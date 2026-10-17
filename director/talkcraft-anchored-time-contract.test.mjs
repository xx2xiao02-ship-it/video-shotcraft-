import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildCatalog} from '../docs/audits/b-talkcraft-target3/current-contract.mjs';
import {validateDsl} from '../docs/audits/b-talkcraft-target3/dsl-validation.mjs';
import {loadTalkcraftGovernedCatalog,talkcraftEditorialContract,validateTalkcraftDesignProps} from './talkcraft-governed-contract.mjs';
import {correctAnchoredSpeechTimes} from './talkcraft-anchored-time-contract.mjs';
const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
const catalog=loadTalkcraftGovernedCatalog(index);
const card=catalog.cards.find(c=>c.cardId==='type-contrast-emphasis');
const field=card.fields.find(f=>f.key==='words');
const realWords='你有没有|0.135\n发现|0.435\n一个|0.715\n很有意思|0.855|serif\n的现象|1.355|color';
const errors=words=>validateDsl('words',words,card.policy.dsl.words,field.default);
test('真实词级时间不再与演示时间比较，输入秒数不被改写',()=>{
  assert.deepEqual(errors(realWords),[]);
  const s={id:'s01',subject:'person',shotCard:card.cardId,templateParams:{cardProps:{words:realWords,fontSize:32,accent:'#1a4a8a',ink:'#1a1a1a'}}};
  const before=JSON.stringify(s);
  assert.equal(validateTalkcraftDesignProps([s],{catalog,projectRoot:process.cwd()}).passed,true);
  assert.equal(JSON.stringify(s),before);
});
test('编导输入和后端校验共享同一个时间契约',()=>{
  const c=talkcraftEditorialContract(catalog).cards.find(c=>c.slug===card.cardId);
  assert.deepEqual(c.dsl.words,(({source,sourceParsers,...rules})=>rules)(card.policy.dsl.words));
  assert.equal(c.dsl.words.timeBasis,'speech-word-anchor-seconds');
});
test('负数、非数、空行、非法强调通道和原有行数边界仍阻断',()=>{
  for(const value of [realWords.replace('0.135','-0.1'),realWords.replace('0.135','NaN'),realWords.replace('|serif','|wrong'),realWords+'\n',realWords.split('\n').slice(1).join('\n')])
    assert.ok(errors(value).length,value);
});
test('其他卡和其他DSL时间列的冻结规则没有改变',()=>{
  const baseline=buildCatalog();
  const corrected=structuredClone(baseline);correctAnchoredSpeechTimes(corrected);
  for(const b of baseline.cards)if(b.cardId!==card.cardId)
    assert.deepEqual(corrected.cards.find(c=>c.cardId===b.cardId).policy,b.policy,b.cardId);
  assert.ok(validateDsl('lines','log|0.5|文本',{syntax:'timed-log',minRows:1,maxRows:null,kinds:['log'],fixedColumns:[1]},'log|0|文本').includes('EMBEDDED_MOTION_CHANGED'));
});
test('startDelay动效常量仍不可改写',()=>{
  const s={id:'s01',subject:'person',shotCard:card.cardId,templateParams:{cardProps:{words:realWords,fontSize:32,accent:'#1a4a8a',ink:'#1a1a1a',startDelay:0}}};
  assert.ok(validateTalkcraftDesignProps([s],{catalog,projectRoot:path.resolve('.')}).errors.some(e=>e.code==='MOTION_FIELD_LOCKED'));
});
test('源码哈希证据变化即停止修正，不静默放行',()=>{
  const c=buildCatalog();c.cards.find(c=>c.cardId===card.cardId).implementation.sha256='0'.repeat(64);
  assert.throws(()=>correctAnchoredSpeechTimes(c),/源码证据失效/);
});
