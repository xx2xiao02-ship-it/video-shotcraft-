import test from 'node:test';import assert from 'node:assert/strict';
import {proposeTimingRows} from './talkcraft-timing-completion.mjs';
import {checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
const fixture=()=>{
 const shot={id:'s05',shotCard:'ink-underline',templateParams:{cardProps:{line1Key:'钱',line2Key:'关联'}}};
 const row={shotId:'s05',startFrame:0,endFrame:170,nativeFrames:109,timeline:[
  {kind:'motion',fromFrame:0,toFrame:90,nativeFromFrame:0,nativeToFrame:90},
  {kind:'hold',fromFrame:91,toFrame:151,nativeFromFrame:90,nativeToFrame:90,reason:'保留已显现内容'},
  {kind:'motion',fromFrame:152,toFrame:169,nativeFromFrame:91,nativeToFrame:108}]};
 return {shots:[{id:'s01'},{id:'s02'},{id:'s03'},shot],presentation:{shots:[row]},reveals:{events:[
  {id:'a',beatId:'s05',field:'line1Key',text:'钱',localFrame:25},
  {id:'b',beatId:'s05',field:'line2Key',text:'关联',localFrame:90}]}};
};
test('节点提出可行驻留方案，原文锚点卡片参数及输入对象均不改写',()=>{
 const f=fixture(),before=structuredClone(f),plan=proposeTimingRows(f.shots,f.presentation,f.reveals);
 assert.equal(plan.operations.length,1);assert.equal(plan.operations[0].shotId,'s05');
 const result=checkTextEffectDependencies([f.shots[3]],{shots:[plan.operations[0].after]},f.reveals);
 assert.equal(result.passed,true,JSON.stringify(result.issues));assert.deepEqual(f,before);
 const again=proposeTimingRows(f.shots,{shots:[plan.operations[0].after]},f.reveals);assert.equal(again.operations.length,0);
});
test('时长无解或前三镜锁定时只记录原因，不能裁尾改速或强行应用',()=>{
 const f=fixture();f.presentation.shots[0].endFrame=110;
 let p=proposeTimingRows(f.shots,f.presentation,f.reveals);assert.equal(p.operations.length,0);assert.match(p.unresolved.find(u=>u.shotId==='s05').reason,/须重选/);
 const opening=fixture();opening.shots=opening.shots.slice(3);
 p=proposeTimingRows(opening.shots,opening.presentation,opening.reveals);assert.equal(p.operations.length,0);assert.match(p.unresolved[0].reason,/前三镜锁定/);
});
