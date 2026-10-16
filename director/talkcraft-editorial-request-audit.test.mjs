import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {buildEditorialPlanningContract,editorialInputReadiness,editorialRangeFeasibility,editorialPlanningLimits,editorialRuleInstructions} from './talkcraft-editorial-planning-contract.mjs';
import {auditEditorialRequestContract} from './talkcraft-editorial-request-audit.mjs';
import {OPENING_MAX_SHOT_SEC,OPENING_MAX_TEMPLATE_SEC,TEMPLATE_REUSE_WINDOW_SIZE} from './talkcraft-template-governance.mjs';
const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
const catalog=loadTalkcraftGovernedCatalog(index),aligned=[{start:0,end:2.36},{start:2.36,end:4.8},{start:4.8,end:7.07},{start:7.07,end:10.18}];
const make=()=>({catalog,promptCatalog:compactTalkcraftEditorialCatalog(index,catalog),planningContract:buildEditorialPlanningContract({aligned,catalog})});

test('108卡的实际模型契约和后端逐字段一致，文本用途说明不再被压掉',()=>{
 const args=make();assert.equal(auditEditorialRequestContract(args).passed,true);
 const info=args.promptCatalog.contracts.find(c=>c.slug==='info-card-assemble');
 assert.equal(info.fields.find(f=>f.key==='price').blankAllowed,true);
 assert.match(info.fields.find(f=>f.key==='highlightLines').label,/1|索引|序号/u);
 const rules=editorialPlanningLimits();assert.equal(rules.openingMaxShotSec,OPENING_MAX_SHOT_SEC);
 assert.equal(rules.openingMaxOriginalSec,OPENING_MAX_TEMPLATE_SEC);assert.equal(rules.reuseWindow,TEMPLATE_REUSE_WINDOW_SIZE);
 assert.match(editorialRuleInstructions(),/开始于窗口内的整镜/);
});

test('模型输入漏用途、空值政策、容量或伪造时长时，自检失败而不是发出请求碰运气',()=>{
 for(const mutate of [
  a=>{a.promptCatalog.contracts.find(c=>c.slug==='info-card-assemble').fields.find(f=>f.key==='price').blankAllowed=false;},
  a=>{delete a.promptCatalog.contracts[0].fields[0].label;},
  a=>{a.promptCatalog.contracts.find(c=>c.slug==='word-slot-cycle').dsl.words.minRows=3;},
  a=>{a.promptCatalog.contracts[0].originalFrames=1;},
  a=>{a.planningContract.limits.openingMaxShotSec=5;}
 ]){const args=make();mutate(args);assert.equal(auditEditorialRequestContract(args).passed,false);}
});

test('整片数值可行性先验：不移动口型、不卡死无可行短卡的句子、不替编导选卡',()=>{
 const before=structuredClone(aligned);
 assert.equal(editorialInputReadiness({aligned,catalog}).passed,true);assert.deepEqual(aligned,before);
 assert.equal(editorialInputReadiness({aligned:[{start:0,end:5}],catalog}).passed,false);
 assert.equal(editorialInputReadiness({aligned,catalog,personWindows:[{start:0,end:2.36,firstSentence:0,lastSentence:0}]}).passed,false);
 assert.equal(editorialInputReadiness({aligned,catalog,personWindows:[{start:1,end:4.8,firstSentence:0,lastSentence:1}]}).passed,false);
 const range=editorialRangeFeasibility({firstSentence:0,lastSentence:0,aligned,catalog});
 assert.ok(range.cards.length>1);assert.ok(!Object.hasOwn(range,'selectedCard'));
});

test('自由段落也得到实际帧容量；内嵌口型卡不能靠驻留改变媒体时钟',()=>{
 const a=[{start:10,end:14.7}],windows=[{start:10,end:14.7,firstSentence:0,lastSentence:0}];
 const result=buildEditorialPlanningContract({aligned:a,catalog,personWindows:windows,previousShots:[{id:'s12',firstSentence:0,lastSentence:0}]});
 const comparison=result.windows.find(w=>w.kind==='rejected-draft-comparison');
 assert.ok(!comparison.cards.some(c=>c.slug==='source-converge'));
 assert.ok(!comparison.cards.some(c=>c.slug==='host-card-glass-board'));
 assert.equal(result.timingDomains.find(c=>c.slug==='source-converge').minimumOutputFrames,173);
});
