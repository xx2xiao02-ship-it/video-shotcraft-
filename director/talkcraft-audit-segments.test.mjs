import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildTalkcraftAuditSegments} from './talkcraft-audit-segments.mjs';

const auditSentences = [
  {index:1, text:'第一句。', start:0, end:1.2, match:.98, ok:true},
  {index:2, text:'第二句。', start:1.3, end:2.8, match:.84, ok:false},
  {index:3, text:'第三句。', start:3, end:4, match:.96, ok:true},
];
const semanticSentences = [
  {i:0, shot:'s01'}, {i:1, shot:'s01'}, {i:2, shot:'s02'},
];
const shots = [{id:'s01',start:0,end:2.8},{id:'s02',start:3,end:4}];

test('groups aligned sentences by approved shot boundaries in shot order', () => {
  const result = buildTalkcraftAuditSegments({auditSentences, semanticSentences, shots, shotbookAvailable:true});
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.segments.map(segment => segment.id), ['s01','s02']);
  assert.equal(result.segments[0].text, '第一句。\n第二句。');
  assert.equal(result.segments[0].start, 0);
  assert.equal(result.segments[0].end, 2.8);
  assert.equal(result.segments[0].minimumMatch, .84);
  assert.equal(result.segments[0].alignmentPassed, false);
});

test('does not fabricate segments before shotbook and sentence assignments exist', () => {
  assert.deepEqual(buildTalkcraftAuditSegments({
    auditSentences, semanticSentences, shots, shotbookAvailable:false,
  }), {state:'pending', segments:[]});
  assert.equal(buildTalkcraftAuditSegments({
    auditSentences, semanticSentences:semanticSentences.map(sentence => ({...sentence, shot:''})),
    shots, shotbookAvailable:true,
  }).state, 'pending');
});

test('rejects stale sentence counts and assignments to unknown shots', () => {
  assert.equal(buildTalkcraftAuditSegments({
    auditSentences, semanticSentences:semanticSentences.slice(1), shots, shotbookAvailable:true,
  }).state, 'invalid');
  assert.equal(buildTalkcraftAuditSegments({
    auditSentences, semanticSentences:semanticSentences.map((sentence, index) =>
      index === 1 ? {...sentence, shot:'s99'} : sentence), shots, shotbookAvailable:true,
  }).state, 'invalid');
});

test('rejects segment assignments that skip or reorder source sentences', () => {
  const reordered = [
    {i:0, shot:'s01'}, {i:2, shot:'s01'}, {i:1, shot:'s02'},
  ];
  assert.equal(buildTalkcraftAuditSegments({
    auditSentences, semanticSentences:reordered, shots, shotbookAvailable:true,
  }).state, 'invalid');
});
