import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadTalkcraftGovernedCatalog,validateTalkcraftDesignProps} from './talkcraft-governed-contract.mjs';
import {buildEditorialPlanningContract,auditEditorialReuse,reusedEditorialWindows,saveEditorialRepairFeedback,currentEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {auditEditorialProposal,compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {normalizeEditorialParams} from './talkcraft-editorial-params.mjs';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {editorialRangeFeasibility} from './talkcraft-editorial-planning-contract.mjs';

const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json')));
const aligned=[{start:0,end:2.36},{start:2.36,end:3.84},{start:3.84,end:4.8},{start:4.8,end:7.07},{start:7.07,end:10.18}];

test('开场可行性表从真实句序求全部范围，不固定四镜，也不自动选卡',()=>{
 const before=structuredClone(aligned),contract=buildEditorialPlanningContract({aligned,catalog});
 assert.equal(contract.reviewedCount,108);assert.deepEqual(aligned,before);
 assert.ok(contract.windows.some(w=>w.firstSentence===1&&w.lastSentence===2));
 assert.ok(!contract.windows.some(w=>w.firstSentence===1&&w.lastSentence===3));
 for(const w of contract.windows){
  assert.ok(w.end-w.start<=3.4);assert.equal(w.frames,Math.round(w.end*30)-Math.round(w.start*30));
  for(const c of w.cards){
   const source=catalog.cards.find(k=>k.cardId===c.slug);
   assert.ok(source.duration.originalFrames/source.duration.fps<=3);
   assert.ok(c.rate.every(r=>r>=.85&&r<=1.15));assert.equal(Object.hasOwn(c,'selected'),false);
  }
 }
 assert.equal(contract.productionAdmitted,false);
});

test('模板可行表严格区分纯动效15%适配与内嵌视频1倍',()=>{
 const custom={cards:[{cardId:'motion',duration:{frames:103,originalFrames:103,fps:30},policy:{media:{}}},
  {cardId:'host',duration:{frames:103,originalFrames:103,fps:30},policy:{media:{hostSrc:'video'}}}]};
 const a=[{start:10,end:10+95/30}];
 const result=buildEditorialPlanningContract({aligned:a,catalog:custom,personWindows:[{start:10,end:a[0].end,firstSentence:0,lastSentence:0}]});
 assert.deepEqual(result.windows[0].cards.map(c=>c.slug),['motion']);
 assert.equal(result.windows[0].cards[0].rate[0],102/94);
});

test('可行性比较包含15%内减速参考，但不改模型明确的一倍速或冻结上限',()=>{
 const catalog={cards:[{cardId:'motion',duration:{frames:103,originalFrames:103,fps:30},policy:{media:{}}},
  {cardId:'video',duration:{frames:103,originalFrames:103,fps:30},policy:{media:{src:'video'}}}]};
 const aligned=[{start:10,end:16.5}];
 const result=editorialRangeFeasibility({firstSentence:0,lastSentence:0,aligned,catalog});
 assert.deepEqual(result.cards.map(c=>c.slug),['motion']);
 assert.equal(result.cards[0].requestedPlaybackRate,.85);
 assert.ok(result.cards[0].rate.every(r=>r>=.85&&r<=1.15));
 assert.throws(()=>nativeEditorialTimeline(195,103,1,'内容驻留',1),/冻结|驻留/);
 assert.deepEqual(editorialRangeFeasibility({firstSentence:0,lastSentence:0,
  aligned:[{start:10,end:20}],catalog}).cards,[]);
});

test('复用口型的缺失、重复、前移都被正式提案校验发现，不是仅靠提示词',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/reuse-window-gate-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'qa'));
 const a=[{start:10,end:12},{start:12,end:15}];
 fs.writeFileSync(path.join(root,'qa/rebuild-inputs.json'),JSON.stringify({personWindows:[{start:12,end:15}]}));
 const windows=reusedEditorialWindows(root,a);
 assert.deepEqual(auditEditorialReuse([{id:'s02',subject:'person',firstSentence:1,lastSentence:1}],a,windows),[]);
 const bad=[{id:'s01',subject:'person',firstSentence:0,lastSentence:0},{id:'s02',subject:'other',firstSentence:1,lastSentence:1}];
 const issues=auditEditorialReuse(bad,a,windows);
 assert.deepEqual(issues.map(i=>i.code),['REUSED_PERSON_RANGE','REUSED_PERSON_WINDOW_COVERAGE']);
 assert.equal(auditEditorialReuse([{subject:'person',firstSentence:1,lastSentence:1},{subject:'person',firstSentence:1,lastSentence:1}],a,windows)[0].code,'REUSED_PERSON_WINDOW_COVERAGE');
 const sentences=a.map((s,i)=>({i,text:`原句${i}`,sem:['强调'],need:['强调'],weight:'main',entities:[]}));
 const shots=bad.map(s=>({...s,shotCard:'per-character-rise',templateParams:{cardProps:{text:'原句'}},nativePresentation:{holdAtNativeFrame:50,holdReason:'正文仍可见'}}));
 const report=auditEditorialProposal({sentences,shots},{aligned:a,semantics:{sentences},vocab:new Set(['强调']),catalog,projectRoot:root});
 assert.ok(report.issues.some(i=>i.code==='REUSED_PERSON_RANGE'));assert.equal(report.passed,false);
 fs.writeFileSync(path.join(root,'qa/rebuild-inputs.json'),JSON.stringify({personWindows:[{start:11,end:15}]}));
 assert.throws(()=>reusedEditorialWindows(root,a),/无法对应/);
});

