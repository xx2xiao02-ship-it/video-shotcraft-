import test from 'node:test';
import assert from 'node:assert/strict';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';

test('only contiguous person scenes become generation units', () => {
  const plan = planDigitalHumanUnits('人物一。图解。人物二。人物三。', [
    {text:'人物一。', subject:'person'}, {text:'图解。', subject:'graphics'},
    {text:'人物二。', subject:'person'}, {text:'人物三。', subject:'person'},
  ], {totalFrames:120, segments:[
    {text:'人物一。', fromFrame:0, durationInFrames:30},
    {text:'图解。', fromFrame:30, durationInFrames:20},
    {text:'人物二。', fromFrame:50, durationInFrames:30},
    {text:'人物三。', fromFrame:80, durationInFrames:40},
  ]});
  assert.deepEqual(plan.units.map(unit => [unit.fromFrame, unit.durationInFrames]), [[0,30],[50,70]]);
  assert.deepEqual(plan.units[1].sceneIndexes, [2,3]);
});

test('rejects stale storyboard text', () => {
  assert.throws(() => planDigitalHumanUnits('新文案。', [{text:'旧文案。', subject:'person'}], {
    totalFrames:30, segments:[{text:'旧文案。', fromFrame:0, durationInFrames:30}],
  }), /分镜原文/);
});

test('rejects gaps in TTS frame timing even when total durations match', () => {
  assert.throws(() => planDigitalHumanUnits('人物。图解。', [
    {text:'人物。', subject:'person'}, {text:'图解。', subject:'graphics'},
  ], {totalFrames:60, segments:[
    {text:'人物。', fromFrame:0, durationInFrames:30},
    {text:'图解。', fromFrame:31, durationInFrames:30},
  ]}), /时间段闭合/);
});

