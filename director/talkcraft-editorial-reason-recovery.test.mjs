import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {captureEditorialResponse} from './talkcraft-editorial-response.mjs';
import {savePlanningEditorialRepairFeedback,saveCandidateMaterialRepairFeedback,currentEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {assertEditorialGenerationState,replayExistingEditorialProviderResult,saveEditorialDerivedArtifact} from './talkcraft-ark-editorial.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');

test('免费重放保存可回退的派生产物，重复继续幂等；新生成仍不覆盖已有成果',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'reason-artifact-replay-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'remotion'));
  for(const name of ['remotion/shots.json','SHOTBOOK.md']){
    saveEditorialDerivedArtifact(project,name,'原有候选');
    assert.throws(()=>saveEditorialDerivedArtifact(project,name,'新生成'),/EEXIST/);
    saveEditorialDerivedArtifact(project,name,'正式重新编译',{replay:true});
    saveEditorialDerivedArtifact(project,name,'正式重新编译',{replay:true});
    const backup=path.join(project,'qa/editorial-free-replay-artifacts',`${path.basename(name)}.${sha('原有候选')}`);
    assert.equal(fs.readFileSync(backup,'utf8'),'原有候选');
    assert.equal(fs.readFileSync(path.join(project,name),'utf8'),'正式重新编译');
  }
  assert.equal(fs.readdirSync(path.join(project,'qa/editorial-free-replay-artifacts')).length,2);
});

