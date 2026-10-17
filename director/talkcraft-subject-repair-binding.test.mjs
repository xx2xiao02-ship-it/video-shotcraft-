import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {bindMachineVideo,assertMachineVideo} from './talkcraft-acceptance-policy.mjs';
import {repairVideoForReview} from './talkcraft-word-reveal.mjs';

test('修复片入口校验视频哈希并保留旧机器绑定兼容性',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'subject-repair-binding-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'remotion/src'),{recursive:true});
  fs.writeFileSync(path.join(project,'remotion/src/Main.tsx'),'export const content=1;');
  const video=path.join(project,'remotion/out/repair-subject-protection-v3/final.mp4');
  fs.mkdirSync(path.dirname(video),{recursive:true});
  fs.writeFileSync(video,'hash-fixture-only-not-a-render');
  const report=bindMachineVideo(project,video);
  assert.equal(report.userAcceptance,false);assert.equal(report.visualVerified,false);
  assert.equal(repairVideoForReview(project),video);
  const record=path.join(project,'qa/machine-video-binding.json');
  delete report.video;fs.writeFileSync(record,JSON.stringify(report));
  assert.doesNotThrow(()=>assertMachineVideo(project,video));
  bindMachineVideo(project,video);fs.appendFileSync(video,'tampered');
  assert.throws(()=>repairVideoForReview(project),/机器绑定不符/);
  bindMachineVideo(project,video);
  fs.writeFileSync(path.join(project,'remotion/src/Main.tsx'),'export const content=2;');
  assert.throws(()=>repairVideoForReview(project),/源码或素材绑定已过期/);
});
