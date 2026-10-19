import test from 'node:test';
import assert from 'node:assert/strict';
import {textEffectContract,checkTextEffectDependencies,TEXT_EFFECT_RULES} from './talkcraft-text-effect-dependencies.mjs';
const shot=(card,props={})=>({id:'s01',shotCard:card,templateParams:{cardProps:props}});
test('真实资料卡使用源码展示窗口，传图文档不产生mock标题；晚锚点仍阻断',()=>{
 const doc=textEffectContract('doc-park-left-pill-deal',{docSrc:'pages/research/detail.png',pills:'收入\n消费',notes:'研究\n综述'},222);
 assert.equal(doc.texts.some(t=>t.field==='docTitle'),false);
 assert.equal(doc.texts.find(t=>t.field==='pills').begin,58);
 const bad=check(shot('rack-focus-pair',{srcFront:'pages/a.png',srcBack:'pages/b.png'}),[{field:'labelFront',text:'政策',localFrame:211}],216);
 assert.ok(bad.issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'));
 const gallery=textEffectContract('gallery-wall-dolly',{},258);
 assert.equal(gallery.texts.length,3);assert.equal(gallery.texts[0].end,230);
});
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
 const r=check(shot('quote-hold-arrow'),[{field:'lastLine',localFrame:140}],128,55,126);
 assert.equal(r.passed,false);assert.equal(r.issues[0].effectId,'quote-highlight');
});
test('原模板载字块允许固有2帧错峰，但禁止长时间空块',()=>{
 assert.equal(check(shot('alt-block-lines'),[{field:'line1',localFrame:15}],91).passed,true);
 assert.equal(check(shot('alt-block-lines'),[{field:'line2',localFrame:46}],91).passed,false);
});
test('逐条词槽窗口：普通字级锚点合法也不能在已滚出后显示',()=>{
 const s=shot('word-slot-cycle',{words:'甲\n乙\n丙\n丁'}),before=[{field:'words',localFrame:110},{field:'words',localFrame:130},{field:'words',localFrame:170},{field:'words',localFrame:200}];
 const saved=structuredClone(before),r=check(s,before,206,55,150);
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
import {createHash} from 'node:crypto';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {skinTalkcraftSharedFont} from './talkcraft-card-runtime.mjs';
import {recordTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';

test('扇形资料、五选一和气泡使用逐项源码窗口，晚锚点及提前强调仍拒绝',()=>{
 const stack=textEffectContract('stack-fan-out',{},204);
 assert.equal(stack.media.length,5);assert.equal(stack.texts[0].begin,7);assert.equal(stack.texts[0].end,191);
 assert.ok(check(shot('stack-fan-out',{title:'政策资料'}),[{field:'title',text:'政策资料',localFrame:195}],204).issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'));
 const chip=shot('chip-grid-single-select',{options:'储蓄\n消费',selected:1,equation:'未来 收入'});
 assert.ok(check(chip,[{field:'options',text:'储蓄',localFrame:80},{field:'options',text:'消费',localFrame:125},{field:'equation',text:'未来收入',localFrame:0}],216).issues.some(i=>i.code==='TEXT_EFFECT_DEPENDENCY_EARLY'));
 assert.ok(check(chip,[{field:'options',text:'储蓄',localFrame:0},{field:'options',text:'消费',localFrame:125}],216).issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'));
 const bubble=shot('danmu-bubble-praise',{bubbles:'个人小事|180,160|灰中\n经济大潮|300,320|强调'});
 assert.equal(check(bubble,[{field:'bubbles',text:'个人小事',localFrame:0},{field:'bubbles',text:'经济大潮',localFrame:0}],131).passed,true);
 assert.ok(check(bubble,[{field:'bubbles',text:'个人小事',localFrame:100}],131).issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'));
});

test('新增时序合同绑定原模板、参数封装与共享源码哈希',()=>{
 const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u,'$1'));
 const skill=resolveTalkcraftSkillRoot(root),manifest=JSON.parse(fs.readFileSync(new URL('./talkcraft-text-effect-sources.json',import.meta.url)));
 for(const card of ['stack-fan-out','chip-grid-single-select','danmu-bubble-praise']){
  assert.ok(textEffectContract(card,{},216));
  for(const [relative,expected] of Object.entries(manifest[card])){
   const canonical=relative.startsWith('parameterized-cards/')?path.join(skill,'workbench/src/cards',relative.slice('parameterized-cards/'.length)):path.join(skill,'template',relative);
   let source=fs.readFileSync(canonical,'utf8');if(relative.startsWith('parameterized-cards/gen/'))source=source.replace(/(["'])@tpl\//gu,'$1../../cards/');
   if(relative==='parameterized-cards/shared.tsx')source=skinTalkcraftSharedFont(source);
   assert.equal(createHash('sha256').update(source).digest('hex'),expected,card+'/'+relative);
  }
 }
});
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

test('拆镜所用扫描框按原版行DSL解析，文字窗口随真实框坐标变化',()=>{
 const c=textEffectContract('scanline-annotate',{targets:'0,20,490,210\n0,237,490,129'},180);
 assert.equal(c.texts.length,2);assert.ok(c.texts[1].begin>c.texts[0].begin);
 const r=check(shot('scanline-annotate',{targets:'0,20,490,210',labels:'政策|官方讲话'}),[{field:'labels',text:'政策官方讲话',localFrame:177}],180);
 assert.ok(r.issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'));
});
test('裂升短标题首秒容量不足须重选或缩减公开文案，不能提前真实锚点',()=>{
 const bad=check({...shot('split-text-stagger',{text:'一次性补贴',sub:'风险'}),subject:'other'},[{field:'text',localFrame:0,text:'一次性补贴'}],156);
 assert.ok(bad.issues.some(i=>i.code==='NATIVE_CONTENT_ONSET_GAP'));
 const good=check({...shot('split-text-stagger',{text:'补贴',sub:'风险'}),subject:'other'},[{field:'text',localFrame:0,text:'补贴'},{field:'sub',localFrame:0,text:'风险'}],156);
 assert.equal(good.passed,true);
});


test('新增图形卡保留源码文字入退场和装饰依赖，不以登记代替通过',()=>{
 const a=textEffectContract('converging-arrows',{startDelay:1},89);
 assert.equal(a.effects[0].begin,31);assert.ok(a.effects.every(e=>e.field==='focusText'));
 const host=textEffectContract('host-shrink-to-chip',{lead:.8,yearLabels:'甲 乙'},114);
 assert.equal(host.texts[0].begin,29);assert.equal(host.texts.filter(w=>w.field==='yearLabels').length,2);
 const source=textEffectContract('source-converge',{sources:'甲\n乙'},198);
 assert.equal(source.texts.find(w=>w.field==='sources').end,89);assert.equal(source.texts.find(w=>w.field==='caption').begin,106);
 const ui=textEffectContract('cursor-actor-demo',{rows:'甲|乙|on\n丙|丁',startDelay:.45},135);
 assert.equal(ui.effects.length,2);assert.equal(ui.effects[0].begin,27);assert.equal(ui.texts.filter(w=>w.field==='rows').length,4);
 const map=textEffectContract('map-route-pin',{pinsDsl:'200|400|甲\n760|300|乙|480|350',routeGrow:1.1},155);
 assert.deepEqual(map.texts.map(w=>w.begin),[13,67]);assert.equal(map.effects[0].leadFrames,8);
 const tilt=textEffectContract('tilt-3d-page',{featsDsl:'甲\n乙'},162);assert.equal(tilt.texts.filter(w=>w.field==='featsDsl').length,2);assert.equal(tilt.effects.length,0);
 const title=textEffectContract('behind-text-title',{lead:.4},132);assert.deepEqual(title.texts.map(w=>w.begin),[13,23]);
 assert.ok(check(shot('source-converge',{sources:'甲'}),[{field:'sources',text:'甲',localFrame:95}],198).issues.some(i=>i.code==='NATIVE_TEXT_WINDOW_MISMATCH'));
 assert.ok(check(shot('converging-arrows',{focusText:'重点'}),[{field:'focusText',text:'重点',localFrame:70}],89).issues.some(i=>i.code==='TEXT_EFFECT_DEPENDENCY_EARLY'));
});


test('光标行高亮包括源码0.2秒淡出，不能截在淡出起点即称完整',()=>{
 const c=textEffectContract('cursor-actor-demo',{rows:'甲|乙|on',startDelay:.45},135);
 assert.equal(c.effects[0].end,Math.ceil((.45+.52+.22+.18+.1+.2)*30));
 const r=check(shot('cursor-actor-demo',{rows:'甲|乙|on',startDelay:4}),[{field:'rows',localFrame:0},{field:'rows',localFrame:0}],155);
 assert.ok(r.issues.some(i=>i.code==='TEXT_EFFECT_INCOMPLETE'));
});
