import {createHash} from 'node:crypto';
import {MANAGED_WORKFLOW_NODES,workflowNodeForTask} from './talkcraft-workflow-contract.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x??null)).digest('hex');
const localStages={input:'recover-timing','word-timing':'recover-alignment',semantics:'semantic-check',editorial:'editorial-check',
  'generation-input':'media-preflight',candidates:'candidates','storyboard-review':'planning-check','digital-human':'host-preflight',
  preflight:'preflight',scaffold:'scaffold',sample:'sample','render-all':'render-all',qa:'qa',review:null,deliver:null};
export const CORRECTION_NODE_POLICIES=MANAGED_WORKFLOW_NODES.map(n=>({node:n.id,
  freeStage:localStages[n.id],supportsCorrection:true,automaticApproval:false,
  rule:n.id==='review'?'用户审核决定；不得代批':n.id==='deliver'?'仅导出已审核版本，不自动发布':'本节点先恢复、补全、复检；不能重写程序或绕过原门禁'}));
export const creativeCode=c=>/^(?:FILM_TEXT_DOMINANCE|GRAPHIC_COMPARISON_REQUIRED|TEXT_VIDEO_CYCLE_REQUIRED|HOST_CONTENT_REGION_CONFLICT|TEXT_LAYOUT_CAPACITY|DEMO_VISUAL_NOT_REPLACEABLE|STRUCTURE_ITEMS_REQUIRED|NATIVE_|EDITORIAL_|DATA_FORMAT|PROP_|REQUIRED_PROP|MATERIAL_DISPLAY_|MATERIAL_PERSON_LABEL_PLAN_INVALID)/u.test(c||'');

export function correctionNode(run){
  if(run.editorialChecked===false&&['editorial-check','editorial'].includes(run.nextStage))return 'editorial';
  return workflowNodeForTask(run.lastFailure?.task?.name||run.nextStage);
}
export function proposeNodeCorrection({run,feedback,attempts=[],fingerprint,progressKey,authorization,inputs,provider,unsubmitted,now=Date.now()}){
  const node=correctionNode(run),policy=CORRECTION_NODE_POLICIES.find(p=>p.node===node);
  const base={schema:'talkcraft-correction-decision-v1',runId:run.runId,node,issues:feedback?.failedChecks||[],
    globalRules:['graphic-first','real-media-slots','word-time','text-capacity','host-content-separation','caption-outline'],
    fingerprint,approved:false,productionAdmitted:false,userAcceptance:false};
  if(run.activeTask)return {...base,state:'correcting',action:null,reason:'正式任务执行中，不重复调度'};
  if(!run.provenance?.verified)return {...base,state:'waiting-input',action:null,reason:'先核验本次管线身份，不串用历史任务'};
  if(['review','deliver'].includes(node)||['approve-final','deliver'].includes(run.nextStage))
    return {...base,state:'waiting-review',action:null,reason:'停在14等待用户，不代替人工审核'};
  if(!run.lastFailure&&!run.failureReport)return {...base,state:'ready',action:null,reason:'无当前失败，由正式主线继续'};
  const used=action=>attempts.some(a=>a.fingerprint===fingerprint&&a.action===action);
  if(!run.editorialResponseSaved&&feedback?.snapshot&&unsubmitted?.schema==='talkcraft-editorial-revision-authorization-v1'&&
    unsubmitted.runId===run.runId&&unsubmitted.startedAt&&!unsubmitted.completedAt&&!unsubmitted.recoveredInputs&&!used('restore-unsubmitted'))
    return {...base,state:'ready-to-correct',approved:false,action:'restore-unsubmitted',body:{stage:'editorial-recover',restoreUnsubmitted:true},reason:'先免费恢复本次发送前失败的原分镜快照；不重新调用模型'};
  if(run.nodeRepair?.providerSubmitted&&run.nodeRepair.status==='blocked'&&run.nodeRepair.node==='storyboard-review'&&!used('recover-response'))
    return {...base,state:'ready-to-correct',approved:false,action:'recover-response',body:{stage:'planning-repair',recoverProviderResponse:true},reason:'优先免费恢复本次已保存响应'};
  if(policy?.freeStage&&!used('local-recheck'))return {...base,state:'ready-to-correct',approved:false,action:'local-recheck',body:{stage:policy.freeStage},reason:'先在当前节点恢复已有绑定并执行原检查'};
  const creative=feedback?.failedChecks?.some(i=>creativeCode(i.code));
  if(progressKey&&attempts.some(a=>a.action==='editorial-repair'&&a.progressKey===progressKey))
    return {...base,state:'needs-repair',action:null,reason:'本次失败范围没有收敛，不因模型改写返回形式再次付费；先治理约束或恢复代码'};
  if(creative&&['editorial','candidates','storyboard-review','preflight'].includes(node)&&!used('editorial-repair')){
    const grant=authorization?.schema==='talkcraft-correction-authorization-v1'&&authorization.runId===run.runId&&
      Date.parse(authorization.expiresAt)>now&&authorization.scope?.includes(node)&&
      digest(authorization.inputs)===digest(inputs)&&digest(authorization.provider)===digest(provider);
    if(grant)return {...base,state:'ready-to-correct',approved:false,action:'editorial-repair',
      body:{stage:'editorial-revision',approveModelCost:true,authorizationNote:authorization.approval},reason:'按本次有效授权修订完整失败范围；原始返回、锁定内容及全部门禁保留'};
    return {...base,state:'waiting-authorization',action:null,reason:'创作修订需要本次有效费用授权，不能自行扩大授权'};
  }
  return {...base,state:'needs-repair',action:null,reason:'同一输入的免费恢复已检查；需补真实资料或修程序，禁止原样空转、改业务值或放宽校验'};
}

