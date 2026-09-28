import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {buildTalkcraftFailureReport, latestTalkcraftFailureReport, writeTalkcraftFailureReport} from './talkcraft-failure-report.mjs';

const workspace = path.resolve('tmp');
const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('reports failed fallback alignment without overwriting earlier failure evidence', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-failure-test-'));
  try {
    const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
    mkdirSync(path.join(project, 'audio'), {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30,
      totalFrames:3900, voiceEngine:'windows-offline-zh-CN'}));
    writeFileSync(path.join(project, 'input.txt'), '研究者发现，只是把资料放进收藏夹，就能显著降低你真正学习它的概率。');
    writeFileSync(path.join(project, 'audio', 'full.mp3'), 'audio');
    writeFileSync(path.join(project, 'audio', 'timestamps.json'), JSON.stringify({sentences:[
      {match:0.55}, {match:0.8}]}));
    const task = {id:3, name:'talkcraft-bootstrap', exitCode:1,
      logs:['Edge TTS failed (NoAudioReceived: No audio was received); trying local Chinese voice',
        'Error: Aligned sentence 1 failed the script, word, or timing contract']};
    const first = writeTalkcraftFailureReport(root, runId, task);
    const second = writeTalkcraftFailureReport(root, runId, task);
    assert.notEqual(first.file, second.file);
    assert.equal(readdirSync(path.dirname(first.file)).length, 2);
    assert.equal(first.report.code, 'ALIGNMENT_QUALITY_GATE');
    assert.equal(first.report.evidence.belowThreshold, 2);
    assert.equal(first.report.evidence.minimumMatch, 0.55);
    assert.equal(first.report.evidence.edgeTtsNoAudio, true);
    assert.match(first.report.contentWarning, /研究表述/);
    assert.equal(latestTalkcraftFailureReport(root, runId)?.runId, runId);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});

test('retains concrete preflight failures and gives stage-specific actions', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-preflight-failure-test-'));
  try {
    const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
    mkdirSync(path.join(project, 'audio'), {recursive:true});
    writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30, totalFrames:300}));
    writeFileSync(path.join(project, 'input.txt'), '口播稿。');
    writeFileSync(path.join(project, 'audio', 'full.mp3'), 'audio');
    writeFileSync(path.join(project, 'audio', 'timestamps.json'), JSON.stringify({sentences:[{match:.98}]}));
    const report = buildTalkcraftFailureReport(root, runId, {id:4, name:'talkcraft-preflight', exitCode:1,
      logs:['[SHOTBOOK] FAIL: 6 镜缺「素材：」行。','[语义覆盖] FAIL: S06 缺 号召。','== preflight FAIL ==']});
    assert.equal(report.code, 'TALKCRAFT_PREFLIGHT_FAILED');
    assert.equal(report.failedChecks.length, 2);
    assert.match(report.cause, /2 项检查失败/u);
    assert.match(report.actions.join(' '), /SHOTBOOK/u);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});
