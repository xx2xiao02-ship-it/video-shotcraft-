import {editorialReplayBatch} from './talkcraft-editorial-selection-replay.mjs';
import {auditEditorialSelectionRequest} from './talkcraft-editorial-selection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {buildEditorialJointRepairContract,auditEditorialJointRepairContract} from './talkcraft-editorial-joint-repair.mjs';
import {auditEditorialMaterialContract} from './talkcraft-editorial-material-contract.mjs';
import {buildEditorialPlanningContract} from './talkcraft-editorial-planning-contract.mjs';
import {auditEditorialRequestContract} from './talkcraft-editorial-request-audit.mjs';
import {compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {buildEditorialSelectionRequest} from './talkcraft-editorial-selection.mjs';

test('素材恢复失败后的重选按真实已存在文件限制必需媒体容量，不再选缺同样素材的卡',t=>{
 const args=fixture(),dir=fs.mkdtempSync(path.resolve('.tmp/reuse-capacity-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));args.projectRoot=dir;
 args.failedChecks=[{shotId:'s07',code:'local_material_unmatched',field:'src1'}];
 const row=args.proposal.materialResearch.shots.find(r=>r.shotId==='s07');
 let w=buildEditorialJointRepairContract(args).windows[0];
 assert.equal(w.reuseMediaBudget.available,0);
 assert.ok(w.rejected.AVAILABLE_MEDIA_CAPACITY_EXCEEDED.includes('filmstrip-conveyor'));
 assert.ok(w.candidates.every(c=>!c.sourceDisplayFields.length));
 fs.mkdirSync(path.join(dir,'remotion/public/pages'),{recursive:true});
 fs.writeFileSync(path.join(dir,'remotion/public/pages/a.png'),'source');
 row.bindings=[{kind:'identity',query:'原机构资料',localPath:'pages/a.png',sha256:createHash('sha256').update('source').digest('hex')}];
 row.research=[{kind:'identity',query:'原机构资料',reason:'身份',displayShotId:'s07',displayField:'src'}];
 w=buildEditorialJointRepairContract(args).windows[0];assert.equal(w.reuseMediaBudget.available,1);
 assert.equal(w.requiresSource,true);assert.ok(w.candidates.every(c=>c.sourceDisplayFields.length));
 assert.ok(w.rejected.AVAILABLE_MEDIA_CAPACITY_EXCEEDED.includes('douyin-follow-card'));
 assert.ok(w.rejected.BOUND_SOURCE_SCALAR_SLOT_REQUIRED.includes('word-relay-filmstrip'));
 assert.ok(w.rejected.SOURCE_DISPLAY_SLOT_REQUIRED.includes('source-converge'));
 row.research.push({kind:'identity',query:'尚未核验的头像',reason:'不得冒充已采集',displayShotId:'s07',displayField:'src'});
 args.failedChecks=[{shotId:'s07',code:'FILM_TEXT_DOMINANCE',shotIds:['s07']}];
 w=buildEditorialJointRepairContract(args).windows[0];assert.equal(w.reuseMediaBudget.available,1);
 assert.ok(w.rejected.AVAILABLE_MEDIA_CAPACITY_EXCEEDED.includes('douyin-follow-card'));
 row.bindings[0].sha256='bad';
 w=buildEditorialJointRepairContract(args).windows[0];assert.equal(w.reuseMediaBudget.available,0);
 assert.equal(w.candidates.length,0);
});

const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8'));
const catalog=loadTalkcraftGovernedCatalog(index);
function fixture(){
  let cursor=10;
  const aligned=[275,254,234,165].map(frames=>{const start=cursor;cursor+=frames/30;return {start,end:cursor};});
  const ids=['s07','s14','s15','s21'],cards=['info-card-assemble','focus-dim-spotlight','callout-line-label','outline-box-title'];
  const shots=ids.map((id,i)=>({id,firstSentence:i,lastSentence:i,subject:i===1||i===3?'person':'other',shotCard:cards[i],
    templateParams:{cardProps:{}},nativePresentation:{playbackRate:1,holdAtNativeFrame:100,holdReason:'内容仍可见'}}));
  const proposal={shots,sentences:ids.map((id,i)=>({i,text:'保持真实原文',need:i===1||i===2?['身份']:['强调'],shot:id})),
    materialResearch:{shots:ids.map((shotId,i)=>({shotId,research:i===1||i===2?[
      {kind:'identity',query:i===1?'伍德福德机构资料':'央行官方资料',reason:'身份真实展示',displayShotId:shotId,displayField:'src'}]:[]}))}};
  const personWindows=[1,3].map(i=>({...aligned[i],firstSentence:i,lastSentence:i}));
  return {proposal,aligned,catalog,personWindows,projectRoot:process.cwd(),failedChecks:[
    {shotId:'s14',code:'MATERIAL_DISPLAY_SLOT_UNAVAILABLE'},
    {shotId:'s15',code:'NATIVE_EDITORIAL_PLAN'},{shotId:'s15',code:'MATERIAL_DISPLAY_SLOT_UNAVAILABLE'},
    {shotId:'s21',code:'NATIVE_EDITORIAL_PLAN'}]};
}

test('三个真实失败模式联合计算，不能让时长可行但无资料槽的卡再次混入',()=>{
  const args=fixture(),before=structuredClone(args),report=buildEditorialJointRepairContract(args);
  assert.deepEqual(args,before);assert.equal(report.reviewedCount,108);
  assert.deepEqual(report.windows.map(w=>w.shotId),['s14','s15','s21']);
  const [s14,s15,s21]=report.windows;
  assert.equal(s14.frames,254);assert.equal(s15.frames,234);assert.equal(s21.frames,165);
  assert.ok(s14.requiresSource&&s15.requiresSource);assert.equal(s21.requiresSource,false);
  assert.ok(s14.rejected.SOURCE_DISPLAY_SLOT_REQUIRED.includes('focus-dim-spotlight'));
  assert.ok(s15.rejected.SOURCE_DISPLAY_SLOT_REQUIRED.includes('callout-line-label'));
  assert.ok(s15.rejected.TIMING_OR_SUBJECT_INCOMPATIBLE.includes('callout-line-label'));
  for(const w of [s14,s15]){
    assert.ok(w.candidates.length>0);assert.ok(w.candidates.every(c=>c.sourceDisplayFields.length>0));
    assert.ok(w.selected.issues.some(i=>i.code==='MATERIAL_DISPLAY_SLOT_UNAVAILABLE'));
  }
  assert.ok(s21.selected.issues.some(i=>i.code==='NATIVE_EDITORIAL_PLAN'));
  assert.equal(s21.selected.requestedPlaybackRate,1);assert.equal(s21.selected.timing,null);
  const slower=s21.candidates.find(c=>c.slug==='outline-box-title');
  assert.equal(slower.timing.requestedPlaybackRate,.85);assert.ok(slower.timing.holdFrames<=60);
  assert.ok(slower.timing.actualRates.every(r=>r>=.85&&r<=1.15));
  assert.equal(slower.timing.visibilityVerified,false);assert.equal(report.productionAdmitted,false);
});

test('完整108卡比较仍保留原去重门禁，修订组内冲突不得误当固定占用或自动承接',()=>{
  const args=fixture(),report=buildEditorialJointRepairContract(args),s14=report.windows[0];
  assert.ok(s14.rejected.FIXED_SHOT_REUSE_CONFLICT.includes('info-card-assemble'));
  for(const w of report.windows){
    const compared=new Set([...w.candidates.map(c=>c.slug),...Object.values(w.rejected).flat()]);
    assert.equal(compared.size,108);assert.equal(Object.hasOwn(w,'selectedCard'),false);
  }
  args.failedChecks.push({shotId:'s07',code:'GROUP_REPLAN'});
  const group=buildEditorialJointRepairContract(args).windows.find(w=>w.shotId==='s14');
  assert.ok(!group.rejected.FIXED_SHOT_REUSE_CONFLICT?.includes('info-card-assemble'));
  assert.ok(group.rejected.HOST_CONTENT_REGION_CONFLICT.includes('info-card-assemble'));
  assert.ok(!group.candidates.some(c=>c.slug==='info-card-assemble')); // 去重解锁不豁免空间冲突
  assert.equal(args.proposal.shots[1].shotCard,'focus-dim-spotlight');
});

test('集中展示的入向资料形成目标镜的真实槽需求，非法核心人物延后仍要求本镜资料',()=>{
  const args=fixture(),row=args.proposal.materialResearch.shots[1];
  row.research[0].displayShotId='s21';
  row.research[0].entityType='person';row.research[0].entityName='迈克尔·伍德福德';
  row.personDisplays=[{entityName:'迈克尔·伍德福德',role:'core'}];
  const report=buildEditorialJointRepairContract(args);
  assert.equal(report.windows.find(w=>w.shotId==='s14').requiresSource,true);
  const target=report.windows.find(w=>w.shotId==='s21');
  assert.equal(target.requiresSource,true);assert.equal(target.obligations[0].sourceShotId,'s14');
  assert.ok(report.materialIssues.some(i=>i.code==='MATERIAL_DEFERRED_DISPLAY_NOT_APPROVED'));
  assert.ok(!target.candidates.some(c=>c.slug==='outline-box-title'));
});

test('核心人物换卡沿用旧姓名字段在04提前拒绝，不要求提前采集文件或改原模板',()=>{
  const args=fixture(),row=args.proposal.materialResearch.shots[1],shot=args.proposal.shots[1];
  row.personDisplays=[{entityName:'迈克尔·伍德福德',role:'core',labelField:'title',labelText:'迈克尔·伍德福德'}];
  const audit=()=>auditEditorialMaterialContract({shots:args.proposal.shots,sentences:args.proposal.sentences,
    researchPlan:args.proposal.materialResearch,catalog,projectRoot:process.cwd()});
  assert.ok(audit().issues.some(i=>i.code==='MATERIAL_PERSON_LABEL_PLAN_INVALID'));
  row.personDisplays[0].labelField='labelA';shot.templateParams.cardProps.labelA='迈克尔·伍德福德';
  const result=audit();assert.ok(!result.issues.some(i=>i.code==='MATERIAL_PERSON_LABEL_PLAN_INVALID'));
  assert.ok(result.issues.some(i=>i.code==='MATERIAL_DISPLAY_SLOT_UNAVAILABLE'));
  assert.equal(result.materialsVerified,false);
});

test('联合契约漏传、速度证据篡改及输入过期均在请求自检被拒绝',()=>{
  const inputs=fixture(),contract=buildEditorialJointRepairContract(inputs);
  assert.deepEqual(auditEditorialJointRepairContract(contract,inputs),[]);
  const planningContract=buildEditorialPlanningContract({...inputs,previousShots:inputs.proposal.shots});
  // This synthetic example begins after the opening, so test the joined gate
  // separately from full-film coverage; the production integration needs both.
  const args={catalog,promptCatalog:compactTalkcraftEditorialCatalog(index,catalog),
    planningContract,repairInputs:inputs};
  assert.ok(auditEditorialRequestContract(args).issues.some(s=>s.includes('联合修订')));
  planningContract.jointRepair=contract;
  assert.ok(!auditEditorialRequestContract(args).issues.some(s=>s.includes('联合修订')));
  assert.ok(auditEditorialRequestContract(args).issues.some(s=>s.includes('局部修订')));
  args.selectionRequest=buildEditorialSelectionRequest(inputs);
  assert.ok(!auditEditorialRequestContract(args).issues.some(s=>s.includes('局部修订')));
  args.selectionRequest.windows[0].choices[0].timing.requestedPlaybackRate=1.3;
  assert.ok(auditEditorialRequestContract(args).issues.some(s=>s.includes('局部修订')));
  const bad=structuredClone(contract);bad.windows[2].candidates[0].timing.holdFrames=0;
  assert.ok(auditEditorialJointRepairContract(bad,inputs).length);
  const changed=fixture();changed.proposal.shots[1].lastSentence=2;
  assert.ok(auditEditorialJointRepairContract(contract,changed).length);
  assert.ok(auditEditorialRequestContract({...args,repairInputs:null}).issues.some(s=>s.includes('联合修订')));
});

test('没有联合可行卡时明确返回重排，不用第一卡、虚构媒体或拉伸人物兜底',()=>{
  const args=fixture();args.catalog={cards:catalog.cards.filter(c=>c.cardId==='focus-dim-spotlight')};
  const result=buildEditorialJointRepairContract(args).windows[0];
  assert.deepEqual(result.candidates,[]);assert.match(result.nextAction,/真实自然句/);
  assert.equal(args.proposal.shots[1].shotCard,'focus-dim-spotlight');
});
test('无明确失败镜范围不能默认为首镜或全片修订',()=>{
 const args=fixture();args.failedChecks=[{code:'EDITORIAL_REPAIR_SELECTION_INVALID'}];
 assert.throws(()=>buildEditorialJointRepairContract(args),/没有本次明确镜头范围/);
});
test('只缺真实来源时不花钱重选卡，来源许可不能由创作修订产生',()=>{
 const args=fixture();args.failedChecks=[{code:'REAL_SOURCE_NOT_BOUND',shotId:'s14'}];
 assert.throws(()=>buildEditorialJointRepairContract(args),/先在06采集核验/);
});

test('固定示意卡没有本片内容与媒体入口时不能作为可执行修订方案',()=>{
  const args=fixture(),report=buildEditorialJointRepairContract(args);
  assert.equal(report.reviewedCount,108);
  for(const w of report.windows){
    assert.ok(w.rejected.AUTHORED_CONTENT_SLOT_UNAVAILABLE.includes('motion-blur-slam-in'));
    assert.ok(!w.candidates.some(c=>c.slug==='motion-blur-slam-in'));
    assert.equal(new Set([...w.candidates.map(c=>c.slug),...Object.values(w.rejected).flat()]).size,108);
  }
});


test('内部已核验资料即使没有research需求也约束全部固定槽，不能降级到无媒体图形卡',()=>{
 const args=fixture();args.failedChecks=[{shotId:'s21',code:'CONTENT_ONSET_GAP'}];
 const row=args.proposal.materialResearch.shots.find(r=>r.shotId==='s21');
 row.materialBindings=[{field:'srcBefore',localPath:'pages/a.png',sourceUrl:'https://official.example/page',identityReason:'官方文字文件',contentLanguage:'zh'},{field:'srcAfter',localPath:'pages/b.png'}];
 const before=structuredClone(args),w=buildEditorialJointRepairContract(args).windows[0];
 assert.equal(w.requiresSource,true);assert.deepEqual(w.retainedInternalSlots.map(b=>b.field),row.materialBindings.map(b=>b.field));
 assert.equal(w.retainedInternalSlots[0].identityReason,'官方文字文件');
 assert.equal(w.retainedInternalSlots[0].sourceUrl,'https://official.example/page');
 assert.ok(w.rejected.RETAINED_INTERNAL_SOURCE_SLOT_REQUIRED.includes('source-converge'));
 assert.ok(w.candidates.every(c=>['srcBefore','srcAfter'].every(f=>c.sourceDisplayFields.includes(f))));
 assert.deepEqual(args,before);
});

test('全片文字占比失败的修订不再向模型提供另一张纯文字卡；108卡仍逐项给出比较证据',()=>{
 const args=fixture();args.failedChecks=[{shotId:'s21',code:'FILM_TEXT_DOMINANCE',shotIds:['s21']}];
 const before=structuredClone(args),r=buildEditorialJointRepairContract(args),w=r.windows[0];
 assert.ok(w.rejected.GRAPHIC_REPLACEMENT_REQUIRED.includes('outline-box-title'));
 assert.ok(w.candidates.length>0);assert.ok(!w.candidates.some(c=>c.slug==='tracking-in'||c.slug==='soft-blur-in'));
 assert.equal(new Set([...w.candidates.map(c=>c.slug),...Object.values(w.rejected).flat()]).size,108);
 assert.deepEqual(args,before);assert.equal(w.selected.slug,'outline-box-title');
});

test('局部素材错误不能掩盖基稿仍超标的全局比例；当前文字目标须同时满足图形替换',()=>{
 const args=fixture();args.failedChecks=[{shotId:'s21',code:'MATERIAL_BOUND_FIELD_MISMATCH'}];
 args.proposal.shots.forEach(s=>{s.firstSentence+=3;s.lastSentence+=3;});
 args.aligned.unshift({start:0,end:1},{start:1,end:2},{start:2,end:3});
 args.personWindows.forEach(w=>{w.firstSentence+=3;w.lastSentence+=3;});
 args.proposal.sentences.unshift(...[0,1,2].map(i=>({i,text:'开场'})));
 args.proposal.shots.unshift(...[0,1,2].map(i=>({id:`o${i}`,firstSentence:i,lastSentence:i,shotCard:'soft-blur-in'})));
 const w=buildEditorialJointRepairContract(args).windows[0];
 assert.ok(w.rejected.GRAPHIC_REPLACEMENT_REQUIRED.includes('outline-box-title'));
 assert.ok(w.candidates.every(c=>!['tracking-in','soft-blur-in'].includes(c.slug)));
 args.failedChecks=[{shotId:'s07',code:'local_material_unmatched',field:'src'}];
 const material=buildEditorialJointRepairContract(args).windows.find(w=>w.shotId==='s07');
 assert.ok(material.rejected.PROJECTED_TEXT_QUOTA_REGRESSION.includes('tracking-in'));
 assert.ok(material.rejected.PROJECTED_TEXT_QUOTA_REGRESSION.includes('info-term-card'));
});


test('单镜仅被唯一固定镜去重占用时提出两镜联合可行域，文件预算及全片去重不豁免',t=>{
 const args=fixture(),dir=fs.mkdtempSync(path.resolve('.tmp/joint-dependency-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));args.projectRoot=dir;args.repairBatch={maxShots:1};
 fs.mkdirSync(path.join(dir,'remotion/public'),{recursive:true});
 const bindings=[1,2,3].map(i=>{const data='verified-'+i,file=i+'.png';fs.writeFileSync(path.join(dir,'remotion/public',file),data);
  return {localPath:file,sha256:createHash('sha256').update(data).digest('hex')};});
 args.proposal.shots[0].shotCard='gallery-wall-dolly';args.proposal.shots[1].shotCard='stack-fan-out';
 args.proposal.materialResearch.shots[1]={shotId:'s14',research:[],bindings:[{...bindings[0],kind:'identity',query:'原机构资料'}],
  materialBindings:bindings.slice(1).map((b,i)=>({...b,field:'src'+(i+2)}))};
 args.proposal.materialResearch.shots[0]={shotId:'s07',research:[],bindings:bindings.slice(0,1),
  materialBindings:bindings.slice(1).map((b,i)=>({...b,field:'src'+(i+2)}))};
 args.failedChecks=[{shotId:'s14',code:'local_material_unmatched',field:'src5'}];
 const before=structuredClone(args.proposal),joint=buildEditorialJointRepairContract(args);
 assert.deepEqual(args.proposal,before);assert.deepEqual(joint.windows.map(w=>w.shotId),['s07','s14']);
 assert.equal(joint.batch.maxShots,2);assert.equal(joint.batch.dependencyExpansion.partnerShotId,'s07');
 assert.ok(joint.batch.legalCardPairs.length);assert.ok(joint.windows.every(w=>w.reuseMediaBudget.available===3));
 assert.ok(joint.windows[1].candidates.some(c=>c.slug==='gallery-wall-dolly'));
 assert.ok(!joint.batch.legalCardPairs.some(([a,b])=>a===b));
 assert.deepEqual(auditEditorialJointRepairContract(joint,args),[]);
 const request=buildEditorialSelectionRequest(args);assert.deepEqual(request.editableShotIds,['s07','s14']);
 assert.equal(request.batch.dependencyExpansion.triggerShotId,'s14');
 // A second fixed occupier makes the dependency ambiguous: do not unlock more shots.
 args.proposal.shots[2].shotCard='gallery-wall-dolly';
 assert.equal(buildEditorialJointRepairContract(args).batch.dependencyExpansion,undefined);
});
