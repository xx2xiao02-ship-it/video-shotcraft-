import test from 'node:test';
import assert from 'node:assert/strict';
import {validateListCardParams} from './list-card-contracts.mjs';

const id='data/scroll-brake-moves/brake-reticle-lock';
const fixture=()=>({rows:Array.from({length:8},(_,i)=>({id:`record-${i}`,title:`真实记录${i}`,detail:'本地验证',tag:String(i+1)})),targetId:'record-5',focusLabel:'本地有效'});

test('完整复制真实列表且按ID停位，不依赖输入顺序编号',()=>{
  const params=fixture();
  const result=validateListCardParams(id,params);
  assert.deepEqual(result,params);
  result.rows[0].title='修改副本';
  assert.equal(params.rows[0].title,'真实记录0');
  assert.equal(result.targetId,'record-5');
});

test('拒绝重复ID、缺失目标、丢字段、超长文字和未声明字段',()=>{
  for(const mutate of [
    p=>{p.rows[1].id=p.rows[0].id;},
    p=>{p.targetId='missing';},
    p=>{delete p.rows[0].detail;},
    p=>{p.rows[0].title='字'.repeat(41);},
    p=>{p.rows[0].title='首行\n次行';},
    p=>{p.rows[0].extra='不得丢弃';},
    p=>{p.extra='不得丢弃';},
    p=>{p.rows=p.rows.slice(0,7);},
    p=>{p.targetId=p.rows[3].id;},
    p=>{p.targetId=p.rows.at(-1).id;},
  ]){
    const params=fixture();mutate(params);
    assert.throws(()=>validateListCardParams(id,params));
  }
});

test('容量边界允许完整40项与40字标题，不裁剪或补造记录',()=>{
  const params=fixture();
  params.rows=Array.from({length:40},(_,i)=>({id:`record-${i}`,title:'字'.repeat(40),detail:'本地验证',tag:String(i+1)}));
  assert.deepEqual(validateListCardParams(id,params),params);
  params.rows.push({...params.rows[0],id:'record-40'});
  assert.throws(()=>validateListCardParams(id,params));
  assert.equal(validateListCardParams('unknown-card',fixture()),undefined);
});
