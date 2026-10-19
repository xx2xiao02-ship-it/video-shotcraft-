import {createHash} from 'node:crypto';
import {MANAGED_WORKFLOW_NODES,workflowNodeForTask} from './talkcraft-workflow-contract.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x??null)).digest('hex');
export function dueSourceRetryToken(plan,now=Date.now()){
  const retry=plan?.transportRetry;
  return retry?.token&&retry.failures<retry.maxFailures&&Date.parse(retry.notBefore)<=now?retry.token:null;
}
const localStages={input:'recover-timing','word-timing':'recover-alignment',semantics:'semantic-check',editorial:'editorial-check',
  'generation-input':'media-preflight',candidates:'candidates','storyboard-review':'planning-check','digital-human':'host-preflight',
  preflight:'preflight',scaffold:'scaffold',sample:'sample','render-all':'render-all',qa:'qa',review:null,deliver:null};
export const CORRECTION_NODE_POLICIES=MANAGED_WORKFLOW_NODES.map(n=>({node:n.id,
  freeStage:localStages[n.id],supportsCorrection:true,automaticApproval:false,
  rule:n.id==='review'?'用户审核决定；不得代批':n.id==='deliver'?'仅导出已审核版本，不自动发布':'本节点先恢复、补全、复检；不能重写程序或绕过原门禁'}));
export const creativeCode=c=>/^(?:FILM_TEXT_DOMINANCE|ATTENTION_TARGET_BOUNDS|GRAPHIC_RELATION_INVALID|GRAPHIC_COMPARISON_REQUIRED|TEXT_VIDEO_(?:CYCLE_REQUIRED|REQUIRED|PLAN_REQUIRED|TEMPLATE_REQUIRED)|HOST_CONTENT_REGION_CONFLICT|HOST_SUBJECT_REQUIRED|TEXT_LAYOUT_CAPACITY|DEMO_VISUAL_NOT_REPLACEABLE|STRUCTURE_ITEMS_REQUIRED|TEXT_EFFECT_(?:DEPENDENCY_EARLY|INCOMPLETE|TARGET_MISSING)$|NATIVE_|EDITORIAL_|DATA_FORMAT|PROP_|REQUIRED_PROP|MATERIAL_DISPLAY_|MATERIAL_BOUND_FIELD_MISMATCH|MATERIAL_PERSON_LABEL_PLAN_INVALID|local_material_unmatched|reviewed_source_binding_required|REAL_SOURCE_NOT_BOUND)/u.test(c||'');

