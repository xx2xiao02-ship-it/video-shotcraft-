import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {talkcraftWorkflowProgress} from './talkcraft-progress.mjs';
import {talkcraftExecutionView} from './talkcraft-execution.mjs';
const runId='e39e8a9d-0740-43df-8729-43d034f0d62a';
const input={runId,inputReady:true,wordTimingReady:true,semanticPassed:true,mediaPreflightPassed:true,digitalHuman:{required:true,ready:false},nextStage:'editorial'};
const failure={title:'本地校验未通过',cause:'s02 应从第 3 句开始，实际范围为第 2–3 句',task:{name:'talkcraft-editorial'}};
const node=(workflow,id)=>workflow.nodes.find(n=>n.id===id);

test('真人输入体检先于编导语义，不能显示03未完成而04体检已完成',()=>{
  const p=talkcraftWorkflowProgress({...input,workflowPath:'recorded-host',semanticPassed:false,
    digitalHuman:{required:false,ready:true},nextStage:'editorial'});
  assert.equal(node(p,'materials').number,3);
  assert.equal(node(p,'materials').status,'done');
  assert.equal(node(p,'semantics').number,4);
  assert.equal(p.currentNode,'semantics');
  assert.equal(node(p,'editorial').status,'pending');
});

test('分镜失败保留配音与字级时间轴节点，准确指出失败任务和原因',()=>{
  const view=talkcraftExecutionView({...input,lastFailure:failure});
  assert.equal(view.status,'blocked');assert.equal(view.progress,null);
  const workflow=view.workflow;assert.equal(workflow.completed,4);assert.equal(workflow.total,16);
  assert.equal(workflow.currentNode,'editorial');assert.equal(node(workflow,'editorial').status,'blocked');
  assert.match(node(workflow,'editorial').detail,/s02.*第 3 句/);
  assert.equal(node(workflow,'input').status,'done');assert.equal(node(workflow,'render-all').status,'pending');
});
test('重试时活动任务优先，停止中不清空已完成节点；刷新投影一致',()=>{
  const run={...input,lastFailure:failure,activeTask:{name:'talkcraft-editorial-check',status:'running',message:'复用缓存校验分镜'}};
  let p=talkcraftWorkflowProgress(run);assert.equal(p.completed,4);assert.equal(node(p,'editorial').status,'running');
  assert.equal(node(p,'editorial').detail,'复用缓存校验分镜');
  p=talkcraftWorkflowProgress({...run,activeTask:{...run.activeTask,status:'stopping'}});
  assert.equal(node(p,'editorial').status,'stopping');assert.equal(p.completed,4);
  assert.deepEqual(p,talkcraftWorkflowProgress({...run,activeTask:{...run.activeTask,status:'stopping'}}));
});
test('缺校验的分镜和未审核样片不算通过，独立审片和交付分别记录',()=>{
  let p=talkcraftWorkflowProgress({...input,shotbook:true,semanticPassed:false});
  assert.notEqual(node(p,'editorial').status,'done');
  p=talkcraftWorkflowProgress({...input,sample:true,final:true,qaPassed:true,nextStage:null,waitingFor:'独立审片'});
  assert.equal(node(p,'sample').status,'done');assert.equal(node(p,'approve-sample').status,'pending');
  assert.equal(node(p,'review').status,'pending');assert.equal(node(p,'deliver').status,'pending');
});
test('可选数字人明确标注无需执行，不冒充完成；已交付全节点完成',()=>{
  const done={...input,shotbook:true,semanticPassed:true,candidatesReady:true,preflightPassed:true,storyboardApproved:true,
    workbenchReady:true,scenesReady:true,digitalHuman:{required:false},sample:true,sampleApproved:true,final:true,
    qaPassed:true,reviewPassed:true,delivery:true,nextStage:null};
  const p=talkcraftWorkflowProgress(done);assert.equal(p.currentNode,null);assert.equal(p.completed,15);assert.equal(p.skipped,1);
  assert.equal(node(p,'digital-human').status,'skipped');assert.equal(node(p,'deliver').status,'done');
});
test('产物不按阶段顺序推定完成，未知活动任务也落到真实未完成节点',()=>{
  const p=talkcraftWorkflowProgress({...input,wordTimingReady:false,final:true,activeTask:{name:'unknown',status:'running'}});
  assert.equal(p.currentNode,'word-timing');assert.equal(node(p,'editorial').status,'pending');
  assert.equal(node(p,'render-all').status,'done');
});
test('实帧或已完成预检的失败显示在对应校验节点，不误指向整片渲染',()=>{
  let p=talkcraftWorkflowProgress({...input,shotbook:true,semanticPassed:true,candidatesReady:true,
    preflightCompleted:true,preflightPassed:false,nextStage:'preflight',preflightIssues:['缺少真实素材']});
  assert.equal(p.currentNode,'preflight');assert.equal(node(p,'preflight').status,'blocked');
  assert.match(node(p,'preflight').detail,/素材/);
  p=talkcraftWorkflowProgress({...input,shotbook:true,candidatesReady:true,preflightPassed:true,storyboardApproved:true,workbenchReady:true,scenesReady:true,digitalHuman:{required:false},sample:true,nextStage:null,blockers:['NATIVE_WORD_RUNTIME_FAILED'],waitingFor:'修复镜头并重新实帧校验'});
  assert.equal(p.currentNode,'sample');assert.equal(node(p,'sample').status,'blocked');
});

