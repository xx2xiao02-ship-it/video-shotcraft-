import test from 'node:test';
import assert from 'node:assert/strict';
import {planNodeCorrection,CORRECTION_NODE_POLICIES} from './talkcraft-correction-center.mjs';
import {MANAGED_WORKFLOW_NODES} from './talkcraft-workflow-contract.mjs';
const run={runId:'current',provenance:{verified:true},lastFailure:{task:{name:'talkcraft-candidates'}},nextStage:'candidates'};
const fixture=()=>({run:structuredClone(run),fingerprint:'same-input',attempts:[],inputs:{voice:'current'},provider:{provider:'acctoken',model:'deepseek-v4.1-flash'},
  feedback:{failedChecks:[{code:'FILM_TEXT_DOMINANCE',shotId:'s08'},{code:'local_material_unmatched',shotId:'s14'}]},now:1000});

test('仅剩重复选卡时保留联合修正范围，不自动付费、换卡或宣称通过',()=>{
 const f=fixture();f.feedback.failedChecks=[{code:'template_window_reuse',previousShotId:'s12',shotId:'s16'},
  {code:'template_window_reuse',previousShotId:'s05',shotId:'s20'}];
 assert.equal(planNodeCorrection(f).action,'local-recheck');
 f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 const plan=planNodeCorrection(f);assert.equal(plan.action,null);assert.equal(plan.state,'needs-repair');
 assert.deepEqual(plan.jointRepairShotIds,['s12','s16','s05','s20']);
 assert.equal(plan.approved,false);assert.equal(plan.productionAdmitted,false);
});
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
 f.feedback.failedChecks=[{code:'local_material_unmatched',shotId:'s08'}];assert.equal(planNodeCorrection(f).state,'waiting-authorization');
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
test('规则热修改后没有验证重载前不调度任何新任务，包括已有费用授权',()=>{
 const f=fixture();f.rulesVersionVerified=false;
 assert.equal(planNodeCorrection(f).state,'waiting-code-reload');assert.equal(planNodeCorrection(f).action,null);
 f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'原用户授权'};
 assert.equal(planNodeCorrection(f).action,null);f.rulesVersionVerified=true;
 assert.equal(planNodeCorrection(f).action,'editorial-repair');
});

test('06仅缺来源时先免费采集再绑定复检，不因费用授权转成付费换卡，重复继续有界',()=>{
 const f=fixture();f.feedback.failedChecks=[{code:'REAL_SOURCE_NOT_BOUND',shotId:'s07'}];
 f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'用户原授权'};
 let d=planNodeCorrection(f);assert.equal(d.action,'source-discovery');assert.equal(d.approved,true);
 assert.deepEqual(d.body,{stage:'material-research'});assert.equal(d.body.approveModelCost,undefined);
 f.attempts.push({fingerprint:f.fingerprint,action:d.action});
 d=planNodeCorrection(f);assert.equal(d.action,'source-recheck');assert.equal(d.approved,true);assert.deepEqual(d.body,{stage:'candidates'});
 f.attempts.push({fingerprint:f.fingerprint,action:d.action});
 d=planNodeCorrection(f);assert.equal(d.action,null);assert.equal(d.state,'needs-source-verification');assert.equal(d.productionAdmitted,false);
 const mixed=structuredClone(f);mixed.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 mixed.feedback.failedChecks.push({code:'local_material_unmatched',shotId:'s14'});
 assert.equal(planNodeCorrection(mixed).action,'source-discovery');
 mixed.attempts.push({fingerprint:f.fingerprint,action:'source-discovery'},{fingerprint:f.fingerprint,action:'source-recheck'});
 assert.equal(planNodeCorrection(mixed).action,'editorial-repair');
 const forged={...proposeNodeCorrection({...f,attempts:[]}),action:'source-discovery',body:{stage:'material-research',approveModelCost:true}};
 assert.equal(approveNodeCorrection(forged,{...f,attempts:[]}).approved,false);
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

test('发送前失败缺少当前响应时先提案免费恢复本次快照，不再次申请模型',()=>{
 const f=fixture();f.run.editorialChecked=false;f.run.nextStage='editorial';f.run.editorialResponseSaved=false;
 f.feedback.snapshot='qa/storyboard-revisions/current';f.unsubmitted={schema:'talkcraft-editorial-revision-authorization-v1',runId:'current',startedAt:'now'};
 const d=planNodeCorrection(f);assert.equal(d.action,'restore-unsubmitted');assert.equal(d.body.stage,'editorial-recover');assert.equal(d.approved,true);
 assert.equal(d.body.approveModelCost,undefined);
});

test('返回形式变化但失败范围未收敛时拒绝重复计费，真实范围收敛才允许新方案',()=>{
 const f=fixture();f.progressKey='same-failed-scope';f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'},{fingerprint:'old-raw-shape',progressKey:f.progressKey,action:'editorial-repair'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'用户原授权'};
 assert.equal(planNodeCorrection(f).action,null);assert.match(planNodeCorrection(f).reason,/没有收敛/);
 f.progressKey='fewer-failures';assert.equal(planNodeCorrection(f).action,'editorial-repair');
});


test('修订方案绑定正式免费自检范围；合同失败不进入费用调度',()=>{
 const f=fixture();f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'原用户授权'};
 f.revisionPlan={requestId:'verified-request',editableShotIds:['s08','s14'],externalRequests:0};
 const plan=planNodeCorrection(f);assert.equal(plan.approved,true);assert.deepEqual(plan.revisionPlan,f.revisionPlan);
 const bad=structuredClone(plan.proposal);bad.revisionPlan.editableShotIds.push('s01');
 assert.equal(approveNodeCorrection(bad,f).approved,false);
 f.revisionPlanError='无联合可行域';assert.equal(planNodeCorrection(f).action,null);
});