export function correctionNode(run){
  if(run.editorialChecked===false&&['editorial-check','editorial'].includes(run.nextStage))return 'editorial';
  // A successful 06 repair leaves its failed task in history. Once current
  // candidate artifacts pass, 07 owns the next check; replaying 06 cannot
  // refresh the native planning report and must not trigger paid repair.
  if(run.nextStage==='planning-check'&&run.candidatesReady===true)return 'storyboard-review';
  return workflowNodeForTask(run.lastFailure?.task?.name||run.nextStage);
}
export function proposeNodeCorrection({run,feedback,attempts=[],fingerprint,progressKey,authorization,inputs,provider,unsubmitted,rulesVersionVerified,institutionRepair,revisionPlan,revisionPlanError,repeatedPaidScope,governance,sourcePlan,now=Date.now()}){
  const node=correctionNode(run),policy=CORRECTION_NODE_POLICIES.find(p=>p.node===node);
  const base={schema:'talkcraft-correction-decision-v1',runId:run.runId,node,issues:feedback?.failedChecks||[],
    globalRules:['graphic-first','real-media-slots','word-time','text-capacity','host-content-separation','caption-outline'],
    fingerprint,...(governance?{governance}:{}),approved:false,productionAdmitted:false,userAcceptance:false};
  if(run.activeTask)return {...base,state:'correcting',action:null,reason:'正式任务执行中，不重复调度'};
  if(rulesVersionVerified===false)return {...base,state:'waiting-code-reload',action:null,
    reason:'磁盘规则与服务已加载版本不一致；暂停自动修正调度，待验证并重启正式服务后继续，不在热修改期间计费'};
  if(!run.provenance?.verified)return {...base,state:'waiting-input',action:null,reason:'先核验本次管线身份，不串用历史任务'};
  if(['review','deliver'].includes(node)||['approve-final','deliver'].includes(run.nextStage))
    return {...base,state:'waiting-review',action:null,reason:'停在14等待用户，不代替人工审核'};
  if(!run.lastFailure&&!run.failureReport)return {...base,state:'ready',action:null,reason:'无当前失败，由正式主线继续'};
  const used=action=>attempts.some(a=>a.fingerprint===fingerprint&&a.action===action);
  if(!run.editorialResponseSaved&&feedback?.snapshot&&unsubmitted?.schema==='talkcraft-editorial-revision-authorization-v1'&&
    unsubmitted.runId===run.runId&&unsubmitted.startedAt&&!unsubmitted.completedAt&&!unsubmitted.recoveredInputs&&!used('restore-unsubmitted'))
    return {...base,state:'ready-to-correct',approved:false,action:'restore-unsubmitted',body:{stage:'editorial-recover',restoreUnsubmitted:true},reason:'先免费恢复本次发送前失败的原分镜快照；不重新调用模型'};
  if(node==='editorial'&&run.editorialResponseSaved&&!run.shotbook&&feedback?.proposal?.editorialSelectionRejection&&!used('recover-editorial-response'))
    return {...base,state:'ready-to-correct',action:'recover-editorial-response',body:{stage:'editorial-recover'},reason:'免费重编译本次已保存原始返回；保留原请求与全部校验，不追加模型调用'};
  if(run.nodeRepair?.providerSubmitted&&run.nodeRepair.status==='blocked'&&run.nodeRepair.node==='storyboard-review'&&!used('recover-response'))
    return {...base,state:'ready-to-correct',approved:false,action:'recover-response',body:{stage:'planning-repair',recoverProviderResponse:true},reason:'优先免费恢复本次已保存响应'};
  if(node==='storyboard-review'&&run.nextStage==='candidates'&&run.candidatesReady===false&&
    run.candidateIssues?.some(i=>/^候选依据已变化/u.test(String(i)))&&!used('candidate-recheck'))
    return {...base,state:'ready-to-correct',action:'candidate-recheck',body:{stage:'candidates'},reason:'07补全使候选依据变化；免费调用原06候选生成与全部校验，刷新依赖后继续07，不重签旧候选或调用模型'};
  if(node==='render-all'&&run.nextStage==='sample'&&run.sample===false&&run.sampleApproved===false&&run.scenesReady===true&&
    run.lastFailure?.cause==='The first-shot sample must be approved before full rendering'&&!used('rebuild-sample'))
    return {...base,state:'ready-to-correct',action:'rebuild-sample',body:{stage:'sample'},reason:'工程源码更新使样片失效；正式重建当前样片并重新走审核，不重试整片或沿用过期批准'};
  if(policy?.freeStage&&!used('local-recheck'))return {...base,state:'ready-to-correct',approved:false,action:'local-recheck',body:{stage:policy.freeStage},reason:'先在当前节点恢复已有绑定并执行原检查'};
  const sourceRetry=sourcePlan?.transportRetry;
  const retryToken=dueSourceRetryToken(sourcePlan,now);
  const retryAttempts=attempts.filter(a=>a.action==='material-completion'&&a.sourceRetryToken===retryToken);
  const beforeLaunchFailure=a=>a.status==='dispatch-failed'&&/无法启动任务子进程（EPERM）/u.test(a.error||'');
  if(retryToken&&retryAttempts.some(a=>beforeLaunchFailure(a)&&a.dispatcherPid===process.pid))
    return {...base,state:'waiting-code-reload',action:null,reason:'操作台尚不能启动节点子进程；保留素材与重试凭据，正常重启服务后免费恢复，不在同一受限进程内循环。'};
  const recoverTransport=retryToken&&!retryAttempts.some(a=>!beforeLaunchFailure(a)||a.dispatcherPid===process.pid);
  if(sourcePlan?.needs?.length&&governance&&['candidates','storyboard-review','preflight'].includes(node)&&(!used('material-completion')||recoverTransport))
    return {...base,state:'ready-to-correct',action:'material-completion',body:{stage:'material-completion'},materialCompletionPlan:sourcePlan,
      reason:'中心核对逐镜模板、素材槽与完整缺项后，调度正式采集绑定处理器；保留原稿和已有素材，补齐后继续原门禁复检，不以付费换卡代替采集'};
  if(sourcePlan?.needs?.length&&governance&&used('material-completion')&&sourceRetry&&sourceRetry.failures<sourceRetry.maxFailures&&Date.parse(sourceRetry.notBefore)>now)
    return {...base,state:'waiting-source-retry',action:null,retryAt:sourceRetry.notBefore,materialCompletionPlan:sourcePlan,
      reason:'来源服务限流，已保留本次候选与成功绑定；到退避时间后正式节点自动恢复，最多三次限流事件，不调用付费模型或原样空转。'};
  if(sourcePlan?.needs?.length&&governance&&used('material-completion')&&feedback?.failedChecks?.every(i=>
    ['BACKGROUND_NOT_BOUND','TEXT_VIDEO_REQUIRED','local_material_unmatched','REAL_SOURCE_NOT_BOUND','REVIEWED_SOURCE_BINDING_REJECTED'].includes(i.code)))
    return {...base,state:'needs-source-verification',action:null,materialCompletionPlan:sourcePlan,
      reason:`正式素材处理器已完成本轮采集与复检，仍有${sourcePlan.needs.length}个真实资料槽需要可用来源或内容核验。候选和下载缓存保留，不将来源缺项误送创作修订，不重复检索或收费。详见qa/material-completion.json。`};
  const reuseOnly=feedback?.failedChecks?.length&&feedback.failedChecks.every(i=>i.code==='template_window_reuse');
  if(reuseOnly&&!authorization)
    return {...base,state:'needs-repair',action:null,
      jointRepairShotIds:[...new Set(feedback.failedChecks.flatMap(i=>[i.previousShotId,i.shotId]).filter(Boolean))],
      reason:`仍有${feedback.failedChecks.length}组重复选卡冲突，须按完整联合方案补齐替代设计；当前返回没有完整备选参数、素材及锚点，不自动换卡或追加付费`};
  const videoNeeded=node==='candidates'&&feedback?.failedChecks?.some(i=>i.code==='TEXT_VIDEO_REQUIRED'&&i.repair==='material-binding');
  if(videoNeeded){
    if(!used('source-discovery'))return {...base,state:'ready-to-correct',action:'source-discovery',body:{stage:'material-research'},reason:'普通论述缺真实背景：06先免费检索和恢复当前来源，不以付费换卡替代素材补全'};
    if(!used('source-recheck'))return {...base,state:'ready-to-correct',action:'source-recheck',body:{stage:'candidates'},reason:'06检索后执行既有绑定恢复与真实文件复检，不把候选链接当已绑定'};
    if(feedback.failedChecks.every(i=>i.code==='TEXT_VIDEO_REQUIRED'))return {...base,state:'needs-source-verification',action:null,reason:'当前真实视频尚未通过来源与绑定核验；保留可恢复结果，不重复计费或用色块替代'};
  }
  const sourceNeeded=node==='candidates'&&feedback?.failedChecks?.some(i=>i.code==='REAL_SOURCE_NOT_BOUND');
  if(sourceNeeded){
    if(institutionRepair?.alternatives?.length&&!used('institution-source-reuse'))return {...base,
      state:'ready-to-correct',action:'institution-source-reuse',sourcePlan:institutionRepair,
      body:{stage:'institution-source-repair'},reason:'同一机构的已有已核验官方原件可替代未绑定的身份素材；保留原检索记录，不授权徽标或肖像，不替代数据和证据'};
    if(!used('source-discovery'))return {...base,state:'ready-to-correct',action:'source-discovery',
      body:{stage:'material-research'},reason:'存在真实来源缺项：由06先免费检索资料，不用付费重选卡代替来源核验'};
    if(!used('source-recheck'))return {...base,state:'ready-to-correct',action:'source-recheck',
      body:{stage:'candidates'},reason:'资料检索后由06恢复已核验绑定并复检；候选URL不代表许可或素材已齐'};
    if(feedback.failedChecks.every(i=>i.code==='REAL_SOURCE_NOT_BOUND'))return {...base,state:'needs-source-verification',action:null,
      reason:'06已执行免费检索和绑定复检，仍缺可核验来源；保留真实缺项，不重复检索或付费换卡，不推断许可'};
  }
  if(feedback?.failedChecks?.some(i=>['TEXT_EFFECT_CONTRACT_REQUIRED','TEXT_EFFECT_SOURCE_CONTRACT_REQUIRED','TEXT_EFFECT_SOURCE_CHANGED'].includes(i.code)))
    return {...base,state:'needs-code-audit',action:null,reason:'模板时序源码契约缺失或指纹变化；先完成代码审计并免费复检，不交模型创作或消耗费用授权'};
  if(repeatedPaidScope)return {...base,state:'needs-repair',action:null,repeatedPaidScope,reason:'本次目标镜头的相同问题已提交过模型，识别到跨事务修订循环；先治理输入或恢复代码，不因切换问题类别或更新规则再次计费'};
  const creative=reuseOnly||feedback?.failedChecks?.some(i=>creativeCode(i.code));
  // Match the formal revision entry before reserving any model action.
  // A dispatch rejection is not a provider response or evidence of non-convergence.
  if(creative&&run.storyboardAdjustmentPending===false)
    return {...base,state:'waiting-input',action:null,reason:'本次调整要求尚未处于待处理状态；须通过正式调整入口登记当前要求，再校验发送前合同，不调用模型或沿用已处理的旧要求'};
  if(creative&&(run.inputReady===false||(run.shotbook===false&&run.editorialRepairReady===false)))
    return {...base,state:'waiting-input',action:null,reason:'正式分镜修订输入尚未就绪；先免费恢复本次输入，不预留模型执行或判为修订未收敛'};
  const rejectedDispatch=attempts.findLast(a=>a.action==='editorial-repair'&&a.progressKey===progressKey&&a.status==='dispatch-failed');
  if(progressKey&&rejectedDispatch)
    return {...base,state:'needs-code-audit',action:null,reason:'正式修订调度失败，不能当作模型返回未收敛，也不自动重试：'+String(rejectedDispatch.error||'未返回具体原因')};
  if(progressKey&&attempts.some(a=>a.action==='editorial-repair'&&a.progressKey===progressKey))
    return {...base,state:'needs-repair',action:null,reason:'本次失败范围没有收敛，不因模型改写返回形式再次付费；先治理约束或恢复代码'};
  if(creative&&revisionPlanError)return {...base,state:'needs-repair',action:null,reason:'正式发送前合同未通过：'+revisionPlanError};
  if(creative&&revisionPlan){
    const editable=new Set(revisionPlan.editableShotIds||[]);
    const missing=[...new Set((feedback.failedChecks||[]).filter(i=>!['REAL_SOURCE_NOT_BOUND','template_window_reuse'].includes(i.code))
      .flatMap(i=>[i.shotId,i.displayShotId,...(i.shotIds||[])]).filter(id=>id&&!editable.has(id)))];
    if(revisionPlan.batch?.deferredShotIds?.length||revisionPlan.deferredShotIds?.length||missing.length)
      return {...base,state:'needs-code-audit',action:null,reason:'修正方案未覆盖本次完整失败范围，禁止按单镜或子集拆分计费；遗漏镜头：'+missing.join('、')};
    if(reuseOnly&&feedback.failedChecks.some(i=>!editable.has(i.shotId)&&!editable.has(i.previousShotId)))
      return {...base,state:'needs-code-audit',action:null,reason:'联合修订未覆盖全部重复选卡冲突边，禁止拆分计费'};
  }

  if(creative&&['editorial','candidates','storyboard-review','preflight'].includes(node)&&!used('editorial-repair')){
    const grant=authorization?.schema==='talkcraft-correction-authorization-v1'&&authorization.runId===run.runId&&
      Date.parse(authorization.expiresAt)>now&&authorization.scope?.includes(node)&&
      digest(authorization.inputs)===digest(inputs)&&digest(authorization.provider)===digest(provider);
    if(grant&&authorization.maxModelTasks===1&&attempts.some(a=>a.action==='editorial-repair'&&a.authorizationSha256===digest(authorization)))
      return {...base,state:'needs-repair',action:null,reason:'本次治理模型额度已预留或使用；先恢复现有结果，不自动追加计费'};
    if(grant)return {...base,...(revisionPlan?{revisionPlan}:{}),state:'ready-to-correct',approved:false,action:'editorial-repair',
      body:{stage:'editorial-revision',approveModelCost:true,authorizationNote:authorization.approval},reason:'按本次有效授权修订完整失败范围；原始返回、锁定内容及全部门禁保留'};
    return {...base,state:'waiting-authorization',action:null,reason:'创作修订需要本次有效费用授权，不能自行扩大授权'};
  }
  return {...base,state:'needs-repair',action:null,reason:'同一输入的免费恢复已检查；需补真实资料或修程序，禁止原样空转、改业务值或放宽校验'};
}

