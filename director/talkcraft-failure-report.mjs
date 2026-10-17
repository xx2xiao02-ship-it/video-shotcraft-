import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {talkcraftProject} from './talkcraft-status.mjs';
import {writeAuditFeedback} from './talkcraft-audit-feedback.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {wordRevealSourceBinding} from './talkcraft-word-reveal.mjs';
import {summarizeWordFailures} from './talkcraft-word-runtime-validation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;

export function taskStageLabel(name) {
  return ({'talkcraft-bootstrap':'配音和时间轴处理', 'talkcraft-editorial':'分镜生成',
    'talkcraft-editorial-revision':'分镜重新生成', 'talkcraft-editorial-check':'分镜校验', 'talkcraft-editorial-recover':'已保存分镜恢复校验',
    'talkcraft-qa':'机器质检', 'talkcraft-word-timing':'字级对齐', 'talkcraft-recover-alignment':'失败句重对齐', 'talkcraft-preflight':'分镜预检',
    'talkcraft-render-all':'整片渲染', 'talkcraft-sample':'样板渲染'})[name] || '任务执行';
}

export function buildTalkcraftFailureReport(root, runId, task) {
  const project = talkcraftProject(root, runId);
  const source = readJson(path.join(project, 'source-run.json')) || {};
  const wordFile=path.join(project,'audio/word-timestamps.json');
  const useWords=['talkcraft-word-timing','talkcraft-recover-alignment'].includes(task.name)&&existsSync(wordFile);
  const timing = readJson(useWords?wordFile:path.join(project,'audio/timestamps.json'));
  const sentences = Array.isArray(timing?.sentences) ? timing.sentences : [];
  const low = timing?.timingSource === 'tts-native' ? [] : sentences.filter(sentence => !Number.isFinite(sentence.match) || sentence.match < 0.9);
  const matches = sentences.map(sentence => sentence.match).filter(Number.isFinite);
  const logs = (task.logs || []).join('\n');
  let visualFailure=null;
  const sampleScope=['talkcraft-sample','talkcraft-scaffold'].includes(task.name);
  const bindingFailed=/Command failed: node[^\r\n]*word-reveal-audit\.mjs[^\r\n]*--binding-only/u.test(logs);
  const contrastFailed=/Command failed: node[^\r\n]*talkcraft-contrast-audit\.mjs/u.test(logs);
  if(bindingFailed||contrastFailed){
    const file=bindingFailed?'qa/text-binding-runtime'+(sampleScope?'-s01':'')+'.json':
      `qa/${sampleScope?'sample':'full'}-contrast-${/--prepare/u.test(logs)?'prepare':'check'}/contrast-audit.json`;
    try{
      const result=readJson(path.join(project,file));
      if(result?.passed===false&&result.failures?.length&&
        JSON.stringify(result.scope??null)===JSON.stringify(sampleScope?['s01']:null)&&
        JSON.stringify(result.binding)===JSON.stringify(wordRevealSourceBinding(project)))
        visualFailure={file,result,binding:bindingFailed};
    }catch{}
  }
  let runtimeFailure=null;
  if(/Command failed: node[^\r\n]*word-reveal-audit\.mjs/u.test(logs)){
    const runtimeFile=task.name==='talkcraft-sample'?'qa/word-reveal-runtime-s01.json':'qa/word-reveal-runtime.json';
    try{
      const result=readJson(path.join(project,runtimeFile));
      const expectedScope=task.name==='talkcraft-sample'?['s01']:null;
      if(result?.schema==='talkcraft-word-runtime-v2'&&result.native===true&&result.passed===false&&
        JSON.stringify(result.scope??null)===JSON.stringify(expectedScope)&&result.failures?.length&&
        JSON.stringify(result.binding)===JSON.stringify(wordRevealSourceBinding(project)))
        runtimeFailure={file:runtimeFile,result};
    }catch{} // Missing or stale proof must not diagnose this task from an old render.
  }
  const editorialInvalid = String(task.name || '').startsWith('talkcraft-editorial')
    ? logs.split(/\r?\n/u).map(line=>line.replace(/^(?:Error: |LOCAL_RECOVERY_BLOCKED: )/u,'').trim())
      .find(line=>/^(?:火山(?:第 \d+ 句语义或原稿对应无效|镜头.*(?:覆盖|设计).*无效|模板参数不符合治理契约)|分镜提案预检未通过|分镜句子归属恢复未通过)/u.test(line)) : null;
  const chineseDependencyMissing=/中文对齐运行依赖检查失败/u.test(logs);
  const edgeNoAudio = /Edge TTS failed \(NoAudioReceived:/u.test(logs);
  const processLaunchBlocked = /spawn(?:Sync)?[^\r\n]*EPERM|Windows 拒绝启动任务进程|中文对齐启动检查无法执行/u.test(logs);
  const wordTimingRequired = /WORD_TIMING_REQUIRED/u.test(logs);
  const alignmentFailed = /Aligned sentence \d+ failed|match<0\.90/u.test(logs) || low.length > 0;
  const motionStatic = /\[静止\]\s+FAIL:\s+(\d+) static stretch/u.exec(logs);
  const failedChecks = logs.split(/\r?\n/u).map(line => line.trim())
    .filter(line => /^\[[^\]]+\]\s+FAIL:|^\d+\.\s+\[[A-Z_]+\]/u.test(line));
  if(editorialInvalid?.startsWith('分镜提案预检未通过：'))
    failedChecks.push(...editorialInvalid.replace(/^分镜提案预检未通过：/u,'').split(/；(?=\[)/u));
  const preflightFailed = (String(task.name || '').includes('preflight') || logs.includes('AUTO_PREFLIGHT_START')) && failedChecks.length > 0;
  const providerEndpointMissing = /HTTP 404[^\r\n]*(?:model|endpoint)[^\r\n]*(?:does not exist|not found|no access|access)/iu.test(logs);
  const providerBalanceOverdue = /HTTP 403[^\r\n]*account has an overdue balance/iu.test(logs);
  const providerFallbackExhausted = /火山方舟\s+global\s+连接失败[^\r\n]*(?:timeout|超时)/iu.test(logs) && /火山请求\s+\d+\/\d+/u.test(logs);
  const audioFile = path.join(project, 'audio', 'full.mp3');
  const script = existsSync(path.join(project, 'input.txt')) ? readFileSync(path.join(project, 'input.txt'), 'utf8') : '';
  const contentWarning = /显著降低你真正学习它的概率|记忆通道全部关闭/u.test(script)
    ? '本次输入仍含此前已确认需要修正的研究表述，不能直接进入成片。' : null;
  const code = chineseDependencyMissing?'CHINESE_ALIGNMENT_DEPENDENCY':processLaunchBlocked?'PROCESS_LAUNCH_BLOCKED':providerEndpointMissing?'PROVIDER_ENDPOINT_UNAVAILABLE':providerFallbackExhausted?'PROVIDER_FALLBACK_EXHAUSTED':wordTimingRequired ? 'WORD_TIMING_REQUIRED' : alignmentFailed ? 'ALIGNMENT_QUALITY_GATE' : edgeNoAudio ? 'VOICE_PROVIDER_NO_AUDIO' : motionStatic ? 'MOTION_STATIC_GATE' :
    preflightFailed ? 'TALKCRAFT_PREFLIGHT_FAILED' : editorialInvalid ? 'EDITORIAL_RESULT_INVALID' : 'TASK_FAILED';
  const cause = chineseDependencyMissing?'运行环境缺少中文繁简转换或拼音匹配依赖，无法可靠执行字级对齐；已有配音保留。':processLaunchBlocked?`Windows 无法执行${taskStageLabel(task.name)}子进程，请检查程序路径和启动权限。`:wordTimingRequired ? '当前时间轴可用于文案和分镜；制作词语动效前还需补充精确时间定位，已有配音无需重做。' : alignmentFailed
    ? `时间轴校验未通过：${low.length}/${sentences.length} 句匹配率低于 0.90。`
    : edgeNoAudio ? '在线配音未返回音频，任务未取得可用配音。'
    : motionStatic ? `画面健康检查发现 ${motionStatic[1]} 段连续静止画面，当前成片需要补充缓慢运镜或环境动态。`
    : processLaunchBlocked ? `Windows 拒绝启动${taskStageLabel(task.name)}子进程，当前操作台启动环境无法执行任务。`
    : providerEndpointMissing ? '火山方舟模型接入点不存在或当前账号无权访问；应按已配置跌落接入点继续核对。'
    : providerFallbackExhausted ? '已按配置尝试全部火山方舟跌落接入点，仍未取得结果；请检查接入点状态和网络后重新授权。'
    : preflightFailed ? `分镜预检未通过：${failedChecks.length} 项检查失败。`
    : editorialInvalid?.startsWith('分镜提案预检未通过：') ? `分镜提案预检未通过：${failedChecks.length} 项设计或参数问题，需编导修订后重新校验。` : editorialInvalid ||
      logs.split(/\r?\n/u).find(line=>/^Error: /u.test(line))?.replace(/^Error: /u,'') || '任务未通过当前阶段的校验。';
  const actions = chineseDependencyMissing?['按构建锁定补齐 zhconv、pypinyin、setuptools 和词典，完成运行检查后只恢复失败句；不要重做配音。']:wordTimingRequired ? [
    '保留已有配音与时间轴，补充词语动效所需的精确时间定位后继续。',
  ] : alignmentFailed ? [
    '优先复用已保存的配音和 TTS 原始时间戳修复时间轴。',
    '缺少原始时间戳时，核对已有配音，再单独补齐对齐数据；不要直接重新配音。',
  ] : preflightFailed ? [
    '系统会先整理可修正的结构项；具体素材、语义和画面取舍交给脚本审核与治理。',
    '请查看分镜脚本预览和具体失败项，完成治理后点击“审核并治理脚本”；机器检查结果不会代替你的决定。',
  ] : editorialInvalid ? [
    '已保存的模型结果和配音保留；先由后端编导核对句子覆盖与画面设计，再复用结果进行本地校验。',
    '自动推进已暂停，不重复提交模型请求；再次调用付费模型须重新取得单次授权。',
  ] : [
    '保留本次运行和日志，核对失败阶段的输入与服务状态。',
    '确认原因后只处理失败单元，不覆盖已成功素材。',
  ];
  return {schema:'talkcraft-failure-report-v1', runId, createdAt:new Date().toISOString(),
    task:{id:task.id ?? null, name:task.name || 'talkcraft', exitCode:task.exitCode ?? null},
    code, title:chineseDependencyMissing?'中文对齐运行依赖缺失':processLaunchBlocked?`${taskStageLabel(task.name)}进程未能启动`:wordTimingRequired ? '需要补充时间定位' : alignmentFailed ? '时间轴校验失败' : edgeNoAudio ? '配音服务未返回音频' : motionStatic ? '画面静止检查未通过' :
      providerEndpointMissing ? '火山方舟模型接入点不可用' : providerFallbackExhausted ? '火山方舟跌落接入点已耗尽' : preflightFailed ? '分镜预检未通过' : editorialInvalid ? '分镜结果校验未通过' : '任务处理失败',
    cause, evidence:{edgeTtsNoAudio:edgeNoAudio, voiceEngine:source.voiceEngine || null,
      fallbackVoice:source.voiceEngine === 'windows-offline-zh-CN' ? source.voiceEngine : null,
      audioSaved:existsSync(audioFile) && statSync(audioFile).size > 0,
      audioSeconds:source.totalFrames && source.fps ? source.totalFrames/source.fps : null,
      sentences:sentences.length, belowThreshold:low.length,
      minimumMatch:matches.length ? Math.min(...matches) : null,
      maximumMatch:matches.length ? Math.max(...matches) : null},
    contentWarning, failedChecks, actions,
    technicalTail:logs.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(-12),
    ...(visualFailure?{code:visualFailure.binding?'TEXT_BINDING_GATE':'TEXT_CONTRAST_GATE',
      title:visualFailure.binding?'镜头文字绑定未通过':'镜头可读性校验未通过',
      cause:`${sampleScope?'首镜':'全镜头'}${visualFailure.binding?'文字绑定':'文字及图标可读性'}检查发现 ${visualFailure.result.failures.length} 项问题，已停止后续整片编码。`,
      failedChecks:visualFailure.result.failures.map(f=>`${f.shotId||f.id?.split('-text')[0]||'镜头'}：${f.id||''} ${f.text||''} ${f.reason||f.blocker||(Number.isFinite(f.ratio)?`实际对比度 ${f.ratio.toFixed(2)}，要求 ${f.minimum}`:'缺少有效证据')}`),
      actions:['返回公共文字匹配、模板字段或实际像素检测代码核对根因；修复公共实现并增加回归测试。',
        '保留原配音、分镜和数字人素材；全镜头绑定、颜色及布局检查均通过后再编码，首镜通过不能替代全片。'],
      remediation:{owner:'local-director-and-runtime',evidence:visualFailure.file,feedback:'qa/audit-feedback.json',
        required:['公共根因与代码位置','对应回归通过','当前源码全镜头实帧检查通过'],closed:false}}:{}),
    ...(runtimeFailure?{code:'NATIVE_RUNTIME_GATE',title:'镜头实帧校验未通过',
      cause:`${task.name==='talkcraft-sample'?'样板镜':'镜头'}实帧校验发现 ${runtimeFailure.result.failures.length} 项问题：${[...new Set(runtimeFailure.result.failures.flatMap(f=>(f.issues||[]).map(i=>i.reason)))].join('；')||'文字落点或可见性不符合计划'}。`,
      failedChecks:summarizeWordFailures(runtimeFailure.result.failures,runtimeFailure.result.rows),
      actions:['返回后端场景实现、模板参数与主题映射逐项反查，对照固定 GitHub 规则定位根因；代码缺陷修到公共实现，增加对应回归。',
        '复用原配音与成功素材，只重检受影响镜头；修改已审分镜或模板时重新审核，不能降低阈值或跳过检查。'],
      remediation:{owner:'local-director-and-runtime',evidence:runtimeFailure.file,
        feedback:'qa/audit-feedback.json',required:['根因与代码位置','对应回归通过','相同输入重新实帧检查通过'],closed:false}}:{}),
    ...(providerBalanceOverdue?{code:'PROVIDER_BALANCE_OVERDUE',title:'火山方舟账号余额逾期',
      cause:'火山方舟返回 HTTP 403：账号余额逾期，本次未返回新分镜。',
      actions:['检查当前接入点对应的火山方舟账号账单与余额，处理欠费。','原分镜与配音保留；本次单次请求已用，不自动重试，恢复调用需要新的单次授权。']}:{}),
  };
}

export function writeTalkcraftFailureReport(root, runId, task) {
  const report = buildTalkcraftFailureReport(root, runId, task);
  const directory = path.join(talkcraftProject(root, runId), 'qa', 'failures');
  mkdirSync(directory, {recursive:true});
  const file = path.join(directory, `${Date.now()}-${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', {encoding:'utf8', flag:'wx'});
  try{writeAuditFeedback(talkcraftProject(root,runId),resolveTalkcraftSkillRoot(root));}
  catch(error){report.auditFeedbackError=String(error.message||error);}
  return {file, report};
}

export function latestTalkcraftFailureReport(root, runId) {
  const directory = path.join(talkcraftProject(root, runId), 'qa', 'failures');
  if (!existsSync(directory)) return null;
  for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))
    .sort((a,b) => statSync(path.join(directory,b)).mtimeMs-statSync(path.join(directory,a)).mtimeMs)) {
    try {
      const report = readJson(path.join(directory, file));
      if (report?.schema === 'talkcraft-failure-report-v1' && report.runId === runId) {
        // 兼容旧报告的错误阶段名称；保留原始证据文件。
        if (report.code === 'PROCESS_LAUNCH_BLOCKED') return {...report,
          title:`${taskStageLabel(report.task?.name)}进程未能启动`,
          cause:`Windows 拒绝启动${taskStageLabel(report.task?.name)}子进程，当前操作台启动环境无法执行任务。`};
        return report;
      }
    } catch {}
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runId = process.argv[2] || '';
  const taskId = Number(process.argv[3]);
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 8774}/api/task?id=${taskId}&since=0`);
  const task = await response.json();
  if (!response.ok || !task.done || task.exitCode === 0 || task.runId !== runId) throw new Error('Matching failed task not found');
  console.log(JSON.stringify(writeTalkcraftFailureReport(ROOT, runId, {...task, id:taskId, name:'talkcraft-bootstrap'}), null, 2));
}
