import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectTalkcraftRenderRuntime} from './talkcraft-render-runtime.mjs';
import {wordRevealSourceBinding} from './talkcraft-word-reveal.mjs';

const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
const text=file=>{try{return fs.readFileSync(file,'utf8');}catch{return '';}};
const sha=file=>fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
const normalizedSha=file=>createHash('sha256').update(text(file).replaceAll('\r\n','\n')).digest('hex');
const reviewComplete=value=>{const m=/## 评审完成 · 已看 (\d+)\/(\d+) 镜/u.exec(value);return !!m&&Number(m[1])>0&&Number(m[1])===Number(m[2]);};
const repository='https://github.com/Vincentwei1021/video-talkcraft.git';
const issue=(code,title,owner,evidence,fix,regression)=>({code,title,owner,status:'open',stage:'diagnosed',evidence,fix,regression,
  closureCriteria:['修复代码与来源依据可核对','对应回归和渲染前检查通过','修复版视频重新检查通过','独立审片无未关闭的 P0/P1']});

function verifiedSource(project,upstream,relative='SKILL.md') {
  if(upstream?.schema!=='talkcraft-upstream-audit-v1'||upstream.repository!==repository||
    !/^[a-f0-9]{40}$/u.test(upstream.remoteSha||''))return {verified:false,reason:'缺少合法的固定上游版本记录'};
  if(!['SKILL.md','scripts/timestamps_cpu.py','scripts/preflight.py'].includes(relative))return {verified:false,reason:'未登记的来源文件'};
  const row=upstream.files?.find(f=>f.file===relative);
  const file=path.join(project,'qa/upstream-audit',upstream.remoteSha,relative);
  const url=`https://raw.githubusercontent.com/Vincentwei1021/video-talkcraft/${upstream.remoteSha}/${relative}`;
  if(!row||row.url!==url||!fs.existsSync(file)||normalizedSha(file)!==row.remoteSha256)
    return {verified:false,reason:'上游规则快照缺失或哈希不一致'};
  return {verified:true,source:text(file),file};
}

// Evidence collection proposes a repair location. It never edits a skill,
// generates media, submits provider work or marks a review accepted.
export function buildAuditFeedback(project,skillRoot,{root=path.resolve(project,'../../../..'),includeParents=true}={}) {
  const upstream=read(path.join(project,'qa/upstream-audit/latest.json'));
  const checked=verifiedSource(project,upstream);
  const sourceFile=checked.file,source=checked.source||'';
  const native=fs.existsSync(path.join(project,'remotion/src/scenes/scene-shared.tsx'));
  const rows=[];
  const hashes=new Map(),cachedSha=file=>{if(!hashes.has(file))hashes.set(file,sha(path.join(project,file)));return hashes.get(file);};
  const proof=(file)=>({file,sha256:cachedSha(file)});
  const declaredRule=(rule)=>({repository:checked.verified?repository:null,commit:checked.verified?upstream.remoteSha:null,
    file:'SKILL.md',sha256:sourceFile?sha(sourceFile):null,present:checked.verified?rule.test(source):null,
    classification:checked.verified?'rule-text-verified':'unverified',limitation:'规则文本存在不等于上游脚本已覆盖全部实际画面；实现缺口须另查调用链。'});
  const preflightSource=verifiedSource(project,upstream,'scripts/preflight.py');
  const localPreflight=path.join(skillRoot,'scripts/preflight.py');
  const semanticShortcut=/card_sem\s*\|=\s*set\(sem_all\)/u;
  if(native&&semanticShortcut.test(text(localPreflight))&&preflightSource.verified&&!semanticShortcut.test(preflightSource.source))
    rows.push(issue('LOCAL_PREFLIGHT_SEMANTIC_SHORTCUT','本地预检将正式场景视为覆盖全部语义','local-integration',
      [{repository,commit:upstream.remoteSha,file:'scripts/preflight.py',sha256:sha(preflightSource.file),verified:true},
       {file:path.relative(root,localPreflight),sha256:sha(localPreflight)},declaredRule(/语义覆盖|语义标注/u)],
      '核对正式主卡的真实语义能力与上游检查调用链，补足替代校验后收窄场景适配；有来源的偏离理由单独登记，不能把源码绑定成功当成语义全部合规。',
      ['身份、量化等语义缺少对应卡时必须阻断','明确语义偏离理由可供独立复核','正式卡 ID 与候选、参数和运行源码保持一致']));
  const recovery=read(path.join(project,'qa/chinese-alignment-recovery.json'));
  if(recovery?.schema==='talkcraft-chinese-alignment-recovery-v1'){
    const scriptSource=verifiedSource(project,upstream,'scripts/timestamps_cpu.py');
    const supportDeclared=scriptSource.verified&&/zhconv/u.test(scriptSource.source)&&/pypinyin/u.test(scriptSource.source);
    const bound=recovery.inputs?.['audio/full.mp3']===sha(path.join(project,'audio/full.mp3'))&&
      recovery.inputs?.['script.json']===sha(path.join(project,'script.json'))&&
      recovery.wordTimingSha256===sha(path.join(project,'audio/word-timestamps.json'));
    const finding=issue('WINDOWS_CHINESE_ALIGNMENT_DEPENDENCIES','Windows 包遗漏上游中文匹配依赖',supportDeclared?'windows-packaging':'unresolved',
      [proof('qa/chinese-alignment-recovery.json'),{repository:scriptSource.verified?repository:null,commit:scriptSource.verified?upstream.remoteSha:null,
        file:'scripts/timestamps_cpu.py',sha256:scriptSource.file?sha(scriptSource.file):null,verified:scriptSource.verified},proof('qa/word-alignment.json')],
      '锁定并随包分发繁简及拼音匹配依赖和词典；构建、启动和识别前验证；复用原配音，仅重识别失败句。',
      ['同一真实失败句保持 0.90 阈值并通过','恢复前后配音哈希相同','缺依赖时不静默降级','EXE 随包运行检查通过']);
    if(bound&&recovery.task?.exitCode===0&&recovery.minimumMatch>=.9){finding.stage='input-recovery-validated';finding.recoveryValidated=true;}
    rows.push(finding);
  }
  const wordRule=declaredRule(/字级时间戳/u);
  for(const [file,kind] of [
    ['qa/text-binding-runtime-s01.json','binding'],['qa/text-binding-runtime.json','binding'],
    ['qa/sample-contrast-check/contrast-audit.json','contrast'],['qa/full-contrast-check/contrast-audit.json','contrast']]){
    const report=read(path.join(project,file));
    if(report?.passed!==false||!report.failures?.length)continue;
    let current=false;try{current=JSON.stringify(report.binding)===JSON.stringify(wordRevealSourceBinding(project));}catch{}
    const finding=issue(kind==='binding'?'RUNTIME_TEXT_BINDING_FAILED':'RUNTIME_TEXT_CONTRAST_FAILED',
      kind==='binding'?'计划文字与真实画面绑定未通过':'文字及图标的实际背景可读性未通过',
      current&&checked.verified?'local-director-and-runtime':'unresolved',
      [proof(file),wordRule,{currentSource:current,scope:report.scope??'full',failures:report.failures}],
      '返回公共文字匹配、模板字段与图形像素检测核对；共用显示文字规则并补回归。镜头实现后先校验全部文字绑定，再检查颜色及布局，通过后才编码整片。',
      ['当前源码绑定有效且相同范围实帧检查通过','首镜凭据不能解除全镜头失败','旧失败证据保留，不降低阈值或跳过图标检查']);
    finding.stage=current?'runtime-failure-confirmed':'previous-source-evidence';rows.push(finding);
  }
  const shared=text(path.join(project,'remotion/src/scenes/scene-shared.tsx'));
  if(native && (!/WordRevealRoot|NativeWordReveal|NativePresentationRoot/u.test(shared)||!fs.existsSync(path.join(project,'remotion/word-reveal-plan.json'))))
    rows.push(issue('NATIVE_WORD_REVEAL_NOT_CONNECTED','正式模板内部大字尚未接入逐词可见性校验',wordRule.present?'local-integration':'unresolved',
      [wordRule,proof('remotion/src/scenes/scene-shared.tsx'),proof('remotion/beats.json')],
      '扩展后端文字落点机制覆盖正式模板，编导保存可见文本与真实锚词；前端展示遗漏，渲染前执行覆盖和实际帧校验。',
      ['句首节拍通过而关键词提前2秒时必须失败','每个可见大字都有锚词或明确延续理由','正式模板和旧视觉拍均执行相同门禁']));
  // Sample failures need the same repair loop as full-film failures. Keep the
  // scopes distinct so a passing sample can never clear a full-film finding.
  for(const runtimeFile of ['qa/word-reveal-runtime-s01.json','qa/word-reveal-runtime.json']){
  const wordRuntime=read(path.join(project,runtimeFile));
  if(wordRuntime?.schema==='talkcraft-word-runtime-v2'&&wordRuntime.native===true&&
    Array.isArray(wordRuntime.failures)&&wordRuntime.failures.length){
    let current=false;
    try{current=JSON.stringify(wordRuntime.binding)===JSON.stringify(wordRevealSourceBinding(project));}catch{}
    const groups=[
      {code:'NATIVE_MOBILE_LAYOUT_FAILED',title:'实际镜头的手机字号或文字边界未通过',owner:'local-director',
       reasons:['layout not readable'],rule:declaredRule(/进片必须蒙皮/u),
       fix:'核对上游卡允许的字体与蒙皮参数，调整正式编导参数；固定版式无法满足时展示替换样板并重新审核。将实际字号和边界检查保留在整片渲染前。'},
      {code:'NATIVE_UNPLANNED_TEXT_FAILED',title:'模板实际输出了未登记的业务文字或数字',owner:'local-director',
       reasons:['unplanned visible business text'],rule:declaredRule(/未验证数据不引用/u),
       fix:'逐项反查参数、模板默认值和文字清单；数字必须有事实来源，不用补造锚词或关闭检查让无依据数据通过。'},
      {code:'NATIVE_WORD_OR_SPAN_FAILED',title:'实际文字落点或主体驻留时段未通过',owner:'local-director-and-runtime',
       reasons:['early reveal','late/hidden reveal','target absent at voice anchor','native content exited before shot ended','context text never visibly evidenced'],rule:wordRule,
       fix:'对照上游完整动作、当前字级锚点和原生展示时间计划，定位选卡、驻留计划或运行代码的缺口；修复受影响镜头并检查真实边界帧。'},
    ];
    for(const group of groups){
      const failures=wordRuntime.failures.filter(f=>group.reasons.includes(f.reason));if(!failures.length)continue;
      const shots=[...new Set(failures.map(f=>wordRuntime.rows?.find(r=>r.frame===f.frame)?.beatId||
        wordRuntime.rows?.flatMap(r=>r.events||[]).find(e=>e.id===f.id)?.id?.split('-text')[0]).filter(Boolean))];
      const finding=issue(group.code,group.title,current&&checked.verified?group.owner:'unresolved',
        [proof(runtimeFile),group.rule,{currentSource:current,shots,failures,
          scope:wordRuntime.scope||'sampled-runtime-frames',limitation:'实帧失败证明当前检查未通过，具体修复层仍须追踪参数和源码；不等于独立全片审片。'}],
        group.fix,['对应实帧失败消失且输入和源码绑定有效','前置门禁不能用旧报告或局部样板替代全片','原配音与已成功素材保留']);
      finding.stage=current?'runtime-failure-confirmed':'previous-source-evidence';rows.push(finding);
    }
  }
  }
  const mix=text(path.join(project,'qa/sfx-mix-report.txt'));
  if(/FAIL:/u.test(mix))rows.push(issue('SFX_MIX_FAILED','音效混音未通过实际可听度检查','local-director',
    [proof('qa/sfx-mix-report.txt'),proof('qa/native-production-plan.json'),declaredRule(/音效/u)],
    '制作规划同时检查真实气口和音效落点，不只套用原卡相对时间；先保留原音轨，再修混音。',
    ['真实混音报告通过','音效落在对应动画或有说明的气口','原配音哈希不变']));
  const sourcePackage=read(path.join(skillRoot,'runtime/package.json'));
  const versions=[path.join(root,'node_modules/remotion/package.json'),path.join(root,'template/node_modules/remotion/package.json'),
    path.join(skillRoot,'runtime/node_modules/remotion/package.json')].map(file=>({file,version:read(file)?.version||null}));
  let renderRuntime=null;try{renderRuntime=inspectTalkcraftRenderRuntime(project,skillRoot);}catch{}
  const runtimeGap=renderRuntime?(!renderRuntime.passed):new Set(versions.map(v=>v.version).filter(Boolean)).size>1;
  if(runtimeGap)rows.push(issue('RUNTIME_VERSION_SPLIT','B 模式工程未统一到锁定 Remotion 依赖','runtime-environment',
    [{expected:sourcePackage?.dependencies?.remotion,actualProject:renderRuntime,inventory:versions},declaredRule(/统一依赖/u)],
    '统一实际启动和打包依赖的解析位置；记录锁定版本和启动冒烟结果，制作中途不自动升级。',
    ['操作台、分段渲染、音效渲染和打包程序使用同一版本','离线安装后的浏览器子进程和真实渲染通过']));
  const review=path.join(project,'review');
  const reviews=fs.existsSync(review)?fs.readdirSync(review).filter(f=>/^REVIEW.*\.md$/u.test(f)).map(f=>({file:'review/'+f,sha256:sha(path.join(review,f)),
    complete:reviewComplete(text(path.join(review,f))),accepted:false})):[];
  const global=text(path.join(review,'REVIEW-global.md'));
  // Reviewer findings stay attributed to their report and exact video. A report
  // for another encode cannot become current-video evidence after a repair.
  const videoSha=cachedSha('remotion/out/final.mp4');
  const globalBound=!!videoSha&&global.includes(videoSha)&&reviewComplete(global);
  const reviewProof=[proof('review/REVIEW-global.md'),proof('remotion/out/final.mp4'),{kind:'independent-review',scope:'sampled-frames-and-runtime',accepted:false}];
  if(globalBound&&global.includes('长镜原卡退场后继续空幕'))rows.push(issue('NATIVE_CONTENT_ENDS_EARLY','长语义镜头超出原卡主体展示区间','local-director',
    [...reviewProof,proof('remotion/shots.json'),declaredRule(/持续运动|连续揭示/u)],
    '编导选卡时核对有效内容区间，安排合法驻留或原生子拍；将主体提前退场和空幕检查移到渲染前。',
    ['长镜头不能仅延长外部时长而保留短卡退场','末句金句在实际口播区间仍可见','逐镜边界和修复成片均检查无信息断档']));
  if(globalBound&&global.includes('共同缩放/固定左右栏位'))rows.push(issue('NATIVE_LAYOUT_AND_SKIN_GAP','正式卡片蒙皮、人物空栏与手机文字布局未落实','local-integration',
    [...reviewProof,proof('remotion/src/scenes/scene-shared.tsx'),declaredRule(/进片必须蒙皮/u)],
    '扩展合法皮肤与无人物版式能力，前端提供编导预览；按真实 390 像素宽画面检查裁切、字色与可读性。',
    ['无数字人时不留下演示人物占位','文字无裁切且主题对比度通过','390 像素实帧可读性及完整运动保真复核通过']));
  if(globalBound&&global.includes('事实措辞仍有已知未闭环项'))rows.push(issue('FACT_REVIEW_UNRESOLVED','已有事实审核问题尚未同步到稿、声和字幕','content-review',
    [...reviewProof,proof('qa/fact-check.md'),proof('input.txt')],
    '编导在制作前展示未解决的事实问题并要求确认依据或修订；保持稿、配音和字幕一致，重新配音的费用另行确认。',
    ['已标记的无依据数量或绝对化断言不得静默放行','修改文案时检查配音与字幕是否仍一致','不为补证据编造百分比或人物身份']));
  const failures=path.join(project,'qa/failures');
  const history=fs.existsSync(failures)?fs.readdirSync(failures).filter(f=>f.endsWith('.json')).map(f=>read(path.join(failures,f))).filter(Boolean)
    .map(r=>({task:r.task,code:r.code,cause:r.cause,createdAt:r.createdAt})):[];
  let parentReview=null;
  const sourceRun=read(path.join(project,'source-run.json')),parentId=sourceRun?.revisionOfRunId;
  if(includeParents&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(parentId||'')&&parentId!==path.basename(path.dirname(project))){
    const parentProject=path.join(root,'director/b-mode-runs',parentId,'talkcraft');
    if(fs.existsSync(path.join(parentProject,'source-run.json'))){
      const prior=buildAuditFeedback(parentProject,skillRoot,{root,includeParents:false});
      parentReview={runId:parentId,scope:'previous-video',findings:prior.findings,closed:false,
        limitation:'这些是上一版成片的问题。新片尚未完整渲染复审，不能因另建运行而标为解决。'};
    }
  }
  return {schema:'talkcraft-audit-feedback-v1',generatedAt:new Date().toISOString(),
    baseline:{verified:checked.verified,reason:checked.reason||null,repository:upstream?.repository||null,remoteSha:upstream?.remoteSha||null,localSha:upstream?.localSha||null,checkedAt:upstream?.checkedAt||null,
      comparisonScope:'固定上游说明与登记脚本；不是全仓库功能一致性认证',
      localDifferences:(upstream?.files||[]).filter(f=>f.same===false).map(f=>({file:f.file,remoteSha256:f.remoteSha256,localSha256:f.localSha256,
        classification:'requires-call-chain-comparison'}))},
    workflow:['最终缺陷与失败证据','固定GitHub提交核对规则和实现','追踪前端到执行脚本','决定修复负责层','加入前置门禁与回归','重渲受影响镜头并重新检查'],
    findings:rows,history,reviews,parentReview,userAcceptance:false,automaticUpgrade:false,
    lifecycle:{stage:'diagnosed',closed:false,sequence:['诊断','确定修复范围','实施修复','前置门禁与回归','真实重渲','独立复审','用户验收'],
      limitation:'本报告收集证据和提出预防改进，不代表修复或验收已完成。'},
    conclusion:source?'已核对固定上游版本。上游已声明字级与蒙皮要求；本次证据指向本地接入、制作规划和运行环境缺口。':'上游固定版本尚未核对，来源归因待定。'};
}

export function writeAuditFeedback(project,skillRoot) {
  const report=buildAuditFeedback(project,skillRoot),directory=path.join(project,'qa');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'audit-feedback.json'),JSON.stringify(report,null,2));return report;
}
