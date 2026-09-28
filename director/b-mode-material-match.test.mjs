import test from 'node:test';
import assert from 'node:assert/strict';
import {matchSceneVideos} from './b-mode-material-match.mjs';

test('matches videos without repeating an adjacent source', () => {
  const index = [
    {path:'a.mp4', duration_sec:5, tags:['办公场景','会议场景']},
    {path:'b.mp4', duration_sec:5, tags:['办公场景','会议场景']},
    {path:'c.mp4', duration_sec:5, tags:['科技界面']},
    {path:'d.mp4', duration_sec:5, tags:['办公场景']},
  ];
  const result = matchSceneVideos([
    {text:'职场沟通'}, {text:'工作方法'}, {text:'手机屏幕'}, {text:'为什么？'},
  ], index);
  assert.equal(result[0].path, 'a.mp4');
  assert.equal(result[1].path, 'b.mp4');
  assert.equal(result[2].path, 'c.mp4');
  assert.equal(result[3].status, 'fallback');
  assert.notEqual(result[3].path, result[2].path);
});

test('does not invent a match when the whole passage has no supported concept', () => {
  const result = matchSceneVideos([{text:'为什么？'}], [{path:'a.mp4', duration_sec:5, tags:['商务']}])[0];
  assert.equal(result.status, 'fallback');
  assert.match(result.reason, /未重复兜底素材/);
});
