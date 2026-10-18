import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {restoreRejectedRevisionBase} from './talkcraft-editorial-cache-recovery.mjs';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-cache-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const write=(n,v)=>{const f=path.join(p,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
 const snapshot='qa/storyboard-revisions/current',base={shots:[{id:'s02',shotCard:'original'}],sentences:[]};
 for(const n of ['input.txt','aligned-sentences.json','audio/full.mp3','qa/storyboard-adjustment-request.json'])write(n,{n});
 write(snapshot+'/qa/ark-editorial-response.json',base);write(snapshot+'/semantics.json',{sentences:[]});
 write(snapshot+'/qa/editorial-repair-feedback.json',{schema:'talkcraft-editorial-repair-feedback-v1',
  failedChecks:[{code:'CURRENT_04',shotId:'s02'}],proposal:base,responseSha256:hash(path.join(p,snapshot,'qa/ark-editorial-response.json'))});
 const files=['qa/ark-editorial-response.json','qa/editorial-repair-feedback.json','semantics.json'];
 const inputs=Object.fromEntries(files.map(n=>[n,hash(path.join(p,snapshot,n))]));
 for(const n of ['input.txt','aligned-sentences.json','audio/full.mp3','qa/storyboard-adjustment-request.json'])inputs[n]=hash(path.join(p,n));
 write('qa/editorial-revision-authorization.json',{schema:'talkcraft-editorial-revision-authorization-v1',startedAt:'current',maxTasks:1,inputs});
 write('qa/editorial-provider-responses/current.json',{requestId:'request',repairs:[{shotId:'s15'}],captionEmphasis:{changed:true}});
 write('qa/editorial-selection-request.json',{requestId:'request'});
 write('qa/ark-editorial-response.json',{...base,editorialSelectionRejection:{requestId:'request',rawResponse:'qa/editorial-provider-responses/current.json'}});
 return {p,write,base};
}
test('恢复本轮授权对应原稿，归档拒绝结果；不采纳越范围修订或改写字幕',t=>{
 const {p,base}=fixture(t),old=fs.readFileSync(path.join(p,'qa/ark-editorial-response.json'));
 const audio=hash(path.join(p,'audio/full.mp3')),r=restoreRejectedRevisionBase(p);
 assert.deepEqual(r.expectedShotIds,['s02']);assert.deepEqual(r.returnedShotIds,['s15']);
 assert.deepEqual(r.unexpectedFields,['captionEmphasis']);assert.equal(r.paidCalls,0);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'qa/ark-editorial-response.json'))),base);
 assert.deepEqual(fs.readFileSync(path.join(p,r.rejectedCache)),old);
 assert.equal(hash(path.join(p,'audio/full.mp3')),audio);
 assert.equal(restoreRejectedRevisionBase(p).responseSha256,r.responseSha256);
});
test('原稿或快照篡改、旧输入、重复快照及缺少授权均停止恢复且不改缓存',t=>{
 for(const mutate of [
  f=>f.write('input.txt','变更'),f=>f.write('qa/storyboard-revisions/current/semantics.json','变更'),
  f=>fs.cpSync(path.join(f.p,'qa/storyboard-revisions/current'),path.join(f.p,'qa/storyboard-revisions/duplicate'),{recursive:true}),
  f=>f.write('qa/editorial-revision-authorization.json',{})
 ]){
  const f=fixture(t),before=fs.readFileSync(path.join(f.p,'qa/ark-editorial-response.json'));mutate(f);
  assert.throws(()=>restoreRejectedRevisionBase(f.p));
  assert.deepEqual(fs.readFileSync(path.join(f.p,'qa/ark-editorial-response.json')),before);
 }
});
test('正式分镜存在或原始返回路径越界不恢复覆盖',t=>{
 for(const mutate of [f=>f.write('SHOTBOOK.md','已正式落地'),
  f=>f.write('qa/ark-editorial-response.json',{editorialSelectionRejection:{rawResponse:'../outside.json'}})]){
  const f=fixture(t);mutate(f);const before=fs.readFileSync(path.join(f.p,'qa/ark-editorial-response.json'));
  assert.throws(()=>restoreRejectedRevisionBase(f.p));assert.deepEqual(fs.readFileSync(path.join(f.p,'qa/ark-editorial-response.json')),before);
 }
});
