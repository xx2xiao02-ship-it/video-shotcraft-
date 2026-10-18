import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {executeNodeRepair,recoverNodePublication} from './talkcraft-node-repair.mjs';
import {createHash} from 'node:crypto';
import {talkcraftProject} from './talkcraft-status.mjs';
const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'node-repair-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const project=path.join(root,'director/b-mode-runs',id,'talkcraft');fs.mkdirSync(path.join(project,'qa'),{recursive:true});
 for(const [n,v] of Object.entries({'source-run.json':'{}','SHOTBOOK.md':'accepted','qa/editorial-single-submission.json':'{"submittedAt":"old"}'}))fs.writeFileSync(path.join(project,n),v);
 return {root,project,runId:id,node:'storyboard-review'};}
test('07独立工作区失败保留正式数据和已提交费用证据，不能假装未消费',async t=>{
 const f=fixture(t);await assert.rejects(()=>executeNodeRepair({...f,operation:async work=>{
  assert.equal(talkcraftProject(f.root,id),work);fs.writeFileSync(path.join(work,'SHOTBOOK.md'),'new');
  fs.writeFileSync(path.join(work,'qa/editorial-single-submission.json'),'{"submittedAt":"new","outcome":"unknown"}');throw Error('failed');
 }}),/failed/);
 assert.equal(fs.readFileSync(path.join(f.project,'SHOTBOOK.md'),'utf8'),'accepted');
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.project,'qa/editorial-single-submission.json'))).outcome,'unknown');
 assert.equal(talkcraftProject(f.root,id),f.project);
});
test('07成功才发布，下一次继续不把自己的状态日志当输入冲突',async t=>{
 const f=fixture(t);for(const value of ['new','newer'])await executeNodeRepair({...f,operation:work=>{
  assert.equal(fs.readFileSync(path.join(f.project,'SHOTBOOK.md'),'utf8'),value==='new'?'accepted':'new');
  fs.writeFileSync(path.join(work,'SHOTBOOK.md'),value);return {passed:true};
 }});assert.equal(fs.readFileSync(path.join(f.project,'SHOTBOOK.md'),'utf8'),'newer');
});
test('补全期间正式内容变化不得覆盖；09同样执行事务保护',async t=>{
 const f=fixture(t);await assert.rejects(()=>executeNodeRepair({...f,node:'preflight',operation:work=>{
  fs.writeFileSync(path.join(work,'SHOTBOOK.md'),'worker');fs.writeFileSync(path.join(f.project,'SHOTBOOK.md'),'user-change');return {passed:true};
 }}),/正式输入发生变化/);assert.equal(fs.readFileSync(path.join(f.project,'SHOTBOOK.md'),'utf8'),'user-change');
});

test('发布中断恢复按重定位后的哈希回滚，保留付费记录且可重复检查',t=>{
 const f=fixture(t),dir=path.join(f.project,'qa/node-repairs/interrupted'),before=path.join(dir,'before'),work=path.join(dir,'work');
 fs.mkdirSync(path.join(work,'qa'),{recursive:true});fs.mkdirSync(before,{recursive:true});
 const sha=s=>createHash('sha256').update(s).digest('hex');
 fs.writeFileSync(path.join(before,'SHOTBOOK.md'),'accepted');
 fs.writeFileSync(path.join(work,'SHOTBOOK.md'),work+'/asset');
 fs.writeFileSync(path.join(work,'qa/editorial-single-submission.json'),'{"submittedAt":"new"}');
 fs.writeFileSync(path.join(f.project,'SHOTBOOK.md'),f.project+'/asset');
 fs.writeFileSync(path.join(f.project,'qa/node-repair.json'),JSON.stringify({schema:'talkcraft-node-repair-v1',status:'publishing',directory:'qa/node-repairs/interrupted',changes:['SHOTBOOK.md'],initial:{'SHOTBOOK.md':sha('accepted')},publishedHashes:{'SHOTBOOK.md':sha(f.project+'/asset')}}));
 assert.equal(recoverNodePublication(f.project),true);assert.equal(recoverNodePublication(f.project),false);
 assert.equal(fs.readFileSync(path.join(f.project,'SHOTBOOK.md'),'utf8'),'accepted');
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.project,'qa/editorial-single-submission.json'))).submittedAt,'new');
});

