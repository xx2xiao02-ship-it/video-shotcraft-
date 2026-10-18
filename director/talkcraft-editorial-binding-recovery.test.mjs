import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {restoreEditorialReviewedBindings} from './talkcraft-editorial-binding-recovery.mjs';
import {saveCandidateMaterialRepairFeedback,preserveCandidateMaterialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {auditEditorialMaterialContract} from './talkcraft-editorial-material-contract.mjs';
const catalog={cards:[{cardId:'pair',policy:{media:{srcFront:'image',srcBack:'image'}}}]};
function fixture(t,configure=()=>{}){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'reviewed-recovery-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 for(const d of ['qa','audio','remotion/public/pages'])fs.mkdirSync(path.join(p,d),{recursive:true});
 const write=(n,v)=>fs.writeFileSync(path.join(p,n),JSON.stringify(v));
 write('input.txt','同一原稿');write('aligned-sentences.json',[{start:0,end:8}]);write('audio/full.mp3','existing audio');
 write('semantics.json',{sentences:[{i:0,text:'两位学者',shot:'s11'}]});
 const bytes=Buffer.from('existing reviewed source'),sha=createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(p,'remotion/public/pages/source.png'),bytes);
 const shot={id:'s11',firstSentence:0,lastSentence:0,subject:'person',shotCard:'pair',templateParams:{cardProps:{labelFront:'甲',labelBack:'乙',srcFront:'pages/source.png',srcBack:'pages/source.png'}}};
 const binding={kind:'identity',localPath:'pages/source.png',sha256:sha,sourceUrl:'https://institution.example/profile',sourceVerified:true,licenseVerified:true,license:'permitted text',licenseUrl:'https://institution.example/rights',identityReason:'机构原文说明身份',contentLanguage:'zh-CN'};
 const row={shotId:'s11',research:['甲','乙'].map(n=>({kind:'identity',entityType:'person',entityName:n,query:n+'原查询',reason:'身份核验'})),
  personDisplays:['甲','乙'].map((n,i)=>({entityName:n,role:'core',presentation:'official-profile',bindingQuery:n+'原查询',labelField:i?'labelBack':'labelFront',labelText:n})),
  bindings:['甲','乙'].map((n,i)=>({...binding,query:n+'原查询',field:i?'srcBack':'srcFront'}))};
 const oldShots=[shot],oldRows=[row];configure({shot,row,oldShots,oldRows,binding,p});
 write('remotion/shots.json',oldShots);write('material-research-plan.json',{shots:oldRows});
 saveCandidateMaterialRepairFeedback(p,{passed:false,materialIssues:[{shotId:'s11',code:'EXAMPLE'}]});
 const snapshot=path.join(p,'qa/storyboard-revisions/verified');preserveCandidateMaterialRepairFeedback(p,snapshot);
 fs.unlinkSync(path.join(p,'remotion/shots.json'));fs.unlinkSync(path.join(p,'material-research-plan.json'));
 const proposal={sentences:[{i:0,text:'两位学者',need:['身份']}],shots:structuredClone(oldShots),materialResearch:{shots:structuredClone(oldRows)}};
 proposal.shots[0].templateParams.cardProps.srcFront='';proposal.shots[0].templateParams.cardProps.srcBack='';
 proposal.materialResearch.shots[0].research.forEach(r=>{r.query=r.entityName+'新查询';});
 proposal.materialResearch.shots[0].bindings=[];
 return {p,proposal,snapshot,write};
}
test('同一人物与原卡从指纹快照恢复双槽资料，保留真实句序、选卡与原始返回',t=>{
 const f=fixture(t),before=structuredClone(f.proposal);let out=restoreEditorialReviewedBindings(f.p,f.proposal,catalog);
 assert.equal(out.repairs.length,2);assert.equal(out.rejected.length,0);assert.deepEqual(f.proposal,before);
 assert.deepEqual(out.result.shots.map(s=>[s.shotCard,s.firstSentence,s.lastSentence,s.subject]),before.shots.map(s=>[s.shotCard,s.firstSentence,s.lastSentence,s.subject]));
 assert.equal(out.result.materialResearch.shots[0].research[1].displayField,'srcBack');
 assert.equal(out.result.materialResearch.shots[0].personDisplays[0].bindingQuery,'甲新查询');
 assert.equal(auditEditorialMaterialContract({shots:out.result.shots,sentences:out.result.sentences,researchPlan:out.result.materialResearch,catalog,projectRoot:f.p}).passed,true);
 assert.equal(restoreEditorialReviewedBindings(f.p,out.result,catalog).repairs.length,0);
});
test('新方案已绑不同文件或明确不同槽位时不覆盖，仍保留原检查阻断',t=>{
 const f=fixture(t);f.proposal.shots[0].templateParams.cardProps.srcFront='pages/new.png';
 f.proposal.materialResearch.shots[0].research[1].displayField='srcFront';
 const out=restoreEditorialReviewedBindings(f.p,f.proposal,catalog);assert.equal(out.repairs.length,0);assert.equal(out.rejected.length,2);
 assert.deepEqual(out.result,f.proposal);
});
test('原卡、句段或姓名标签变化时不猜测旧绑定，不代编导选卡',t=>{
 const f=fixture(t);
 for(const key of ['shotCard','firstSentence','subject']){
  const changed=structuredClone(f.proposal);changed.shots[0][key]=key==='firstSentence'?1:'changed';
  assert.equal(restoreEditorialReviewedBindings(f.p,changed,catalog).repairs.length,0);
 }
 f.proposal.shots[0].templateParams.cardProps.labelFront='另一人';f.proposal.shots[0].templateParams.cardProps.labelBack='又一人';
 assert.equal(restoreEditorialReviewedBindings(f.p,f.proposal,catalog).repairs.length,0);
});
test('原稿、旧快照或真实文件变化后拒绝恢复',t=>{
 const f=fixture(t);f.write('input.txt','新原稿');assert.equal(restoreEditorialReviewedBindings(f.p,f.proposal,catalog).repairs.length,0);
 f.write('input.txt','同一原稿');fs.writeFileSync(path.join(f.p,'remotion/public/pages/source.png'),'changed');
 assert.equal(restoreEditorialReviewedBindings(f.p,f.proposal,catalog).rejected.length,2);
 f.write(path.relative(f.p,path.join(f.snapshot,'material-research-plan.json')),{shots:[]});
 assert.equal(restoreEditorialReviewedBindings(f.p,f.proposal,catalog).repairs.length,0);
});

