import test from 'node:test';
import assert from 'node:assert/strict';
import {planNodeCorrection,CORRECTION_NODE_POLICIES} from './talkcraft-correction-center.mjs';
import {MANAGED_WORKFLOW_NODES} from './talkcraft-workflow-contract.mjs';
const run={runId:'current',provenance:{verified:true},lastFailure:{task:{name:'talkcraft-candidates'}},nextStage:'candidates'};
const fixture=()=>({run:structuredClone(run),fingerprint:'same-input',attempts:[],inputs:{voice:'current'},provider:{provider:'acctoken',model:'deepseek-v4.1-flash'},
  feedback:{failedChecks:[{code:'FILM_TEXT_DOMINANCE',shotId:'s08'},{code:'local_material_unmatched',shotId:'s14'}]},now:1000});
test('15个正式节点均有修正政策；14人工审查和15发布不能自动批准',()=>{
 assert.deepEqual(CORRECTION_NODE_POLICIES.map(p=>p.node),MANAGED_WORKFLOW_NODES.map(p=>p.id));
 assert.ok(CORRECTION_NODE_POLICIES.every(p=>p.supportsCorrection&&!p.automaticApproval));
 for(const stage of ['approve-final','deliver']){
  const f=fixture();f.run.nextStage=stage;assert.equal(planNodeCorrection(f).state,'waiting-review');
 }
});
test('06先免费补全复检，宏观图形和素材问题同时保留；重复输入不再次空转',()=>{
 const f=fixture(),d=planNodeCorrection(f);assert.equal(d.action,'local-recheck');assert.equal(d.body.stage,'candidates');
 assert.equal(d.issues.length,2);assert.equal(d.productionAdmitted,false);
 f.attempts=[{fingerprint:f.fingerprint,action:d.action}];assert.equal(planNodeCorrection(f).state,'waiting-authorization');
 f.feedback.failedChecks=[{code:'local_material_unmatched',shotId:'s08'}];assert.equal(planNodeCorrection(f).state,'needs-repair');
});
test('只有本次任务、输入、模型和有效期全部一致的授权可调度模型；不自动扩大费用',()=>{
 const f=fixture();f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'用户原授权'};
 const before=structuredClone(f),d=planNodeCorrection(f);assert.equal(d.action,'editorial-repair');assert.equal(d.body.approveModelCost,true);assert.deepEqual(f,before);
 for(const change of [a=>a.runId='old',a=>a.inputs={voice:'old'},a=>a.provider={model:'old'},a=>a.expiresAt=new Date(500).toISOString(),a=>a.scope=['preflight']]){
  const bad=structuredClone(f);change(bad.authorization);assert.equal(planNodeCorrection(bad).action,null);
 }
 f.attempts.push({fingerprint:f.fingerprint,action:'editorial-repair'});assert.equal(planNodeCorrection(f).action,null);
});
test('存在任务时不重复启动；管线身份不符不能修正其他运行；免费恢复优先模型',()=>{
 const f=fixture();f.run.activeTask={id:1};assert.equal(planNodeCorrection(f).action,null);
 delete f.run.activeTask;f.run.provenance.verified=false;assert.equal(planNodeCorrection(f).state,'waiting-input');
 f.run.provenance.verified=true;f.run.nodeRepair={providerSubmitted:true,status:'blocked',node:'storyboard-review'};
 assert.equal(planNodeCorrection(f).action,'recover-response');
});


import {proposeNodeCorrection} from './talkcraft-node-correction-plan.mjs';
import {approveNodeCorrection} from './talkcraft-correction-center.mjs';
test('节点提出具体方案，中心单独审批；不可伪造业务补值、授权或输入',()=>{
 const f=fixture(),proposal=proposeNodeCorrection(f);
 assert.equal(proposal.approved,false);assert.equal(proposal.action,'local-recheck');
 const decision=approveNodeCorrection(proposal,f);assert.equal(decision.approved,true);
 assert.equal(decision.approval.scope,'candidates');assert.equal(decision.approval.stopAt,'review');
 for(const change of [p=>p.runId='old',p=>p.fingerprint='old',p=>p.body.cardProps={text:'手工补值'},p=>{p.action='editorial-repair';p.body={stage:'editorial-revision',approveModelCost:true};}]){
  const bad=structuredClone(proposal);change(bad);assert.equal(approveNodeCorrection(bad,f).approved,false);
 }
 assert.deepEqual(proposeNodeCorrection(f),proposal);
});

test('04门禁因新规则失效时优先本节点复检，不被历史06失败误导',()=>{
 const f=fixture();f.run.editorialChecked=false;f.run.nextStage='editorial-check';
 const p=proposeNodeCorrection(f);assert.equal(p.node,'editorial');assert.equal(p.body.stage,'editorial-check');
 const d=approveNodeCorrection(p,f);assert.equal(d.approved,true);
});


import fs from 'node:fs';
import path from 'node:path';
import {dispatchNodeCorrection} from './talkcraft-correction-center.mjs';
import {saveEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
test('真实调度器落盘审批和预留；进程恢复重复继续不能重复启动',async t=>{
 const project=fs.mkdtempSync(path.resolve('.tmp/center-dispatch-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const put=(name,value)=>{const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
 for(const name of ['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json'])put(name,{});
 const proposal={sentences:[],shots:[]};put('qa/ark-editorial-response.json',proposal);
 saveEditorialRepairFeedback(project,proposal,{issues:[{code:'FILM_TEXT_DOMINANCE',shotId:'s04'}]});
 const current={...run,editorialChecked:false,nextStage:'editorial-check'};let calls=0;
 const queueStage=async body=>{calls++;assert.equal(body.stage,'editorial-check');return {id:77};};
 const first=await dispatchNodeCorrection({project,run:current,queueStage});assert.equal(first.handled,true);assert.equal(first.decision.approved,true);
 const second=await dispatchNodeCorrection({project,run:current,queueStage});assert.equal(calls,1);assert.equal(second.decision.state,'waiting-authorization');
 const record=JSON.parse(fs.readFileSync(path.join(project,'qa/correction-center.json')));assert.equal(record.attempts[0].taskId,77);
});
