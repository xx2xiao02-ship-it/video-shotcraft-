import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialResponseContract,auditEditorialConstraintInput,auditEditorialMaterialOwnership,
  SOURCE_FACT_KEYS,editorialMaterialRefs,resolveEditorialMaterialRefs} from './talkcraft-editorial-constraints.mjs';

const binding={kind:'identity',query:'央行官方资料',field:'src',localPath:'sources/central-bank.png',
  sha256:'a'.repeat(64),license:'原许可',verified:true,sourceUrl:'https://example.org/official'};
function fixture(){
  const research={kind:'identity',query:'央行官方资料',entityType:'organization',entityName:'央行',reason:'机构身份',displayField:'src'};
  const request={requestId:'本次内容指纹',editableShotIds:['s07'],materialShotIds:['s04','s07'],
    windows:[{shotId:'s07',requiresSource:true,anchorScope:{scopeId:'本镜锚点范围'},
      choices:[{slug:'原卡',choiceId:'本镜方案',sourceDisplayFields:['src']}]}],
    baseProposal:{materialResearch:{shots:[{shotId:'s04',research:[],backgroundReason:'已审理由'},
      {shotId:'s07',research:[research],bindings:[structuredClone(binding)]}]}}};
  const catalog={cards:[{cardId:'原卡',policy:{media:{src:'image',hostSrc:'portrait-video'}}}]};
  const modelInput={responseContract:editorialResponseContract(request),materials:[
    {shotId:'s04',mode:'retarget-only',rewriteFields:[],requiredArrays:['research'],research:[]},
    {shotId:'s07',mode:'replace-design',rewriteFields:[],requiredArrays:['research'],
      research:[{kind:research.kind,query:research.query,entityType:research.entityType,entityName:research.entityName}],
      bindings:[{kind:binding.kind,query:binding.query,field:'src'}]}]};
  const response={materialResearchUpdates:[{shotId:'s04',research:[]},{shotId:'s07',research:[structuredClone(research)]}]};
  modelInput.materials[1].research[0].researchRef=editorialMaterialRefs(request,'s07','research')[0].ref;
  modelInput.materials[1].bindings[0].bindingRef=editorialMaterialRefs(request,'s07','bindings')[0].ref;
  return {request,catalog,modelInput,response};
}

test('实际发送前独立检查资料覆盖、只读任务和原卡槽；合同不能被删减或换成其他镜',()=>{
  const good=fixture();assert.deepEqual(auditEditorialConstraintInput(good.request,good),{passed:true,issues:[]});
  for(const mutate of [
    a=>delete a.modelInput.responseContract,
    a=>a.modelInput.responseContract.repairs[0].choicesPath='windows[其他镜].choices',
    a=>a.modelInput.materials.pop(),
    a=>a.modelInput.materials[0].rewriteFields.push('backgroundReason'),
    a=>a.modelInput.materials[0].requiredArrays=[],
    a=>a.modelInput.materials[1].research[0].entityName='其他镜的主体',
    a=>a.modelInput.materials[1].research[0].researchRef='其他事务引用',
    a=>a.modelInput.materials[1].bindings[0].license='让模型重抄许可',
    a=>a.request.windows[0].choices[0].sourceDisplayFields=['hostSrc'],
  ]){const args=fixture();mutate(args);assert.equal(auditEditorialConstraintInput(args.request,args).passed,false);}
});

test('本次本镜引用只还原身份与已核验事实，设计理由和目标槽仍必须显式提供',()=>{
  const {request}=fixture(),researchRef=editorialMaterialRefs(request,'s07','research')[0].ref,
    bindingRef=editorialMaterialRefs(request,'s07','bindings')[0].ref;
  const response={materialResearchUpdates:[{shotId:'s07',research:[{researchRef,reason:'本次对央行机构的展示设计',displayField:'srcAfter'}],
    bindings:[{bindingRef,field:'srcAfter'}]}]},before=structuredClone(response);
  const normalized=resolveEditorialMaterialRefs(response,request);
  assert.equal(auditEditorialMaterialOwnership(normalized,request).passed,true);
  assert.deepEqual(normalized.materialResearchUpdates[0].bindings,[{...binding,field:'srcAfter'}]);
  assert.equal(normalized.materialResearchUpdates[0].research[0].query,'央行官方资料');
  assert.deepEqual(response,before);
  for(const mutate of [
    r=>r.materialResearchUpdates[0].research[0].researchRef='旧任务引用',
    r=>r.materialResearchUpdates[0].shotId='s04',
    r=>delete r.materialResearchUpdates[0].research[0].reason,
    r=>r.materialResearchUpdates[0].research[0].query='被改写的检索词',
    r=>r.materialResearchUpdates[0].research[0].identityContext='伪造新身份',
    r=>r.materialResearchUpdates[0].bindings[0].license='伪造许可',
    r=>r.materialResearchUpdates[0].research.push(r.materialResearchUpdates[0].research[0]),
  ]){const bad=structuredClone(response);mutate(bad);assert.throws(()=>resolveEditorialMaterialRefs(bad,request));}
  const other=structuredClone(request);other.requestId='另一请求';
  assert.throws(()=>resolveEditorialMaterialRefs(response,other),/不属于本次本镜/);
});

