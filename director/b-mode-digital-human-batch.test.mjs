import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';
import {buildDigitalHumanComposition} from './b-mode-digital-human-composition.mjs';
import {planCombinedDigitalHumanAudio, createCombinedDigitalHumanAudio,
  splitCombinedDigitalHumanVideo} from './b-mode-digital-human-batch.mjs';

const scenes = [
  {text:'人物一。', subject:'person'}, {text:'图解。', subject:'graphics'},
  {text:'人物二。', subject:'person'}, {text:'人物三。', subject:'person'},
];
const timing = {totalFrames:120, segments:scenes.map((scene, index) =>
  ({text:scene.text, fromFrame:index * 30, durationInFrames:30}))};

test('combined mode packs only person units while preserving source and output frame offsets', () => {
  const plan = planDigitalHumanUnits(scenes.map(scene => scene.text).join(''), scenes, timing);
  const segments = planCombinedDigitalHumanAudio(plan.units);
  assert.deepEqual(segments.map(item => [item.sourceFromFrame, item.fromFrame, item.durationInFrames]),
    [[0, 0, 30], [60, 30, 60]]);
  assert.deepEqual(segments.map(item => item.sceneIndexes), [[0], [2, 3]]);
  const units = plan.units.map((unit, index) => ({...unit, status:'SUCCESS', avatarIndex:1,
    durationSeconds:unit.durationInFrames / 30}));
  const composition = buildDigitalHumanComposition({runId:'11111111-1111-4111-8111-111111111111',
    timing, plan, units, avatarFiles:['a.png','b.png']});
  assert.equal(composition.props.scenes[1].digitalHumanVideo, undefined);
  assert.equal(composition.props.scenes[2].digitalHumanStartFrame, 0);
  assert.equal(composition.props.scenes[3].digitalHumanStartFrame, 30);
  assert.deepEqual(composition.manifest.units.map(unit => unit.avatarIndex), [1, 1]);
  assert.throws(() => planCombinedDigitalHumanAudio([{fromFrame:10, durationInFrames:30},
    {fromFrame:20, durationInFrames:30}]), /时间范围无效/);
});

test('combined WAV and split video keep exact 30 fps boundaries without the graphics interval', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shotcraft-dh-batch-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const sourceAudio = path.join(dir, 'source.wav');
  const combinedAudio = path.join(dir, 'combined.wav');
  const sourceVideo = path.join(dir, 'source.mp4');
  const outputFiles = [path.join(dir, 'person-1.mp4'), path.join(dir, 'person-2.mp4')];
  const segments = planCombinedDigitalHumanAudio(planDigitalHumanUnits(
    scenes.map(scene => scene.text).join(''), scenes, timing).units);
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'sine=frequency=440:sample_rate=48000:duration=4','-ac','2','-c:a','pcm_s16le',sourceAudio]);
  createCombinedDigitalHumanAudio(sourceAudio, combinedAudio, segments);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','a:0',
    '-show_entries','stream=duration_ts','-of','json',combinedAudio], {encoding:'utf8'}));
  assert.equal(Number(probe.streams?.[0]?.duration_ts), 144000);
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'color=c=green:s=160x90:r=30:d=3','-c:v','libx264','-pix_fmt','yuv420p',sourceVideo]);
  const result = splitCombinedDigitalHumanVideo(sourceVideo, outputFiles, segments);
  assert.deepEqual(result.map(item => item.frames), [30, 60]);
  assert.deepEqual(result.map(item => item.durationSeconds), [1, 2]);
  assert.throws(() => splitCombinedDigitalHumanVideo(sourceVideo, outputFiles, segments), /已存在/);
});
