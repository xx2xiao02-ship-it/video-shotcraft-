import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOpeningPilot} from './opening-short-policy.mjs';

const shots = [
  {shotCard:null,durationInFrames:30,displayLines:['这两年']},
  {shotCard:'typography/marker-underline-title',durationInFrames:60,displayLines:['现金','更有用']},
  {shotCard:'typography/paper-title-card',durationInFrames:60,displayLines:['留住现金','留住选择']},
];
const policies={
  'video-only':{completionFrame:0,holdFrames:30,exitFrames:0,maxLines:1,maxChars:6},
  'typography/marker-underline-title':{completionFrame:42,holdFrames:18,exitFrames:0,maxLines:2,maxChars:6},
  'typography/paper-title-card':{completionFrame:34,holdFrames:18,exitFrames:8,maxLines:2,maxChars:6},
};
const validate=items=>validateOpeningPilot(items,30,policies);
test('1+2+2秒开场完整覆盖5秒，模板展开、停留和淡出均有预算',()=>{
  assert.equal(validate(shots),shots);
});
test('拒绝超2秒、未知长模板、停留不足及文案过长',()=>{
  assert.throws(()=>validate([{...shots[0],durationInFrames:61},...shots.slice(1)]),/超过2秒/);
  assert.throws(()=>validate([shots[0],{...shots[1],shotCard:'typography/outline-word-fill'},shots[2]]),/不得截断/);
  assert.throws(()=>validate([shots[0],{...shots[1],durationInFrames:30},shots[2]]),/足够时间/);
  assert.throws(()=>validate([{...shots[0],displayLines:['这是一句过长的开场文案']},...shots.slice(1)]),/文案太长/);
  assert.throws(()=>validate(shots.slice(1)),/精确覆盖/);
});
