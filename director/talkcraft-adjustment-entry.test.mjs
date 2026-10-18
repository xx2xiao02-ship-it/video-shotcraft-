import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {requestTalkcraftStoryboardAdjustment,approveTalkcraftStoryboard} from './talkcraft-status.mjs';

const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'adjustment-entry-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'director/b-mode-runs',id,'talkcraft');
  for(const dir of ['qa','audio','remotion'])fs.mkdirSync(path.join(project,dir),{recursive:true});
  for(const [name,value]of Object.entries({'source-run.json':'{}','input.txt':'原稿',
    'SHOTBOOK.md':'未通过06的分镜','semantics.json':'{"sentences":[]}',
    'remotion/shots.json':'[{"id":"s07"}]','aligned-sentences.json':'[]',
    'audio/full.mp3':'existing-paid-audio','material-research-plan.json':'{"shots":[]}'}))
    fs.writeFileSync(path.join(project,name),value);
  return {root,project};
}
test('06缺候选产物仍可正式提交调整，记录当前输入且不解锁审核或产生费用授权',t=>{
  const {root,project}=fixture(t);
  const audio=fs.readFileSync(path.join(project,'audio/full.mp3'));
  requestTalkcraftStoryboardAdjustment(root,id,'修订s07真实资料展示，不改变配音');
  const record=JSON.parse(fs.readFileSync(path.join(project,'qa/storyboard-adjustment-request.json')));
  assert.match(record.request,/s07/);
  assert.equal(record.inputs['audio/full.mp3'],createHash('sha256').update(audio).digest('hex'));
  assert.ok(record.inputs['remotion/shots.json']);
  assert.deepEqual(fs.readFileSync(path.join(project,'audio/full.mp3')),audio);
  for(const f of ['qa/card-candidates.json','qa/semantic-passed.json','qa/preflight-passed.json',
    'qa/storyboard-approved.json','qa/editorial-single-submission.json'])assert.equal(fs.existsSync(path.join(project,f)),false,f);
  assert.throws(()=>approveTalkcraftStoryboard(root,id,'不能以调整请求替代选卡通过'));
});
test('真正缺分镜输入仍拒绝调整，保留现有审批及素材',t=>{
  const {root,project}=fixture(t);
  fs.unlinkSync(path.join(project,'SHOTBOOK.md'));
  const approval=path.join(project,'qa/storyboard-approved.json');fs.writeFileSync(approval,'existing-approval');
  assert.throws(()=>requestTalkcraftStoryboardAdjustment(root,id,'调整s07'),/数据不完整/);
  assert.equal(fs.existsSync(path.join(project,'qa/storyboard-adjustment-request.json')),false);
  assert.equal(fs.readFileSync(approval,'utf8'),'existing-approval');
});
