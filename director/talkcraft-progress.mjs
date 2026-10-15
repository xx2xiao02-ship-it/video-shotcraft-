// Observation only: this projection never schedules work or changes approval gates.
const definitions = [
  ['input','文案与配音','保存文案，生成或接收完整配音',r=>r.inputReady===true],
  ['word-timing','字级时间轴','核对逐字发音时间与文案映射',r=>r.wordTimingReady===true],
  ['semantics','逐句语义标注','按原稿标注语义与重点，校验逐句对应',r=>r.semanticPassed===true],
  ['materials','素材输入与准备','按分镜核对真实素材、角色图和配音；口型由后续 RunningHub 节点生成',r=>(r.mediaPreparationPassed??r.mediaPreflightPassed)===true&&(!r.digitalHumanGenerationPlanned||r.shotbook===true)],
  ['editorial','SHOTBOOK 分镜编排','编写分镜层矩阵，检查句序和连续覆盖',r=>r.shotbook===true&&r.semanticPassed===true],
  ['candidates','镜头候选与选卡','按语义匹配候选并记录编导选卡',r=>r.candidatesReady===true],
  ['preflight','分镜全量预检','执行原 Skill ④→⑤ 预检，检查分镜、素材及模板约束',r=>r.preflightPassed===true],
  ['approve-storyboard','分镜审核','确认分镜，记录当前版本审批',r=>r.storyboardApproved===true],
  ['scaffold','渲染工程与场景','搭建工程，绑定逐镜模板和素材',r=>r.workbenchReady===true&&r.scenesReady===true],
  ['digital-human','RunningHub 口型生成与绑定','按已审核人物出镜区间生成口型视频，再体检并绑定',r=>r.digitalHuman?.ready===true&&r.mediaPreflightPassed===true],
  ['sample','首镜样板','渲染有声样板并检查实际画面',r=>r.sample===true],
  ['approve-sample','样板审核','确认样板，记录对应版本审批',r=>r.sampleApproved===true],
  ['render-all','整片渲染','分段渲染、合成画面与声音',r=>r.final===true],
  ['qa','机器质检','检查解码、音画、动效与绑定',r=>r.qaPassed===true],
  ['review','独立审片','复核全片，修复未关闭的严重问题',r=>r.reviewPassed===true],
  ['deliver','交付导出','导出审核后的可播放成片',r=>r.delivery===true],
];
const aliases={bootstrap:'input','recover-timing':'input','recover-alignment':'word-timing',
  'semantic-init':'semantics','semantic-check':'semantics','semantic-apply':'semantics','media-preflight':'materials',
  'editorial-check':'editorial','editorial-revision':'editorial','editorial-recover':'editorial','semantic-shot-check':'editorial','fact-revision':'input',
  'workbench-contract':'scaffold','visual-card-calls':'scaffold','sample-qa':'sample',
  'sample-2m':'sample','render-qa':'qa','word-reveal-qa':'qa','text-contrast':'qa'};
const nodeForTask=name=>{const stage=String(name||'').replace(/^talkcraft-/u,'');return aliases[stage]||stage;};
const states={done:'已完成',pending:'未开始',running:'执行中',stopping:'停止中',blocked:'已阻断',waiting:'待处理',skipped:'无需执行'};

