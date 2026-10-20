import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadTalkcraftGovernedCatalog, talkcraftEditorialContract, validateTalkcraftDesignProps} from './talkcraft-governed-contract.mjs';
import {validateEditorial} from './talkcraft-ark-editorial.mjs';

const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
const catalog=loadTalkcraftGovernedCatalog(index);
const fixture=JSON.parse(fs.readFileSync('docs/audits/b-talkcraft-target3/stage5-b021-r1-20261005/calls.json'));
const projectRoot=path.resolve('docs/audits/b-talkcraft-target3/stage5-b021-r1-20261005/project');
const shot=(cardId)=>({id:'s01',shotCard:cardId,templateParams:{cardProps:structuredClone(fixture.calls.find(c=>c.cardId===cardId).props)}});
const validate=shots=>validateTalkcraftDesignProps(shots,{catalog,projectRoot});

test('完整 B 治理目录与上游索引精确对应，不用六卡白名单',()=>{
  assert.equal(catalog.cards.length,108);
  assert.equal(talkcraftEditorialContract(catalog).cards.length,108);
  assert.equal(validate([shot('impact-open-title')]).passed,true);
  assert.throws(()=>loadTalkcraftGovernedCatalog({cards:index.cards.slice(1)}),/不一致/);
});

test('首词补句允许显式关闭副行；漏传副行及空主词仍被阻断',()=>{
  const s={id:'s01',shotCard:'lead-word-zoom-assemble',templateParams:{cardProps:{words:'央行工作\n调整利率\n只是一半工作',subline:'',accentIndex:2}}};
  assert.equal(validate([s]).passed,true);
  delete s.templateParams.cardProps.subline;
  assert.ok(validate([s]).errors.some(e=>e.code==='REQUIRED_PROP'&&e.at.endsWith('.subline')));
  s.templateParams.cardProps.subline='';s.templateParams.cardProps.words='';
  assert.ok(validate([s]).errors.some(e=>e.code==='REQUIRED_PROP'&&e.at.endsWith('.words')));
});

test('拒绝把 impact-open-title 参数跨卡传给 contrast，且不补演示默认值',()=>{
  const s=shot('impact-open-title');s.shotCard='type-contrast-emphasis';
  const original=JSON.stringify(s),result=validate([s]);
  assert.equal(result.passed,false);
  assert.ok(result.errors.some(e=>e.code==='UNKNOWN_FIELD'&&e.at.endsWith('.lineStart')));
  assert.ok(result.errors.some(e=>e.code==='REQUIRED_PROP'&&e.at.endsWith('.words')));
  assert.equal(JSON.stringify(s),original);
});

test('缺少 cardProps、超范围和冻结运动字段不能通过编导校验',()=>{
  const empty=shot('type-contrast-emphasis');delete empty.templateParams.cardProps;
  assert.equal(validate([empty]).passed,false);
  const range=shot('impact-open-title');range.templateParams.cardProps.fontSize=100000;
  assert.ok(validate([range]).errors.some(e=>e.code==='PROP_RANGE'));
  const timing=shot('type-contrast-emphasis');timing.templateParams.cardProps.startDelay=0;
  assert.ok(validate([timing]).errors.some(e=>e.code==='MOTION_FIELD_LOCKED'));
});

test('数字事实来源缺失保留待核验项，不冒充生产通过',()=>{
  const s=shot('bar-chart-growth'),result=validate([s]);
  assert.equal(result.passed,true);
  assert.ok(result.pending.some(e=>e.code==='NUMERIC_EVIDENCE_REQUIRED'));
  assert.equal(result.productionAdmitted,false);
});

test('真正的 editorial 校验入口使用治理契约拒绝错误字段',()=>{
  const semantics={sentences:[{i:0,text:'先把边界说清楚。'}]},aligned=[{start:0,end:8}];
  const s={...shot('impact-open-title'),firstSentence:0,lastSentence:0,intent:'说明边界',visual:'标题分层揭示'};
  const result={sentences:[{...semantics.sentences[0],sem:['强调'],need:['强调'],weight:'main',entities:[]}],shots:[s]};
  const options={catalog,projectRoot,cardSlugs:new Set(index.cards.map(c=>c.slug))};
  assert.equal(validateEditorial(result,semantics,aligned,new Set(['强调']),options)[0].shotCard,'impact-open-title');
  s.shotCard='type-contrast-emphasis';
  assert.throws(()=>validateEditorial(result,semantics,aligned,new Set(['强调']),options),/UNKNOWN_FIELD/);
});

test('源信息卡允许显式关闭价格行；缺字段仍不准使用演示价格',()=>{
 const s=shot('info-card-assemble');s.templateParams.cardProps.price='';
 assert.ok(!validate([s]).errors.some(e=>e.at.endsWith('.price')));
 delete s.templateParams.cardProps.price;
 assert.ok(validate([s]).errors.some(e=>e.code==='REQUIRED_PROP'&&e.at.endsWith('.price')));
 assert.equal(catalog.localCorrections[0].field,'price');
});

test('信息卡高亮字段按源解析器填写行号，不再静默吞掉整句文字或越界值',()=>{
 const s=shot('info-card-assemble');s.templateParams.cardProps.highlightLines='不是行号';
 assert.ok(validate([s]).errors.some(e=>e.code==='INDEX_LIST_FORMAT'));
 s.templateParams.cardProps.highlightLines='99';
 assert.ok(validate([s]).errors.some(e=>e.code==='INDEX_LIST_FORMAT'));
 s.templateParams.cardProps.highlightLines='1，2';
 assert.ok(!validate([s]).errors.some(e=>e.code==='INDEX_LIST_FORMAT'));
});


test('章节空编号依据源码在素材采集前接纳，仍记录绑定义务且拒绝空正文',()=>{
 const s=shot('chapter-progress-list');s.templateParams.cardProps.rows='|所有人相信物价稳定|current';s.templateParams.cardProps.bg='#ffffff00';
 const result=validate([s]);assert.equal(result.passed,true,JSON.stringify(result.errors));assert.ok(result.pending.some(x=>x.code==='BACKGROUND_BINDING_REQUIRED'));assert.equal(result.productionAdmitted,false);
 s.templateParams.cardProps.bg='#ffffff';assert.equal(validate([s]).passed,false);
 s.templateParams.cardProps.bg='#ffffff00';s.templateParams.cardProps.rows='||current';assert.equal(validate([s]).passed,false);
});