test('事务不覆盖主目录并发新增文件',async t=>{
 const f=fixture(t);await assert.rejects(()=>executeNodeRepair({...f,operation:work=>{
  fs.writeFileSync(path.join(work,'new.txt'),'worker');fs.writeFileSync(path.join(f.project,'new.txt'),'user');return {passed:true};
 }}),/新增文件/);assert.equal(fs.readFileSync(path.join(f.project,'new.txt'),'utf8'),'user');
});

test('同次已提交节点可免费恢复；失败与重复继续保留基稿、费用记录和当前诊断',async t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.project,'SHOTBOOK.md'));
 await assert.rejects(()=>executeNodeRepair({...f,operation:work=>{
   fs.writeFileSync(path.join(work,'qa/editorial-single-submission.json'),'{"submittedAt":"new"}');throw Error('JSON failed');
 }}),/JSON failed/);
 const submission=fs.readFileSync(path.join(f.project,'qa/editorial-single-submission.json'));
 // The production failure reporter may refresh its derived report after exit.
 fs.writeFileSync(path.join(f.project,'qa/audit-feedback.json'),'new diagnostic');
 fs.mkdirSync(path.join(f.project,'qa/failures'));fs.writeFileSync(path.join(f.project,'qa/failures/current.json'),'current failure log');
 for(let i=0;i<2;i++)await assert.rejects(()=>executeNodeRepair({...f,resumeProviderResponse:true,operation:()=>{
   throw Object.assign(Error('原文未留存'),{code:'EDITORIAL_RESPONSE_NOT_RETAINED'});
 }}),/原文未留存/);
 const record=JSON.parse(fs.readFileSync(path.join(f.project,'qa/node-repair.json')));
 assert.equal(record.responseFailure.code,'EDITORIAL_RESPONSE_NOT_RETAINED');assert.equal(record.responseFailure.paidCalls,0);
 assert.deepEqual(fs.readFileSync(path.join(f.project,'SHOTBOOK.md')),before);
 assert.deepEqual(fs.readFileSync(path.join(f.project,'qa/editorial-single-submission.json')),submission);
});

test('免费恢复拒绝跨任务目录和已变更正式输入，成功复检才发布',async t=>{
 const f=fixture(t);
 await assert.rejects(()=>executeNodeRepair({...f,operation:work=>{
  fs.writeFileSync(path.join(work,'qa/editorial-single-submission.json'),'{"submittedAt":"new"}');
  fs.writeFileSync(path.join(work,'SHOTBOOK.md'),'retained design');throw Error('interrupted');
 }}),/interrupted/);
 fs.writeFileSync(path.join(f.project,'SHOTBOOK.md'),'changed');
 await assert.rejects(()=>executeNodeRepair({...f,resumeProviderResponse:true,operation:()=>assert.fail()}),/正式输入已变化/);
 fs.writeFileSync(path.join(f.project,'SHOTBOOK.md'),'accepted');
 const journal=JSON.parse(fs.readFileSync(path.join(f.project,'qa/node-repair.json')));
 fs.writeFileSync(path.join(f.project,'qa/node-repair.json'),JSON.stringify({...journal,runId:'another-run'}));
 await assert.rejects(()=>executeNodeRepair({...f,resumeProviderResponse:true,operation:()=>assert.fail()}),/本次/);
 fs.writeFileSync(path.join(f.project,'qa/node-repair.json'),JSON.stringify(journal));
 await executeNodeRepair({...f,resumeProviderResponse:true,operation:()=>({passed:true})});
 assert.equal(fs.readFileSync(path.join(f.project,'SHOTBOOK.md'),'utf8'),'retained design');
 await assert.rejects(()=>executeNodeRepair({...f,resumeProviderResponse:true,operation:()=>assert.fail()}),/本次/);
});
