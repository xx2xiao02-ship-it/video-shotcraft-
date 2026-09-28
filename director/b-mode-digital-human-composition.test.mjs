import test from 'node:test';
import assert from 'node:assert/strict';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';
import {buildDigitalHumanComposition, silentTailPadFrames} from './b-mode-digital-human-composition.mjs';

test('dispersed person shots stay separate and adjacent shots share one video with offset', () => {
  const scenes = [
    {text:'一。', subject:'person'}, {text:'图。', subject:'graphics'},
    {text:'二。', subject:'person'}, {text:'三。', subject:'person'},
    {text:'料。', subject:'material'}, {text:'四。', subject:'person'},
  ];
  const timing = {totalFrames:180, segments:scenes.map((scene, index) =>
    ({text:scene.text, fromFrame:index * 30, durationInFrames:30}))};
  const plan = planDigitalHumanUnits(scenes.map(scene => scene.text).join(''), scenes, timing);
  const units = plan.units.map((unit, index) => ({...unit, status:'SUCCESS', avatarIndex:index % 2,
    durationSeconds:unit.durationInFrames / 30}));
  const {manifest, props} = buildDigitalHumanComposition({runId:'11111111-1111-4111-8111-111111111111',
    timing, plan, units, avatarFiles:['a.png','b.png']});
  assert.equal(units.length, 3);
  assert.deepEqual(manifest.units.map(unit => unit.sceneIndexes), [[0], [2,3], [5]]);
  assert.equal(props.scenes[2].digitalHumanStartFrame, 0);
  assert.equal(props.scenes[3].digitalHumanStartFrame, 30);
  assert.equal(props.scenes[1].digitalHumanVideo, undefined);
  assert.equal(props.scenes[4].digitalHumanVideo, undefined);
});

test('composition rejects a short generated clip', () => {
  const timing = {totalFrames:30, segments:[{text:'一。', fromFrame:0, durationInFrames:30}]};
  const plan = planDigitalHumanUnits('一。', [{text:'一。', subject:'person'}], timing);
  assert.throws(() => buildDigitalHumanComposition({runId:'11111111-1111-4111-8111-111111111111',
    timing, plan, units:[{...plan.units[0], status:'SUCCESS', durationSeconds:0.5}],
    avatarFiles:['a.png']}), /时长不足/);
});

test('only a short silent audio tail can be padded without another provider task', () => {
  assert.equal(silentTailPadFrames(103, 3.24, -91), 6);
  assert.equal(silentTailPadFrames(103, 3.5, -10), 0);
  assert.throws(() => silentTailPadFrames(103, 3.24, -20), /主配音尾部仍有声音/);
  assert.throws(() => silentTailPadFrames(103, 3.0, -91), /超过 0.3 秒/);
});