test('04有本次拒绝响应但未落地分镜时先免费重编译，不能直接再次付费',()=>{
 const f=fixture();f.run.nextStage='editorial';f.run.lastFailure={task:{name:'talkcraft-editorial-revision'}};
 f.run.editorialResponseSaved=true;f.run.shotbook=false;
 f.feedback.proposal={editorialSelectionRejection:{requestId:'this-request'}};
 const plan=planNodeCorrection(f);assert.equal(plan.action,'recover-editorial-response');assert.equal(plan.approved,true);
 assert.deepEqual(plan.body,{stage:'editorial-recover'});
 f.attempts=[{fingerprint:f.fingerprint,action:'recover-editorial-response'}];assert.notEqual(planNodeCorrection(f).action,'recover-editorial-response');
});


test('07发现候选依据过期可提出免费重建依赖方案，不能直接重签或重复空转',()=>{
 const f=fixture();f.run.lastFailure={task:{name:'talkcraft-planning-check'}};f.run.nextStage='candidates';f.run.candidatesReady=false;
 f.run.candidateIssues=['候选依据已变化，请重新生成候选：SHOTBOOK.md'];
 const d=planNodeCorrection(f);assert.equal(d.node,'storyboard-review');assert.equal(d.action,'candidate-recheck');assert.equal(d.approved,true);
 assert.deepEqual(d.body,{stage:'candidates'});
 f.attempts=[{fingerprint:f.fingerprint,action:d.action}];assert.notEqual(planNodeCorrection(f).action,'candidate-recheck');
 f.run.candidateIssues=['其他未核验问题'];f.attempts=[];assert.notEqual(planNodeCorrection(f).action,'candidate-recheck');
});


test('纯动效时序不兼容由节点提出修订，源码契约缺失不消耗创作授权',()=>{
 const f=fixture();f.run.lastFailure={task:{name:'talkcraft-planning-check'}};f.run.nextStage='planning-check';
 f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['storyboard-review'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'原用户授权'};
 for(const code of ['TEXT_EFFECT_DEPENDENCY_EARLY','TEXT_EFFECT_INCOMPLETE','TEXT_EFFECT_TARGET_MISSING']){
  f.feedback.failedChecks=[{code,shotId:'s05'}];
  const d=planNodeCorrection(f);assert.equal(d.action,'editorial-repair');assert.equal(d.approved,true);assert.equal(d.productionAdmitted,false);
 }
 for(const code of ['TEXT_EFFECT_CONTRACT_REQUIRED','TEXT_EFFECT_SOURCE_CONTRACT_REQUIRED','TEXT_EFFECT_SOURCE_CHANGED']){
  f.feedback.failedChecks=[{code,shotId:'s05'},{code:'TEXT_EFFECT_DEPENDENCY_EARLY',shotId:'s08'}];
  const d=planNodeCorrection(f);assert.equal(d.action,null);assert.equal(d.state,'needs-code-audit');assert.equal(d.approved,false);
 }
});


import {correctionProgressKey} from './talkcraft-correction-center.mjs';
test('同镜同类失败数量减少不冒充范围收敛，避免换动效编号后重复计费',()=>{
 const base={inputs:{voice:'current'},rules:{contract:'same'},node:'storyboard-review'};
 const a={code:'TEXT_EFFECT_DEPENDENCY_EARLY',shotId:'s05',effectId:'arrow-0'};
 const b={...a,effectId:'arrow-1'};
 assert.equal(correctionProgressKey({...base,checks:[a,b]}),correctionProgressKey({...base,checks:[{...a,effectId:'carrier-1'}]}));
 assert.notEqual(correctionProgressKey({...base,checks:[a,{code:a.code,shotId:'s08'}]}),correctionProgressKey({...base,checks:[a]}));
});


