import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {textEffectContract,checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import {skinTalkcraftSharedFont} from './talkcraft-card-runtime.mjs';
const cards=['pullback-cool-transition','black-slam-transition','particle-weld-transition','push-through-transition','overexpose-flip-transition','strike-and-replace','color-slam-beat-card','still-layout-relay','split-compare-slider','line-carry-transition'];
function check(card,props,events,n=300){return checkTextEffectDependencies([{id:'s01',shotCard:card,subject:'other',templateParams:{cardProps:props}}],{shots:[{shotId:'s01',startFrame:0,endFrame:n,nativeFrames:n,timeline:[{kind:'motion',fromFrame:0,toFrame:n-1,nativeFromFrame:0,nativeToFrame:n-1}]}]},{events:events.map((e,i)=>({id:'e'+i,beatId:'s01',...e}))});}
test('转场A已退场不能等待未来字，B入场和公开lead保持独立',()=>{
 for(const card of cards.slice(0,5)){
  const result=check(card,{textA:'旧观点',textB:'新观点'},[{field:'textA',text:'旧观点',localFrame:200},{field:'textB',text:'新观点',localFrame:0}]);
  assert.ok(result.issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'&&i.eventId==='e0'),card);
  assert.ok(result.checks[0].texts[1].firstReadableFrame>0,card);
  assert.ok(textEffectContract(card,{lead:1.2},300).texts.find(t=>t.field==='textB').begin>textEffectContract(card,{lead:.5},300).texts.find(t=>t.field==='textB').begin);
 }
});
test('对比标签按真实裁切多窗口复现，隐藏期不伪装连续可读',()=>{
 const c=textEffectContract('split-compare-slider',{},296),left=c.texts.find(t=>t.field==='labelBefore');
 assert.equal(left.intervals.length,2);assert.equal(left.begin,0);
 const r=check('split-compare-slider',{srcBefore:'pages/a.png',srcAfter:'pages/b.png'},[{field:'labelBefore',text:'研究原文',localFrame:180},{field:'labelBefore',text:'新增说明',localFrame:290}],296);
 assert.equal(r.checks[0].texts.length,2);assert.ok(r.checks[0].texts[0].firstReadableFrame>210);
 assert.ok(r.issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'&&i.eventId==='e1'));
 assert.equal(r.issues.some(i=>i.code==='NATIVE_CONTENT_ONSET_GAP'),false);
 const empty=check('split-compare-slider',{},[{field:'labelAfter',text:'研究结果',localFrame:0}],296);
 assert.ok(empty.issues.some(i=>i.code==='NATIVE_CONTENT_ONSET_GAP'));
});
test('划除作用于整个from字段，不能只验第一段遗漏后段真实锚点',()=>{
 const r=check('strike-and-replace',{from:'旧观点',to:'新观点'},[{field:'from',text:'旧',localFrame:0},{field:'from',text:'观点',localFrame:12},{field:'to',text:'新观点',localFrame:0}],90);
 assert.ok(r.issues.some(i=>i.code==='TEXT_EFFECT_DEPENDENCY_EARLY'&&i.targetEventId==='e1'));
});
test('线条接力按实际源码初始划线和相机裁切检查，不能照注释虚填延时',()=>{
 const c=textEffectContract('line-carry-transition',{titleA:'旧观点',subA:'说明'},204);
 assert.equal(c.effects[0].begin,0);assert.ok(c.texts[0].end<96);
 const r=check('line-carry-transition',{titleA:'旧观点',titleB:'新观点'},[{field:'titleA',text:'旧观点',localFrame:0},{field:'titleB',text:'新观点',localFrame:0}],204);
 assert.ok(r.issues.some(i=>i.code==='TEXT_EFFECT_DEPENDENCY_EARLY'));
});
test('静态布局图注时序取决于公开layout，tour保留两段而非穿过空窗',()=>{
 const a=textEffectContract('still-layout-relay',{layout:'hero-duo'},254),b=textEffectContract('still-layout-relay',{layout:'triptych'},224),tour=textEffectContract('still-layout-relay',{layout:'tour'},467);
 assert.equal(a.texts[0].begin,40);assert.equal(b.texts[0].begin,25);assert.equal(tour.texts[0].intervals.length,2);
 assert.equal(textEffectContract('still-layout-relay',{layout:'unknown'},300),null);
});
test('两张色卡各自退场，不能把第一张的标题留到第二张',()=>{
 const r=check('color-slam-beat-card',{title1:'第一观点',title2:'第二观点',lead:.9},[{field:'title1',text:'第一观点',localFrame:120},{field:'title2',text:'第二观点',localFrame:120}],215);
 assert.ok(r.issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'&&i.eventId==='e0'));
 assert.ok(!r.issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'&&i.eventId==='e1'));
});
test('十张新增契约对应实际安装转换源码指纹，保留未知模板阻断',()=>{
 const root=new URL('../_audit/video-talkcraft/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('./talkcraft-text-effect-sources.json',import.meta.url)));
 const hash=s=>createHash('sha256').update(s).digest('hex');
 for(const card of cards){
  assert.ok(textEffectContract(card,{},300),card);
  assert.equal(manifest[card]['parameterized-cards/gen/'+card+'.tsx'],hash(fs.readFileSync(new URL('workbench/src/cards/gen/'+card+'.tsx',root),'utf8').replace(/(["'])@tpl\//g,'$1../../cards/')));
  assert.equal(manifest[card]['cards/'+card+'.tsx'],hash(fs.readFileSync(new URL('template/cards/'+card+'.tsx',root))));
  assert.equal(manifest[card]['parameterized-cards/shared.tsx'],hash(skinTalkcraftSharedFont(fs.readFileSync(new URL('workbench/src/cards/shared.tsx',root),'utf8'))));
 }
 assert.equal(textEffectContract('unreviewed-transition',{},300),null);
});
