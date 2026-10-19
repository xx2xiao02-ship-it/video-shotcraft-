import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {proposeInstitutionSourceRepair,executeInstitutionSourceRepair} from './talkcraft-institution-source-repair.mjs';
import {planNodeCorrection} from './talkcraft-correction-center.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'institution-source-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const put=(n,x)=>{fs.mkdirSync(path.dirname(path.join(p,n)),{recursive:true});fs.writeFileSync(path.join(p,n),typeof x==='string'?x:JSON.stringify(x));};
 for(const n of ['input.txt','aligned-sentences.json','audio/full.mp3'])put(n,'current');
 const source={kind:'identity',query:'甲机构官方报告',field:'src',localPath:'pages/detail.png',sha256:sha('image'),
  sourceUrl:'https://example.gov.cn/report',sourceVerified:true,licenseVerified:true,license:'已核验限定报告使用',licenseUrl:'https://example.gov.cn/terms',identityReason:'已核验甲机构官方报告',contentLanguage:'zh-CN',sourceCoordinates:'pages/targets.json'};
 put('remotion/public/pages/detail.png','image');put('remotion/public/pages/targets.json',{url:source.sourceUrl,text:'网站主办单位：甲机构办公厅'});
 const row={shotId:'s07',research:[{kind:'identity',entityType:'other',query:source.query},{kind:'identity',entityType:'other',entityName:'甲机构',query:'甲机构标志'}],bindings:[source]};
 put('material-research-plan.json',{shots:[row]});put('remotion/shots.json',[{id:'s07',templateParams:{cardProps:{src:'remotion/public/'+source.localPath}}}]);
 return {p,put,row,source,save:()=>put('material-research-plan.json',{shots:[row]})};
}
test('节点提出唯一同机构官方原件替代、中心审批，执行保持检索历史与授权范围且重复继续不重写',async t=>{
 const f=fixture(t),plan=proposeInstitutionSourceRepair(f.p);assert.equal(plan.alternatives.length,1);assert.equal(plan.grantsLogoRights,false);
 const ctx={run:{runId:'current',provenance:{verified:true},nextStage:'candidates',lastFailure:{task:{name:'talkcraft-candidates'}}},
  feedback:{failedChecks:[{shotId:'s07',code:'REAL_SOURCE_NOT_BOUND'}]},attempts:[{fingerprint:'f',action:'local-recheck'}],fingerprint:'f',institutionRepair:plan};
 const approval=planNodeCorrection(ctx);assert.equal(approval.action,'institution-source-reuse');assert.equal(approval.approved,true);
 f.put('qa/correction-center.json',approval);let requests=0;
 const out=await executeInstitutionSourceRepair(f.p,{fetchImpl:async url=>{requests++;return {ok:true,url,text:async()=>'甲机构官方报告'};}});
 assert.equal(requests,1);assert.equal(out.paidCalls,0);assert.equal(out.productionAdmitted,false);
 const saved=JSON.parse(fs.readFileSync(path.join(f.p,'material-research-plan.json'))).shots[0];
 assert.deepEqual(saved.research,f.row.research);assert.deepEqual(saved.bindings[0],f.source);
 assert.equal(saved.bindings[1].query,'甲机构标志');assert.equal(saved.bindings[1].localPath,f.source.localPath);
 assert.equal(saved.bindings[1].license,f.source.license);assert.equal(saved.bindings[1].sourceAlternative.grantsLogoRights,false);
 assert.equal(proposeInstitutionSourceRepair(f.p),null);
 await assert.rejects(executeInstitutionSourceRepair(f.p,{fetchImpl:()=>assert.fail('重复继续不能再次请求')}),/发生变化/);
});
test('人物、数据、不同机构、未核验许可、非官方域和损坏文件均不能替代',t=>{
 const f=fixture(t),need=f.row.research[1];
 for(const change of [()=>need.entityType='person',()=>need.kind='data',()=>need.entityName='乙机构',
   ()=>f.source.licenseVerified=false,()=>f.source.sourceVerified='true',()=>f.source.sourceUrl='https://other.example/report']){
  const original=structuredClone(f.row);change();f.save();assert.equal(proposeInstitutionSourceRepair(f.p),null);
  Object.keys(f.row).forEach(k=>delete f.row[k]);Object.assign(f.row,original);
  // Restore captured object references for the next independent case.
  f.row.research[1]=need;Object.assign(need,original.research[1]);f.row.bindings[0]=f.source;Object.assign(f.source,original.bindings[0]);
 }
 f.save();f.put('remotion/public/pages/detail.png','changed');assert.equal(proposeInstitutionSourceRepair(f.p),null);
});
test('不可访问或跳转其他机构的原件不执行绑定事务',async t=>{
 const f=fixture(t),plan=proposeInstitutionSourceRepair(f.p);
 f.put('qa/correction-center.json',{approved:true,action:'institution-source-reuse',sourcePlan:plan});
 const before=fs.readFileSync(path.join(f.p,'material-research-plan.json'),'utf8');
 await assert.rejects(executeInstitutionSourceRepair(f.p,{fetchImpl:async()=>({ok:true,url:'https://other.gov.cn/report'})}),/不可访问/);
 assert.equal(fs.readFileSync(path.join(f.p,'material-research-plan.json'),'utf8'),before);
});
