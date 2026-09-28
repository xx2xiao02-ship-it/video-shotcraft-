import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {prepareTalkcraftProject, useAlignedTiming} from './talkcraft-project.mjs';

const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const workspace = path.resolve('tmp');

function fixture() {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-project-test-'));
  const run = path.join(root, 'director', 'b-mode-runs', runId);
  const media = path.join(root, 'template', 'public', 'b-mode', runId);
  mkdirSync(run, {recursive:true});
  mkdirSync(media, {recursive:true});
  writeFileSync(path.join(run, 'avatar.png'), 'avatar');
  writeFileSync(path.join(media, 'placeholder-voice.mp3'), 'audio');
  writeFileSync(path.join(media, 'scene-video-0.mp4'), 'video');
  writeFileSync(path.join(run, 'placeholder-report.json'), JSON.stringify({runId, isDigitalHuman:false,
    totalFrames:90, fps:30, timingMethod:'edge_sentence_boundary'}));
  writeFileSync(path.join(run, 'placeholder-scene-plan.json'), JSON.stringify({runId, totalFrames:90,
    scenes:[{text:'第一句。', fromFrame:0, durationInFrames:45,
      video:`b-mode/${runId}/scene-video-0.mp4`, videoSource:'素材库/示例.mp4'},
    {text:'第二句。', fromFrame:45, durationInFrames:45, video:null}]}));
  return {root, run};
}

test('exports B assets without altering the source run and closes aligned shots at audio end', () => {
  const {root, run} = fixture();
  try {
    const result = prepareTalkcraftProject(root, runId);
    assert.equal(result.scenes, 2);
    assert.equal(result.withVideo, 1);
    assert.deepEqual(JSON.parse(readFileSync(path.join(result.projectDir, 'script.json'))).sentences,
      ['第一句。', '第二句。']);
    assert.equal(JSON.parse(readFileSync(path.join(result.projectDir, 'source-run.json'))).visualTextLocale, 'zh-CN');
    assert.equal(readFileSync(path.join(run, 'avatar.png'), 'utf8'), 'avatar');
    assert.throws(() => prepareTalkcraftProject(root, runId), /already exists/);
    const timestamps = {total:2.6, sentences:[
      {text:'第一句。', start:0, end:1.2, match:0.96, words:[{text:'第一句', start:0, end:1.2}]},
      {text:'第二句。', start:1.5, end:2.6, match:0.94, words:[{text:'第二句', start:1.5, end:2.6}]}]};
    writeFileSync(path.join(result.projectDir, 'audio', 'timestamps.json'), JSON.stringify(timestamps));
    assert.equal(useAlignedTiming(root, runId).minMatch, 0.94);
    assert.deepEqual(JSON.parse(readFileSync(path.join(result.projectDir, 'aligned-sentences.json'))), [
      {sentence:0, start:0, end:1.5, text:'第一句。'},
      {sentence:1, start:1.5, end:3, text:'第二句。'}]);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});

test('rejects gaps in the source frame timeline before creating a project', () => {
  const {root, run} = fixture();
  try {
    const planFile = path.join(run, 'placeholder-scene-plan.json');
    const plan = JSON.parse(readFileSync(planFile));
    plan.scenes[1].fromFrame = 46;
    writeFileSync(planFile, JSON.stringify(plan));
    assert.throws(() => prepareTalkcraftProject(root, runId), /does not close/);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});
