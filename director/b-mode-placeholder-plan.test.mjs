import test from 'node:test';
import assert from 'node:assert/strict';
import {countPersonUnits, mapPlaceholderScenes} from './b-mode-placeholder-plan.mjs';
import {loadAcceptanceFixture} from './b-mode-acceptance.mjs';

test('maps a long UI sentence over multiple TTS clauses without losing frames', () => {
  const text = '开场先说明问题，接着给出答案。然后展示素材。';
  const scenes = [
    {text: '开场先说明问题，接着给出答案。', subject: 'person'},
    {text: '然后展示素材。', subject: 'material'},
  ];
  const timing = {totalFrames: 120, segments: [
    {text: '开场先说明问题，', fromFrame: 0, durationInFrames: 34},
    {text: '接着给出答案。', fromFrame: 34, durationInFrames: 46},
    {text: '然后展示素材。', fromFrame: 80, durationInFrames: 40},
  ]};
  assert.deepEqual(mapPlaceholderScenes(text, scenes, timing).map(({fromFrame, durationInFrames}) => [fromFrame, durationInFrames]), [[0, 80], [80, 40]]);
});

test('rejects stale text and incomplete timing', () => {
  const timing = {totalFrames: 40, segments: [{text: '新的文案。', fromFrame: 0, durationInFrames: 40}]};
  assert.throws(() => mapPlaceholderScenes('新的文案。', [{text: '旧文案。', subject: 'person'}], timing), /分镜原文/);
  assert.throws(() => mapPlaceholderScenes('新的文案。', [{text: '新的文案。', subject: 'pending'}], timing), /镜头主体/);
  assert.throws(() => mapPlaceholderScenes('新的文案。', [{text: '新的文案。', subject: 'person'}], {...timing, totalFrames: 41}), /总帧数/);
});

test('counts contiguous person scenes as one generation unit', () => {
  assert.equal(countPersonUnits([{subject:'person'}, {subject:'person'}, {subject:'graphics'}, {subject:'person'}]), 2);
});

test('preserves per-scene library video selections through TTS alignment', () => {
  const scenes = mapPlaceholderScenes('开场。素材。', [
    {text:'开场。', subject:'person', videoPath:'person.mp4'},
    {text:'素材。', subject:'material', videoPath:'material.mp4'},
  ], {totalFrames:60, segments:[
    {text:'开场。', fromFrame:0, durationInFrames:30},
    {text:'素材。', fromFrame:30, durationInFrames:30},
  ]});
  assert.deepEqual(scenes.map(scene => scene.videoPath), ['person.mp4','material.mp4']);
});

test('rejects adjacent duplicate library videos', () => {
  assert.throws(() => mapPlaceholderScenes('开场。继续。', [
    {text:'开场。', subject:'person', videoPath:'same.mp4'},
    {text:'继续。', subject:'material', videoPath:'same.mp4'},
  ], {totalFrames:60, segments:[
    {text:'开场。', fromFrame:0, durationInFrames:30},
    {text:'继续。', fromFrame:30, durationInFrames:30},
  ]}), /不能与上一镜头使用同一视频素材/);
});

test('acceptance fixture preserves the complete 19-scene script', () => {
  const fixture = loadAcceptanceFixture();
  assert.equal(fixture.scenes.length, 19);
  assert.equal(fixture.script.length, 520);
  assert.equal(fixture.scenes.map(scene => scene.text).join('').replace(/\s+/gu,''), fixture.script.replace(/\s+/gu,''));
  assert.ok(fixture.scenes.some(scene => scene.subject === 'person'));
  assert.ok(fixture.scenes.some(scene => scene.subject === 'graphics'));
  assert.ok(fixture.scenes.some(scene => scene.subject === 'material'));
  assert.equal(fixture.scenes[3].visualText, '真相是，\n那条视频大概率不会打开第二次');
  assert.equal(fixture.scenes[1].subtitle, '被误认的进步');
});