test('真实回归：语义通过、素材缺失时停在04，不跳到分镜全量预检',()=>{
  const p=talkcraftWorkflowProgress({...input,mediaPreflightPassed:false,mediaPreflightCompleted:true,
    mediaPreflightIssues:['[人物素材] FAIL: 文件不存在：remotion/public/dh/host.webm'],
    lastFailure:{cause:'素材体检未通过',task:{name:'talkcraft-media-preflight'}}});
  assert.equal(p.currentNode,'materials');assert.equal(p.completed,3);
  assert.equal(node(p,'semantics').number,3);assert.equal(node(p,'semantics').status,'done');
  assert.equal(node(p,'materials').number,4);assert.equal(node(p,'materials').status,'blocked');
  assert.match(node(p,'materials').detail,/host.webm/);
  assert.equal(node(p,'editorial').status,'pending');assert.equal(p.outOfOrderActivity,null);
});
test('后续局部检查失败或运行，不覆盖尚未完成的前置节点',()=>{
  const run={...input,semanticPassed:false,mediaPreflightPassed:false};
  for(const event of [
    {lastFailure:{cause:'后续诊断失败',task:{name:'talkcraft-preflight'}}},
    {activeTask:{name:'talkcraft-preflight',status:'running',message:'单独校验已有分镜'}},
  ]){
    const p=talkcraftWorkflowProgress({...run,...event});
    assert.equal(p.currentNode,'semantics');assert.equal(node(p,'semantics').status,'waiting');
    assert.equal(node(p,'materials').status,'pending');assert.equal(node(p,'preflight').status,'pending');
    assert.equal(p.outOfOrderActivity.node,'preflight');assert.equal(p.completed,2);
  }
});

test('RunningHub 路径先04编排分镜，再05素材输入，口型生成位于审核之后',()=>{
  const run={...input,digitalHumanGenerationPlanned:true,mediaPreparationPassed:true,mediaPreflightPassed:false,
    digitalHuman:{required:true,ready:false,mode:'segments'}};
  let p=talkcraftWorkflowProgress(run);
  assert.equal(node(p,'editorial').number,4);assert.equal(node(p,'materials').number,5);
  assert.equal(p.currentNode,'editorial');assert.equal(node(p,'materials').status,'pending');
  assert.equal(node(p,'digital-human').status,'pending');assert.match(node(p,'digital-human').label,/RunningHub/);
  p=talkcraftWorkflowProgress({...run,shotbook:true,candidatesReady:true,planningPassed:true,preflightPassed:false,storyboardApproved:true,workbenchReady:false,scenesReady:false,nextStage:'digital-human'});
  assert.equal(p.currentNode,'digital-human');assert.equal(node(p,'materials').status,'done');
  assert.equal(node(p,'sample').status,'pending');
});

