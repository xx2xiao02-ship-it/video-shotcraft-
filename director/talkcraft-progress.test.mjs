import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {talkcraftWorkflowProgress} from './talkcraft-progress.mjs';
import {MANAGED_WORKFLOW_NODES,TALKCRAFT_PARALLEL_CONTRACT} from './talkcraft-workflow-contract.mjs';

const runId='e39e8a9d-0740-43df-8729-43d034f0d62a';
const base={runId,workflowPath:'planned-runninghub',digitalHumanGenerationPlanned:true,
  inputReady:true,wordTimingReady:true,semanticPassed:true,shotbook:true,
  mediaPreparationPassed:true,candidatesReady:true,planningPassed:true,storyboardApproved:true,
  digitalHuman:{required:true,ready:true},mediaPreflightPassed:true,preflightPassed:true,
  scaffoldReady:true,sample:true,sampleApproved:true,final:true,qaPassed:true,reviewPassed:true,delivery:true};
const node=(workflow,id)=>workflow.nodes.find(item=>item.id===id);

test('后端唯一输出15个稳定节点及编号',()=>{
  const p=talkcraftWorkflowProgress(base);
  assert.equal(p.schema,'talkcraft-workflow-contract-v2');
  assert.equal(p.total,15);assert.equal(p.currentNode,null);
  assert.deepEqual(p.nodes.map(n=>n.id),MANAGED_WORKFLOW_NODES.map(n=>n.id));
  assert.deepEqual(p.nodes.map(n=>n.number),Array.from({length:15},(_,i)=>i+1));
  assert.equal(node(p,'preflight').number,9);
  assert.equal(node(p,'preflight').label,'分镜全量预检');
});

test('候选文件或旧产物不能越级推进，后续旧结果显示需重验',()=>{
  const p=talkcraftWorkflowProgress({...base,candidatesReady:false,candidatesCompleted:true,
    candidateIssues:['候选依据已变化'],nextStage:'candidates'});
  assert.equal(p.currentNode,'candidates');assert.equal(node(p,'candidates').number,6);
  assert.equal(node(p,'candidates').status,'blocked');assert.match(node(p,'candidates').detail,/候选依据/);
  for(const id of ['storyboard-review','digital-human','preflight','scaffold','sample','render-all','qa','review','deliver'])
    assert.equal(node(p,id).status,'stale',id);
});

test('历史后续失败不覆盖当前节点自己的阻断',()=>{
  const p=talkcraftWorkflowProgress({...base,candidatesReady:false,candidatesCompleted:true,
    candidateIssues:['正式选卡不在候选内'],lastFailure:{task:{name:'talkcraft-preflight'},cause:'旧预检失败'}});
  assert.equal(p.currentNode,'candidates');assert.equal(node(p,'candidates').status,'blocked');
  assert.match(node(p,'candidates').detail,/正式选卡/);
  assert.equal(p.outOfOrderActivity.node,'preflight');
});

test('分镜校验与审核由后端合并，两个阶段缺一不可',()=>{
  let p=talkcraftWorkflowProgress({...base,planningPassed:true,storyboardApproved:false,
    digitalHuman:{required:true,ready:false},mediaPreflightPassed:false,preflightPassed:false,scaffoldReady:false,sample:false,sampleApproved:false,final:false,qaPassed:false,reviewPassed:false,delivery:false});
  const review=node(p,'storyboard-review');
  assert.equal(review.number,7);assert.equal(review.status,'waiting');
  assert.deepEqual(review.phases.map(x=>[x.id,x.done]),[['planning-check',true],['approve-storyboard',false]]);
  p=talkcraftWorkflowProgress({...base,planningPassed:false,storyboardApproved:true});
  assert.equal(p.currentNode,'storyboard-review');assert.equal(node(p,'storyboard-review').status,'waiting');
});