test('旧来源或许可未核验时不恢复，不补造授权',t=>{
 for(const key of ['sourceVerified','licenseVerified','license','licenseUrl','sourceUrl','identityReason']){
  const f=fixture(t,({row})=>row.bindings.forEach(b=>{delete b[key];}));
  const out=restoreEditorialReviewedBindings(f.p,f.proposal,catalog);
  assert.equal(out.repairs.length,0,key);assert.equal(out.rejected.length,2,key);
  assert.deepEqual(out.result,f.proposal);
 }
});

test('历史分镜没有资料计划时保持原提案，不因可选旧文件缺失而新增阻断',t=>{
 const f=fixture(t);
 for(const name of ['semantics.json','remotion/shots.json'])fs.copyFileSync(path.join(f.snapshot,name),path.join(f.p,name));
 saveCandidateMaterialRepairFeedback(f.p,{passed:false,materialIssues:[{shotId:'s11',code:'EXAMPLE'}]});
 preserveCandidateMaterialRepairFeedback(f.p,path.join(f.p,'qa/storyboard-revisions/no-materials'));
 fs.unlinkSync(path.join(f.p,'remotion/shots.json'));
 const out=restoreEditorialReviewedBindings(f.p,f.proposal,catalog);
 assert.deepEqual(out.result,f.proposal);assert.equal(out.repairs.length,0);
});

test('跨镜资料随相同句段目标恢复，人物双槽仍逐人绑定',t=>{
 const f=fixture(t,({oldShots,oldRows,binding})=>{
  oldShots.push({id:'s04',firstSentence:1,lastSentence:1,subject:'text',shotCard:'title',templateParams:{cardProps:{}}});
  oldRows.push({shotId:'s04',research:[{kind:'identity',query:'奖项原始来源',displayShotId:'s11',displayField:'srcFront'}],
   bindings:[{...binding,query:'奖项原始来源',field:'srcFront',displayShotId:'s11'}]});
 });
 f.proposal.shots[0].id='s12';f.proposal.materialResearch.shots[0].shotId='s12';
 f.proposal.materialResearch.shots[1].research[0].displayShotId='s12';
 const out=restoreEditorialReviewedBindings(f.p,f.proposal,catalog);
 assert.equal(out.repairs.length,3);assert.equal(out.rejected.length,0);
 assert.equal(out.result.materialResearch.shots[1].bindings[0].displayShotId,'s12');
 assert.equal(out.result.shots[0].templateParams.cardProps.srcFront,'remotion/public/pages/source.png');
});