test('当前目标重复历史已付费问题时拒绝循环，仍允许先免费恢复',()=>{
 const f=fixture();f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.repeatedPaidScope={requestId:'prior-paid',shotIds:['s08']};
 assert.equal(planNodeCorrection(f).action,null);assert.match(planNodeCorrection(f).reason,/跨事务修订循环/);
 f.run.nodeRepair={providerSubmitted:true,status:'blocked',node:'storyboard-review'};
 assert.equal(planNodeCorrection(f).action,'recover-response');
});


test('展示源码变更使样片失效时恢复样片依赖，不原样重试整片或伪造审批',()=>{
 const run={runId:'new-task',provenance:{verified:true},nextStage:'sample',sample:false,sampleApproved:false,scenesImplemented:24,scenesReady:true,
 lastFailure:{task:{name:'talkcraft-render-all'},cause:'The first-shot sample must be approved before full rendering'}};
 const context={run,fingerprint:'new-sources',rulesVersionVerified:true,attempts:[{fingerprint:'new-sources',action:'local-recheck'}]};
 const plan=planNodeCorrection(context);assert.equal(plan.approved,true);assert.equal(plan.action,'rebuild-sample');assert.deepEqual(plan.body,{stage:'sample'});
 assert.equal(plan.userAcceptance,false);assert.equal(run.sampleApproved,false);
 assert.notEqual(planNodeCorrection({...context,attempts:[...context.attempts,{fingerprint:'new-sources',action:'rebuild-sample'}]}).action,'rebuild-sample');
 assert.notEqual(planNodeCorrection({...context,run:{...run,lastFailure:{...run.lastFailure,cause:'Other render error'}}}).action,'rebuild-sample');
});

test('调整要求已处理时不批准付费动作；发送前拒绝不冒充模型未收敛',()=>{
 const f=fixture();f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];f.progressKey='scope';
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'用户原授权'};
 f.run.storyboardAdjustmentPending=false;const before=structuredClone(f),d=planNodeCorrection(f);
 assert.equal(d.action,null);assert.equal(d.state,'waiting-input');assert.match(d.reason,/正式调整入口/u);assert.deepEqual(f,before);
 f.run.storyboardAdjustmentPending=true;f.run.inputReady=false;assert.equal(planNodeCorrection(f).state,'waiting-input');
 f.run.inputReady=true;assert.equal(planNodeCorrection(f).action,'editorial-repair');
 f.attempts.push({action:'editorial-repair',progressKey:f.progressKey,status:'dispatch-failed',error:'正式入口尚未就绪'});
 const failed=planNodeCorrection(f);assert.equal(failed.action,null);assert.equal(failed.state,'needs-code-audit');assert.match(failed.reason,/正式入口尚未就绪/u);
 f.attempts.at(-1).status='queued';assert.match(planNodeCorrection(f).reason,/没有收敛/u);
});

test('中心按完整失败范围审批，单镜或延后子集不消耗授权；包含资料框问题',()=>{
 const f=fixture();f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',scope:['candidates'],inputs:f.inputs,provider:f.provider,expiresAt:new Date(2000).toISOString(),approval:'一次完整范围授权'};
 f.feedback.failedChecks.push({shotId:'s07',code:'ATTENTION_TARGET_BOUNDS'});
 f.revisionPlan={editableShotIds:['s08'],batch:{deferredShotIds:['s14','s07']}};
 assert.equal(planNodeCorrection(f).action,null);assert.equal(planNodeCorrection(f).state,'needs-code-audit');
 f.revisionPlan={editableShotIds:['s08','s14']};assert.equal(planNodeCorrection(f).action,null);
 f.revisionPlan={editableShotIds:['s07','s08','s14'],scopeMode:'all-current-failures',deferredShotIds:[]};
 assert.equal(planNodeCorrection(f).action,'editorial-repair');
 f.attempts.push({fingerprint:f.fingerprint,action:'editorial-repair'});assert.equal(planNodeCorrection(f).action,null);
});

test('资料绑定证据拒绝由素材处理器免费修正，不转为编导费用授权',()=>{
 const f=fixture();f.attempts=[{fingerprint:f.fingerprint,action:'local-recheck'}];
 f.feedback.failedChecks=[{code:'REVIEWED_SOURCE_BINDING_REJECTED',shotId:'s07'},{code:'TEXT_VIDEO_REQUIRED',shotId:'s04'}];
 f.governance={caseSha256:'case',mapSha256:'map'};
 f.sourcePlan={planId:'repair-language',needs:[{shotId:'s07',field:'src4'},{shotId:'s04',field:'@background'}],invalidBindings:[{shotId:'s07',field:'src4'}]};
 const proposed=planNodeCorrection(f);assert.equal(proposed.action,'material-completion');assert.equal(proposed.approved,true);
 f.attempts.push({fingerprint:f.fingerprint,action:'material-completion'});
 const exhausted=planNodeCorrection(f);assert.equal(exhausted.action,null);assert.equal(exhausted.state,'needs-source-verification');
 assert.equal(exhausted.materialCompletionPlan.needs.length,2);assert.equal(exhausted.productionAdmitted,false);
});
