import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {auditEditorialRequiredProps,editorialRequiredBusinessFields} from './talkcraft-editorial-required-props.mjs';

test('222两镜空对象一次报告全部9个必填业务字段，不填默认值或媒体事实',()=>{
 const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json')));
 const props={},before=structuredClone(props),issues=[];
 for(const [id,slug] of [['s03','highlighter-sweep'],['s08','chat-gpt']]){
  const card=catalog.cards.find(c=>c.cardId===slug);
  issues.push(...auditEditorialRequiredProps(card,props,id).issues);
  assert.ok(editorialRequiredBusinessFields(card).every(f=>!Object.hasOwn(card.policy.media,f.key)));
 }
 assert.deepEqual(issues.map(i=>`${i.shotId}.${i.field}`),['s03.docHead','s03.linesBefore','s03.keyText','s03.linesAfter',
  's08.greeting','s08.prompt','s08.reply','s08.placeholder','s08.chips']);
 assert.deepEqual(props,before);
});

test('显式存在规则与原校验一致：空白、null、缺失拒绝，获准空字符串和0/false保留',()=>{
 const card={fields:[{key:'text'},{key:'optionalBlank',blankAllowed:true},{key:'n',type:'number'},{key:'b',type:'boolean'}],
  policy:{required:['text','optionalBlank','n','b','image'],media:{image:'image'}}};
 const good={text:'当前内容',optionalBlank:'',n:0,b:false};
 assert.equal(auditEditorialRequiredProps(card,good,'s03').passed,true);
 for(const value of [null,[],undefined,''])assert.equal(auditEditorialRequiredProps(card,value,'s03').passed,false);
 for(const value of [null,'',' '])assert.equal(auditEditorialRequiredProps(card,{...good,text:value},'s03').passed,false);
 const missing={...good};delete missing.text;
 assert.equal(auditEditorialRequiredProps(card,missing,'s03').passed,false);
 assert.equal(auditEditorialRequiredProps(card,{...good,optionalBlank:' '},'s03').passed,false);
 assert.deepEqual(good,{text:'当前内容',optionalBlank:'',n:0,b:false});
});
