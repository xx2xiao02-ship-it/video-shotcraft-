import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {talkcraftProject} from './talkcraft-status.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;

export function taskStageLabel(name) {
  return ({'talkcraft-bootstrap':'配音和时间轴处理', 'talkcraft-editorial':'分镜生成',
    'talkcraft-editorial-revision':'分镜重新生成', 'talkcraft-editorial-check':'分镜校验',
    'talkcraft-qa':'机器质检', 'talkcraft-preflight':'分镜预检',
    'talkcraft-render-all':'整片渲染', 'talkcraft-sample':'样板渲染'})[name] || '任务执行';
}

export function buildTalkcraftFailureReport(root, runId, task) {
  const project = talkcraftProject(root, runId);
  const source = readJson(path.join(project, 'source-run.json')) || {};
  const timing = readJson(path.join(project, 'audio', 'timestamps.json'));
  const sentences = Array.isArray(timing?.sentences) ? timing.sentences : [];
  const low = timing?.timingSource === 'tts-native' ? [] : sentences.filter(sentence => !Number.isFinite(sentence.match) || sentence.match < 0.9);
  const matches = sentences.map(sentence => sentence.match).filter(Number.isFinite);
  const logs = (task.logs || []).join('\n');
  const edgeNoAudio = /Edge TTS failed \(NoAudioReceived:/u.test(logs);
  const processLaunchBlocked = /spawn(?:Sync)?[^\r\n]*EPERM|Windows 拒绝启动任务进程/u.test(logs);
  const wordTimingRequired = /WORD_TIMING_REQUIRED/u.test(logs);
  const alignmentFailed = /Aligned sentence \d+ failed|match<0\.90/u.test(logs) || low.length > 0;
  const failedChecks = logs.split(/\r?\n/u).map(line => line.trim())
    .filter(line => /^\[[^\]]+\]\s+FAIL:/u.test(line));
  const preflightFailed = (String(task.name || '').includes('preflight') || logs.includes('AUTO_PREFLIGHT_START')) && failedChecks.length > 0;
  const audioFile = path.join(project, 'audio', 'full.mp3');
  const script = existsSync(path.join(project, 'input.txt')) ? readFileSync(path.join(project, 'input.txt'), 'utf8') : '';
  const contentWarning = /显著降低你真正学习它的概率|记忆通道全部关闭/u.test(script)
    ? '本次输入仍含此前已确认需要修正的研究表述，不能直接进入成片。' : null;
  const code = wordTimingRequired ? 'WORD_TIMING_REQUIRED' : alignmentFailed ? 'ALIGNMENT_QUALITY_GATE' : edgeNoAudio ? 'VOICE_PROVIDER_NO_AUDIO' : processLaunchBlocked ? 'PROCESS_LAUNCH_BLOCKED' :
    preflightFailed ? 'TALKCRAFT_PREFLIGHT_FAILED' : 'TASK_FAILED';
  const cause = wordTimingRequired ? '当前时间轴可用于文案和分镜；制作词语动效前还需补充精确时间定位，已有配音无需重做。' : alignmentFailed
    ? `时间轴校验未通过：${low.length}/${sentences.length} 句匹配率低于 0.90。`
    : edgeNoAudio ? '在线配音未返回音频，任务未取得可用配音。'
    : processLaunchBlocked ? `Windows 拒绝启动${taskStageLabel(task.name)}子进程，当前操作台启动环境无法执行任务。`
    : preflightFailed ? `分镜预检未通过：${failedChecks.length} 项检查失败。`
    : '任务未通过当前阶段的校验。';
  const actions = wordTimingRequired ? [
    '保留已有配音与时间轴，补充词语动效所需的精确时间定位后继续。',
  ] : alignmentFailed ? [
    '优先复用已保存的配音和 TTS 原始时间戳修复时间轴。',
    '缺少原始时间戳时，核对已有配音，再单独补齐对齐数据；不要直接重新配音。',
  ] : preflightFailed ? [
    '系统会先整理可修正的结构项；具体素材、语义和画面取舍交给脚本审核与治理。',
    '请查看分镜脚本预览和具体失败项，完成治理后点击“审核并治理脚本”；机器检查结果不会代替你的决定。',
  ] : [
    '保留本次运行和日志，核对失败阶段的输入与服务状态。',
    '确认原因后只处理失败单元，不覆盖已成功素材。',
  ];
  return {schema:'talkcraft-failure-report-v1', runId, createdAt:new Date().toISOString(),
    task:{id:task.id ?? null, name:task.name || 'talkcraft', exitCode:task.exitCode ?? null},
    code, title:wordTimingRequired ? '需要补充时间定位' : alignmentFailed ? '时间轴校验失败' : edgeNoAudio ? '配音服务未返回音频' : processLaunchBlocked ? `${taskStageLabel(task.name)}进程未能启动` :
      preflightFailed ? '分镜预检未通过' : '任务处理失败',
    cause, evidence:{edgeTtsNoAudio:edgeNoAudio, voiceEngine:source.voiceEngine || null,
      fallbackVoice:source.voiceEngine === 'windows-offline-zh-CN' ? source.voiceEngine : null,
      audioSaved:existsSync(audioFile) && statSync(audioFile).size > 0,
      audioSeconds:source.totalFrames && source.fps ? source.totalFrames/source.fps : null,
      sentences:sentences.length, belowThreshold:low.length,
      minimumMatch:matches.length ? Math.min(...matches) : null,
      maximumMatch:matches.length ? Math.max(...matches) : null},
    contentWarning, failedChecks, actions,
    technicalTail:logs.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(-12)};
}

export function writeTalkcraftFailureReport(root, runId, task) {
  const report = buildTalkcraftFailureReport(root, runId, task);
  const directory = path.join(talkcraftProject(root, runId), 'qa', 'failures');
  mkdirSync(directory, {recursive:true});
  const file = path.join(directory, `${Date.now()}-${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', {encoding:'utf8', flag:'wx'});
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