test('已有分镜仍禁止新生成，免费重放必须有原始响应及绑定证据且失败不改分镜',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'reason-repeat-replay-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'remotion'),{recursive:true});
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  const shots=path.join(project,'remotion/shots.json');fs.writeFileSync(shots,'[{"id":"s03","preserve":true}]');
  const before=fs.readFileSync(shots,'utf8');
  assert.throws(()=>assertEditorialGenerationState(project,{semanticPassed:true}),/已有分镜/);
  assert.throws(()=>replayExistingEditorialProviderResult(project,{runId:'current-run'}),/没有本次已保存/);
  fs.writeFileSync(path.join(project,'qa/ark-editorial-response.json'),'{}');
  assert.throws(()=>replayExistingEditorialProviderResult(project,{runId:'current-run'}));
  assert.equal(fs.readFileSync(shots,'utf8'),before);
});
test('局部编译成功后候选失败仍保留本次成功镜及完整补全范围；证据变化即拒绝',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'reason-recovery-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const write=(root,n,v)=>{const f=path.join(root,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
  const runId='current-run',directory='qa/node-repairs/exact',work=path.join(project,directory,'work');
  const proposal={sentences:[{i:0,text:'本次原句',shot:'s05'}],shots:[{id:'s05',shotCard:'chosen',firstSentence:0,lastSentence:0,
    templateParams:{cardProps:{text:'本次成功修复'},semanticDeviations:{}}}],captionEmphasis:{sentences:[]}};
  const entries={'input.txt':'本次原句','aligned-sentences.json':[{start:0,end:3}],'audio/full.mp3':'保留音轨',
    'semantics.json':{sentences:proposal.sentences},'remotion/shots.json':proposal.shots,'material-research-plan.json':{shots:[]},
    'material-binding-plan.json':{bindings:[]},'qa/ark-editorial-response.json':{old:'正式未发布草稿'}};
  for(const [n,v]of Object.entries(entries)){write(project,n,v);write(work,n,v);}
  const initial=Object.fromEntries(Object.keys(entries).map(n=>[n,sha(fs.readFileSync(path.join(project,n)))]));
  const requestBody={schema:'talkcraft-editorial-selection-request-v2',editableShotIds:['s05'],baseProposal:proposal};
  const request={...requestBody,requestId:sha(JSON.stringify(requestBody))};
  write(work,'qa/editorial-selection-request.json',request);
  const raw={schema:'talkcraft-editorial-selection-response-v2',requestId:request.requestId,repairs:[],materialResearchUpdates:[]};
  const submission={submittedAt:'2026-10-19T00:00:00.000Z',inputs:Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,initial[n]]))};
  write(project,'qa/editorial-single-submission.json',submission);write(work,'qa/editorial-single-submission.json',submission);
  captureEditorialResponse(work,{runId,requestId:request.requestId,prompt:'本次请求'})(JSON.stringify({output_text:JSON.stringify(raw)}),{httpStatus:200});
  const rawResponse='qa/editorial-provider-responses/2026-10-19T00-00-00-000Z.json';write(work,rawResponse,raw);
  write(work,'qa/ark-editorial-response.json',proposal);
  write(work,'qa/editorial-selection-audit.json',{requestId:request.requestId,compiled:true,productionAdmitted:false,compiledSha256:sha(JSON.stringify(proposal))});
  write(work,'qa/editorial-free-selection-replay.json',{runId,requestId:request.requestId,passed:true,issues:[],externalRequests:0,productionAdmitted:false,rawResponse});
  const checks=[{code:'SELECTION_DEVIATION_REQUIRED',shotId:'s05',message:'本镜理由漏填'},
    {code:'NATIVE_WORD_COVERAGE',shotId:'s05',message:'同镜文字落点漏填'}];
  savePlanningEditorialRepairFeedback(work,{passed:false,issues:checks});
  write(project,'qa/node-repair.json',{schema:'talkcraft-node-repair-v1',runId,directory,node:'storyboard-review',status:'blocked',providerSubmitted:true,
    initial,error:checks.map(i=>i.message).join('；')});
  const feedback=currentEditorialRepairFeedback(project);
  assert.deepEqual(feedback.failedChecks,checks);assert.deepEqual(feedback.proposal,proposal);
  assert.equal(feedback.retainedTransaction,directory);assert.equal(feedback.paidCalls,0);
  const original=fs.readFileSync(path.join(work,'remotion/shots.json'));
  write(work,'remotion/shots.json',[{id:'s05',shotCard:'tampered'}]);
  assert.throws(()=>currentEditorialRepairFeedback(project),/反馈已过期|篡改/);
  fs.writeFileSync(path.join(work,'remotion/shots.json'),original);
  const candidateChecks=[{shotId:'s05',code:'GRAPHIC_COMPARISON_REQUIRED',message:'缺少本次图形比较'}];
  saveCandidateMaterialRepairFeedback(work,{passed:false,materialIssues:candidateChecks});
  const journal=JSON.parse(fs.readFileSync(path.join(project,'qa/node-repair.json')));
  journal.error='选卡前真实素材规划未完成：s05 GRAPHIC_COMPARISON_REQUIRED：缺少本次图形比较';
  write(project,'qa/node-repair.json',journal);
  const candidate=currentEditorialRepairFeedback(project);
  assert.equal(candidate.stage,'planning-check');assert.equal(candidate.sourceGate,'candidates');assert.deepEqual(candidate.failedChecks,candidateChecks);
  assert.deepEqual(candidate.proposal,proposal);
  const savedCandidate=fs.readFileSync(path.join(work,'qa/candidate-editorial-repair.json'));
  write(work,'remotion/shots.json',[{id:'s05',shotCard:'tampered'}]);
  assert.throws(()=>currentEditorialRepairFeedback(project),/反馈已过期|篡改/);
  fs.writeFileSync(path.join(work,'remotion/shots.json'),original);
  assert.deepEqual(fs.readFileSync(path.join(work,'qa/candidate-editorial-repair.json')),savedCandidate);
  const envelope=JSON.parse(fs.readFileSync(path.join(work,'qa/editorial-provider-receipt.json')));
  fs.appendFileSync(path.join(work,envelope.file),' ');
  assert.throws(()=>currentEditorialRepairFeedback(project),/哈希/);
});
