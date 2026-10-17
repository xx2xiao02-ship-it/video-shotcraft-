import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {auditEditorialMaterialContract} from './talkcraft-editorial-material-contract.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {auditEditorialProposal,compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {auditEditorialRequestContract} from './talkcraft-editorial-request-audit.mjs';
import {buildEditorialPlanningContract} from './talkcraft-editorial-planning-contract.mjs';

const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8'));
const catalog=loadTalkcraftGovernedCatalog(index);
const fixture=(card='tracking-in',need='身份')=>({catalog,projectRoot:process.cwd(),
  sentences:[{i:0,text:'原文不变。',sem:['论点'],need:[need],weight:'main',entities:[]}],
  shots:[{id:'s01',firstSentence:0,lastSentence:0,start:0,end:3,subject:'other',shotCard:card,
    templateParams:{cardProps:{text:'原文不变。'},materialRole:'真实资料'}}],
  researchPlan:{shots:[{shotId:'s01',research:[{kind:need==='量化'?'data':'identity',query:'指定机构原始资料',reason:'核验身份与原始论述'}]}]}});
const codes=value=>auditEditorialMaterialContract(value).issues.map(i=>i.code);

test('有资料要求却没有原卡媒体槽，在04结构检查中拒绝，不能等06重复检索',()=>{
  for(const card of ['tracking-in','source-converge','focus-dim-spotlight','quote-card']){
    const args=fixture(card),before=structuredClone(args);assert.ok(codes(args).includes('MATERIAL_DISPLAY_SLOT_UNAVAILABLE'));
    assert.deepEqual(args,before);
  }
});
test('双图模板不能声明无外部素材；检索词仅是采集待办，不是素材验收',()=>{
  const args=fixture('split-compare-slider');args.researchPlan.shots[0].research=[];args.sentences[0].need=['对比'];
  args.shots[0].templateParams.materialRole='无外部素材，原卡解释信息';
  assert.equal(codes(args).filter(c=>c==='MATERIAL_SLOT_PLAN_REQUIRED').length,2);
  assert.ok(codes(args).includes('MATERIAL_ROLE_CONFLICT'));
  args.shots[0].templateParams.templateMaterialQueries={srcBefore:'真实央行建筑',srcAfter:'真实日常消费'};
  assert.ok(codes(args).includes('MATERIAL_ROLE_CONFLICT'));
  args.shots[0].templateParams.materialRole='真实图片对比';
  const report=auditEditorialMaterialContract(args);assert.equal(report.passed,true);
  assert.equal(report.pending.filter(i=>i.code==='MATERIAL_ACQUISITION_PENDING').length,2);
  assert.equal(report.materialsVerified,false);assert.equal(report.productionAdmitted,false);
});
test('研究的多图入口必须明确逐条指向，不能把文字、背景或hostSrc当资料槽',()=>{
  const args=fixture('rack-focus-pair');args.shots[0].templateParams.templateMaterialQueries={srcFront:'机构原文',srcBack:'研究原文'};
  assert.ok(codes(args).includes('MATERIAL_DISPLAY_FIELD_REQUIRED'));
  for(const displayField of ['labelFront','materialSrc','hostSrc']){
    args.researchPlan.shots[0].research[0].displayField=displayField;
    assert.ok(codes(args).includes('MATERIAL_DISPLAY_FIELD_REQUIRED'));
  }
  args.researchPlan.shots[0].research[0].displayField='srcFront';
  assert.equal(auditEditorialMaterialContract(args).passed,true);
});
test('已绑定素材按真实槽位追溯，兼容历史binding没有field，不要求重新采集',()=>{
  const args=fixture('rack-focus-pair'),row=args.researchPlan.shots[0];
  args.shots[0].templateParams.cardProps={srcFront:'pages/official.png',srcBack:'pages/official.png'};
  row.bindings=[{kind:'identity',query:row.research[0].query,localPath:'pages/official.png'}];
  const result=auditEditorialMaterialContract(args);assert.equal(result.passed,true);
  assert.equal(result.pending.length,0);assert.equal(result.materialsVerified,false);
});
test('人物生成阶段只递延真实host，不要求虚构提前生成口型',()=>{
  const args=fixture('full-bleed-host');args.shots[0].subject='person';args.sentences[0].need=['强调'];args.researchPlan.shots[0].research=[];
  // Use the real card with a host/image alternative from the locked catalog.
  const card=catalog.cards.find(c=>c.policy.mediaAlternatives.some(g=>g.includes('hostSrc')));
  assert.ok(card);args.shots[0].shotCard=card.cardId;
  const result=auditEditorialMaterialContract(args);
  assert.equal(result.issues.length,0);assert.equal(result.pending.length,0);
});
test('缺少量化来源不能自动改成作者观点，批准后的强调标注不强造数据要求',()=>{
  const args=fixture('tracking-in','量化');args.researchPlan.shots[0].research=[];
  const before=structuredClone(args);assert.ok(codes(args).includes('MATERIAL_RESEARCH_PLAN_REQUIRED'));assert.deepEqual(args,before);
  args.sentences[0].need=['强调'];args.researchPlan.shots[0].claimClassification={kind:'author-opinion',reason:'用户已明确批准'};
  assert.equal(auditEditorialMaterialContract(args).passed,true);
});
test('跨镜集中展示只接受当前稿件音频的批准，核心人物不得延后',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'material-display-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'qa'));fs.mkdirSync(path.join(root,'audio'));fs.writeFileSync(path.join(root,'script.txt'),'原文');fs.writeFileSync(path.join(root,'audio/full.mp3'),'测试输入，不作媒体验收');
  const args=fixture();args.projectRoot=root;
  args.shots.push({id:'s02',firstSentence:1,lastSentence:1,shotCard:'rack-focus-pair',templateParams:{cardProps:{srcFront:'one.png',srcBack:'two.png'}}});
  args.researchPlan.shots.push({shotId:'s02',research:[]});
  const r=args.researchPlan.shots[0].research[0];r.displayShotId='s02';r.displayField='srcFront';r.displayReason='保留短开场，在后续资料镜展示';
  assert.ok(codes(args).includes('MATERIAL_DEFERRED_DISPLAY_NOT_APPROVED'));
  const sha=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
  fs.writeFileSync(path.join(root,'qa/material-display-policy-approval.json'),JSON.stringify({policy:'concentrated-sources',authorizedBy:'user',sourceShotIds:['s01'],scriptSha256:sha('script.txt'),audioSha256:sha('audio/full.mp3')}));
  assert.equal(auditEditorialMaterialContract(args).passed,true);
  r.entityType='person';r.entityName='核心学者';args.researchPlan.shots[0].personDisplays=[{entityName:'核心学者',role:'core'}];
  assert.ok(codes(args).includes('MATERIAL_DEFERRED_DISPLAY_NOT_APPROVED'));
  r.entityType='other';fs.writeFileSync(path.join(root,'script.txt'),'改稿');
  assert.ok(codes(args).includes('MATERIAL_DEFERRED_DISPLAY_NOT_APPROVED'));
});
test('真实04提案入口调用同一规则并集中反馈，不改变原稿和配音时长',()=>{
  const args=fixture(),result={sentences:args.sentences,shots:args.shots,materialResearch:args.researchPlan};
  result.shots[0].nativePresentation={holdAtNativeFrame:30,holdReason:'原卡主体仍可见'};
  const before=structuredClone(result);
  const audit=auditEditorialProposal(result,{semantics:{sentences:args.sentences},aligned:[{start:0,end:3}],vocab:new Set(['论点']),catalog,projectRoot:process.cwd()});
  assert.ok(audit.issues.some(i=>i.code==='MATERIAL_DISPLAY_SLOT_UNAVAILABLE'));assert.deepEqual(result,before);
});
test('模型侧素材规则与108卡真实媒体槽逐项自检，遗漏或篡改时发送前失败',()=>{
  const make=()=>({catalog,promptCatalog:compactTalkcraftEditorialCatalog(index,catalog),planningContract:buildEditorialPlanningContract({aligned:[{start:0,end:2.36}],catalog})});
  assert.equal(auditEditorialRequestContract(make()).passed,true);
  const text=make();delete text.promptCatalog.materialDisplayRules;assert.equal(auditEditorialRequestContract(text).passed,false);
  const wrong=make();wrong.promptCatalog.contracts.find(c=>c.slug==='tracking-in').sourceDisplayFields=['src'];
  assert.equal(auditEditorialRequestContract(wrong).passed,false);
});
