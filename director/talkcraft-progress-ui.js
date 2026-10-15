// Group adjacent workflow steps for display only; backend gates stay separate.
// Read-only compatibility for an already-running console: the worker's own report
// remains observable without restarting or interrupting the paid task.
async function readTalkcraftParallelDisplay(run){
  if(run.parallelPreparation)return run.parallelPreparation;
  if(!run.digitalHumanGenerationPlanned||!run.storyboardApproved||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(run.runId))return null;
  const base='/director/b-mode-runs/'+encodeURIComponent(run.runId)+'/talkcraft/qa/';
  try{
    const response=await fetch(base+'parallel-preparation.json',{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(response.status===404)return null;
    if(!response.ok)throw Error('准备状态读取失败');
    const report=await response.json();
    if(report.schema!=='talkcraft-parallel-preparation-v1'||report.runId!==run.runId)throw Error('准备记录不属于当前任务');
    const approval=await fetch(base+'storyboard-approved.json',{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!approval.ok)throw Error('无法核对准备记录的审核版本');
    const bytes=await approval.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==report.approvalSha256)return {...report,status:'stale',error:'分镜审核版本已变化，旧准备结果不可用于当前制作'};
    return report;
  }catch(e){return {status:'unknown',error:e.message,lanes:[]};}
}

function talkcraftProgressDisplay(workflow) {
  if(!workflow?.nodes?.length)return workflow;
  const groups={
    'planning-check':{next:'approve-storyboard',label:'分镜校验与审核',task:'校验分镜规划，通过后等待你审核'},
    'digital-human':{next:'host-preflight',label:'数字人生成与验收',task:'RunningHub 生成已审核出镜区间，再检查实际视频的帧率、重复帧、时长与区间',waitingLabel:'待验收',runningLabels:['生成中','验收中']},
    sample:{next:'approve-sample',label:'样片生成与审核',task:'生成有声样片，通过检查后等待你审核'},
  };
  const nodes=[];let currentNode=workflow.currentNode;
  for(let i=0;i<workflow.nodes.length;i++){
    const source=workflow.nodes[i],group=groups[source.id],next=workflow.nodes[i+1];
    let node={...source};
    if(group&&next?.id===group.next){
      const phases=[source,next],unfinished=phases.find(phase=>!['done','skipped'].includes(phase.status));
      const phase=unfinished||next;
      node={...source,label:group.label,task:group.task,phases,status:unfinished?phase.status:'done',
        stateLabel:unfinished?phase.stateLabel:'已完成',detail:unfinished?(phase.detail||phase.task):undefined};
      if(unfinished?.status==='running'&&group.runningLabels)node.stateLabel=group.runningLabels[phases.indexOf(unfinished)];
      if(source.status==='done'&&['pending','waiting'].includes(next.status)){
        node.status='waiting';node.stateLabel=group.waitingLabel||'待审核';
      }
      if(phases.some(phase=>phase.id===workflow.currentNode))currentNode=node.id;
      i++;
    }
    nodes.push({...node,number:nodes.length+1});
  }
  return {...workflow,nodes,currentNode,total:nodes.length,
    completed:nodes.filter(node=>node.status==='done').length,
    skipped:nodes.filter(node=>node.status==='skipped').length};
}

function renderTalkcraftProgress(host, workflow, {disconnected=false}={}) {
  if(!host)return;
  host.hidden=false;
  if(!workflow?.nodes?.length){
    if(host.dataset.runId) return; // Keep the last observed nodes during reconnects.
    host.textContent='正在读取后端节点状态…';return;
  }
  if(disconnected) workflow={...workflow,nodes:workflow.nodes.map(node=>node.id===workflow.currentNode?
    {...node,status:'unknown',stateLabel:'待同步',detail:'状态同步中断，暂时无法确认后台是否结束；保留最后确认的已完成节点。'}:node)};
  workflow=talkcraftProgressDisplay(workflow);
  const signature=JSON.stringify(workflow);
  if(host.dataset.snapshot===signature)return;
  host.dataset.snapshot=signature;host.dataset.runId=workflow.runId;
  const el=(tag,className,text)=>{const item=document.createElement(tag);item.className=className;if(text)item.textContent=text;return item;};
  const current=workflow.nodes.find(node=>node.id===workflow.currentNode);
  const heading=el('div','talkcraft-node-current');
  if(current){
    heading.dataset.status=current.status;
    heading.append(el('strong','',`当前${current.status==='blocked'?'阻断':'节点'}：${String(current.number).padStart(2,'0')} · ${current.label} · ${current.stateLabel}`));
    heading.append(el('p','',current.detail||current.task));
  }else heading.append(el('strong','','所有制作节点已完成'));
  if(workflow.workflowLabel)heading.append(el('p','',`本次路径：${workflow.workflowLabel}`));
  if(workflow.outOfOrderActivity){
    const other=workflow.outOfOrderActivity;
    heading.append(el('p','talkcraft-node-observation',`另有局部检查：${other.label} · ${other.status==='running'?'执行中':other.status==='stopping'?'停止中':'未通过'}。${other.detail||''}；此记录不代表前置节点已完成。`));
  }
  const list=el('ol','talkcraft-node-list');list.setAttribute('aria-label','视频制作任务节点');
  for(const node of workflow.nodes){
    const item=el('li','talkcraft-node');item.dataset.node=node.id;item.dataset.status=node.status;
    if(node.id===workflow.currentNode)item.setAttribute('aria-current','step');
    const title=el('div','talkcraft-node-heading');
    title.append(el('span','talkcraft-node-number',node.status==='done'?'✓':String(node.number).padStart(2,'0')),
      el('strong','',node.label));
    item.append(title,el('p','talkcraft-node-task',node.task));
    if(node.phases)for(const phase of node.phases){
      item.append(el('p','talkcraft-node-task',`${phase.label}：${phase.stateLabel}`));
    }
    item.append(el('span','talkcraft-node-status',node.stateLabel));list.append(item);
  }
  host.replaceChildren(heading,list);
  const preparation=workflow.parallelPreparation;
  if(preparation){
    const panel=el('section','talkcraft-node-current');panel.dataset.preparation=preparation.status;
    const labels={done:'已就绪',running:'执行中',failed:'未通过',stale:'版本已变化',interrupted:'已中断',pending:'排队中',unknown:'待同步'};
    panel.append(el('strong','',`并行准备 · ${labels[preparation.status]||preparation.status}`),
      el('p','','与 RunningHub 独立执行；准备就绪后仍需口型验收和全量预检。'));
    for(const lane of preparation.lanes||[])panel.append(el('p','',`${lane.label}：${labels[lane.status]||lane.status}${lane.error?' · '+lane.error:''}`));
    if(preparation.error)panel.append(el('p','',preparation.error));
    host.append(panel);
  }
}
