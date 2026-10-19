import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {repeatedPaidRepairScope} from './talkcraft-paid-scope-history.mjs';
const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'paid-scope-history-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const w=path.join(p,'qa/node-repairs/current/work');
 const put=(base,n,v)=>{const f=path.join(base,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v));};
 for(const base of [p,w])for(const n of ['source-run.json','input.txt','aligned-sentences.json','audio/full.mp3'])put(base,n,'current-'+n);
 const checks=[{code:'TEXT_EFFECT_DEPENDENCY_EARLY',shotId:'s08',effectId:'source-0'}];
 const contract={schema:'talkcraft-editorial-selection-request-v2',editableShotIds:['s08'],failedChecks:checks,baseProposal:{shots:[{id:'s08',shotCard:'source-converge'}]}};
 const request={...contract,requestId:digest(contract)};
 put(w,'qa/editorial-selection-request.json',request);
 put(w,'qa/editorial-single-submission.json',{schema:'talkcraft-editorial-single-submission-v1',submittedAt:'2026-10-19T00:00:00Z',inputs:Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,digest('current-'+n)]))});
 return {p,w,put,request,checks,plan:{editableShotIds:['s08']}};
}
test('素材与时序错误交替也识别此前本任务已提交范围，不依赖规则版本或动效编号',t=>{
 const f=fixture(t),feedback={proposal:f.request.baseProposal,failedChecks:[{...f.checks[0],effectId:'new-id'}, {...f.checks[0],effectId:'other'},{code:'NEW_ERROR',shotId:'s08'},{code:'OTHER',shotId:'s09'}]};
 const r=repeatedPaidRepairScope(f.p,feedback,f.plan);assert.equal(r.requestId,f.request.requestId);assert.deepEqual(r.shotIds,['s08']);
});
test('不同目标镜头、不同问题类型或字段不误当成相同范围',t=>{
 const f=fixture(t);
 for(const check of [{...f.checks[0],shotId:'s09'},{...f.checks[0],code:'local_material_unmatched'},{...f.checks[0],field:'title'}])
  assert.equal(repeatedPaidRepairScope(f.p,{proposal:f.request.baseProposal,failedChecks:[check]},f.plan),null);
});
test('旧任务身份、原配音或真实时间轴变化不能串用历史证据',t=>{
 for(const name of ['source-run.json','audio/full.mp3','aligned-sentences.json']){
  const f=fixture(t);f.put(f.w,name,'old');assert.equal(repeatedPaidRepairScope(f.p,{proposal:f.request.baseProposal,failedChecks:f.checks},f.plan),null);
 }
});
test('未实际提交、请求指纹损坏或提交输入不符不作为已付费证据',t=>{
 for(const mode of ['unsubmitted','bad-request','bad-input']){
  const f=fixture(t);
  if(mode==='bad-request')f.put(f.w,'qa/editorial-selection-request.json',{...f.request,requestId:'changed'});
  else f.put(f.w,'qa/editorial-single-submission.json',{schema:'talkcraft-editorial-single-submission-v1',...(mode==='bad-input'?{submittedAt:'now'}:{}),inputs:{}});
  assert.equal(repeatedPaidRepairScope(f.p,{proposal:f.request.baseProposal,failedChecks:f.checks},f.plan),null);
 }
});


test('同镜已重新选卡后属于不同模板问题，不能让旧卡失败误阻断当前设计',t=>{
 const f=fixture(t),feedback={proposal:{shots:[{id:'s08',shotCard:'cursor-actor-demo'}]},failedChecks:f.checks};
 assert.equal(repeatedPaidRepairScope(f.p,feedback,f.plan),null);
 delete feedback.proposal;assert.equal(repeatedPaidRepairScope(f.p,feedback,f.plan),null);
});
