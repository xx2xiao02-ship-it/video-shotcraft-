import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFrameAtWithBridge} from './talkcraft-native-time-map.mjs';
const timeline=[{kind:'motion',fromFrame:0,toFrame:44,nativeFromFrame:0,nativeToFrame:44},
 {kind:'hold',fromFrame:45,toFrame:74,nativeFromFrame:44,nativeToFrame:44},
 {kind:'motion',fromFrame:75,toFrame:119,nativeFromFrame:45,nativeToFrame:89}];
const bounds={plannedStartFrame:115,plannedEndFrame:235,visualStartFrame:115,visualEndFrame:264,nextStartFrame:264};
test('真实停顿只在下一镜头开始前承接原卡最后一帧，不重播动作',()=>{
 assert.equal(nativeFrameAtWithBridge(timeline,74,bounds),44);
 assert.equal(nativeFrameAtWithBridge(timeline,75,bounds),45);
 assert.equal(nativeFrameAtWithBridge(timeline,119,bounds),89);
 assert.equal(nativeFrameAtWithBridge(timeline,120,bounds),89);
 assert.equal(nativeFrameAtWithBridge(timeline,148,bounds),89);
 assert.throws(()=>nativeFrameAtWithBridge(timeline,149,bounds),/未覆盖/);
});
test('无真实空档、任意延长、时间轴缺帧或起点漂移不能被尾帧驻留掩盖',()=>{
 for(const change of [{nextStartFrame:235},{nextStartFrame:null},{visualEndFrame:265},{visualStartFrame:114},{plannedEndFrame:234}])
  assert.throws(()=>nativeFrameAtWithBridge(timeline,120,{...bounds,...change}),/边界不一致|禁止任意延长/);
 assert.throws(()=>nativeFrameAtWithBridge(timeline,-1,bounds),/未覆盖/);
 assert.throws(()=>nativeFrameAtWithBridge(timeline,120,{...bounds,visualEndFrame:235,nextStartFrame:235}),/未覆盖/);
});
