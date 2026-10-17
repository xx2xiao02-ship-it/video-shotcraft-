import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeEditorialTimeline,EDITORIAL_NATIVE_RULES} from './talkcraft-editorial-native-plan.mjs';
import {nativeFrameAt,nativeMotionRate,outputFrameForNativeFrame,assertNativeMediaClock} from './talkcraft-native-time-map.mjs';
import {validateNativeTimeline} from './talkcraft-native-governance.mjs';
import {checkNativeWordWindows} from './talkcraft-native-word-window.mjs';

test('速度首尾跨度边界精确为0.85与1.15；相邻越限拒绝',()=>{
 for(const [native,total,rate] of [[116,101,1.15],[86,101,.85]]){
  const timeline=nativeEditorialTimeline(total,native,40,'保持主体',rate);
  assert.equal(nativeMotionRate(timeline[0]),rate);
  assert.deepEqual(validateNativeTimeline({timeline},total,native),[]);
  assert.equal(nativeFrameAt(timeline,0),0);assert.equal(nativeFrameAt(timeline,total-1),native-1);
 }
 assert.throws(()=>nativeEditorialTimeline(100,116,40,'保持主体'),/重新选卡/);
 for(const rate of [.8499,1.1501,0,NaN,'1.1',null])assert.throws(()=>nativeEditorialTimeline(101,100,40,'驻留',rate),/速度/);
});

test('每帧映射单调且含原卡两端；音效落在首次采样交叉帧；可随机seek',()=>{
 for(const [total,native,rate] of [[95,103,undefined],[101,86,.85],[170,177,undefined],[240,177,1.1],[240,177,.9]]){
  const timeline=nativeEditorialTimeline(total,native,70,'原主体可见',rate);
  assert.deepEqual(validateNativeTimeline({timeline},total,native),[]);
  const frames=Array.from({length:total},(_,i)=>nativeFrameAt(timeline,i));
  assert.equal(frames[0],0);assert.equal(frames.at(-1),native-1);
  assert.ok(frames.every((f,i)=>!i||f>=frames[i-1]));
  for(let cue=0;cue<native;cue++){
   const output=outputFrameForNativeFrame(timeline,cue);
   assert.equal(output,frames.findIndex(f=>f>=cue));
  }
  for(const i of [total-1,4,0,Math.floor(total/2)])assert.equal(nativeFrameAt(timeline,i),frames[i]);
 }
});

test('不能伪报速度、漏首尾、回跳或用未声明的变速计划',()=>{
 const timeline=nativeEditorialTimeline(95,103);
 for(const segment of [{...timeline[0],playbackRate:1},{...timeline[0],playbackRate:undefined},
  {...timeline[0],nativeFromFrame:1},{...timeline[0],nativeToFrame:101}])
  assert.ok(validateNativeTimeline({timeline:[segment]},95,103).length);
 assert.throws(()=>nativeFrameAt([{...timeline[0],playbackRate:1}],3),/不一致/);
});

test('数字人口型或内嵌视频不得进入变速卡树；独立人物层及图片卡不受影响',()=>{
 const changed=nativeEditorialTimeline(95,103),normal=nativeEditorialTimeline(103,103);
 assert.throws(()=>assertNativeMediaClock(changed,{hostSrc:'video-alpha-unverified'}),/口型/);
 assert.throws(()=>assertNativeMediaClock(changed,{}, {hostSrc:'digital-human/x.webm'}),/口型/);
 assert.throws(()=>assertNativeMediaClock(changed,{}, {srcs:['movie.mp4']}),/口型/);
 assert.doesNotThrow(()=>assertNativeMediaClock(normal,{hostSrc:'video-alpha-unverified'}));
 assert.doesNotThrow(()=>assertNativeMediaClock(changed,{src:'image'},{src:'photo.png'}));
 const held=nativeEditorialTimeline(160,103,50,'正文驻留');
 assert.throws(()=>assertNativeMediaClock(held,{hostSrc:'video-alpha-unverified'}),/驻留/);
 assert.doesNotThrow(()=>assertNativeMediaClock(held,{src:'image'},{src:'photo.png'}));
});

test('变速不能改字级锚点或放行已被模板删掉的文字',()=>{
 const timeline=nativeEditorialTimeline(170,177),events=[{id:'e',beatId:'s01',field:'first',text:'调整利率',role:'spoken',localFrame:105}];
 const before=structuredClone(events);
 const report=checkNativeWordWindows([{id:'s01',shotCard:'error-retype',templateParams:{cardProps:{first:'调整利率'}}}],
  {shots:[{shotId:'s01',startFrame:0,endFrame:170,timeline}]},{events});
 assert.equal(report.passed,false);assert.deepEqual(events,before);
 assert.match(EDITORIAL_NATIVE_RULES,/配音、数字人口型、字级输出锚点/);
});
