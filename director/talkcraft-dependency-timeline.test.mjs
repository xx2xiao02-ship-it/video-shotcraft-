import test from 'node:test';import assert from 'node:assert/strict';
import {proposeDependencyTimeline} from './talkcraft-dependency-timeline.mjs';
test('晚到关键词导致超额冻结时拒绝提案，真实字级输入不变',()=>{
 const shot={id:'s01',shotCard:'ink-underline',templateParams:{cardProps:{line1Key:'甲',line2Key:'乙'}}};
 const row={shotId:'s01',nativeFrames:109,startFrame:0,endFrame:230};
 const reveals={events:[{id:'a',beatId:'s01',field:'line1Key',localFrame:40},{id:'b',beatId:'s01',field:'line2Key',localFrame:120}]};
 const before=JSON.stringify(reveals);assert.throws(()=>proposeDependencyTimeline(shot,row,reveals,{holdAt:90,reason:'完整字句可见阶段'}),/额外冻结累计超过2秒/);
 assert.equal(JSON.stringify(reveals),before);
});
test('预算不够不得裁尾、越速或伪造通过',()=>{
 assert.throws(()=>proposeDependencyTimeline({id:'s01',shotCard:'ink-underline',templateParams:{cardProps:{line2Key:'复苏'}}},{shotId:'s01',startFrame:0,endFrame:141,nativeFrames:109},{events:[{id:'a',beatId:'s01',field:'line2Key',localFrame:104}]}),/须重选/);
});
