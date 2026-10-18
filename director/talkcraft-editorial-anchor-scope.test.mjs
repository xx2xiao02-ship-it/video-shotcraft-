import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditorialAnchorScope,compileEditorialAnchorEvents} from './talkcraft-editorial-anchor-scope.mjs';

const make=(overrides={})=>buildEditorialAnchorScope({shotId:'s02',firstSentence:1,lastSentence:2,
  inputSha256:'当前任务输入',sentences:[{text:'后镜不可见'},{text:'很多国际大奖，'},{text:'听着宏大，'}],...overrides});
const event=(scope,first=0,last=-1)=>({field:'keyword',text:'宏大',role:'spoken',
  fromAnchorId:scope.sentences[1].anchors.at(first).anchorId,throughAnchorId:scope.sentences[1].anchors.at(last).anchorId});

test('只生成本镜可发音字符编号，从合法首尾编号恢复真实句序和原文，完全保留输入',()=>{
  const scope=make(),before=structuredClone(scope);
  assert.deepEqual(scope.sentences.map(r=>r.sentenceIndex),[1,2]);
  assert.ok(!JSON.stringify(scope).includes('后镜不可见'));
  assert.equal(scope.sentences[1].anchors.length,4);
  assert.deepEqual(compileEditorialAnchorEvents([event(scope,2)],scope,'s02'),[
    {field:'keyword',text:'宏大',role:'spoken',sentenceIndex:2,anchor:'宏大'}]);
  assert.deepEqual(scope,before);
});

test('其他镜、其他输入、其他句、倒序和未知编号无法编译；reason和context不豁免',()=>{
  const scope=make(),foreign=make({shotId:'s03'}),stale=make({inputSha256:'旧输入'});
  for(const mutate of [e=>e.fromAnchorId=foreign.sentences[1].anchors[0].anchorId,
    e=>e.fromAnchorId=stale.sentences[1].anchors[0].anchorId,e=>e.fromAnchorId='a_不存在',
    e=>e.fromAnchorId=scope.sentences[0].anchors[0].anchorId,
    e=>[e.fromAnchorId,e.throughAnchorId]=[e.throughAnchorId,e.fromAnchorId]]){
    const e=event(scope);mutate(e);e.role='context';e.reason='本镜需要提前交代后句';
    assert.throws(()=>compileEditorialAnchorEvents([e],scope,'s02'),/未知、过期、跨镜、跨句或倒序/);
  }
});

test('不能提交自由句序、锚词、秒数或carry；缺少内容保持失败',()=>{
  const scope=make();
  for(const extra of [{sentenceIndex:3},{anchor:'隔得很远'},{carry:true},{start:2.4}])
    assert.throws(()=>compileEditorialAnchorEvents([{...event(scope),...extra}],scope,'s02'),/不得自由填写/);
  assert.throws(()=>compileEditorialAnchorEvents([],scope,'s02'),/缺少/);
  assert.throws(()=>compileEditorialAnchorEvents([{...event(scope),role:'context'}],scope,'s02'),/依据/);
});

test('重复短词不会静默锚到第一次；Unicode字符范围和原标点不被改写',()=>{
  const scope=make({firstSentence:0,lastSentence:0,sentences:[{text:'宏大，宏大😀'}]});
  const anchors=scope.sentences[0].anchors;
  const e={field:'title',text:'宏大',role:'spoken',fromAnchorId:anchors[2].anchorId,throughAnchorId:anchors[3].anchorId};
  assert.throws(()=>compileEditorialAnchorEvents([e],scope,'s02'),/重复/);
  e.throughAnchorId=anchors[4].anchorId;
  assert.equal(compileEditorialAnchorEvents([e],scope,'s02')[0].anchor,'宏大😀');
  e.fromAnchorId=anchors[0].anchorId;
  assert.equal(compileEditorialAnchorEvents([e],scope,'s02')[0].anchor,'宏大，宏大😀');
});

test('有真实时间轴原文时逐字核对，不能给旧稿字符重新签发有效编号',()=>{
  assert.throws(()=>make({aligned:[{}, {text:'擅自换稿'}, {text:'听着宏大，'}]}),/与真实时间轴原文不一致/);
});
