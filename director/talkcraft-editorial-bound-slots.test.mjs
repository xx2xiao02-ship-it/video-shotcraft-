import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {restoreEditorialBoundSlots} from './talkcraft-editorial-bound-slots.mjs';
import {editorialMaterialRefs} from './talkcraft-editorial-constraints.mjs';
function fixture(t){
 const projectRoot=fs.mkdtempSync(path.join(os.tmpdir(),'bound-slots-'));t.after(()=>fs.rmSync(projectRoot,{recursive:true,force:true}));
 fs.mkdirSync(path.join(projectRoot,'remotion/public/pages'),{recursive:true});
 fs.writeFileSync(path.join(projectRoot,'remotion/public/pages/source.png'),'reviewed');
 const binding={kind:'identity',query:'官方资料',field:'src',localPath:'pages/source.png',sha256:createHash('sha256').update('reviewed').digest('hex'),
 sourceVerified:true,licenseVerified:true,sourceUrl:'https://official.example/page',license:'已核验',licenseUrl:'https://official.example/license',identityReason:'机构原文',contentLanguage:'zh-CN'};
 const row={shotId:'s07',research:[{kind:'identity',query:'官方资料',displayField:'src'}],bindings:[binding]};
 const base={shots:[{id:'s07',shotCard:'old',templateParams:{cardProps:{src:'pages/source.png'}}}],materialResearch:{shots:[row]}};
 const request={requestId:'当前事务',editableShotIds:['s07'],baseProposal:structuredClone(base)};
 const result=structuredClone(base);result.shots[0].shotCard='new';result.shots[0].templateParams={cardProps:{title:'新编导内容'},templateMaterialQueries:{src:'官方资料'}};
 const catalog={cards:[{cardId:'new',policy:{media:{src:'image'}}}]};return {request,result,options:{projectRoot,catalog}};
}

test('明确引用本请求核验来源时检索提示不替代文件身份；伪造、跨镜和旧请求引用不恢复',t=>{
 const f=fixture(t),ref=editorialMaterialRefs(f.request,'s07','bindings')[0].ref;
 f.result.shots[0].templateParams.templateMaterialQueries.src='official original source';
 const before=structuredClone(f.result),options={...f.options,bindingSelections:[{shotId:'s07',field:'src',bindingRef:ref}]};
 for(const patch of [{bindingRef:'forged'},{shotId:'s08'},{field:'src2'}]){
  const r=restoreEditorialBoundSlots(f.result,f.request,{...options,bindingSelections:[{...options.bindingSelections[0],...patch}]});
  assert.equal(r.repairs.length,0);assert.deepEqual(f.result,before);
 }
 f.request.requestId='新事务';assert.equal(restoreEditorialBoundSlots(f.result,f.request,options).repairs.length,0);
 f.request.requestId='当前事务';const report=restoreEditorialBoundSlots(f.result,f.request,options);
 assert.equal(report.repairs.length,1);assert.equal(report.repairs[0].bindingRef,ref);
 assert.equal(report.repairs[0].discoveryQuery,'official original source');
 assert.equal(f.result.shots[0].templateParams.templateMaterialQueries.src,'official original source');
 delete f.result.shots[0].templateParams.cardProps.src;
 f.result.materialResearch.shots[0].bindings[0].sha256='changed';
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,options).repairs.length,0);
});
test('换卡后按本次绑定填入原卡公开空槽，不改选卡、文字、理由和请求；重复恢复无副作用',t=>{
 const f=fixture(t),before=structuredClone(f.request),shots=structuredClone(f.result.shots);
 const report=restoreEditorialBoundSlots(f.result,f.request,f.options);assert.equal(report.repairs.length,1);assert.deepEqual(report.rejected,[]);
 assert.equal(f.result.shots[0].templateParams.cardProps.src,'remotion/public/pages/source.png');
 delete f.result.shots[0].templateParams.cardProps.src;assert.deepEqual(f.result.shots,shots);
 restoreEditorialBoundSlots(f.result,f.request,f.options);assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,0);
 assert.deepEqual(f.request,before);
});
test('跨镜资料仅填明确且可编辑的目标；锁定镜头不改',t=>{
 const f=fixture(t);f.request.baseProposal.materialResearch.shots[0].bindings[0].displayShotId='s11';
 f.result.materialResearch.shots[0].bindings[0].displayShotId='s11';f.result.shots[0].id='s11';f.request.editableShotIds=['s11'];
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,1);
 delete f.result.shots[0].templateParams.cardProps.src;f.request.editableShotIds=[];
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,0);
});
test('文件变化、授权缺失、查询冲突、非图片槽、字段或目标改变均不恢复',t=>{
 for(const mutate of [f=>f.request.baseProposal.materialResearch.shots[0].bindings[0].licenseVerified=false,
 f=>f.result.shots[0].templateParams.templateMaterialQueries.src='另一个人物',
 f=>f.options.catalog.cards[0].policy.media.src='portrait-video',
 f=>f.result.materialResearch.shots[0].research[0].displayField='other',
 f=>f.result.materialResearch.shots[0].bindings[0].sha256='changed',
 f=>fs.writeFileSync(path.join(f.options.projectRoot,'remotion/public/pages/source.png'),'changed')]){
  const f=fixture(t);mutate(f);const before=structuredClone(f.result),r=restoreEditorialBoundSlots(f.result,f.request,f.options);
  assert.equal(r.repairs.length,0);assert.equal(r.rejected.length,1);assert.deepEqual(f.result,before);
 }
});
test('已填写不同文件不覆盖；人物标签不匹配不能填入资料',t=>{
 const f=fixture(t);f.result.shots[0].templateParams.cardProps.src='other.png';
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,0);
 assert.equal(f.result.shots[0].templateParams.cardProps.src,'other.png');delete f.result.shots[0].templateParams.cardProps.src;
 for(const obj of [f.request.baseProposal.materialResearch.shots[0].research[0],f.result.materialResearch.shots[0].research[0]])Object.assign(obj,{entityType:'person',entityName:'甲'});
 f.result.materialResearch.shots[0].personDisplays=[{entityName:'甲',bindingQuery:'官方资料',labelField:'title',labelText:'甲'}];
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).rejected.length,1);
 f.result.shots[0].templateParams.cardProps.title='甲';assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,1);
});

