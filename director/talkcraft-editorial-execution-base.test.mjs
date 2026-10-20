import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {captureEditorialResponse} from './talkcraft-editorial-response.mjs';
import {preserveRetainedEditorialExecutionBase,savePlanningEditorialRepairFeedback,verifiedCandidateRevisionFeedback} from './talkcraft-editorial-planning-contract.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
test('新任务标识及任意镜号：局部修订继承明确父事务执行时序，生产旧稿不变，重复恢复幂等',t=>{
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'execution-base-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const directory='qa/node-repairs/parent',source=path.join(p,directory,'work'),target=path.join(p,'qa/node-repairs/next/work');
 const write=(root,n,v)=>{const f=path.join(root,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
 for(const root of [p,source,target])for(const [n,v] of Object.entries({'input.txt':'new independent script','aligned-sentences.json':[],
  'audio/full.mp3':'paid voice','source-run.json':{runId:'independent-run'},'semantics.json':{sentences:[]},
  'remotion/shots.json':[{id:'arbitrary-shot',shotCard:'card',nativePresentation:{wordEvents:[]}}],
  'material-research-plan.json':{shots:[]},'material-binding-plan.json':{},'remotion/native-presentation.json':{shots:['old']},'remotion/word-reveal-plan.json':{events:['old']}}))write(root,n,v);
 const proposal={shots:[{id:'arbitrary-shot',shotCard:'card',nativePresentation:{wordEvents:[]}}],sentences:[]};
 write(source,'qa/ark-editorial-response.json',proposal);
 write(source,'remotion/native-presentation.json',{shots:['executed-parent']});
 write(source,'remotion/word-reveal-plan.json',{events:['executed-parent']});
 const contract={schema:'talkcraft-editorial-selection-request-v2',baseProposal:proposal},request={...contract,requestId:sha(JSON.stringify(contract))};
 write(source,'qa/editorial-selection-request.json',request);
 const raw={requestId:request.requestId,repairs:[]};
 captureEditorialResponse(source,{runId:'independent-run',requestId:request.requestId,prompt:'bound'})(JSON.stringify({output_text:JSON.stringify(raw)}),{httpStatus:200});
 const rawFile='qa/editorial-provider-responses/2026-10-20T00-00-00-000Z.json';write(source,rawFile,raw);
 write(source,'qa/editorial-selection-audit.json',{passed:true,compiled:true,requestId:request.requestId,compiledSha256:sha(JSON.stringify(proposal)),rawResponse:rawFile});
 savePlanningEditorialRepairFeedback(source,{passed:false,issues:[{shotId:'arbitrary-shot',code:'GRAPHIC_COMPARISON_REQUIRED'}]});
 const feedback={proposal,retainedTransaction:directory,requestId:request.requestId,sourceGate:'planning-check',schema:'talkcraft-candidate-editorial-repair-v1',passed:false};
 const before=fs.readFileSync(path.join(p,'remotion/native-presentation.json'));
 const a=preserveRetainedEditorialExecutionBase(target,p,feedback),b=preserveRetainedEditorialExecutionBase(target,p,feedback);
 assert.equal(a.snapshot,b.snapshot);assert.deepEqual(verifiedCandidateRevisionFeedback(target),b);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target,a.snapshot,'remotion/native-presentation.json'))),{shots:['executed-parent']});
 assert.deepEqual(fs.readFileSync(path.join(p,'remotion/native-presentation.json')),before);
 assert.throws(()=>preserveRetainedEditorialExecutionBase(target,p,{...feedback,retainedTransaction:'../other-run'}),/当前任务/);
 assert.throws(()=>preserveRetainedEditorialExecutionBase(target,p,{...feedback,requestId:'other'}),/不一致/);
 write(target,'source-run.json',{runId:'another-run'});assert.throws(()=>preserveRetainedEditorialExecutionBase(target,p,feedback),/任务标识不同/);write(target,'source-run.json',{runId:'independent-run'});
 write(target,'audio/full.mp3','different');assert.throws(()=>preserveRetainedEditorialExecutionBase(target,p,feedback),/时间轴不同/);write(target,'audio/full.mp3','paid voice');
 write(source,'remotion/shots.json',[]);assert.throws(()=>preserveRetainedEditorialExecutionBase(target,p,feedback),/反馈已变化/);
});
