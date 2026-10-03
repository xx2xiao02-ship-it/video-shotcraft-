import test from 'node:test';
import assert from 'node:assert/strict';
import {GRAPHIC_CONTRACTS,validateGraphicParams} from './graphic-contracts.mjs';
import {buildStoryboard,validateShotPlan} from './a-mode-run.mjs';

test('图形参数贯通逐镜校验和最终分镜，不丢节点标签',() => {
  const card='ui-entrance/bezier-source-converge-merge';
  const segments=[{text:'收入节流还债，留住现金。',fromFrame:0,durationInFrames:180}];
  const globals=[{fromSegment:0,toSegment:1,type:'claim',card,materialRole:'none'}];
  const details={shots:[{index:0,displayLines:['现金底气'],elementPlan:'三个来源汇聚现金',captionHighlights:['现金'],templateParams:GRAPHIC_CONTRACTS[card].fixture}]};
  validateShotPlan(details,globals,segments);
  assert.deepEqual(buildStoryboard(null,'id',{fps:30,totalFrames:180,segments},globals,details.shots,{}).shots[0].templateParams,details.shots[0].templateParams);
  assert.throws(()=>validateShotPlan({shots:[{...details.shots[0],templateParams:undefined}]},globals,segments),/缺少结构化/);
});
test('数值图必须引用原文，拒绝错数、未知字段、不同单位和残留演示数据',() => {
  const card='data/hatch-depth',p=GRAPHIC_CONTRACTS[card].fixture;
  const text='账面资产100万，可用现金10万。';
  assert.deepEqual(validateGraphicParams(card,p,text),p);
  for(const bad of [{...p,unit:'美元'},{...p,rows:[{...p.rows[0],value:999},p.rows[1]]},{...p,extra:'demo'}])
    assert.throws(()=>validateGraphicParams(card,bad,text));
  assert.throws(()=>validateGraphicParams('typography/brace-expand',{rows:p.rows},text),/尚无图形参数/);
});
