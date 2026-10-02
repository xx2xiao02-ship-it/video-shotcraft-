import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {approveTalkcraftSample, approveTalkcraftStoryboard, latestTalkcraftRun, readTalkcraftStatus, recordPreflightResult, recordSemanticPass} from './talkcraft-status.mjs';

const workspace = path.resolve(process.env.TALKCRAFT_TEST_TEMP_ROOT || 'tmp');
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('preflight and sample approval are invalidated when their inputs change', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-status-test-'));
  try {
    const project = path.join(root, 'director', 'b-mode-runs', id, 'talkcraft');
    mkdirSync(path.join(project, 'audio'), {recursive:true});
    mkdirSync(path.join(project, 'remotion', 'out', 'preview'), {recursive:true});
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId:id, fps:30, totalFrames:300}));
    writeFileSync(path.join(project, 'semantics.json'), JSON.stringify({sentences:[
      {shot:'s01',weight:'main',sem:['钩子']}]}));
    writeFileSync(path.join(project, 'SHOTBOOK.md'), 'first plan');
    writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify([{id:'s01',start:0,end:10}]));
    writeFileSync(path.join(project, 'audio', 'timestamps.json'), JSON.stringify({sentences:[{match:0.98}]}));
    writeFileSync(path.join(project, 'sources.md'), 'source');
    assert.equal(latestTalkcraftRun(root), id);
    assert.equal(readTalkcraftStatus(root, id).visualTextLocale, 'zh-CN');
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, false);
    assert.equal(readTalkcraftStatus(root, id).semanticPassed, false);
    recordSemanticPass(root, id);
    assert.equal(readTalkcraftStatus(root, id).semanticPassed, true);
    assert.equal(readTalkcraftStatus(root, id).preflight, false);
    writeFileSync(path.join(project, 'qa', 'card-candidates.json'), '{}');
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, false);
    writeFileSync(path.join(project, 'qa', 'card-candidates.md'), '# candidates');
    assert.equal(readTalkcraftStatus(root, id).candidatesReady, true);
    recordPreflightResult(root, id, {passed:true});
    assert.equal(readTalkcraftStatus(root, id).preflight, true);
    approveTalkcraftStoryboard(root, id, 'test fixture');
    writeFileSync(path.join(project, 'remotion', 'out', 'preview', 's01.mp4'), 'sample-one');
    assert.equal(approveTalkcraftSample(root, id).approved, true);
    assert.equal(readTalkcraftStatus(root, id).sampleApproved, true);
    const finalFile = path.join(project, 'remotion', 'out', 'final.mp4');
    writeFileSync(finalFile, 'final-one');
    const finalSha256 = createHash('sha256').update(readFileSync(finalFile)).digest('hex');
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    mkdirSync(path.join(project, 'review'), {recursive:true});
    writeFileSync(path.join(project, 'qa', 'passed.json'), JSON.stringify({finalSha256}));
    writeFileSync(path.join(project, 'review', 'approval.json'), JSON.stringify({finalSha256,
      reviewedShots:1, openP0:0, openP1:0}));
    const deliveryFile = path.join(project, 'remotion', 'out', 'delivery.mp4');
    writeFileSync(deliveryFile, '');
    assert.equal(readTalkcraftStatus(root, id).delivery, false);
    writeFileSync(deliveryFile, 'delivery-one');
    assert.equal(readTalkcraftStatus(root, id).delivery, true);
    writeFileSync(path.join(project, 'SHOTBOOK.md'), 'changed plan');
    assert.equal(readTalkcraftStatus(root, id).preflight, false);
    assert.equal(readTalkcraftStatus(root, id).sampleApproved, false);
    assert.throws(() => approveTalkcraftSample(root, id), /需先完成自动调节和分镜审核/);
    assert.equal(readFileSync(path.join(project, 'sample-approved.json'), 'utf8').includes('sampleSha256'), true);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});

test('all planned scenes must exist and be registered before full rendering is ready', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-scenes-test-'));
  try {
    const project = path.join(root, 'director', 'b-mode-runs', id, 'talkcraft');
    const scenes = path.join(project, 'remotion', 'src', 'scenes');
    mkdirSync(scenes, {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId:id}));
    writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify([{id:'s01'}, {id:'s02'}]));
    writeFileSync(path.join(scenes, 's01.tsx'), 'export const S01 = () => null;');
    writeFileSync(path.join(scenes, 'index.ts'), 'export const SCENES = {s01:S01};');
    assert.deepEqual(readTalkcraftStatus(root, id).scenesMissing, ['s02']);
    assert.equal(readTalkcraftStatus(root, id).scenesReady, false);
    writeFileSync(path.join(scenes, 's02.tsx'), 'export const S02 = () => null;');
    assert.equal(readTalkcraftStatus(root, id).scenesReady, false);
    writeFileSync(path.join(scenes, 'index.ts'), 'export const SCENES = {s01:S01, s02:S02};');
    assert.equal(readTalkcraftStatus(root, id).scenesReady, true);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});
