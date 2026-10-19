import test from 'node:test';import assert from 'node:assert/strict';
import {assertNativeHoldBudget,nativeFrameAt,NATIVE_HOLD_RULES} from './talkcraft-native-time-map.mjs';
import {nativeEditorialTimeline,EDITORIAL_NATIVE_RULES,EDITORIAL_MATERIAL_RULES} from './talkcraft-editorial-native-plan.mjs';
import {validateNativeTimeline} from './talkcraft-native-governance.mjs';
import {checkCorePersonDisplays} from './talkcraft-core-person.mjs';
const timeline=n=>[{kind:'motion',fromFrame:0,toFrame:89,nativeFromFrame:0,nativeToFrame:89},{kind:'hold',fromFrame:90,toFrame:89+n,nativeFromFrame:89,nativeToFrame:89,reason:'阅读'},{kind:'motion',fromFrame:90+n,toFrame:179+n,nativeFromFrame:90,nativeToFrame:179}];
test('2秒边界通过，7秒额外冻结在生成、后端和运行时都阻断',()=>{
 assert.equal(assertNativeHoldBudget(timeline(60)).holdFrames,60);
 assert.throws(()=>nativeEditorialTimeline(442,222,155,'内容完整'),/冻结/);
 assert.ok(validateNativeTimeline({timeline:timeline(210)},390,180).some(s=>s.includes('冻结')));
 assert.throws(()=>nativeFrameAt(timeline(210),100),/冻结/);
 assert.ok(EDITORIAL_NATIVE_RULES.includes(NATIVE_HOLD_RULES));
});
test('拆成多个hold仍累计，短镜不能过半冻结',()=>{
 assert.throws(()=>assertNativeHoldBudget([...timeline(40),{kind:'hold',fromFrame:220,toFrame:279,nativeFromFrame:179,nativeToFrame:179}]),/累计/);
 assert.throws(()=>assertNativeHoldBudget(timeline(60),100),/50%/);
});
const person={kind:'identity',query:'Hall',entityType:'person',entityName:'Robert Hall'};
const row=()=>({shotId:'s10',research:[person],personDisplays:[{entityName:'Robert Hall',role:'core',reason:'核心观点人物首次介绍',presentation:'research-source',bindingQuery:'Hall',labelField:'labelFront',labelText:'罗伯特·霍尔'}],bindings:[{kind:'identity',query:'Hall',localPath:'hall.png'}]});
const shots=()=>[{id:'s10',start:40,end:46,templateParams:{cardProps:{srcFront:'remotion/public/hall.png',labelFront:'罗伯特·霍尔'}}}];
test('核心人物本镜真实资料和逐人标签匹配，生成器获得同源规则',()=>{assert.deepEqual(checkCorePersonDisplays([row()],shots()),[]);assert.ok(EDITORIAL_MATERIAL_RULES.includes('personDisplays'));});
test('核心人物不能靠后续来源、文字或数字人充数',()=>{
 const r=row();r.bindings[0].displayShotId='s16';assert.ok(checkCorePersonDisplays([r],shots()).length);
 delete r.bindings[0].displayShotId;const s=shots();delete s[0].templateParams.cardProps.srcFront;assert.ok(checkCorePersonDisplays([r],s).length);
 assert.ok(checkCorePersonDisplays([{...row(),personDisplays:[]}]).length);
});
test('顺带提及仍需明确职责和原因，不强制每次重复肖像',()=>{const r=row();r.personDisplays=[{entityName:person.entityName,role:'mention',reason:'已正式介绍后的顺带引用'}];assert.deepEqual(checkCorePersonDisplays([r],shots()),[]);});