export function talkcraftWorkflowProgress(run) {
  let ordered=[...definitions];
  const managed=run.digitalHumanGenerationPlanned===true;
  // For provider-generated hosts, the shot windows are inputs to generation.
  // Imported finished host footage keeps the upstream material-before-shotbook order.
  if(managed){
    const byId=Object.fromEntries(definitions.map(row=>[row[0],row]));
    byId.materials=['materials','生成输入检查','生成前核对角色图、原配音及真实画面素材；不检查尚未生成的口型视频',
      r=>r.mediaPreparationPassed===true&&r.shotbook===true];
    byId['planning-check']=['planning-check','分镜规划校验','检查句序、时间覆盖、选卡与人物区间；不代表全量素材通过',r=>r.planningPassed===true];
    byId['digital-human']=['digital-human','RunningHub 口型生成','仅生成已审核的人物出镜区间',r=>r.digitalHuman?.ready===true];
    byId['host-preflight']=['host-preflight','口型视频验收','生成后检查实际视频的帧率、重复帧、时长与出镜区间',r=>r.mediaPreflightPassed===true];
    ordered=['input','word-timing','semantics','editorial','materials','candidates','planning-check','approve-storyboard',
      'digital-human','host-preflight','preflight','scaffold','sample','approve-sample','render-all','qa','review','deliver'].map(id=>byId[id]);
  }
  if(run.workflowPath==='recorded-host'){
    ordered=ordered.filter(row=>!['digital-human','materials'].includes(row[0]));
    // The backend checks uploaded footage before asking the director to annotate
    // semantics. Display that same dependency order rather than a later green node.
    ordered.splice(2,0,['materials','真人素材体检','核验原视频与原声，完成后按 GitHub 原版进入语义与分镜',r=>r.mediaPreflightPassed===true]);
  }
  const nodes=ordered.map(([id,label,task,passed],i)=>({id,number:i+1,label,task,
    status:id==='digital-human'&&run.digitalHuman?.required===false?'skipped':passed(run)?'done':'pending'}));
  const active=run.activeTask;
  const failure=!active&&run.lastFailure;
  const runtimeFailure=!active&&run.blockers?.includes('NATIVE_WORD_RUNTIME_FAILED');
  if(runtimeFailure)nodes.find(n=>n.id==='sample').status='pending';
  const requested=nodeForTask(active?.name||failure?.task?.name||(runtimeFailure?'sample':run.nextStage));
  // Reports from a later standalone check cannot advance the sequential Skill.
  const first=nodes.find(n=>n.status==='pending');
  let current=first;
  const requestedNode=nodes.find(n=>n.id===requested);
  const separate=requestedNode&&current&&requestedNode.id!==current.id&&(active||failure||runtimeFailure);
  const outOfOrderActivity=separate?{node:requestedNode.id,label:requestedNode.label,
    status:active?(active.status==='stopping'?'stopping':'running'):failure?'blocked':'blocked',
    detail:active?.message||failure?.cause||failure?.title||run.waitingFor}:null;
  if(run.provenance?.verified===false)current=nodes[0];
  if(current) {
    const belongs=!separate;
    current.status=run.provenance?.verified===false?'blocked':!belongs?'waiting':active?(active.status==='stopping'?'stopping':'running'):failure?'blocked':'waiting';
    current.detail=run.provenance?.verified===false?'模式、管线或配音来源核验未通过':
      !belongs?'前置节点尚未完成，主流程停在此处。':active?.message||failure?.cause||failure?.title||run.waitingFor||'等待后端执行';
    if(belongs&&runtimeFailure) {
      current.status='blocked';current.detail=run.waitingFor;
    }
    if(!active&&current.id==='materials'&&(run.mediaPreparationCompleted??run.mediaPreflightCompleted)===true&&(run.mediaPreparationPassed??run.mediaPreflightPassed)!==true) {
      current.status='blocked';current.detail=(run.mediaPreparationIssues||run.mediaPreflightIssues)?.join('；')||'素材输入准备未通过';
    }
    if(!active&&!failure&&current.id==='preflight'&&run.preflightCompleted===true&&run.preflightPassed!==true) {
      current.status='blocked';current.detail=run.preflightIssues?.join('；')||run.waitingFor;
    }
  }
  for(const node of nodes)node.stateLabel=states[node.status];
  const completed=nodes.filter(n=>n.status==='done').length,skipped=nodes.filter(n=>n.status==='skipped').length;
  return {schema:'talkcraft-node-progress-v1',runId:run.runId,workflowPath:run.workflowPath,
    workflowLabel:run.workflowPath==='recorded-host'?'真人视频 · 原声与 GitHub 原版流程':managed?'数字人 · 先审分镜再生成口型':'既有任务流程',currentNode:current?.id||null,
    completed,total:nodes.length,skipped,nodes,outOfOrderActivity,parallelPreparation:run.parallelPreparation||null};
}
