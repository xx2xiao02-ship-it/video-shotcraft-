// 底片+受影响拍替换：分缝时间线纯函数测试（源自成功案例 17c3017d 的导出脚本固化）。
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planPatchTimeline} from './render-revised-film.mjs';

const beat = (id, startFrame, endFrame) => ({id, startFrame, endFrame});

test('middle beat replacement splits into two gaps around the patch', () => {
  const {filters, sequence} = planPatchTimeline([beat('v010', 100, 200)], 500);
  assert.equal(sequence.filter(label => label.startsWith('[gap')).length, 2);
  assert.ok(filters.some(line => line.includes('trim=start_frame=0:end_frame=100')));
  assert.ok(filters.some(line => line.includes('trim=start_frame=200:end_frame=500')));
  assert.ok(filters.at(-1).includes('concat=n=3'));
});

test('contiguous beats merge without gaps between them', () => {
  const merged = planPatchTimeline([beat('a', 0, 100), beat('b', 100, 200)], 200);
  assert.equal(merged.sequence.filter(label => label.startsWith('[gap')).length, 0);
  assert.ok(merged.sequence.every(label => label.startsWith('[patch')));
  // 覆盖不足全长时，尾部缺口来自底片而非补丁间隙
  const trailing = planPatchTimeline([beat('a', 0, 100), beat('b', 100, 200)], 300);
  assert.equal(trailing.sequence.filter(label => label.startsWith('[gap')).length, 1);
  assert.ok(trailing.filters.some(line => line.includes('trim=start_frame=200:end_frame=300')));
});

test('patch reaching film end leaves no trailing gap', () => {
  const {sequence} = planPatchTimeline([beat('tail', 480, 500)], 500);
  assert.equal(sequence.filter(label => label.startsWith('[gap')).length, 1); // 仅头部缺口
});

test('beats are sorted by startFrame before planning', () => {
  const {filters} = planPatchTimeline([beat('late', 300, 400), beat('early', 100, 200)], 500);
  const early = filters.findIndex(line => line.includes('start_frame=0:end_frame=100'));
  const late = filters.findIndex(line => line.includes('start_frame=200:end_frame=300'));
  assert.ok(early >= 0 && late > early, '早拍应先出现在时间线中');
});
