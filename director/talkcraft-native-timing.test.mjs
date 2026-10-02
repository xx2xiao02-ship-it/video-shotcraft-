import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {readNativeTiming, writeNativeTiming, validateNativeTiming, timingHealth, requireWordTiming, createTimingRecovery} from './talkcraft-native-timing.mjs';
import {useAlignedTiming} from './talkcraft-project.mjs';
import {buildTalkcraftFailureReport} from './talkcraft-failure-report.mjs';

const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function fixture(events = [
  {type:'SentenceBoundary', text:'第一句。', offset:1_000_000, duration:9_500_000},
  {type:'SentenceBoundary', text:'第二句。', offset:10_000_000, duration:8_000_000},
]) {
  mkdirSync('tmp', {recursive:true});
  const root = mkdtempSync(path.resolve('tmp/native-timing-test-'));
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  mkdirSync(path.join(project, 'audio'), {recursive:true});
  mkdirSync(path.join(project, 'assets'), {recursive:true});
  writeFileSync(path.join(project, 'script.json'), JSON.stringify({sentences:['第一句。','第二句。']}));
  writeFileSync(path.join(project, 'script.txt'), '第一句。\n第二句。');
  writeFileSync(path.join(project, 'input.txt'), '第一句。第二句。');
  writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30, totalFrames:60}));
  writeFileSync(path.join(project, 'audio/full.mp3'), 'fixture-audio');
  writeFileSync(path.join(project, 'audio/voice-timing.json'), JSON.stringify({voiceEngine:'edge-tts', durationSeconds:2}));
  writeFileSync(path.join(project, 'audio/voice-timing.boundary.jsonl'), events.map(row => JSON.stringify(row)).join('\n'));
  return {root, project};
}

test('uses real provider sentence boundaries without inventing words or recognition confidence', () => {
  const {root, project} = fixture();
  const timing = writeNativeTiming(project);
  assert.equal(timing.sentences[0].start, 0.1);
  assert.equal(timing.sentences[0].end, 1); // trims the recorded 50 ms overlap
  assert.equal(timing.sentences[1].end, 1.8);
  assert.equal(timing.sentences[0].match, null);
  assert.deepEqual(timing.sentences[0].words, []);
  assert.equal(timingHealth(timing).sentenceTimingReady, true);
  assert.equal(timingHealth(timing).wordTimingReady, false);
  const result = useAlignedTiming(root, runId);
  assert.equal(result.minMatch, null);
  assert.deepEqual(JSON.parse(readFileSync(path.join(project, 'aligned-sentences.json'))).map(s => [s.start,s.end]), [[0,1],[1,2]]);
  assert.throws(() => requireWordTiming(project), /WORD_TIMING_REQUIRED/);
  assert.throws(() => writeNativeTiming(project), /preserved/);
});

test('rejects different text, missing sentences, large overlap and invalid time before writing', () => {
  for (const change of [
    rows => {rows[0].text = '另一句。';},
    rows => {rows.pop();},
    rows => {rows[1].offset = 2_000_000;},
    rows => {rows[1].duration = 30_000_000;},
    rows => {rows[0].offset = -1_000_000;},
  ]) {
    const {project} = fixture();
    const file = path.join(project, 'audio/voice-timing.boundary.jsonl');
    const rows = readFileSync(file, 'utf8').split('\n').map(JSON.parse);
    change(rows);
    writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n'));
    assert.throws(() => writeNativeTiming(project), /TTS 时间戳/);
    assert.equal(existsSync(path.join(project, 'audio/timestamps.json')), false);
  }
});

test('unavailable provider evidence falls back, but invalid supplied evidence does not silently fallback', () => {
  const {project} = fixture();
  writeFileSync(path.join(project, 'audio/voice-timing.json'), JSON.stringify({voiceEngine:'windows-offline-zh-CN', durationSeconds:2}));
  assert.equal(readNativeTiming(project), null);
  writeFileSync(path.join(project, 'audio/voice-timing.json'), JSON.stringify({voiceEngine:'volcengine-seed-tts-2.0', durationSeconds:2,
    segments:[{text:'第一句。第二句。',fromFrame:0,durationInFrames:60}], words:[]}));
  assert.equal(readNativeTiming(project), null); // frame-weighted estimates are not provider timestamps
});

