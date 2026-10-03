import assert from 'node:assert/strict';
import test from 'node:test';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration,numericCardInstructions} from './numeric-card-contracts.mjs';

const card='data/counter-confetti';
test('numeric card retains zero and decimals with shot-local evidence',()=>{
  for(const value of [0,12.34,999999]) {
    const params={value,unit:'元',label:'储备',evidence:`储备${value}元`};
    assert.deepEqual(validateNumericCardParams(card,params,params.evidence),params);
  }
});

test('odometer numeric contract enforces six actual digits and its independent hold',()=>{
  const odometer='data/odometer-digit-roll';
  for (const value of [0,12.34,1234.56,999999]) {
    const params={value,unit:'元',label:'储备',evidence:`储备${value}元`};
    assert.deepEqual(validateNumericCardParams(odometer,params,params.evidence),params);
  }
  for (const value of [12345.67,999999.99,[1200],1e-12]) {
    const params={value,unit:'元',label:'储备',evidence:`储备${value}元`};
    assert.throws(()=>validateNumericCardParams(odometer,params,params.evidence));
  }
  assert.doesNotThrow(()=>assertNumericCardDuration(odometer,144,30));
  for (const frames of [60,138,143]) assert.throws(()=>assertNumericCardDuration(odometer,frames,30));
  assert.throws(()=>assertNumericCardDuration(odometer,144,60));
  const guide=numericCardInstructions([card,odometer]);
  assert.ok(guide.includes(odometer) && guide.includes('144帧') && guide.includes('138帧'));
  assert.ok(!numericCardInstructions([card]).includes(odometer));
  assert.equal(numericCardInstructions([]),'');
});

test('numeric evidence cannot borrow comma suffixes, exponent suffixes or Unicode negative values',()=>{
  for (const id of [card,'data/odometer-digit-roll']) for (const [value,evidence] of [[0,'储备1,000元'],[3,'储备1e3元'],[100,'储备−100元']]) {
    assert.throws(()=>validateNumericCardParams(id,{value,unit:'元',label:'储备',evidence},evidence));
  }
});
test('numeric card rejects demo fallback, foreign evidence and malformed values',()=>{
  const params=NUMERIC_CARD_CONTRACTS[card].fixture;
  for(const bad of [undefined,{...params,value:'1200'},{...params,value:12.345},{...params,value:-1},
    {...params,unit:'美元'},{...params,extra:true},{...params,value:1000000}])
    assert.throws(()=>validateNumericCardParams(card,bad,params.evidence));
  assert.throws(()=>validateNumericCardParams(card,params,'本镜头没有数值'));
  assert.throws(()=>validateNumericCardParams(card,{...params,value:100,evidence:'收入10元，资产100万'},'收入10元，资产100万'));
  assert.throws(()=>validateNumericCardParams(card,{...params,value:100,evidence:'现金变化-100元'},'现金变化-100元'));
});
test('long card cannot be silently compressed into a two-second opening',()=>{
  assert.doesNotThrow(()=>assertNumericCardDuration(card,138,30));
  for(const frames of [30,60,120]) assert.throws(()=>assertNumericCardDuration(card,frames,30));
  assert.throws(()=>assertNumericCardDuration(card,138,60));
});
