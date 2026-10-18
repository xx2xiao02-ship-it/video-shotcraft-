import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{createHash}from'node:crypto';
import{captureEditorialResponse}from'./talkcraft-editorial-response.mjs';
import{currentEditorialRepairFeedback,preserveCandidateMaterialRepairFeedback,saveEditorialRepairFeedback}from'./talkcraft-editorial-planning-contract.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
test('本次已编译结果的两处失败覆盖旧五镜清单，归档后仍锁定其余设计；篡改拒绝且不发布',t=>{
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'latest-repair-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const directory='qa/node-repairs/transaction',w=path.join(p,directory,'work');fs.mkdirSync(w,{recursive:true});
 const write=(root,n,v)=>{const f=path.join(root,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
 for(const [n,v]of Object.entries({'input.txt':'script','aligned-sentences.json':[],'audio/full.mp3':'paid','semantics.json':{sentences:[]},'remotion/shots.json':[{id:'s05',visual:'old'}],'qa/ark-editorial-response.json':{old:true}}))write(p,n,v);
 const inputs=Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,hash(fs.readFileSync(path.join(p,n)))]));
 write(p,'qa/editorial-single-submission.json',{submittedAt:'this-call',inputs});
 const initial=Object.fromEntries(['input.txt','aligned-sentences.json','audio/full.mp3','semantics.json','remotion/shots.json','qa/ark-editorial-response.json'].map(n=>[n,hash(fs.readFileSync(path.join(p,n)))]));
 for(const n of [...Object.keys(initial),'qa/editorial-single-submission.json']){const f=path.join(w,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(p,n),f);}
 const proposal={shots:[{id:'s03'},{id:'s08'},{id:'s05',visual:'latest-design'}]},contract={schema:'talkcraft-editorial-selection-request-v2',baseProposal:proposal};
 const request={requestId:hash(JSON.stringify(contract)),...contract},raw={requestId:request.requestId,repairs:[]};
 write(w,'qa/editorial-selection-request.json',request);
 captureEditorialResponse(w,{runId:'current',requestId:request.requestId,prompt:'current'})(JSON.stringify({output_text:JSON.stringify(raw)}),{httpStatus:200});
 const rawResponse='qa/editorial-provider-responses/2026-10-18T14-54-29-114Z.json';write(w,rawResponse,raw);write(w,'qa/ark-editorial-response.json',proposal);
 write(w,'qa/editorial-selection-audit.json',{requestId:request.requestId,compiled:true,productionAdmitted:false,compiledSha256:hash(JSON.stringify(proposal))});
 const issues=[{shotId:'s03',code:'PROP_STEP',message:'step'},{shotId:'s08',code:'DURATION_BUDGET',message:'budget'}];
 write(w,'qa/editorial-free-selection-replay.json',{requestId:request.requestId,runId:'current',passed:false,productionAdmitted:false,externalRequests:0,rawResponse,issues});
 write(p,'qa/node-repair.json',{schema:'talkcraft-node-repair-v1',status:'blocked',node:'storyboard-review',providerSubmitted:true,runId:'current',directory,initial,error:'step；budget'});
 const before=fs.readFileSync(path.join(p,'remotion/shots.json'));
 const f=currentEditorialRepairFeedback(p);assert.deepEqual(f.failedChecks,issues);assert.equal(f.proposal.shots[2].visual,'latest-design');
 write(w,'qa/ark-editorial-response.json',{...proposal,tampered:true});
 assert.throws(()=>currentEditorialRepairFeedback(p),/不一致/);write(w,'qa/ark-editorial-response.json',proposal);
 const revision=path.join(p,'qa/storyboard-revisions/current');preserveCandidateMaterialRepairFeedback(p,revision);
 fs.unlinkSync(path.join(p,'qa/node-repair.json'));fs.unlinkSync(path.join(p,'remotion/shots.json'));fs.unlinkSync(path.join(p,'qa/ark-editorial-response.json'));
 assert.deepEqual(currentEditorialRepairFeedback(p).failedChecks,issues);
 fs.copyFileSync(path.join(revision,'remotion/shots.json'),path.join(p,'remotion/shots.json'));
 assert.deepEqual(fs.readFileSync(path.join(p,'remotion/shots.json')),before);
});


test('本次未编译拒绝保留成功基稿和最新错误，不退回旧清单、不采用违规新设计',t=>{
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'rejected-repair-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const directory='qa/node-repairs/current',w=path.join(p,directory,'work');
 const write=(root,n,v)=>{const f=path.join(root,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
 const entries={'input.txt':'script','aligned-sentences.json':[],'audio/full.mp3':'paid','semantics.json':{sentences:[]},'remotion/shots.json':[{id:'s19',visual:'published'}],'qa/ark-editorial-response.json':{old:true}};
 for(const [n,v]of Object.entries(entries)){write(p,n,v);write(w,n,v);}
 const initial=Object.fromEntries(Object.keys(entries).map(n=>[n,hash(fs.readFileSync(path.join(p,n)))]));
 const submission={submittedAt:'current-call',inputs:Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,initial[n]]))};
 write(p,'qa/editorial-single-submission.json',submission);write(w,'qa/editorial-single-submission.json',submission);
 const base={sentences:[],shots:[{id:'s19',visual:'last-compiled'},{id:'s05',visual:'preserved-success'}]};
 const contract={schema:'talkcraft-editorial-selection-request-v2',baseProposal:base};
 const request={...contract,requestId:hash(JSON.stringify(contract))},raw={requestId:request.requestId,repairs:[{shotId:'s19',visual:'invalid-new'}]};
 write(w,'qa/editorial-selection-request.json',request);
 captureEditorialResponse(w,{runId:'current',requestId:request.requestId,prompt:'current'})(JSON.stringify({output_text:JSON.stringify(raw)}),{httpStatus:200});
 const rawResponse='qa/editorial-provider-responses/2026-10-19T00-00-00-000Z.json';write(w,rawResponse,raw);
 const issues=[{shotId:'s19',code:'EDITORIAL_STRUCTURE_INVALID',message:'明确字段错误'}];
 const audit={schema:'talkcraft-editorial-selection-audit-v1',requestId:request.requestId,compiled:false,passed:false,productionAdmitted:false,rawResponse,issues};
 const cache={...base,editorialSelectionRejection:audit};write(w,'qa/editorial-selection-audit.json',audit);write(w,'qa/ark-editorial-response.json',cache);
 saveEditorialRepairFeedback(w,cache,{issues});
 write(p,'qa/node-repair.json',{schema:'talkcraft-node-repair-v1',status:'blocked',node:'storyboard-review',providerSubmitted:true,runId:'current',directory,initial,error:'分镜提案预检未通过：[EDITORIAL_STRUCTURE_INVALID] 明确字段错误'});
 const before=fs.readFileSync(path.join(p,'remotion/shots.json'));
 const f=currentEditorialRepairFeedback(p);assert.deepEqual(f.proposal,base);assert.deepEqual(f.failedChecks,issues);
 assert.equal(f.stage,'planning-check');assert.equal(f.sourceGate,'selection-compile');
 assert.deepEqual(fs.readFileSync(path.join(p,'remotion/shots.json')),before);
 write(w,rawResponse,{...raw,requestId:'other'});assert.throws(()=>currentEditorialRepairFeedback(p),/不一致/);
});