test('数字人生成与验收是同一主节点，验收完成后才进入09全量预检',()=>{
  const common={...base,digitalHuman:{required:true,ready:true},mediaPreflightPassed:false,
    preflightPassed:false,scaffoldReady:false,sample:false,sampleApproved:false,final:false,qaPassed:false,reviewPassed:false,delivery:false};
  let p=talkcraftWorkflowProgress({...common,nextStage:'host-preflight'});
  assert.equal(p.currentNode,'digital-human');assert.equal(node(p,'digital-human').number,8);
  assert.deepEqual(node(p,'digital-human').phases.map(x=>x.done),[true,false]);
  p=talkcraftWorkflowProgress({...common,mediaPreflightPassed:true});
  assert.equal(p.currentNode,'preflight');assert.equal(node(p,'preflight').number,9);
});

test('全量预检未通过时场景、样片和整片不能保持绿色',()=>{
  const p=talkcraftWorkflowProgress({...base,preflightPassed:false,preflightCompleted:true,
    preflightIssues:['模板绑定失效'],nextStage:'preflight'});
  assert.equal(p.currentNode,'preflight');assert.equal(node(p,'preflight').status,'blocked');
  assert.equal(node(p,'scaffold').status,'stale');assert.equal(node(p,'sample').status,'stale');
  assert.equal(node(p,'render-all').status,'stale');
});

test('后续局部任务只作为旁路活动显示，不改变主线前沿',()=>{
  const p=talkcraftWorkflowProgress({...base,semanticPassed:false,shotbook:false,candidatesReady:false,
    planningPassed:false,storyboardApproved:false,digitalHuman:{required:true,ready:false},mediaPreflightPassed:false,
    preflightPassed:false,scaffoldReady:false,sample:false,sampleApproved:false,final:false,qaPassed:false,reviewPassed:false,delivery:false,
    activeTask:{name:'talkcraft-preflight',status:'running',message:'局部复查'}});
  assert.equal(p.currentNode,'semantics');assert.equal(p.outOfOrderActivity.node,'preflight');
  assert.equal(node(p,'preflight').status,'pending');
});

test('真人视频路径保持原版语义后素材体检再进入SHOTBOOK',()=>{
  const p=talkcraftWorkflowProgress({...base,workflowPath:'recorded-host',digitalHumanGenerationPlanned:false,
    semanticPassed:true,mediaPreflightPassed:false,shotbook:false,candidatesReady:false,planningPassed:false,
    storyboardApproved:false,preflightPassed:false,scaffoldReady:false,sample:false,sampleApproved:false,
    final:false,qaPassed:false,reviewPassed:false,delivery:false,digitalHuman:{required:false}});
  assert.equal(p.total,14);assert.equal(node(p,'generation-input').number,4);
  assert.equal(node(p,'editorial').number,5);assert.equal(p.currentNode,'generation-input');
});

test('并行支线只能在审核后启动并在全量预检前汇合',()=>{
  assert.equal(TALKCRAFT_PARALLEL_CONTRACT.startsAfter,'storyboard-review');
  assert.equal(TALKCRAFT_PARALLEL_CONTRACT.joinBefore,'preflight');
  assert.deepEqual(TALKCRAFT_PARALLEL_CONTRACT.lanes.map(x=>x.id),
    ['digital-human','template-runtime','materials','scaffold-shell']);
});

class Element{constructor(){this.dataset={};this.children=[];this.hidden=true;this.attrs={};}append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}setAttribute(k,v){this.attrs[k]=v}}
const renderer=readFileSync(new URL('./talkcraft-progress-ui.js',import.meta.url),'utf8');
test('前端不再合并或重编号后端节点',()=>{
  const c=vm.createContext({document:{createElement:()=>new Element()}});vm.runInContext(renderer,c);
  const backend=talkcraftWorkflowProgress({...base,preflightPassed:false,scaffoldReady:false,sample:false,sampleApproved:false,final:false,qaPassed:false,reviewPassed:false,delivery:false});
  assert.equal(c.talkcraftProgressDisplay(backend),backend);
  const host=new Element();c.renderTalkcraftProgress(host,backend);
  assert.equal(host.children[1].children.length,15);
  assert.equal(host.children[1].children[8].dataset.node,'preflight');
  assert.equal(host.children[1].children[7].children[0].children[2].textContent,'汇合门禁');
  assert.equal(host.children[1].children[11].children[0].children[2].textContent,'节点内并行');
  assert.equal(host.children[2].className,'talkcraft-parallel-contract');
  assert.match(host.children[2].children[0].textContent,/07.*09/);
});