test('完整模型契约包含可选数字选择字段、范围和一基说明',()=>{
 const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
 const compact=compactTalkcraftEditorialCatalog(index,catalog);
 const selected=compact.contracts.find(c=>c.slug==='chip-grid-single-select').fields.find(f=>f.key==='selected');
 assert.equal(selected.type,'number');assert.equal(selected.min,1);assert.equal(selected.max,6);assert.match(selected.label,/1 起/);
 const allAccent=compact.contracts.flatMap(c=>c.fields).filter(f=>f.key==='accentIndex');
 assert.ok(allAccent.length>0);assert.ok(allAccent.every(f=>f.type==='number'));
 const steps=compact.contracts.find(c=>c.slug==='host-card-glass-board').dslExamples.steps;
 assert.ok(steps.sourceFormatExample.split('\n').every(row=>row.split('|').length===3));
});

test('失败自动形成下次修订输入，原文或时间轴变化后不沿用旧反馈，也不产生付费请求',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/editorial-feedback-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'qa'));
 fs.writeFileSync(path.join(root,'input.txt'),'批准文案');fs.writeFileSync(path.join(root,'aligned-sentences.json'),'[]');
 const proposal={shots:[{id:'s01',shotCard:'原选择'}]},audit={issues:[{code:'template_window_reuse',shotId:'s01',message:'换卡'}]};
 saveEditorialRepairFeedback(root,proposal,audit);
 assert.deepEqual(currentEditorialRepairFeedback(root).failedChecks,audit.issues);
 assert.deepEqual(currentEditorialRepairFeedback(root).proposal,proposal);
 fs.writeFileSync(path.join(root,'aligned-sentences.json'),'[{}]');assert.equal(currentEditorialRepairFeedback(root),null);
});

test('数字字符串只做无损类型转换，越界值仍由源契约拒绝，不改文案或运动参数',()=>{
 const input={shots:[{id:'s01',shotCard:'chip-grid-single-select',templateParams:{cardProps:{selected:'2',question:'原问题',options:'储蓄\n消费',equation:'原结论'}}}]};
 const before=structuredClone(input),normalized=normalizeEditorialParams(input,catalog);
 assert.deepEqual(input,before);assert.equal(normalized.result.shots[0].templateParams.cardProps.selected,2);
 assert.equal(normalized.result.shots[0].templateParams.cardProps.question,'原问题');
 for(const value of ['第2项','', 'Infinity','9007199254740993','1.0000000000000001']){
  const v=structuredClone(input);v.shots[0].templateParams.cardProps.selected=value;
  assert.equal(normalizeEditorialParams(v,catalog).result.shots[0].templateParams.cardProps.selected,value);
 }
 const bad=structuredClone(input);bad.shots[0].templateParams.cardProps.selected='99';
 const props=normalizeEditorialParams(bad,catalog).result.shots;
 assert.equal(props[0].templateParams.cardProps.selected,99);
 const report=validateTalkcraftDesignProps(props,{catalog,projectRoot:process.cwd()});
 assert.equal(report.passed,false);
 assert.ok(report.errors.some(e=>e.code==='SELECTION_RANGE'||/范围|range|max/i.test(e.message||'')));
});
