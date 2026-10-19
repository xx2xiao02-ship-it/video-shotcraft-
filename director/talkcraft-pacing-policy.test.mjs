import test from 'node:test';import assert from 'node:assert/strict';
import {OPENING_MAX_SHOT_SEC,OPENING_MAX_TEMPLATE_SEC,OPENING_TARGET_SHOT_SEC,isOpeningTemplateEligible} from './talkcraft-template-governance.mjs';
import {NATIVE_MAX_HOLD_FRAMES,assertNativeHoldBudget,assertNativeMediaClock} from './talkcraft-native-time-map.mjs';
import {captionOutlineStyle} from './talkcraft-caption-style.mjs';
const timeline=n=>[{kind:'motion',fromFrame:0,toFrame:89,nativeFromFrame:0,nativeToFrame:89},{kind:'hold',fromFrame:90,toFrame:89+n,nativeFromFrame:89,nativeToFrame:89,reason:'正文阅读'},{kind:'motion',fromFrame:90+n,toFrame:179+n,nativeFromFrame:90,nativeToFrame:179}];
test('开场保持原有限制，后续驻留放宽不影响开场',()=>{
 assert.equal(OPENING_MAX_SHOT_SEC,3.4);assert.equal(OPENING_TARGET_SHOT_SEC,2.4);assert.equal(OPENING_MAX_TEMPLATE_SEC,3);
 const catalog={cards:[{cardId:'exact',duration:{originalFrames:90,fps:30}},{cardId:'over',duration:{originalFrames:91,fps:30}},{cardId:'unknown',duration:{}}]};
 assert.equal(isOpeningTemplateEligible('exact',catalog),true);assert.equal(isOpeningTemplateEligible('over',catalog),false);assert.equal(isOpeningTemplateEligible('unknown',catalog),false);
});
test('驻留3秒边界可用，累计、半镜及内嵌音视频限制保留',()=>{
 assert.equal(NATIVE_MAX_HOLD_FRAMES,90);assert.equal(assertNativeHoldBudget(timeline(90)).holdFrames,90);
 assert.throws(()=>assertNativeHoldBudget(timeline(91)),/3秒/);assert.throws(()=>assertNativeHoldBudget(timeline(90),150),/50%/);
 assert.throws(()=>assertNativeHoldBudget([...timeline(50),{kind:'hold',fromFrame:230,toFrame:279,nativeFromFrame:179,nativeToFrame:179}]),/累计/);
 assert.throws(()=>assertNativeMediaClock(timeline(90),{hostSrc:'video'}),/口型/);
});
test('字幕移除描边，明暗软阴影随画布缩放，保留填充字形',()=>{
 const dark=captionOutlineStyle(2,'#1a1a1a'),light=captionOutlineStyle(1,'#ffffff');
 assert.equal(dark.WebkitTextStroke,undefined);assert.equal(dark.paintOrder,undefined);assert.match(dark.textShadow,/3px 6px rgba\(255,255,255/);assert.match(light.textShadow,/rgba\(0,0,0/);
});
