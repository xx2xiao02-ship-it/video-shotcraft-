import test from 'node:test';import assert from 'node:assert/strict';
import {proposeDependencyTimeline} from './talkcraft-dependency-timeline.mjs';
import {nativeFrameAt} from './talkcraft-native-time-map.mjs';
test('多处晚到关键词可独立驻留，原卡全帧与字级输入不变',()=>{
 const shot={id:'s01',shotCard:'ink-underline',templateParams:{cardProps:{line1Key:'甲',line2Key:'乙'}}};
 const row={shotId:'s01',nativeFrames:109,startFrame:0,endFrame:230};
 const reveals={events:[{id:'a',beatId:'s01',field:'line1Key',localFrame:40},{id:'b',beatId:'s01',field:'line2Key',localFrame:120}]};
 const before=JSON.stringify(reveals),r=proposeDependencyTimeline(shot,row,reveals,{holdAt:90,reason:'完整字句可见阶段'});
 assert.equal(JSON.stringify(reveals),before);const mapped=Array.from({length:230},(_,i)=>nativeFrameAt(r.timeline,i));
 assert.deepEqual([...new Set(mapped)],Array.from({length:109},(_,i)=>i));assert.ok(r.timeline.filter(s=>s.kind==='hold').length>=2);
});
test('预算不够不得裁尾、越速或伪造通过',()=>{
 assert.throws(()=>proposeDependencyTimeline({id:'s01',shotCard:'ink-underline',templateParams:{cardProps:{line2Key:'复苏'}}},{shotId:'s01',startFrame:0,endFrame:141,nativeFrames:109},{events:[{id:'a',beatId:'s01',field:'line2Key',localFrame:104}]}),/须重选/);
});