test('显式换槽按本次编导声明恢复同一来源；不推断槽位、不越镜、不改来源',t=>{
 const f=fixture(t),row=f.result.materialResearch.shots[0];
 row.bindings[0].field='src2';row.research[0].displayField='src2';
 f.result.shots[0].templateParams.templateMaterialQueries={src2:'官方资料'};
 f.options.catalog.cards[0].policy.media={src2:'image'};
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,0);
 const options={...f.options,slotRetargets:[{shotId:'s07',kind:'identity',query:'官方资料',field:'src2'}]};
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,options).repairs.length,1);
 assert.equal(f.result.shots[0].templateParams.cardProps.src2,'remotion/public/pages/source.png');
 delete f.result.shots[0].templateParams.cardProps.src2;
 row.research[0].displayField='src3';assert.equal(restoreEditorialBoundSlots(f.result,f.request,options).repairs.length,0);
 row.research[0].displayField='src2';row.bindings[0].displayShotId='s08';f.result.shots[0].id='s08';f.request.editableShotIds=['s08'];
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,options).repairs.length,0);
});


test('无research的内部资料按本请求固定槽和核验文件恢复，重复继续无副作用',t=>{
 const f=fixture(t),b=f.request.baseProposal.materialResearch.shots[0].bindings[0];
 delete b.kind;delete b.query;
 for(const row of [f.request.baseProposal.materialResearch.shots[0],f.result.materialResearch.shots[0]]){
   row.research=[];delete row.bindings;row.materialBindings=[structuredClone(b)];
 }
 f.result.shots[0].templateParams.templateMaterialQueries={};
 const before=structuredClone(f.request),r=restoreEditorialBoundSlots(f.result,f.request,f.options);
 assert.equal(r.repairs.length,1);assert.equal(r.repairs[0].internal,true);assert.deepEqual(r.rejected,[]);
 assert.equal(f.result.shots[0].templateParams.cardProps.src,'remotion/public/pages/source.png');
 assert.equal(restoreEditorialBoundSlots(f.result,f.request,f.options).repairs.length,0);assert.deepEqual(f.request,before);
 for(const mutate of [g=>g.result.materialResearch.shots[0].materialBindings[0].sha256='changed',
   g=>g.options.catalog.cards[0].policy.media={},g=>g.result.shots[0].templateParams.cardProps.src='different.png',
   g=>g.result.shots[0].templateParams.templateMaterialQueries.src='改成会议照片',
   g=>g.request.baseProposal.materialResearch.shots[0].materialBindings[0].licenseVerified=false]){
   const g=structuredClone({...f,options:{catalog:f.options.catalog,projectRoot:f.options.projectRoot}});
   delete g.result.shots[0].templateParams.cardProps.src;mutate(g);
   assert.equal(restoreEditorialBoundSlots(g.result,g.request,g.options).repairs.length,0);
   assert.equal(restoreEditorialBoundSlots(g.result,g.request,g.options).rejected.length,1);
 }
});
