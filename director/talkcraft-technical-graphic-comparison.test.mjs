import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {prepareTechnicalGraphicComparisons} from './talkcraft-technical-graphic-comparison.mjs';
const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
const catalog=loadTalkcraftGovernedCatalog(index);
function fixture(){return {shots:[{id:'s02',shotCard:'keyword-pop-highlight',firstSentence:0,lastSentence:0,subject:'other',templateParams:{cardProps:{}}}],
  research:{shots:[{shotId:'s02',research:[],graphicAlternatives:[{cardId:'keyword-pop-highlight',reason:'已选本卡'}]}]},
  sentences:[{i:0,text:'很多国际大奖，听着宏大，',sem:['例证'],need:[],weight:'main'}],aligned:[{start:0,end:73/30}],catalog,
  graphicCardIds:index.cards.filter(c=>c.category==='数据信息图').map(c=>c.slug),eligibleShotIds:['s02']};}
test('所有图形模板都被真实硬约束排除时保存完整实际比较，不更换文字卡',()=>{
  const input=fixture(),before=structuredClone(input.shots),result=prepareTechnicalGraphicComparisons(input);
  assert.equal(result.length,1);assert.equal(result[0].compared.length,input.graphicCardIds.length);
  assert.ok(input.research.shots[0].graphicAlternatives.some(a=>a.rejectCodes?.length));assert.deepEqual(input.shots,before);
  assert.equal(prepareTechnicalGraphicComparisons(input).length,0);
});
test('存在可执行图形卡时不自动编造不适配理由，不改变编导比较',()=>{
  const input=fixture(),card=structuredClone(catalog.cards.find(c=>c.cardId==='keyword-pop-highlight'));
  card.cardId='viable-graphic';input.catalog={...catalog,cards:[...catalog.cards,card]};input.graphicCardIds.push(card.cardId);
  assert.equal(prepareTechnicalGraphicComparisons(input).length,0);assert.equal(input.research.shots[0].graphicAlternatives.length,1);
});
test('已有真实图形比较或非纯文镜头不被重写',()=>{
  const input=fixture();input.research.shots[0].graphicAlternatives=[{cardId:input.graphicCardIds[0],reason:'本镜不包含逐年量化信息'}];
  assert.equal(prepareTechnicalGraphicComparisons(input).length,0);
  input.research.shots[0].graphicAlternatives=[];input.eligibleShotIds=[];assert.equal(prepareTechnicalGraphicComparisons(input).length,0);
});
