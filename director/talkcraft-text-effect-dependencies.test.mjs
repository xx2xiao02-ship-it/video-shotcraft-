import test from 'node:test';
import assert from 'node:assert/strict';
import {textEffectContract,checkTextEffectDependencies,TEXT_EFFECT_RULES} from './talkcraft-text-effect-dependencies.mjs';
const shot=(card,props={})=>({id:'s01',shotCard:card,templateParams:{cardProps:props}});
const timeline=(n,extra=0,hold=n-2)=>[{kind:'motion',fromFrame:0,toFrame:hold,nativeFromFrame:0,nativeToFrame:hold},...(extra?[{kind:'hold',fromFrame:hold+1,toFrame:hold+extra,nativeFromFrame:hold,nativeToFrame:hold,reason:'保留原字级时间'}]:[]),{kind:'motion',fromFrame:hold+extra+1,toFrame:n+extra-1,nativeFromFrame:hold+1,nativeToFrame:n-1}];
function check(s,events,n=109,extra=0,hold=n-2){return checkTextEffectDependencies([s],{shots:[{shotId:'s01',startFrame:0,endFrame:n+extra,nativeFrames:n,timeline:timeline(n,extra,hold)}]},{events:events.map((e,i)=>({id:'e'+i,beatId:'s01',role:'spoken',...e}))});}
test('下划线不能先于关键词，同帧也不能伪装成先字后线',()=>{
 for(const frame of [28,17]){const r=check(shot('ink-underline'),[{field:'line1Key',text:'物价稳定',localFrame:frame}]);assert.equal(r.passed,false);assert.equal(r.issues[0].code,'TEXT_EFFECT_DEPENDENCY_EARLY');}
 assert.equal(check(shot('ink-underline'),[{field:'line1Key',localFrame:15}]).passed,true);
});
test('合法驻留使第二划线晚于真实锚点；所有原生帧完整保留',()=>{
 const s=shot('ink-underline'),events=[{field:'line1Key',localFrame:5},{field:'line2Key',localFrame:104}];
 assert.equal(check(s,events,109,51,53).passed,true);
});
test('高亮条不能为未来金句空等；包括末行文字入场窗口',()=>{
 const r=check(shot('quote-hold-arrow'),[{field:'lastLine',localFrame:200}],128,115,126);
 assert.equal(r.passed,false);assert.equal(r.issues[0].effectId,'quote-highlight');
});
test('原模板载字块允许固有2帧错峰，但禁止长时间空块',()=>{
 assert.equal(check(shot('alt-block-lines'),[{field:'line1',localFrame:15}],91).passed,true);
 assert.equal(check(shot('alt-block-lines'),[{field:'line2',localFrame:46}],91).passed,false);
});
test('逐条词槽窗口：普通字级锚点合法也不能在已滚出后显示',()=>{
 const s=shot('word-slot-cycle',{words:'甲\n乙\n丙\n丁'}),before=[{field:'words',localFrame:172},{field:'words',localFrame:236},{field:'words',localFrame:368},{field:'words',localFrame:400}];
 const saved=structuredClone(before),r=check(s,before,206,236,150);
 assert.equal(r.issues.filter(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH').length,4);assert.deepEqual(before,saved);
});
test('不能借推迟公开起点把高亮动作挤出原生结尾',()=>{
 const r=check(shot('quote-hold-arrow',{lead:4}),[{field:'lastLine',localFrame:0}],128);
 assert.ok(r.issues.some(i=>i.code==='TEXT_EFFECT_INCOMPLETE'));
});
test('退场窗口真实来自正式单章参数化实现，不误用上游双章demo',()=>{
 const c=textEffectContract('chapter-title-card',{},100);assert.equal(c.effects.length,0);assert.equal(c.texts.find(t=>t.field==='name').begin,24);
 const r=check(shot('chapter-title-card'),[{field:'name',localFrame:117}],100,50,98);assert.equal(r.passed,false);
});
test('每个划线/高亮分别找对应field，而不是只看本镜有字',()=>{
 const r=check(shot('ink-underline'),[{field:'line1Pre',localFrame:0},{field:'line2Key',localFrame:104}]);
 assert.equal(r.issues.length,1);assert.equal(r.issues[0].effectId,'underline-2');
});
test('信息卡只检查实际选中的高亮行，行索引不串位',()=>{
 const s=shot('info-card-assemble',{lines:'甲\n乙\n丙',highlightLines:'3'});
 const r=check(s,[{field:'lines',localFrame:0},{field:'lines',localFrame:0},{field:'lines',localFrame:150}],216);
 assert.ok(r.issues.some(i=>i.effectId==='line-highlight-0'&&i.targetEventId==='e2'));
});
test('未知卡如实标注未审计，不能报告全片时序已覆盖',()=>{
 const r=check(shot('future-card'),[],90);assert.equal(r.checks[0].coverage,'not-audited');
});
test('公开参数与生成器规则使用同一契约，不修改音频或字级时间',()=>{
 assert.equal(textEffectContract('ink-underline',{startDelay:1,gapBetween:2},130).effects[1].begin,106);
 assert.match(TEXT_EFFECT_RULES,/禁止提前真实字级锚点/);assert.match(TEXT_EFFECT_RULES,/重新选卡/);
});

test('新选卡逐字段绑定，载字块保留原生短错峰，不能空等',()=>{
 assert.equal(check(shot('slab-punch-title',{line1:'信心',line2:'折扣'}),[{field:'line1',localFrame:0},{field:'line2',localFrame:80}],91).passed,false);
 assert.equal(check(shot('corner-bracket-frame',{line1:'看财经新闻',line2:'换视角'}),[{field:'line1',localFrame:0},{field:'line2',localFrame:76}],94,28,80).passed,true);
});
test('一个文字字段含多段真实落点时必须逐段检查，不能漏掉后半句',()=>{
 const s=shot('soft-blur-in',{text:'经济好坏并非遥远'});
 const r=check(s,[{field:'text',localFrame:0},{field:'text',localFrame:95}],92);
 assert.equal(r.checks[0].texts.length,2);assert.ok(r.issues.some(i=>i.eventId==='e1'));
});
test('真实原卡入口晚于首秒时，0帧文字事件不能掩盖空等',()=>{
 const r=check({...shot('soft-blur-in',{text:'当前内容',lead:2}),subject:'other'},[{field:'text',text:'当前内容',localFrame:0}],92);
 assert.ok(r.issues.some(i=>i.code==='NATIVE_CONTENT_ONSET_GAP'));
});


import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {recordTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
test('正式源码缺失或变化不能套旧时间表，sourceVerified必须为false',t=>{
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'text-effect-proof-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 fs.mkdirSync(path.join(p,'remotion'),{recursive:true});
 const s=shot('keyword-pop-highlight',{keyword:'当前'}),n={shots:[{shotId:'s01',startFrame:0,endFrame:42,nativeFrames:42,timeline:timeline(42)}]},r={events:[{id:'e',beatId:'s01',field:'keyword',text:'当前',localFrame:0}]};
 for(const [name,data] of [['shots.json',[s]],['native-presentation.json',n],['word-reveal-plan.json',r]])fs.writeFileSync(path.join(p,'remotion',name),JSON.stringify(data));
 let report=recordTextEffectDependencies(p,[s],n,r,{requireSources:true});assert.equal(report.passed,false);assert.equal(report.sourceVerified,false);
 const manifest=JSON.parse(fs.readFileSync(new URL('./talkcraft-text-effect-sources.json',import.meta.url)));
 for(const rel of Object.keys(manifest[s.shotCard])){const file=path.join(p,'remotion/src',rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'changed source');}
 report=recordTextEffectDependencies(p,[s],n,r,{requireSources:true});assert.equal(report.sourceVerified,false);assert.ok(report.issues.some(i=>i.code==='TEXT_EFFECT_SOURCE_CHANGED'));
});
