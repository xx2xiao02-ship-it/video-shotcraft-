import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {repairEditorialSourceSlotAliases} from './talkcraft-editorial-source-slot-repair.mjs';
import {restoreEditorialBoundSlots} from './talkcraft-editorial-bound-slots.mjs';
function fixture(t){
 const projectRoot=fs.mkdtempSync(path.join(os.tmpdir(),'source-slot-alias-'));t.after(()=>fs.rmSync(projectRoot,{recursive:true,force:true}));
 fs.mkdirSync(path.join(projectRoot,'remotion/public'),{recursive:true});fs.writeFileSync(path.join(projectRoot,'remotion/public/doc.png'),'verified');
 const source={kind:'identity',localPath:'doc.png',sha256:createHash('sha256').update('verified').digest('hex'),sourceVerified:true,licenseVerified:true,
  sourceUrl:'https://example.gov.cn/source',license:'限定文件许可',licenseUrl:'https://example.gov.cn/terms',identityReason:'已核验身份',contentLanguage:'zh-CN'};
 const rows=['s04','s11'].map((shotId,i)=>({shotId,research:[{kind:'identity',query:'source'+i,reason:'原设计',displayShotId:'s11',displayField:'src'+(i+1)}],
  bindings:[{...source,query:'source'+i,displayShotId:'s11',field:'src'+(i+1)}]}));
 const baseProposal={shots:[{id:'s04',shotCard:'locked',templateParams:{cardProps:{text:'保留'}}},{id:'s11',shotCard:'old',templateParams:{cardProps:{}}}],materialResearch:{shots:rows}};
 const request={requestId:'current',editableShotIds:['s11'],baseProposal:structuredClone(baseProposal)},result=structuredClone(baseProposal);
 result.shots[1].shotCard='new';result.shots[1].templateParams={cardProps:{title:'本次模型内容'},templateMaterialQueries:{src:'两项身份资料'}};
 result.materialResearch.shots[1].research[0].displayField='src';
 const options={projectRoot,catalog:{cards:[{cardId:'new',policy:{media:{src:'image'}}}]}};
 return {request,result,options};
}
test('同一已核验文件的旧字段别名可跟随本次明确单槽设计免费修正，再由原恢复器和门禁核验',t=>{
 const f=fixture(t),before=structuredClone(f.request),locked=structuredClone(f.result.shots[0]);
 const aliases=repairEditorialSourceSlotAliases(f.result,f.request,f.options);assert.equal(aliases.length,2);
 for(const row of f.result.materialResearch.shots){assert.equal(row.research[0].displayField,'src');assert.equal(row.bindings[0].field,'src');assert.equal(row.bindings[0].license,'限定文件许可');}
 const restored=restoreEditorialBoundSlots(f.result,f.request,{...f.options,sourceSlotAliases:aliases,slotRetargets:aliases});
 assert.equal(restored.rejected.length,0);assert.equal(f.result.shots[1].templateParams.cardProps.src,'remotion/public/doc.png');
 assert.deepEqual(f.result.shots[0],locked);assert.deepEqual(f.request,before);
 assert.deepEqual(repairEditorialSourceSlotAliases(f.result,f.request,f.options),[]);
});
test('不同文件、许可缺失、哈希变化、跨目标、新有效槽、多候选槽或缺少本次明确落点均不推断',t=>{
 for(const change of [f=>f.result.materialResearch.shots[0].bindings[0].localPath='other.png',
 f=>f.request.baseProposal.materialResearch.shots[0].bindings[0].licenseVerified=false,
 f=>fs.writeFileSync(path.join(f.options.projectRoot,'remotion/public/doc.png'),'changed'),
 f=>f.result.materialResearch.shots[0].research[0].displayShotId='other',
 f=>f.result.materialResearch.shots[0].research[0].displayField='guessed',
 f=>f.options.catalog.cards[0].policy.media.src2='image',
 f=>f.result.materialResearch.shots[1].research[0].displayField='src2']){
  const f=fixture(t);change(f);const before=structuredClone(f.result);
  const report=repairEditorialSourceSlotAliases(f.result,f.request,f.options);
  assert.deepEqual(report,[]);assert.deepEqual(f.result,before);
 }
});