test('accepts provider word spans in seconds and binds them to original sentence order', () => {
  const {project} = fixture();
  writeFileSync(path.join(project, 'audio/voice-timing.json'), JSON.stringify({voiceEngine:'volcengine-seed-tts-2.0', durationSeconds:2,
    words:[{word:'第一句',startTime:0.1,endTime:0.9},{word:'第二句',startTime:1,endTime:1.8}]}));
  const timing = readNativeTiming(project);
  assert.equal(timingHealth(timing).wordTimingReady, true);
  assert.deepEqual(timing.sentences[1].words, [{text:'第二句',start:1,end:1.8}]);
  assert.equal(timing.sentences[0].match, null);
});

test('detects changed audio or script instead of trusting a stale timing file', () => {
  const {project} = fixture();
  const timing = writeNativeTiming(project);
  validateNativeTiming(project, timing);
  writeFileSync(path.join(project, 'audio/full.mp3'), 'different-audio');
  assert.throws(() => validateNativeTiming(project, timing), /不一致/);
});

test('recovery preserves audio and failed evidence, creates no TTS call, and invalidates downstream approvals', () => {
  const {root, project} = fixture();
  const failed = JSON.stringify({total:2,sentences:[{match:0.3}]});
  writeFileSync(path.join(project, 'audio/timestamps.json'), failed);
  writeFileSync(path.join(project, 'sample-approved.json'), '{}');
  const recovery = createTimingRecovery(root, runId);
  assert.notEqual(recovery.runId, runId);
  assert.equal(readFileSync(path.join(project, 'audio/timestamps.json'), 'utf8'), failed);
  assert.equal(readFileSync(path.join(recovery.project, 'audio/full.mp3'), 'utf8'), 'fixture-audio');
  assert.equal(existsSync(path.join(recovery.project, 'sample-approved.json')), false);
  assert.equal(existsSync(path.join(recovery.project, 'audio/timestamps.json')), false);
  writeNativeTiming(recovery.project);
  assert.equal(useAlignedTiming(root, recovery.runId).sentenceTimingReady, true);
});

test('legacy ASR failures remain failures', () => {
  assert.equal(timingHealth({sentences:[{start:0,end:1,match:0.84,ok:false,words:[{text:'第',start:0,end:1}]}]}).sentenceTimingReady, false);
});

test('native timing without ASR scores does not misclassify later preflight failures', () => {
  const {root, project} = fixture();
  writeNativeTiming(project);
  const report = buildTalkcraftFailureReport(root, runId, {name:'talkcraft-preflight', exitCode:1,
    logs:['[素材] FAIL: 缺少素材']});
  assert.equal(report.code, 'TALKCRAFT_PREFLIGHT_FAILED');
  assert.equal(report.evidence.belowThreshold, 0);
  const precision = buildTalkcraftFailureReport(root, runId, {name:'talkcraft-scaffold', exitCode:1,
    logs:['WORD_TIMING_REQUIRED']});
  assert.equal(precision.code, 'WORD_TIMING_REQUIRED');
  assert.doesNotMatch(precision.title + precision.cause, /字级|句级/);
});

test('Edge word timestamps retain provider spans rather than distributing by character weight', () => {
  const {project} = fixture([
    {type:'WordBoundary',text:'第一句',offset:1_000_000,duration:7_000_000},
    {type:'WordBoundary',text:'第二句',offset:11_000_000,duration:7_000_000},
  ]);
  const timing = writeNativeTiming(project);
  assert.equal(timingHealth(timing).wordTimingReady, true);
  assert.equal(timing.sentences[1].start, 1.1);
  requireWordTiming(project);
});
