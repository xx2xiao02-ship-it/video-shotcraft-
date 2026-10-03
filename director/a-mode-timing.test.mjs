import assert from 'node:assert/strict';
import test from 'node:test';
import {alignAModeTiming} from './a-mode-timing.mjs';

test('优先采用真实句子边界，句内拆分仍标记为估算', () => {
  const timing = {fps:30, totalFrames:180, audioLevels:Array(180).fill(0.5), segments:[
    {text:'先说现状，', fromFrame:0, durationInFrames:40},
    {text:'再说结论。', fromFrame:40, durationInFrames:60},
    {text:'最后总结。', fromFrame:100, durationInFrames:80},
  ]};
  const lines = [
    {type:'SentenceBoundary', text:'先说现状，再说结论。', offset:1_000_000},
    {type:'SentenceBoundary', text:'最后总结。', offset:30_000_000},
  ].map(event => JSON.stringify(event)).join('\n');
  const aligned = alignAModeTiming(timing, lines);
  assert.equal(aligned.timingMethod, 'edge_sentence_boundary_clause_estimate');
  assert.equal(aligned.segments[2].fromFrame, 90);
  assert.equal(aligned.segments.at(-1).fromFrame + aligned.segments.at(-1).durationInFrames, 180);
  assert.equal(alignAModeTiming(timing, lines.replace('最后总结', '另一句话')), null);
});
