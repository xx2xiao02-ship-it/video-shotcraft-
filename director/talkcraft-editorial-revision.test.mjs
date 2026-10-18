import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {authorizeEditorialRevision,executeEditorialRevision,recoverUnsubmittedEditorialRevision} from './talkcraft-editorial-revision.mjs';
import {requestTalkcraftStoryboardAdjustment,prepareTalkcraftStoryboardRevision} from './talkcraft-status.mjs';
import {saveCandidateMaterialRepairFeedback,savePlanningEditorialRepairFeedback,currentEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {reserveEditorialSubmission} from './talkcraft-editorial-submission.mjs';
import {selectTalkcraftContinuation} from './talkcraft-orchestration-policy.mjs';
const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'formal-revision-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const p=path.join(root,'director/b-mode-runs',id,'talkcraft');for(const d of ['qa','audio','remotion'])fs.mkdirSync(path.join(p,d),{recursive:true});
 const write=(n,v)=>fs.writeFileSync(path.join(p,n),JSON.stringify(v));const read=n=>JSON.parse(fs.readFileSync(path.join(p,n)));
 for(const [n,v]of Object.entries({'source-run.json':{},'input.txt':'原稿','aligned-sentences.json':[{start:0,end:3}],
 'audio/full.mp3':'existing-voice','semantics.json':{sentences:[{i:0,text:'原稿',shot:'s07'}]},
 'SHOTBOOK.md':'原分镜','remotion/shots.json':[{id:'s07',shotCard:'source-converge'}],
 'qa/ark-editorial-response.json':{saved:true},'qa/semantics-before-ark.json':{sentences:[{i:0,text:'原稿'}]},
 'material-research-plan.json':{shots:[]},'material-binding-plan.json':{bindings:[]}}))write(n,v);
 const inputs=Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(p,n))).digest('hex')]));
 write('qa/editorial-single-submission.json',{schema:'talkcraft-editorial-single-submission-v1',approved:true,maxTasks:1,allowConfiguredFallback:true,submittedAt:'old',inputs});
 saveCandidateMaterialRepairFeedback(p,{passed:false,materialIssues:[{shotId:'s07',code:'MATERIAL_DISPLAY_SLOT_UNAVAILABLE'}]});
 requestTalkcraftStoryboardAdjustment(root,id,'保留原配音，按真实资料槽修订s07');
 return {root,p,write,read};
}
test('正式继续意图只有明确修订费用授权才选后端修订任务，不接受指定stage',()=>{
 const run={provenance:{verified:true},shotbook:true,storyboardAdjustmentPending:true,inputReady:true};
 const body={intent:'continue',reviseStoryboard:true,approveModelCost:true,authorizationNote:'用户授权一次修订'};
 assert.equal(selectTalkcraftContinuation(run,body),'editorial-revision');
 for(const changes of [{approveModelCost:false},{authorizationNote:''},{stage:'editorial-revision'}])assert.throws(()=>selectTalkcraftContinuation(run,{...body,...changes}));
 assert.throws(()=>selectTalkcraftContinuation({...run,activeTask:{id:1}},body));
});
test('缺授权、草案变化或执行锁不归档素材、不发起模型',t=>{
 const f=fixture(t);
 assert.throws(()=>authorizeEditorialRevision(f.root,id),/授权/);
 f.write('editorial.lock',{});assert.throws(()=>authorizeEditorialRevision(f.root,id,{approval:'用户授权一次修订'}),/执行锁/);
 fs.unlinkSync(path.join(f.p,'editorial.lock'));f.write('remotion/shots.json',[]);
 assert.throws(()=>authorizeEditorialRevision(f.root,id,{approval:'用户授权一次修订'}),/不一致/);
 assert.ok(fs.existsSync(path.join(f.p,'qa/ark-editorial-response.json')));
});
test('授权仅记录输入，正式任务归档当前06反馈并先语义检查再消费一次原版授权',async t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.p,'audio/full.mp3')),order=[];
 authorizeEditorialRevision(f.root,id,{approval:'用户授权这一次分镜修订'});
 assert.ok(fs.existsSync(path.join(f.p,'remotion/shots.json')));
 await executeEditorialRevision(f.root,id,{stage:()=>{order.push('semantic-check');return {passed:true};},generate:()=>{
   order.push('generate');assert.equal(currentEditorialRepairFeedback(f.p).failedChecks[0].shotId,'s07');
   const r=reserveEditorialSubmission(f.p,{requestPlan:[],requireConfiguredFallback:true});assert.equal(r.limited,true);return {fixtureOnly:true};
 }});
 assert.deepEqual(order,['semantic-check','generate']);assert.deepEqual(fs.readFileSync(path.join(f.p,'audio/full.mp3')),before);
 assert.ok(f.read('qa/editorial-revision-authorization.json').completedAt);
 await assert.rejects(()=>executeEditorialRevision(f.root,id,{generate:()=>assert.fail('不能重复调用')}),/已使用|输入变化/);
});
test('修订授权后输入变化或语义失败不调用模型、不增加付费请求',async t=>{
 const f=fixture(t);authorizeEditorialRevision(f.root,id,{approval:'用户授权一次修订'});
 f.write('input.txt','改变原稿');await assert.rejects(()=>executeEditorialRevision(f.root,id),/输入变化/);
 f.write('input.txt','原稿');let calls=0;
 await assert.rejects(()=>executeEditorialRevision(f.root,id,{stage:()=>({passed:false}),generate:()=>{calls++;}}),/语义校验未通过/);
 assert.equal(calls,0);assert.equal(f.read('qa/editorial-single-submission.json').submittedAt,'old');
});

test('归档后发送前中断只恢复本次基稿和未消费授权；重复恢复幂等，未知提交不重试',t=>{
 const f=fixture(t);savePlanningEditorialRepairFeedback(f.p,{passed:false,issues:[{code:'NATIVE_WORD_COVERAGE',shotId:'s07'}]});
 const record=authorizeEditorialRevision(f.root,id,{approval:'用户授权本次07五镜修订'});
 f.write('qa/editorial-revision-authorization.json',{...record,startedAt:new Date().toISOString()});
 prepareTalkcraftStoryboardRevision(f.root,id);
 const restored=recoverUnsubmittedEditorialRevision(f.root,id);
 assert.equal(restored.node,'storyboard-review');assert.equal(restored.providerSubmitted,false);
 assert.equal(f.read('qa/editorial-single-submission.json').submittedAt,'old');
 assert.ok(fs.existsSync(path.join(f.p,'remotion/shots.json')));
 assert.deepEqual(recoverUnsubmittedEditorialRevision(f.root,id),restored);
 f.write('qa/editorial-single-submission.json',{submittedAt:'new',outcome:'unknown'});
 assert.throws(()=>recoverUnsubmittedEditorialRevision(f.root,id),/输入变化/);
});
