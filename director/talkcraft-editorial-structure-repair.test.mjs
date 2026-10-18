import test from 'node:test';
import assert from 'node:assert/strict';
import {repairEditorialStructure} from './talkcraft-editorial-structure-repair.mjs';
const request={requestId:'this-request',editableShotIds:['s03','s08']};
const raw=()=>({requestId:request.requestId,repairs:[{shotId:'s03',templateParams:{cardProps:{text:'真实内容'}},templateMaterialQueries:{src:'官方照片'},semanticDeviations:{解释:'真实理由'}}]});

test('本次文字字段的field别名可无损转key，字级事件和原文不变且重复执行幂等',()=>{
 const original=raw();delete original.repairs[0].templateMaterialQueries;delete original.repairs[0].semanticDeviations;
 original.repairs[0].nativePresentation={textFields:[{field:'text',visibility:'visible',reason:'真实内容'}],
  wordEvents:[{field:'text',text:'真实内容',sentenceRef:'current-sentence',fromOffset:0,throughOffset:3}]};
 const before=structuredClone(original),fixed=repairEditorialStructure(original,request);
 assert.equal(fixed.report.passed,true);assert.deepEqual(original,before);
 assert.deepEqual(fixed.response.repairs[0].nativePresentation.textFields,[{key:'text',visibility:'visible',reason:'真实内容'}]);
 assert.deepEqual(fixed.response.repairs[0].nativePresentation.wordEvents,before.repairs[0].nativePresentation.wordEvents);
 assert.deepEqual(fixed.report.changes[0].sourceValue,before.repairs[0].nativePresentation.textFields[0]);
 assert.notEqual(fixed.report.rawSha256,fixed.report.normalizedSha256);
 assert.deepEqual(repairEditorialStructure(fixed.response,request).report.changes,[]);
 for(const fields of [[{field:'unknown',visibility:'visible'}],[{field:'text',key:'different',visibility:'visible'}],
  [{field:'text',visibility:'visible'},{key:'text',visibility:'hidden'}]]){
   const invalid=structuredClone(before);invalid.repairs[0].nativePresentation.textFields=fields;
   const rejected=repairEditorialStructure(invalid,request);assert.equal(rejected.report.passed,false);
   assert.deepEqual(rejected.response,invalid);assert.deepEqual(rejected.report.changes,[]);
 }
});
test('错层无损移动，原始内容不变，重复修复幂等且保留内容哈希',()=>{
  const original=raw(),before=structuredClone(original),{response,report}=repairEditorialStructure(original,request);
  assert.deepEqual(original,before);assert.equal(report.changes.length,2);
  assert.deepEqual(response.repairs[0].templateParams.templateMaterialQueries,before.repairs[0].templateMaterialQueries);
  assert.deepEqual(response.repairs[0].templateParams.semanticDeviations,before.repairs[0].semanticDeviations);
  assert.equal(report.externalRequests,0);assert.equal(report.productionAdmitted,false);
  const again=repairEditorialStructure(response,request);assert.deepEqual(again.response,response);assert.deepEqual(again.report.changes,[]);
});
test('两层不一致时整个修复原子拒绝，不选值、不覆盖',()=>{
  const original=raw();original.repairs[0].templateParams.semanticDeviations={解释:'冲突理由'};
  const result=repairEditorialStructure(original,request);
  assert.equal(result.report.passed,false);assert.equal(result.report.issues[0].code,'EDITORIAL_STRUCTURE_CONFLICT');
  assert.deepEqual(result.response,original);assert.deepEqual(result.report.changes,[]);
});
test('一致重复可去重，未知键和内容错误留给严格校验',()=>{
  const original=raw();original.repairs[0].templateParams.semanticDeviations={解释:'真实理由'};
  original.repairs[0].playbackRate=9;
  const result=repairEditorialStructure(original,request);
  assert.ok(result.report.changes.some(c=>c.operation==='deduplicate-identical'));
  assert.equal(result.response.repairs[0].playbackRate,9);
});
test('错误类型不修复，锁定镜头不修复，旧请求不接受',()=>{
  const original=raw();original.repairs[0].templateMaterialQueries=['不能猜测的条目'];
  assert.equal(repairEditorialStructure(original,request).report.passed,false);
  const locked=raw();locked.repairs[0].shotId='s09';assert.deepEqual(repairEditorialStructure(locked,request).response,locked);
  assert.throws(()=>repairEditorialStructure(raw(),{...request,requestId:'old'}),/指纹/);
});
test('空素材查询数组可无损转换为空映射，不补造任何查询',()=>{
  const original=raw();original.repairs[0].templateMaterialQueries=[];
  const result=repairEditorialStructure(original,request);
  assert.equal(result.report.passed,true);assert.deepEqual(result.response.repairs[0].templateParams.templateMaterialQueries,{});
  assert.deepEqual(original.repairs[0].templateMaterialQueries,[]);
  assert.ok(result.report.changes.some(c=>c.operation==='empty-map'));
});

test('逐槽列表仅按明确field和materialQuery转换，原始条目留存且重复字段原子拒绝',()=>{
  const value=raw();delete value.repairs[0].templateMaterialQueries;
  const entry={field:'src2',materialQuery:'官方原始检索词',queryZh:'中文发现词',materialRole:'identity',reason:'本次人物身份'};
  value.repairs[0].templateParams.templateMaterialQueries=[entry];
  const before=structuredClone(value),fixed=repairEditorialStructure(value,request);
  assert.equal(fixed.report.passed,true);assert.deepEqual(value,before);
  assert.deepEqual(fixed.response.repairs[0].templateParams.templateMaterialQueries,{src2:entry.materialQuery});
  assert.deepEqual(fixed.report.changes[0].sourceValue,[entry]);
  assert.deepEqual(repairEditorialStructure(fixed.response,request).report.changes,[]);
  for(const invalid of [[entry,entry],[{field:'src2',queryZh:'只有中文提示'}],[{...entry,unknown:'未定义'}]]){
    const broken=structuredClone(before);broken.repairs[0].templateParams.templateMaterialQueries=invalid;
    const rejected=repairEditorialStructure(broken,request);
    assert.equal(rejected.report.passed,false);assert.deepEqual(rejected.response,broken);
  }
});
