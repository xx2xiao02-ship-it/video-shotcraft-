import {isVisualDiagnosticFailure} from './talkcraft-acceptance-policy.mjs';
import {MANAGED_WORKFLOW_NODES,RECORDED_HOST_WORKFLOW_NODES,TALKCRAFT_PARALLEL_CONTRACT,
  TALKCRAFT_WORKFLOW_SCHEMA,workflowNodeForTask} from './talkcraft-workflow-contract.mjs';

const rawPassed=(id,r)=>({
  input:r.inputReady===true,
  'word-timing':r.wordTimingReady===true,
  semantics:r.semanticPassed===true,
  editorial:r.shotbook===true&&r.semanticPassed===true&&r.editorialChecked!==false,
  'generation-input':r.workflowPath==='recorded-host'?r.mediaPreflightPassed===true:
    r.digitalHumanGenerationPlanned===true?r.mediaPreparationPassed===true:
    (r.mediaPreparationPassed??r.mediaPreflightPassed??r.preflightPassed)===true,
  candidates:r.candidatesReady===true,
  'storyboard-review':r.planningPassed===true&&r.storyboardApproved===true,
  'digital-human':r.digitalHuman?.ready===true&&r.mediaPreflightPassed===true,
  preflight:r.preflightPassed===true,
  scaffold:(r.scaffoldReady??(r.workbenchReady===true&&r.scenesReady===true))===true,
  sample:r.sample===true&&r.sampleApproved===true,
  'render-all':r.final===true,
  qa:r.qaPassed===true,
  review:r.reviewPassed===true,
  deliver:r.delivery===true,
})[id]===true;

const phaseRows=(node,run)=>{
  if(!node.phases)return undefined;
  return node.phases.map(id=>({id,label:({
    'planning-check':'分镜规划校验','approve-storyboard':'分镜人工审核',
    'digital-human':'RunningHub 口型生成','host-preflight':'口型视频验收',
    sample:'有声样片生成','approve-sample':'样片人工审核',
  })[id]||id,done:({
    'planning-check':run.planningPassed===true,'approve-storyboard':run.storyboardApproved===true,
    'digital-human':run.digitalHuman?.ready===true,'host-preflight':run.mediaPreflightPassed===true,
    sample:run.sample===true,'approve-sample':run.sampleApproved===true,
  })[id]===true})).map(phase=>({...phase,status:phase.done?'done':'pending',stateLabel:phase.done?'已完成':'待处理'}));
};

const states={done:'已完成',pending:'未开始',running:'执行中',stopping:'停止中',blocked:'已阻断',waiting:'待处理',skipped:'无需执行',stale:'需重验'};

export function talkcraftWorkflowProgress(run) {
  const managed=run.digitalHumanGenerationPlanned===true;
  const contract=run.workflowPath==='recorded-host'?RECORDED_HOST_WORKFLOW_NODES:MANAGED_WORKFLOW_NODES;
  let frontier=false;
  const nodes=contract.map((definition,index)=>{
    const skipped=definition.id==='digital-human'&&run.digitalHuman?.required===false;
    const passed=rawPassed(definition.id,run);
    let status;
    if(skipped)status='skipped';
    else if(!frontier&&passed)status='done';
    else {
      if(!frontier)frontier=true;
      status=passed?'stale':'pending';
    }
    return {...definition,number:index+1,status,stateLabel:states[status],phases:phaseRows(definition,run)};
  });
  const active=run.activeTask;
  const failure=!active&&!isVisualDiagnosticFailure(run.lastFailure)&&run.lastFailure;
  const requested=workflowNodeForTask(active?.name||failure?.task?.name||run.nextStage);
  let current=nodes.find(node=>!['done','skipped'].includes(node.status));
  const requestedNode=nodes.find(node=>node.id===requested);
  const separate=requestedNode&&current&&requestedNode.id!==current.id&&(active||failure);
  const outOfOrderActivity=separate?{node:requestedNode.id,label:requestedNode.label,
    status:active?(active.status==='stopping'?'stopping':'running'):'blocked',
    detail:active?.message||failure?.cause||failure?.title||run.waitingFor}:null;
  if(run.provenance?.verified===false)current=nodes[0];
  if(current){
    const belongs=!separate;
    current.status=run.provenance?.verified===false?'blocked':!belongs?'waiting':active?
      (active.status==='stopping'?'stopping':'running'):failure?'blocked':'waiting';
    current.detail=run.provenance?.verified===false?'模式、管线或配音来源核验未通过':
      !belongs?'前置节点尚未完成；当前后台活动不会越级推进主线。':
      active?.message||failure?.cause||failure?.title||run.waitingFor||'等待后端执行';
    if((!active||separate)&&(!failure||separate)&&current.id==='generation-input'&&
       (run.mediaPreparationCompleted??run.mediaPreflightCompleted)===true&&
       (run.workflowPath==='recorded-host'?run.mediaPreflightPassed:run.mediaPreparationPassed)!==true){
      current.status='blocked';current.detail=(run.mediaPreparationIssues||run.mediaPreflightIssues)?.join('；')||'生成输入检查未通过';
    }
    if((!active||separate)&&(!failure||separate)&&current.id==='candidates'&&run.candidatesCompleted===true&&run.candidatesReady!==true){
      current.status='blocked';current.detail=run.candidateIssues?.join('；')||'候选或正式选卡未绑定当前已审模板版本';
    }
    if((!active||separate)&&(!failure||separate)&&current.id==='storyboard-review'&&run.planningCompleted===true&&run.planningPassed!==true){
      current.status='blocked';current.detail=run.planningIssues?.join('；')||'分镜规划校验未通过';
    }
    if((!active||separate)&&(!failure||separate)&&current.id==='preflight'&&run.preflightCompleted===true&&run.preflightPassed!==true){
      current.status='blocked';current.detail=run.preflightIssues?.join('；')||'GitHub 原版全量预检未通过';
    }
    current.stateLabel=states[current.status];
  }
  for(const node of nodes)node.stateLabel=states[node.status];
  return {schema:TALKCRAFT_WORKFLOW_SCHEMA,runId:run.runId,workflowPath:run.workflowPath,
    workflowLabel:run.workflowPath==='recorded-host'?'真人视频 · 原声与 GitHub 原版流程':managed?'数字人 · 分镜审核后生成口型':'既有任务流程',
    currentNode:current?.id||null,completed:nodes.filter(n=>n.status==='done').length,total:nodes.length,
    skipped:nodes.filter(n=>n.status==='skipped').length,nodes,outOfOrderActivity,
    parallelPreparation:run.parallelPreparation||null,parallelContract:TALKCRAFT_PARALLEL_CONTRACT};
}
