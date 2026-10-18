import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {buildEditorialJointRepairContract,auditEditorialJointRepairContract} from './talkcraft-editorial-joint-repair.mjs';
import {auditEditorialMaterialContract} from './talkcraft-editorial-material-contract.mjs';
import {buildEditorialPlanningContract} from './talkcraft-editorial-planning-contract.mjs';
import {auditEditorialRequestContract} from './talkcraft-editorial-request-audit.mjs';
import {compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {buildEditorialSelectionRequest} from './talkcraft-editorial-selection.mjs';

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
  const reusable=group.candidates.find(c=>c.slug==='info-card-assemble');
  assert.ok(reusable);assert.ok(reusable.requiresGroupReuseCheck.includes('s07'));
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
 row.materialBindings=[{field:'srcBefore',localPath:'pages/a.png'},{field:'srcAfter',localPath:'pages/b.png'}];
 const before=structuredClone(args),w=buildEditorialJointRepairContract(args).windows[0];
 assert.equal(w.requiresSource,true);assert.deepEqual(w.retainedInternalSlots,row.materialBindings);
 assert.ok(w.rejected.RETAINED_INTERNAL_SOURCE_SLOT_REQUIRED.includes('source-converge'));
 assert.ok(w.candidates.every(c=>['srcBefore','srcAfter'].every(f=>c.sourceDisplayFields.includes(f))));
 assert.deepEqual(args,before);
});