class Element {
  constructor(){this.dataset={};this.children=[];this.hidden=true;this.attrs={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this.attrs[k]=v;}
}
const renderer=readFileSync(new URL('./talkcraft-progress-ui.js',import.meta.url),'utf8');

test('数字人进度合并两组审核及口型验收，后台审批未通过时整组不能完成',()=>{
  const c=vm.createContext({document:{createElement:()=>new Element()}});vm.runInContext(renderer,c);
  const run={...input,digitalHumanGenerationPlanned:true,shotbook:true,candidatesReady:true,
    mediaPreparationPassed:true,planningPassed:true,mediaPreflightPassed:false,nextStage:'approve-storyboard'};
  const backend=talkcraftWorkflowProgress(run),snapshot=JSON.stringify(backend);
  let view=c.talkcraftProgressDisplay(backend);
  assert.equal(view.total,15);assert.equal(view.completed,6);
  assert.equal(view.currentNode,'planning-check');
  assert.equal(node(view,'planning-check').stateLabel,'待审核');
  assert.equal(node(view,'planning-check').label,'分镜校验与审核');
  assert.equal(node(view,'digital-human').number,8);
  assert.equal(node(view,'sample').number,11);
  assert.equal(node(view,'approve-storyboard'),undefined);assert.equal(node(view,'approve-sample'),undefined);
  assert.equal(JSON.stringify(backend),snapshot);
  assert.equal(JSON.stringify(c.talkcraftProgressDisplay(view)),JSON.stringify(view));
  view=c.talkcraftProgressDisplay(talkcraftWorkflowProgress({...run,storyboardApproved:true}));
  assert.equal(node(view,'planning-check').status,'done');
  assert.equal(view.currentNode,'digital-human');
});

test('数字人供应商成功不等于验收通过，合并卡保留自动验收状态和真实失败',()=>{
  const c=vm.createContext({document:{createElement:()=>new Element()}});vm.runInContext(renderer,c);
  const run={...input,digitalHumanGenerationPlanned:true,shotbook:true,candidatesReady:true,
    mediaPreparationPassed:true,planningPassed:true,storyboardApproved:true,mediaPreflightPassed:false};
  const project=extra=>talkcraftWorkflowProgress({...run,...extra});
  const running=project({activeTask:{name:'talkcraft-digital-human',status:'running',message:'查询已有任务'}});
  assert.equal(node(c.talkcraftProgressDisplay(running),'digital-human').stateLabel,'生成中');
  const generated={digitalHuman:{required:true,ready:true},nextStage:'host-preflight'};
  let backend=project(generated),view=c.talkcraftProgressDisplay(backend);
  assert.equal(backend.total,18);assert.equal(node(backend,'host-preflight').status,'waiting');
  assert.equal(view.total,15);assert.equal(view.completed,7);assert.equal(view.currentNode,'digital-human');
  assert.equal(node(view,'host-preflight'),undefined);
  assert.equal(node(view,'digital-human').stateLabel,'待验收');
  assert.equal(node(view,'preflight').number,9);assert.equal(node(view,'preflight').status,'pending');
  backend=project({...generated,activeTask:{name:'talkcraft-host-preflight',status:'running',message:'检查实际视频'}});
  view=c.talkcraftProgressDisplay(backend);
  assert.equal(node(view,'digital-human').status,'running');
  assert.equal(node(view,'digital-human').stateLabel,'验收中');
  const host=new Element();c.renderTalkcraftProgress(host,backend,{disconnected:true});
  assert.equal(host.children[1].children.find(item=>item.dataset.node==='digital-human').dataset.status,'unknown');
  backend=project({...generated,lastFailure:{cause:'重复帧检查未通过',task:{name:'talkcraft-host-preflight'}}});
  view=c.talkcraftProgressDisplay(backend);
  assert.equal(node(view,'digital-human').status,'blocked');
  assert.match(node(view,'digital-human').detail,/重复帧/);
  assert.equal(node(view,'preflight').status,'pending');
  c.renderTalkcraftProgress(host,backend);
  const card=host.children[1].children.find(item=>item.dataset.node==='digital-human');
  assert.equal(card.attrs['aria-current'],'step');assert.equal(card.dataset.status,'blocked');
  assert.match(card.children[2].textContent,/RunningHub.*已完成/);
  assert.match(card.children[3].textContent,/口型视频验收.*已阻断/);
  view=c.talkcraftProgressDisplay(project({...generated,mediaPreflightPassed:true}));
  assert.equal(node(view,'digital-human').status,'done');assert.equal(view.completed,8);
  assert.equal(view.currentNode,'preflight');
  assert.equal(JSON.stringify(c.talkcraftProgressDisplay(view)),JSON.stringify(view));
});

test('合并样片节点保留生成失败、待审核和断线状态，不把样片存在当审核通过',()=>{
  const c=vm.createContext({document:{createElement:()=>new Element()}});vm.runInContext(renderer,c);
  const run={...input,shotbook:true,candidatesReady:true,preflightPassed:true,storyboardApproved:true,
    workbenchReady:true,scenesReady:true,digitalHuman:{required:false},sample:true,nextStage:'approve-sample'};
  const backend=talkcraftWorkflowProgress(run),host=new Element();
  c.renderTalkcraftProgress(host,backend);
  let displayed=host.children[1].children.find(item=>item.dataset.node==='sample');
  assert.equal(displayed.dataset.status,'waiting');assert.equal(displayed.attrs['aria-current'],'step');
  assert.match(displayed.children.at(-1).textContent,/待审核/);
  assert.match(displayed.children[2].textContent,/首镜样板：已完成/);
  assert.match(displayed.children[3].textContent,/样板审核：待处理/);
  c.renderTalkcraftProgress(host,backend,{disconnected:true});
  assert.equal(host.children[1].children.find(item=>item.dataset.node==='sample').dataset.status,'unknown');
  const failed=talkcraftWorkflowProgress({...run,sample:false,nextStage:'sample',lastFailure:{cause:'实际渲染失败',task:{name:'talkcraft-sample'}}});
  const view=c.talkcraftProgressDisplay(failed);
  assert.equal(node(view,'sample').status,'blocked');assert.match(node(view,'sample').detail,/实际渲染失败/);
  assert.equal(node(c.talkcraftProgressDisplay(talkcraftWorkflowProgress({...run,sampleApproved:true})),'sample').status,'done');
});

test('节点页面显示任务与原因，断线保留完成节点，重新连接恢复后端状态',()=>{
  const c=vm.createContext({document:{createElement:()=>new Element()}});vm.runInContext(renderer,c);
  const host=new Element(),workflow=talkcraftWorkflowProgress({...input,lastFailure:failure});
  c.renderTalkcraftProgress(host,workflow);
  assert.equal(host.hidden,false);assert.equal(host.children[1].children.length,15);
  assert.match(host.children[0].children[0].textContent,/当前阻断.*05.*分镜/);
  assert.match(host.children[0].children[1].textContent,/s02/);
  assert.equal(host.children[1].children[4].attrs['aria-current'],'step');
  c.renderTalkcraftProgress(host,workflow,{disconnected:true});
  assert.equal(host.children[1].children[0].dataset.status,'done');
  assert.equal(host.children[1].children[4].dataset.status,'unknown');
  c.renderTalkcraftProgress(host,workflow);assert.equal(host.children[1].children[4].dataset.status,'blocked');
});
test('主操作台使用后端节点替代 B 模式百分比，A/C 和新草稿保留原显示',()=>{
  const html=readFileSync(new URL('../console-ui.html',import.meta.url),'utf8');
  const code=html.slice(html.indexOf('function boundBProgressRunId()'),html.indexOf('function populateBProductionFailure('));
  const elements=new Map();
  const $=id=>{if(!elements.has(id)){const e=new Element();e.style={};elements.set(id,e);}return elements.get(id);};
  const run={...input,lastFailure:failure};run.execution=talkcraftExecutionView(run);
  const c=vm.createContext({$,document:{createElement:()=>new Element()},Date,initialRoute:new URLSearchParams({runId}),
    activeProductionMode:'B',bFreshInput:false,bAuditRunId:runId,bBackendRunStatus:run,bBackendSnapshotAt:Date.now(),bAuditRunStatus:run});
  vm.runInContext(renderer,c);vm.runInContext(code,c);c.setBProgress(0,'已暂停');
  assert.equal($('#gen-linear-progress').hidden,true);assert.match($('#gen-pct').textContent,/4\/15/);
  assert.equal($('#b-node-progress').children[1].children[4].dataset.status,'blocked');
  for(const mode of ['A','C']){
    c.activeProductionMode=mode;c.setBProgress(35,'处理中');
    assert.equal($('#gen-linear-progress').hidden,false);assert.equal($('#b-node-progress').hidden,true);
    assert.equal($('#gen-pct').textContent,'35%');
  }
  c.activeProductionMode='B';c.bFreshInput=true;c.setBProgress(0,'文案尚未提交');
  assert.equal($('#b-node-progress').hidden,true);assert.equal($('#gen-status').textContent,'文案尚未提交');
});
