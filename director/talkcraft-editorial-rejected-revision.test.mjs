import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {saveEditorialRepairFeedback,currentEditorialRepairFeedback,currentRejectedEditorialFeedback,
 saveCandidateMaterialRepairFeedback,preserveCandidateMaterialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {requestTalkcraftStoryboardAdjustment,readTalkcraftStatus} from './talkcraft-status.mjs';
import {authorizeEditorialRevision,executeEditorialRevision} from './talkcraft-editorial-revision.mjs';
import {selectTalkcraftContinuation} from './talkcraft-orchestration-policy.mjs';
import {talkcraftControlState} from './talkcraft-control-state.mjs';
const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
test('已核验不合格的缓存等待单次修订授权，普通继续不空转；未知缓存仍允许免费恢复',()=>{
 const run={inputReady:true,wordTimingReady:true,semanticPassed:true,shotbook:false,editorialResponseSaved:true};
 assert.equal(talkcraftControlState(run,null).nextStage,'editorial-recover');
 const failure={code:'EDITORIAL_RESULT_INVALID',task:{name:'talkcraft-editorial-recover'}};
 const state=talkcraftControlState({...run,editorialRepairReady:true},failure);
 assert.equal(state.nextStage,null);assert.deepEqual(state.blockers,['EDITORIAL_REVISION_REQUIRED']);
 assert.equal(state.lastFailure.code,failure.code);
 assert.throws(()=>selectTalkcraftContinuation({...run,...state,provenance:{verified:true}},{intent:'continue'}),/授权/);
});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rejected-revision-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const p=path.join(root,'director/b-mode-runs',id,'talkcraft');for(const d of ['qa','audio','remotion'])fs.mkdirSync(path.join(p,d),{recursive:true});
 const write=(n,v)=>fs.writeFileSync(path.join(p,n),JSON.stringify(v));const read=n=>JSON.parse(fs.readFileSync(path.join(p,n)));
 for(const [n,v]of Object.entries({'source-run.json':{},'input.txt':'原稿','aligned-sentences.json':[{start:0,end:3}],
  'audio/full.mp3':'paid-audio','semantics.json':{sentences:[{i:0,text:'原稿',shot:'s07'}]},
  'remotion/shots.json':[{id:'s07',shotCard:'old-card'}],
  'qa/semantics-before-ark.json':{sentences:[{i:0,text:'原稿'}]},'qa/rebuild-inputs.json':{personWindows:[]}}))write(n,v);
 saveCandidateMaterialRepairFeedback(p,{passed:false,materialIssues:[{shotId:'s07',code:'OLD_06'}]});
 const oldSnapshot=path.join(p,'qa/storyboard-revisions/old-06');preserveCandidateMaterialRepairFeedback(p,oldSnapshot);
 fs.unlinkSync(path.join(p,'remotion/shots.json'));
 const proposal={shots:[{id:'s14',shotCard:'repeated-card',nativePresentation:{playbackRate:1}}]};
 write('qa/ark-editorial-response.json',proposal);
 saveEditorialRepairFeedback(p,proposal,{issues:[{code:'CURRENT_04',shotId:'s14'}]});
 const inputs=Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(p,n))).digest('hex')]));
 write('qa/editorial-single-submission.json',{schema:'talkcraft-editorial-single-submission-v1',approved:true,maxTasks:1,
  allowConfiguredFallback:true,submittedAt:'old',outcome:'response-saved',inputs});
 return {root,p,write,read,proposal,oldSnapshot};
}
test('新04失败优先于旧06快照，资料恢复仍独立读取核验过的06快照',t=>{
 const f=fixture(t);
 assert.equal(currentEditorialRepairFeedback(f.p).failedChecks[0].code,'CURRENT_04');
 assert.equal(currentEditorialRepairFeedback(f.p,{candidateSnapshotOnly:true}).failedChecks[0].code,'OLD_06');
 assert.deepEqual(currentRejectedEditorialFeedback(f.p).proposal,f.proposal);
 for(const name of ['qa/ark-editorial-response.json','audio/full.mp3','semantics.json']){
  const before=fs.readFileSync(path.join(f.p,name));f.write(name,{changed:true});
  assert.equal(currentRejectedEditorialFeedback(f.p),null,name);
  assert.equal(currentEditorialRepairFeedback(f.p),null,name);
  fs.writeFileSync(path.join(f.p,name),before);
 }
});
test('只有合法的未落地结果才可记录修订，不自动通过或产生费用授权',t=>{
 const f=fixture(t);
 assert.equal(readTalkcraftStatus(f.root,id).editorialRepairReady,true);
 requestTalkcraftStoryboardAdjustment(f.root,id,'修订s14重复卡、s15媒体时钟、s21驻留超限');
 const status=readTalkcraftStatus(f.root,id);
 assert.equal(status.shotbook,false);assert.equal(status.storyboardApproved,false);
 assert.equal(status.storyboardAdjustmentPending,true);
 assert.equal(fs.existsSync(path.join(f.p,'qa/editorial-revision-authorization.json')),false);
 const run={...status,provenance:{verified:true},inputReady:true};
 assert.throws(()=>selectTalkcraftContinuation(run,{intent:'continue',reviseStoryboard:true}),/费用授权/);
 assert.equal(selectTalkcraftContinuation(run,{intent:'continue',reviseStoryboard:true,approveModelCost:true,authorizationNote:'明确一次修订授权'}),'editorial-revision');
 f.write('qa/ark-editorial-response.json',{});
 assert.equal(readTalkcraftStatus(f.root,id).editorialRepairReady,false);
 assert.throws(()=>requestTalkcraftStoryboardAdjustment(f.root,id,'过期草案不能记录'),/不完整/);
});
test('正式修订可处理未落地04，归档最新失败与完整提案，保留原06素材快照及配音',async t=>{
 const f=fixture(t),audio=fs.readFileSync(path.join(f.p,'audio/full.mp3'));
 f.write('qa/editorial-selection-request.json',{requestId:'old-request'});
 f.write('qa/editorial-selection-audit.json',{passed:false});
 requestTalkcraftStoryboardAdjustment(f.root,id,'解决当前04的三项失败');
 assert.throws(()=>authorizeEditorialRevision(f.root,id),/授权/);
 authorizeEditorialRevision(f.root,id,{approval:'用户明确授权一次修订'});
 let calls=0;
 await executeEditorialRevision(f.root,id,{stage:()=>({passed:true}),generate:()=>{
  calls++;const feedback=currentEditorialRepairFeedback(f.p);
  assert.equal(feedback.failedChecks[0].code,'CURRENT_04');assert.deepEqual(feedback.proposal,f.proposal);
  assert.equal(currentEditorialRepairFeedback(f.p,{candidateSnapshotOnly:true}).failedChecks[0].code,'OLD_06');
  const snapshot=path.join(f.p,feedback.snapshot);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshot,'qa/ark-editorial-response.json'))),f.proposal);
  assert.ok(fs.existsSync(path.join(snapshot,'qa/editorial-repair-feedback.json')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshot,'qa/editorial-selection-request.json'))),{requestId:'old-request'});
  assert.ok(fs.existsSync(path.join(snapshot,'qa/editorial-selection-audit.json')));
  assert.equal(fs.existsSync(path.join(f.p,'qa/editorial-selection-request.json')),false);
  return {testDouble:true};
 }});
 assert.equal(calls,1);assert.deepEqual(fs.readFileSync(path.join(f.p,'audio/full.mp3')),audio);
 assert.equal(fs.existsSync(path.join(f.oldSnapshot,'remotion/shots.json')),true);
 await assert.rejects(()=>executeEditorialRevision(f.root,id),/已使用/);
 const archived=f.read('qa/editorial-revision-feedback.json');
 f.write(path.join(archived.snapshot,'audio/full.mp3'),'tampered');
 // Invalid newer archived evidence must not fall back to the old 06 list.
 assert.equal(currentEditorialRepairFeedback(f.p),null);
});
test('新明确授权只归档已消费授权，不覆盖未消费授权；并发锁与输入变化阻断调用',async t=>{
 const f=fixture(t);requestTalkcraftStoryboardAdjustment(f.root,id,'解决当前04的三项失败');
 const approval={approval:'用户明确授权这一次'};
 const first=authorizeEditorialRevision(f.root,id,approval);
 assert.throws(()=>authorizeEditorialRevision(f.root,id,approval),/未消费/);
 const used={...first,startedAt:'previous-start',completedAt:'previous-end'};
 f.write('qa/editorial-revision-authorization.json',used);
 f.write('editorial-revision.lock',{});assert.throws(()=>authorizeEditorialRevision(f.root,id,approval),/执行锁/);
 fs.unlinkSync(path.join(f.p,'editorial-revision.lock'));
 authorizeEditorialRevision(f.root,id,approval);
 const history=fs.readdirSync(path.join(f.p,'qa/editorial-revision-authorization-history'));
 assert.equal(history.length,1);assert.deepEqual(f.read('qa/editorial-revision-authorization-history/'+history[0]),used);
 f.write('qa/rebuild-inputs.json',{personWindows:[{start:0,end:3}]});
 await assert.rejects(()=>executeEditorialRevision(f.root,id,{generate:()=>assert.fail('不得调用')}),/输入变化/);
});
