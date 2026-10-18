import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {editorialNumericGrid,editorialReplacementBudget,auditEditorialParameterBudget} from './talkcraft-editorial-parameter-budget.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json')));
const card=id=>catalog.cards.find(c=>c.cardId===id);
test('原卡格点基于min或源码default，0.42失败而0.4通过，不修改返回',()=>{
 const c=card('highlighter-sweep'),f=c.fields.find(f=>f.key==='dimTo'),props={dimTo:0.42},before=structuredClone(props);
 assert.deepEqual({...editorialNumericGrid(f),rule:undefined},{base:0.1,step:0.05,min:0.1,max:1,rule:undefined});
 assert.equal(auditEditorialParameterBudget(c,props,'s03').issues[0].code,'PROP_STEP');assert.deepEqual(props,before);
 assert.equal(auditEditorialParameterBudget(c,{dimTo:0.4},'s03').passed,true);
 assert.equal(editorialNumericGrid({type:'number',default:0.3,step:0.2}).base,0.3);
 assert.equal(editorialNumericGrid({type:'string'}),null);
});
test('217实际五条消息按同源源码需要364帧，不能沿用277帧默认预算',()=>{
 const c=card('chat-message-flow'),props={messages:'them|政策落地\nthem|钱流到市场里\nthem|老百姓拿到钱\nme|第一反应不是消费\nthem|而是存进银行'},before=structuredClone(props);
 const a=auditEditorialParameterBudget(c,props,'s08'),issue=a.issues.find(i=>i.code==='DURATION_BUDGET');
 assert.equal(issue.requiredFrames,364);assert.equal(issue.availableFrames,277);assert.deepEqual(props,before);
 const contract=editorialReplacementBudget(c);assert.equal(contract.mode,'source_pure_schedule');
 assert.ok(contract.sourceDefinitions.some(r=>r.text.includes('function buildSchedule')));
 assert.ok(contract.sourceDefinitions.some(r=>r.text.includes('function parseMessages')));
 assert.equal(contract.numericSourceDefaults.msgGap,0.6);assert.ok(!JSON.stringify(contract).includes(c.fields.find(f=>f.key==='messages').default));
});
test('替换文字预算按实际消息内容计算，固定卡预算保持不变',()=>{
 const c=card('chat-message-flow');assert.equal(auditEditorialParameterBudget(c,{messages:'them|政策'},'s08').passed,true);
 assert.equal(editorialReplacementBudget(card('highlighter-sweep')).mode,'registered_fixed');
});
