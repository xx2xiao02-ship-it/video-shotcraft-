import test from 'node:test';import assert from 'node:assert/strict';
import {proposeEditorialTimingCorrection,approveEditorialTimingCorrection,executeEditorialTimingCorrection} from './talkcraft-editorial-timing-correction.mjs';
import {checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
test('生成接纳前节点提案、中心审批、执行复检；不改文字、原锚点和前三镜，拒绝篡改',()=>{
 const shot={id:'new-shot',shotCard:'ink-underline',templateParams:{cardProps:{line1Key:'钱',line2Key:'关联'}}};
 const shots=[{id:'a'},{id:'b'},{id:'c'},shot],presentation={shots:[{shotId:shot.id,startFrame:0,endFrame:170,nativeFrames:109,timeline:[
  {kind:'motion',fromFrame:0,toFrame:90,nativeFromFrame:0,nativeToFrame:90},
  {kind:'hold',fromFrame:91,toFrame:151,nativeFromFrame:90,nativeToFrame:90,reason:'完整内容可见'},
  {kind:'motion',fromFrame:152,toFrame:169,nativeFromFrame:91,nativeToFrame:108}]}]};
 const reveals={events:[{id:'x',beatId:shot.id,field:'line1Key',text:'钱',localFrame:25},{id:'y',beatId:shot.id,field:'line2Key',text:'关联',localFrame:90}]};
 const before=structuredClone({shots,presentation,reveals});
 const plan=proposeEditorialTimingCorrection(shots,presentation,reveals),approval=approveEditorialTimingCorrection(plan,shots,presentation,reveals);
 assert.equal(plan.operations.length,1);assert.equal(approval.approved,true);
 const next=executeEditorialTimingCorrection(plan,approval,shots,presentation,reveals);
 assert.equal(checkTextEffectDependencies([shot],next,reveals).passed,true);
 assert.deepEqual({shots,presentation,reveals},before);
 assert.equal(proposeEditorialTimingCorrection(shots,next,reveals).operations.length,0);
 const altered=structuredClone(plan);altered.operations[0].after.timeline[0].toFrame++;
 assert.equal(approveEditorialTimingCorrection(altered,shots,presentation,reveals).approved,false);
 assert.throws(()=>executeEditorialTimingCorrection(altered,approval,shots,presentation,reveals),/审批/);
 assert.equal(proposeEditorialTimingCorrection([shot],presentation,reveals).operations.length,0);
 const changed=structuredClone(reveals);changed.events[0].localFrame++;
 assert.throws(()=>executeEditorialTimingCorrection(plan,approval,shots,presentation,changed),/审批/);
});