test('锁定资料只按引用换槽；既有返回违规不能借引用恢复静默丢弃',()=>{
  const {request}=fixture();request.editableShotIds=[];
  const researchRef=editorialMaterialRefs(request,'s07','research')[0].ref;
  const r={materialResearchUpdates:[{shotId:'s07',research:[{researchRef,displayField:'srcAfter'}]}]};
  const normalized=resolveEditorialMaterialRefs(r,request);
  assert.equal(normalized.materialResearchUpdates[0].research[0].reason,'机构身份');
  r.materialResearchUpdates[0].research[0].reason='改写锁定理由';
  assert.throws(()=>resolveEditorialMaterialRefs(r,request),/展示补丁/);
  const legacy={materialResearchUpdates:[{shotId:'s07',research:[{kind:'identity',query:'中文化后新检索词',reason:'模型新理由'}]}]};
  assert.equal(auditEditorialMaterialOwnership(resolveEditorialMaterialRefs(legacy,request),request).passed,false);
});

test('人物展示引用必须指向同一人物的本镜资料；不能把另一人物的资料借来',()=>{
  const {request}=fixture(),row=request.baseProposal.materialResearch.shots[1];
  row.research=[{kind:'identity',entityType:'person',entityName:'人物甲',query:'official profile A',reason:'原理由'}];
  const researchRef=editorialMaterialRefs(request,'s07','research')[0].ref;
  const response={materialResearchUpdates:[{shotId:'s07',research:[{researchRef,reason:'本次人物展示'}],
    personDisplays:[{entityName:'人物甲',bindingResearchRef:researchRef,labelField:'labelFront',labelText:'人物甲'}]}]};
  const result=resolveEditorialMaterialRefs(response,request);
  assert.equal(result.materialResearchUpdates[0].personDisplays[0].bindingQuery,'official profile A');
  response.materialResearchUpdates[0].personDisplays[0].entityName='人物乙';
  assert.throws(()=>resolveEditorialMaterialRefs(response,request),/人物身份/);
});

test('响应逐行合同保留非空研究身份，不能以空数组、同类其他检索或背景理由替代',()=>{
  const good=fixture();assert.equal(auditEditorialMaterialOwnership(good.response,good.request).passed,true);
  for(const mutate of [r=>r.research=[],r=>r.research[0].query='其他机构',
    r=>r.research[0].entityName='改成别的主体',r=>delete r.research[0].reason]){
    const args=fixture();mutate(args.response.materialResearchUpdates[1]);
    assert.equal(auditEditorialMaterialOwnership(args.response,args.request).passed,false);
  }
});

test('模型只能按已有身份换槽；原始文件、来源和许可不回抄，省略绑定不等于删除',()=>{
  const args=fixture(),row=args.response.materialResearchUpdates[1];
  row.bindings=[{kind:binding.kind,query:binding.query,field:'srcAfter'}];
  assert.equal(auditEditorialMaterialOwnership(args.response,args.request).passed,true);
  const before=structuredClone(args.request);
  for(const key of SOURCE_FACT_KEYS){
    row.bindings=[{kind:binding.kind,query:binding.query,field:'srcAfter',[key]:'模型伪造值'}];
    assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.code==='EDITORIAL_SOURCE_FACT_LOCKED'));
  }
  row.bindings=[{kind:binding.kind,query:binding.query,field:'srcAfter',futureVerificationFlag:true}];
  assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.field==='futureVerificationFlag'));
  row.bindings=[];assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.code==='EDITORIAL_BINDING_REMOVAL'));
  row.bindings=[{kind:'identity',query:'尚未采集的资料',field:'src'}];
  assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.code==='EDITORIAL_BINDING_NOT_OWNED'));
  row.bindings=null;assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.code==='EDITORIAL_BINDING_INVALID'));
  assert.deepEqual(args.request,before);
});

test('新增资料只能规划；已有研究记录的URL、哈希与授权不可伪造',()=>{
  const args=fixture(),row=args.response.materialResearchUpdates[1];
  row.research.push({kind:'identity',query:'待检索官方资料',reason:'补充展示',displayField:'src'});
  assert.equal(auditEditorialMaterialOwnership(args.response,args.request).passed,true);
  row.research.at(-1).localPath='伪造已下载.png';
  assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.field==='localPath'));
  delete row.research.at(-1).localPath;row.research[0].verified=true;
  assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.field==='verified'));
  delete row.research[0].verified;row.unauthorizedApproval=true;
  assert.ok(auditEditorialMaterialOwnership(args.response,args.request).issues.some(i=>i.code==='EDITORIAL_MATERIAL_FIELD_NOT_WRITABLE'));
});
