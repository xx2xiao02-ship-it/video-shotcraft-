import assert from 'node:assert/strict';
import test from 'node:test';
import {applyVideoPlayback, assertNoAdjacentVideoReuse, fitVideoPlayback} from './video-material-policy.mjs';

test('长视频保持原速，短视频减速覆盖整镜并留一帧尾部余量', () => {
  assert.equal(fitVideoPlayback(10,120).playbackRate,1);
  const p = fitVideoPlayback(2,120);
  assert.equal(p.playbackRate,59/120);
  assert.ok(119 * p.playbackRate < 60);
  assert.equal(fitVideoPlayback(2,120,60).playbackRate,119/120);
  for (const duration of [0,NaN,undefined,-1]) assert.throws(()=>fitVideoPlayback(duration,120),/无效/);
  assert.throws(()=>fitVideoPlayback(0.01,120),/不足两帧/);
});

test('相邻背景、元素及跨角色重复都拒绝，间隔使用和同镜复用允许', () => {
  for (const shots of [
    [{material:'a.mp4'}, {material:'a.mp4'}],
    [{media:'a.mp4'}, {media:'a.mp4'}],
    [{material:'Folder/A.mp4'}, {media:'folder\\a.mp4'}],
    [{media:'a.mp4'}, {material:'a.mp4'}],
  ]) assert.throws(()=>assertNoAdjacentVideoReuse(shots),/连续使用/);
  assert.doesNotThrow(()=>assertNoAdjacentVideoReuse([{material:'a.mp4',media:'a.mp4'},{material:'b.mp4'},{material:'a.mp4'}]));
  assert.doesNotThrow(()=>assertNoAdjacentVideoReuse([{material:'a.mp4'},{},{media:'a.mp4'}]));
});

test('背景与元素分别冻结速度，不修改字幕、配音或模板时长，也不修改输入', () => {
  const shots = [{material:'a.mp4',media:'b.mp4',durationInFrames:120,text:'文案',templateParams:{count:3}}];
  const before = JSON.stringify(shots);
  const result = applyVideoPlayback(shots,[{path:'a.mp4',duration_sec:2},{path:'b.mp4',duration_sec:8}]);
  assert.equal(result[0].materialPlayback.playbackRate,59/120);
  assert.equal(result[0].mediaPlayback.playbackRate,1);
  assert.equal(result[0].durationInFrames,120);
  assert.equal(JSON.stringify(shots),before);
  assert.throws(()=>applyVideoPlayback(shots,[]),/未核实/);
});
