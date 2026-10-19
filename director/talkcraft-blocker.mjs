import {isVisualDiagnosticFailure} from './talkcraft-acceptance-policy.mjs';
// An observation contract, not an executor: no stage selection, repair or approval.
export function talkcraftBlocker(run) {
  if(!run || run.activeTask && ['starting','running','stopping'].includes(run.activeTask.status))return null;
  const failure=isVisualDiagnosticFailure(run.lastFailure)?null:run.lastFailure;
  const node=run.execution?.workflow?.nodes?.find(n=>n.status==='blocked');
  const provenance=run.provenance?.verified===false;
  const invalidPreflight=run.preflightCompleted===true&&run.preflightPassed!==true;
  const stopped=run.automation?.state==='blocked' && !!run.automation?.error;
  const unresolved=!run.nextStage&&!run.delivery&&run.blockers?.length>0;
  if(!failure&&!node&&!provenance&&!invalidPreflight&&!stopped&&!unresolved)return null;
  // Approval, payment and independent review are deliberate gates, not failures.
  if(!failure&&!node&&!provenance&&!invalidPreflight&&!stopped&&
    run.blockers.every(code=>['INDEPENDENT_REVIEW_REQUIRED','HUMAN_VISUAL_REVIEW_REQUIRED','EDITORIAL_AUTHORIZATION_USED'].includes(code)))return null;
  const stage=node?.id || String(failure?.task?.name||run.nextStage||'').replace(/^talkcraft-/u,'');
  const center=run.correctionCenter;
  const centerIssues=center?.issues||[];
  const centerCurrent=center&&typeof run.runId==='string'&&center.runId===run.runId&&center.node==='editorial'&&
    /editorial/u.test(stage)&&run.editorialChecked===false&&center.state==='needs-repair'&&centerIssues.length>0&&
    run.blockers?.length===centerIssues.length&&centerIssues.every((i,index)=>
      run.blockers[index]===`${i.shotId||'全局'}：[${i.code}] ${i.message}`);
  const materialCurrent=center&&center.runId===run.runId&&center.node==='candidates'&&stage==='candidates'&&
    run.nextStage==='candidates'&&center.state==='needs-source-verification'&&center.materialCompletionPlan?.needs?.length>0&&
    center.attempts?.some(a=>a.fingerprint===center.fingerprint&&a.action==='material-completion'&&a.status==='queued');
  const code=failure?.code || (provenance?'PIPELINE_PROVENANCE_INVALID':invalidPreflight?'TALKCRAFT_PREFLIGHT_FAILED':run.blockers?.[0]) || 'WORKFLOW_BLOCKED';
  const reason=(centerCurrent||materialCurrent?center.reason:null)||failure?.cause||node?.detail||(provenance?run.provenance.issues?.join('；'):null)||
    (invalidPreflight?run.preflightIssues?.join('；'):null)||run.automation?.error||run.waitingFor||'后端检查未通过，等待核对当前证据。';
  let owner='后端编导与运行维护',method,criteria;
  if(provenance){
    method=['对照已批准任务与上游主链，核对 B 模式、管线来源和实际音色。','恢复正确的后端输入与参数映射；保留原配音、历史视频和模型结果供对照。','重新通过来源核验后，从后端判定的失败节点继续。'];
    criteria=['模式、管线与音色来源核验通过','后端解除来源阻断，未跳过预检和审批'];
  }else if(materialCurrent){
    owner='06素材节点与来源核验';
    method=['读取本次素材补全报告，区分库已连接、语义匹配、来源追溯、使用许可和内容核验。',
      '复用已核验的原库文件及下载缓存；有用户使用权确认时按精确文件哈希记录依据，不伪造供应商许可证。',
      '补齐当前真实缺项后由06重新执行原素材门禁，不重复计费，不以候选或已调度冒充通过。'];
    criteria=['本次全部真实素材槽绑定且来源与使用依据有效','原06检查通过；14仍由用户审核'];
  }else if(stage==='materials'||stage==='media-preflight'){
    owner='素材输入与原版体检';
    const generated=run.digitalHumanGenerationPlanned===true;
    method=generated?['核对已保存角色图、配音和真实画面素材，不要求提前上传 RunningHub 尚未生成的口型视频。','由后端编导确定人物出镜区间，分镜审核后进入 RunningHub 生成节点。','生成后检查实际视频的帧率、帧数和出镜绑定，通过后才制作样板。']:
      ['提供与本次配音对应的成品口型视频，核对真实画面素材。','按原 Skill ③ 执行 preflight.py --media-only，核对文件、帧率和配音时长。','体检通过后进入 SHOTBOOK 分镜编排；复用现有配音与字级时间轴。'];
    criteria=generated?['角色图、配音和本节点所需素材输入有效','待生成口型明确列在 RunningHub 后续节点，未冒充成品通过']:['本次素材输入齐备，原版素材体检通过','素材与本次配音对应，不以旧报告或照片放行'];
  }else if(code==='PROVIDER_BALANCE_OVERDUE'){
    owner='火山方舟账号与计费';
    method=['检查当前模型接入点对应账号的账单和余额，处理服务商报告的欠费。','本次请求没有返回新分镜；原分镜、配音和时间轴保留，不修改模板来处理账号问题。','账号恢复后重新确认一次分镜修订授权，再恢复当前节点；不自动重复提交。'];
    criteria=['服务商账号恢复可用','获得新的单次修订授权并返回分镜，再通过原定校验'];
  }else if(/EDITORIAL_RESULT_INVALID/u.test(code)||/editorial/u.test(stage)&&!/^PROVIDER_/u.test(code)){
    owner='后端编导与分镜结果校验';
    method=['对照原稿、逐句时间轴与已保存的模型结果，修正镜头句子归属；保证句序连续、不重复、不漏句；同时按具体失败项核对模板时长、30镜不重复和参数约束。','复用现有结果执行语义校验、镜头候选匹配和分镜预检；不得由前端指定模板或跳过检查。','模板容量或画面取舍无法本地确定时，交给编导按失败清单修订，不能反复校验同一错误结果。保留现有配音；重新请求模型需新的单次费用授权。'];
    criteria=['每句原稿恰好覆盖一次，语义与镜头范围一致','候选、SHOTBOOK 与预检结果一致且通过'];
  }else if(/PROCESS_LAUNCH|DEPENDENCY/u.test(code)||/EPERM|依赖/u.test(reason)){
    method=['检查 Windows 实际执行路径、子进程权限及随包依赖，区分环境故障与业务校验失败。','修复后先运行真实子进程检查，复用已保存音频和素材，只恢复失败步骤。','由后端重新确认可执行阶段；涉及外部生成时另行确认费用。'];
    criteria=['真实子进程启动检查通过','失败步骤实际运行成功，已有资产保留'];
  }else if(/PROVIDER|AUTHORIZATION/u.test(code)){
    method=['核对已配置接入点、凭据映射和本次服务响应，先查询已经提交的结果。','保留成功结果，排除接入点或网络问题；不把查询恢复变成重新生成。','需要再次提交时重新取得本次费用授权，再由后端按跌落配置执行。'];
    criteria=['接入点可用，已提交结果核对清楚','本次授权与后端实际请求对应'];
  }else if(/ALIGNMENT|WORD_TIMING/u.test(code)||/timing|alignment/u.test(stage)){
    method=['对照原稿、已保存配音和原始时间戳，定位未通过的句子或字级锚点。','补齐对齐依赖或修复时间映射，只恢复失败句；不重新配音替换现有音色。','重新检查文本对应、时间连续性及文字出场帧的代码映射，再继续分镜。'];
    criteria=['失败句达到原定匹配阈值','字级时间与文字代码映射通过检查'];
  }else if(invalidPreflight||/PREFLIGHT|NATIVE_|MOTION_|BINDING/u.test(code)){
    method=['按具体失败项反查上游模板说明、当前分镜、参数、素材和运行时绑定，确定缺口位于编导、代码或工作流。','由编导修复受影响镜头；缺素材补真实素材，模板变更重新审核，不使用占位或旧报告放行。','重新执行预检和对应代码规则检查；成片变更后仍需机器规则检查与人工视觉审核。'];
    criteria=['当前版本预检与对应代码规则检查通过','候选、分镜、运行绑定和新视频证据一致'];
  }else{
    method=['依据本次失败记录追踪输入、参数、运行环境与第三方响应，先确定责任层。','对照上游规则和本项目已确认约束，修复当前失败单元并保留成功资产。','运行对应回归和真实产物检查；由后端解除阻断后继续，不能只凭页面恢复放行。'];
    criteria=['本次失败原因有可核对的证据','对应检查通过，后端状态解除阻断'];
  }
  return {schema:'talkcraft-blocker-v1',runId:run.runId,code,stage,
    title:node?`${String(node.number).padStart(2,'0')} · ${node.label}`:failure?.title||run.waitingFor||'工作流检查',
    reason,owner,method,criteria,failedChecks:centerCurrent?[...run.blockers]:run.failureReport?.failedChecks||run.preflightIssues||[],
    recoveryAction:run.nextStage==='editorial-recover'?{label:failure?.task?.name==='talkcraft-editorial-recover'?'修改后重新校验（不调用模型）':'恢复已保存分镜（不调用模型）'}:null,
    baseline:{label:'video-talkcraft 上游规则与已确认的 B 模式治理约束',url:'https://github.com/Vincentwei1021/video-talkcraft/blob/main/SKILL.md'},
    preservation:centerCurrent||materialCurrent?'已有配音、模型结果和成功素材保留；已执行免费恢复与复检，剩余问题按当前清单治理，不代表节点已通过。':'已有配音、模型结果和成功素材保留；治理方案尚未执行，不代表问题已解决。'};
}
