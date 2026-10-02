import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {validateEditorial,bindEditorialTiming,checkEditorial} from './talkcraft-ark-editorial.mjs';

const semantics = {sentences:[{i:0,text:'第一句。'},{i:1,text:'第二句。'}]};
const aligned = [{start:0,end:2},{start:2,end:5}];
const vocab = new Set(['强调']);
const valid = () => ({sentences:semantics.sentences.map((s,i) => ({...s,sem:['强调'],need:['强调'],entities:[],weight:i ? 'sub' : 'main'})),
  shots:[{id:'s01',firstSentence:0,lastSentence:1,intent:'同一观点',visual:'主体延续，第二句强调关键点',start:999,end:1000}]});

function savedEditorial(t) {
  const root=mkdtempSync(path.resolve('tmp/auto-preflight-test-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const runId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  for (const dir of ['qa','audio','remotion']) mkdirSync(path.join(project,dir),{recursive:true});
  for (const [name,data] of Object.entries({'source-run.json':{runId},'semantics.json':semantics,
    'qa/ark-editorial-response.json':valid(),'audio/timestamps.json':{sentences:semantics.sentences.map((s,i) => ({...s,start:i*2}))},
    'remotion/shots.json':validateEditorial(valid(),semantics,aligned,vocab)}))
    writeFileSync(path.join(project,name),JSON.stringify(data));
  return {root,runId};
}
test('editorial automatically runs preflight after semantic validation', t => {
  const {root,runId}=savedEditorial(t); const calls=[];
  const result=checkEditorial(root,runId,{stage:(stage,id) => {assert.equal(id,runId);calls.push(stage);}});
  assert.deepEqual(calls,['semantic-check','preflight']);
  assert.equal(result.status,'editorial_preflight_passed');
});
test('failed automatic preflight propagates and never reports editorial success', t => {
  const {root,runId}=savedEditorial(t); const calls=[];
  assert.throws(() => checkEditorial(root,runId,{stage:stage => {
    calls.push(stage); if(stage === 'preflight') throw new Error('missing materials');
  }}),/missing materials/);
  assert.deepEqual(calls,['semantic-check','preflight']);
});
test('semantic failure stops before automatic preflight', t => {
  const {root,runId}=savedEditorial(t); const calls=[];
  assert.throws(() => checkEditorial(root,runId,{stage:stage => {calls.push(stage);throw new Error('invalid semantics');}}),/invalid semantics/);
  assert.deepEqual(calls,['semantic-check']);
});
test('semantic timing keeps original precision at shot boundaries', () => {
  const actual=bindEditorialTiming({sentences:[{i:0,text:'第一句。',t:16.641}]},
    {sentences:[{text:'第一句。',start:16.6413046}]},[{id:'s02',firstSentence:0,lastSentence:0}]);
  assert.equal(actual.sentences[0].t,16.6413046);
  assert.equal(actual.sentences[0].shot,'s02');
});
test('Ark editorial derives seconds from saved timing, never model invented seconds', () => {
  const shots = validateEditorial(valid(),semantics,aligned,vocab);
  assert.equal(shots[0].start,0); assert.equal(shots[0].end,5);
});
test('Ark editorial rejects changed text, missing sentences and unknown semantics', () => {
  for (const mutate of [v => {v.sentences[0].text='改稿';},v => v.sentences.pop(),v => {v.sentences[0].sem=['不存在'];}]) {
    const v=valid(); mutate(v); assert.throws(() => validateEditorial(v,semantics,aligned,vocab));
  }
});
test('Ark editorial rejects missing coverage, overlap and invalid timeline', () => {
  for (const mutate of [v => {v.shots[0].lastSentence=0;},v => {v.shots[0].firstSentence=1;},v => v.shots.push({...v.shots[0],id:'s02'})]) {
    const v=valid(); mutate(v); assert.throws(() => validateEditorial(v,semantics,aligned,vocab));
  }
  assert.throws(() => validateEditorial(valid(),semantics,[{start:0,end:2},{start:2,end:NaN}],vocab));
});
