import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {captureEditorialResponse} from './talkcraft-editorial-response.mjs';
import {recompileRetainedEditorialSelection} from './talkcraft-editorial-selection-replay.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {buildEditorialSelectionRequest,auditEditorialSelectionRequest,compileEditorialSelection,editorialSelectionPrompt,editorialSelectionModelInput,auditEditorialSelectionContent,preservedEditorialSelectionShots,auditEditorialSelectionResponseBindings,prepareEditorialMaterialUpdates} from './talkcraft-editorial-selection.mjs';
import {buildEditorialAnchorScope} from './talkcraft-editorial-anchor-scope.mjs';
import {editorialMaterialRefs} from './talkcraft-editorial-constraints.mjs';
import {createHash} from 'node:crypto';
import {prepareEditorialRepairInput} from './talkcraft-ark-editorial.mjs';
import {auditEditorialRequestContract} from './talkcraft-editorial-request-audit.mjs';
import {buildEditorialJointRepairContract} from './talkcraft-editorial-joint-repair.mjs';
import {compactTalkcraftEditorialCatalog} from './talkcraft-ark-editorial.mjs';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {editorialRequiredParameterContracts} from './talkcraft-editorial-required-props.mjs';
import {EDITORIAL_NATIVE_RULES,EDITORIAL_MATERIAL_RULES,EDITORIAL_SELECTION_NATIVE_RULES,EDITORIAL_SELECTION_MATERIAL_RULES} from './talkcraft-editorial-native-plan.mjs';

const index=JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json'));
const catalog=loadTalkcraftGovernedCatalog(index);

test('单镜修订发送前逐选项核对锁定相邻镜头的纯文字三连，前三镜豁免不扩散',()=>{
 const request=buildEditorialSelectionRequest(fixture()),w=request.windows[0];
 const shot=request.baseProposal.shots.find(s=>s.id===w.shotId);
 const text=(id,start)=>({id,start,end:start+1,shotCard:'soft-blur-in',templateParams:{cardProps:{text:'保留相邻镜'}}});
 request.baseProposal.shots=[text('open1',0),text('open2',1),text('open3',2),text('locked1',3),text('locked2',4),{...shot,start:5,end:6}];
 request.windows=[{...w,choices:[{slug:'line-by-line-slide',choiceId:'text-choice'},{slug:'logo-enter',choiceId:'title-choice'}]}];
 request.editableShotIds=[w.shotId];
 const args={promptCatalog:compactTalkcraftEditorialCatalog(index,catalog)};
 const model=editorialSelectionModelInput(request,args);
 assert.deepEqual(model.windows[0].backgroundCycleContract.incompatibleChoices.map(c=>c.choiceId),['text-choice']);
 assert.deepEqual(model.windows[0].backgroundCycleContract.incompatibleChoices[0].shotIds,[['locked1','locked2',w.shotId]]);
 request.baseProposal.shots=request.baseProposal.shots.slice(3);
 assert.deepEqual(editorialSelectionModelInput(request,args).windows[0].backgroundCycleContract.incompatibleChoices,[]);
});

test('图形比较失败时发送真实图形分类目录与理由合同，不把强调卡当图形替代',()=>{
 const args=fixture(),request=buildEditorialSelectionRequest(args);
 request.failedChecks=[{shotId:request.editableShotIds[0],code:'GRAPHIC_COMPARISON_REQUIRED'}];
 const promptCatalog=compactTalkcraftEditorialCatalog(index,catalog);
 const model=editorialSelectionModelInput(request,{promptCatalog});
 const contract=model.materials.find(r=>r.shotId===request.editableShotIds[0]).graphicComparisonContract;
 assert.deepEqual(contract.cards.map(c=>c.slug),promptCatalog.cards.filter(c=>c.category==='数据信息图').map(c=>c.slug));
 assert.ok(contract.cards.length>0);assert.equal(contract.minimumReasonCharacters,4);
 assert.ok(!contract.cards.some(c=>c.slug==='soft-blur-in'));
 assert.ok(model.materials.filter(r=>r.shotId!==request.editableShotIds[0]).every(r=>!r.graphicComparisonContract));
});

test('资料协议区分锁定换槽与创意重写，逐行明确数组和已有绑定归属',()=>{
  const args=fixture(),row=args.proposal.materialResearch.shots[1];
  row.research=[{kind:'identity',query:'官方出处',displayShotId:'s15',displayField:'srcBefore'}];
  row.bindings=[{kind:'identity',query:'官方出处',displayShotId:'s15',field:'srcBefore',localPath:'verified.png'}];
  row.backgroundReason='锁定创意不可重写';
  row.personDisplays=[{entityName:'资料人物',role:'core',displayShotId:'s15',
    labelField:'docTitle',labelText:'资料人物',bindingQuery:'官方出处',nameField:'错误旧别名'}];
  const request=buildEditorialSelectionRequest(args);
  const model=editorialSelectionModelInput(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog)});
  const locked=model.materials.find(r=>r.shotId==='s19');
  assert.equal(locked.mode,'retarget-only');assert.deepEqual(locked.rewriteFields,[]);
  assert.deepEqual(locked.requiredArrays,['research','personDisplays']);assert.equal(locked.preservedBindingCount,1);
  assert.deepEqual(locked.personDisplays,[{entityName:'资料人物',role:'core',displayShotId:'s15',
    labelField:'docTitle',labelText:'资料人物',bindingQuery:'官方出处'}]);
  assert.equal(model.materials[0].mode,'replace-design');
  const prompt=editorialSelectionPrompt(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog)});
  assert.match(prompt,/research:\[\]/);assert.match(prompt,/bindings由服务端/);assert.match(prompt,/mode=retarget-only/);
});

test('实际组合规则不再附带全量研究重写样例或要求人物重抄bindingQuery',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  const prompt=editorialSelectionPrompt(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog),
    rules:EDITORIAL_SELECTION_NATIVE_RULES+EDITORIAL_SELECTION_MATERIAL_RULES});
  assert.match(prompt,/researchRef/);assert.match(prompt,/bindingResearchRef/);
  assert.doesNotMatch(EDITORIAL_SELECTION_MATERIAL_RULES,/research:\[\{kind/);
  assert.doesNotMatch(EDITORIAL_SELECTION_MATERIAL_RULES,/presentation:[^\]]*,bindingQuery/);
  assert.match(EDITORIAL_SELECTION_MATERIAL_RULES,/锁定资料行仅换槽/);
});

test('仅恢复本次基稿明确的空research和已有绑定；非空规划及锁定改写一次完整报告',()=>{
  const request={editableShotIds:['s03','s07'],baseProposal:{materialResearch:{shots:[
    {shotId:'s03',research:[]},
    {shotId:'s07',research:[{kind:'identity',query:'真实央行'}],bindings:[{kind:'identity',query:'真实央行',field:'src',sha256:'original'}]},
    {shotId:'s04',research:[],backgroundReason:'已审理由'}]}}};
  const r={materialResearchUpdates:[{shotId:'s03'},{shotId:'s07'},{shotId:'s04',research:[],backgroundReason:'新编理由'}]};
  const before=structuredClone(r),audit=prepareEditorialMaterialUpdates(r,request);
  assert.deepEqual(audit.rows[0].research,[]);
  assert.deepEqual(audit.rows[1].bindings,request.baseProposal.materialResearch.shots[1].bindings);
  assert.deepEqual(audit.issues.map(i=>i.shotId),['s07','s04']);assert.equal(audit.passed,false);
  assert.deepEqual(r,before);
  r.materialResearchUpdates[0].research=null;
  assert.ok(prepareEditorialMaterialUpdates(r,request).issues.some(i=>i.shotId==='s03'));
});

test('同卡资料绑定由基稿保留，错槽、文件篡改及非空research遗漏仍不能通过',()=>{
  const args=fixture();
  args.proposal.materialResearch.shots[0].bindings=[{kind:'identity',query:'央行官方资料',field:'src',localPath:'real.png',sha256:'retained'}];
  const request=buildEditorialSelectionRequest(args),r=response(request,'doc-park-left-pill-deal');
  // Source is preserved exactly; this old field is incompatible with the new
  // card and must be reported, never automatically renamed to a new slot.
  assert.throws(()=>compileEditorialSelection(r,request,args),/槽位|实际绑定|真实媒体/);
  delete r.materialResearchUpdates[0].research;
  assert.throws(()=>compileEditorialSelection(r,request,args),/缺少完整资料规划/);
});

test('正式编译接受按kind/query换槽并保留服务端来源事实；模型伪造事实和删除资料仍拒绝',()=>{
  const args=fixture(),row=args.proposal.materialResearch.shots[0];
  row.bindings=[{kind:'identity',query:'央行官方资料',field:'srcBefore',
    localPath:'sources/official.png',sha256:'a'.repeat(64),license:'已核验许可'}];
  const request=buildEditorialSelectionRequest(args),r=response(request),update=r.materialResearchUpdates[0];
  const field=update.research[0].displayField;
  update.bindings=[{kind:'identity',query:'央行官方资料',field}];
  r.repairs[0].templateParams.cardProps[field]='sources/official.png';
  const before=structuredClone(r),result=compileEditorialSelection(r,request,args);
  assert.deepEqual(result.materialResearch.shots[0].bindings,[{...row.bindings[0],field}]);
  assert.deepEqual(r,before);
  const model=editorialSelectionModelInput(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog)});
  assert.deepEqual(model.materials[0].bindings,[{bindingRef:editorialMaterialRefs(request,'s15','bindings')[0].ref,kind:'identity',query:'央行官方资料',field:'srcBefore'}]);
  assert.equal(model.responseContract.materials[0].retainedBindings.length,1);
  update.bindings[0].license='模型随意声明的许可';
  assert.throws(()=>compileEditorialSelection(r,request,args),/不能改写真实素材的license/);
  delete update.bindings[0].license;update.research=[];
  assert.throws(()=>compileEditorialSelection(r,request,args),/遗漏或修改已登记/);
});

test('正式编译执行引用补丁而非身份回抄；锁定镜头原样保留，省略研究不能通过',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),r=response(request);
  for(const row of r.materialResearchUpdates){
    const refs=editorialMaterialRefs(request,row.shotId,'research');
    row.research=row.research.map(item=>{
      const ref=refs.find(x=>x.item.kind===item.kind&&x.item.query===item.query);
      assert.ok(ref);
      const {reason,displayField}=item;
      return {researchRef:ref.ref,...(request.editableShotIds.includes(row.shotId)?{reason}:{}),displayField};
    });
  }
  const before=structuredClone(r),result=compileEditorialSelection(r,request,args);
  assert.deepEqual(result.shots.filter(s=>s.id!=='s15'),args.proposal.shots.filter(s=>s.id!=='s15'));
  assert.deepEqual(result.materialResearch.shots[1],args.proposal.materialResearch.shots[1]);
  assert.deepEqual(r,before);
  delete r.materialResearchUpdates[0].research;
  assert.throws(()=>compileEditorialSelection(r,request,args),/缺少完整资料规划/);
});

test('需补资料而基稿没有该镜资料行时，发送合同仍完整列出该镜，不依赖模型猜漏行',()=>{
  const args=fixture();args.proposal.materialResearch.shots.shift();
  const request=buildEditorialSelectionRequest(args),model=editorialSelectionModelInput(request,
    {promptCatalog:compactTalkcraftEditorialCatalog(index,catalog)});
  assert.ok(request.materialShotIds.includes('s15'));
  assert.deepEqual(model.materials.map(r=>r.shotId),request.materialShotIds);
  assert.deepEqual(model.materials.find(r=>r.shotId==='s15').research,[]);
  assert.deepEqual(model.responseContract.materials.find(r=>r.shotId==='s15').requiredFields,['shotId','research']);
});

test('已拒绝的原始响应可反复免费重编译；当前请求、原文与基稿必须全部相符',t=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),r=response(request);
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'selection-replay-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'qa/editorial-provider-responses'),{recursive:true});
  const write=(name,value)=>fs.writeFileSync(path.join(project,name),JSON.stringify(value));
  fs.writeFileSync(path.join(project,'input.txt'),'当前原稿');write('aligned-sentences.json',args.aligned);
  const hash=v=>createHash('sha256').update(v).digest('hex');
  write('qa/editorial-single-submission.json',{submittedAt:'2026-10-18T12:43:08.164Z',inputs:Object.fromEntries(
    ['input.txt','aligned-sentences.json'].map(n=>[n,hash(fs.readFileSync(path.join(project,n)))]))});
  captureEditorialResponse(project,{runId:'current-run',requestId:request.requestId,prompt:'original submitted prompt'})(
    JSON.stringify({output_text:JSON.stringify(r)}),{httpStatus:200,attempt:1});
  const audit={passed:false,compiled:false,requestId:request.requestId,rawResponse:'qa/editorial-provider-responses/2026-10-18T12-43-08-164Z.json'};
  write(audit.rawResponse,r);write('qa/editorial-selection-request.json',request);
  write('qa/editorial-selection-audit.json',audit);
  write('qa/ark-editorial-response.json',{...request.baseProposal,editorialSelectionRejection:audit});
  const before=fs.readFileSync(path.join(project,'qa/ark-editorial-response.json'));
  for(let i=0;i<2;i++){
    const replay=recompileRetainedEditorialSelection(project,{runId:'current-run',...args});
    assert.equal(replay.result.shots[0].shotCard,'doc-park-left-pill-deal');
    assert.equal(JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-free-selection-replay.json'))).externalRequests,0);
  }
  const compiled=recompileRetainedEditorialSelection(project,{runId:'current-run',...args}).result;
  write('qa/ark-editorial-response.json',compiled);
  write('qa/editorial-selection-audit.json',{requestId:request.requestId,passed:true,compiled:true,
    recoveredWithoutProvider:true,productionAdmitted:false,compiledSha256:hash(JSON.stringify(compiled))});
  for(let i=0;i<2;i++)assert.deepEqual(recompileRetainedEditorialSelection(project,{runId:'current-run',...args}).result,compiled);
  // First successful compile followed by a later strict rejection: no prior
  // replay report or raw-file pointer exists in legacy successful audits.
  fs.unlinkSync(path.join(project,'qa/editorial-free-selection-replay.json'));
  fs.unlinkSync(path.join(project,audit.rawResponse));
  write('qa/editorial-selection-audit.json',{requestId:request.requestId,passed:true,compiled:true,
    productionAdmitted:false,compiledSha256:hash(JSON.stringify(compiled))});
  for(let i=0;i<2;i++)assert.deepEqual(recompileRetainedEditorialSelection(project,{runId:'current-run',...args}).result,compiled);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project,audit.rawResponse))),r);
  write('qa/ark-editorial-response.json',{...compiled,intent:'tampered'});
  assert.throws(()=>recompileRetainedEditorialSelection(project,{runId:'current-run',...args}),/哈希核验/);
  write('qa/editorial-selection-audit.json',audit);
  fs.writeFileSync(path.join(project,'qa/ark-editorial-response.json'),before);
  assert.deepEqual(fs.readFileSync(path.join(project,'qa/ark-editorial-response.json')),before);
  assert.throws(()=>recompileRetainedEditorialSelection(project,{runId:'another-run',...args}),/当前任务|本次提交/);
  write(audit.rawResponse,{...r,repairs:[]});
  assert.throws(()=>recompileRetainedEditorialSelection(project,{runId:'current-run',...args}),/不一致/);
});

test('选卡必填合同逐方案显式发送；空参数在编译前聚合拒绝且不修改返回',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  const promptCatalog=compactTalkcraftEditorialCatalog(index,catalog);
  const model=editorialSelectionModelInput(request,{promptCatalog});
  const reason=model.windows[0].selectionReasonContract;
  assert.equal(reason.path,'templateParams.semanticDeviations');
  assert.equal(reason.requiredWhen,'outside-upstream-recommendations');
  assert.deepEqual(reason.allowedSemanticKeys,request.windows[0].actualCandidateSemantics);
  assert.deepEqual(reason.choices.map(c=>c.choiceId),request.windows[0].choices.map(c=>c.choiceId));
  assert.ok(reason.choices.every(c=>Array.isArray(c.indexedSemantics)&&typeof c.directSemanticMatch==='boolean'));
  assert.deepEqual(model.parameterContracts,editorialRequiredParameterContracts(request,catalog));
  const r=response(request),before=structuredClone(r);
  r.repairs[0].templateParams.cardProps={};
  const empty=structuredClone(r);
  assert.throws(()=>compileEditorialSelection(r,request,args),error=>{
    assert.deepEqual(error.issues.map(i=>i.field),['docTitle','pills','notes','hint']);
    assert.ok(error.issues.every(i=>i.code==='REQUIRED_PROP'&&i.shotId==='s15'));return true;
  });
  assert.deepEqual(r,empty);assert.notDeepEqual(r,before);
  assert.ok(!editorialSelectionPrompt(request,{promptCatalog}).includes('"cardProps":{}'));
});
function fixture(){
  const params={cardProps:{},templateMaterialQueries:{srcBefore:'官方研究资料',srcAfter:'真实生活资料'}};
  const proposal={sentences:[{i:0,text:'央行的预期管理',need:['身份'],shot:'s15'},
    {i:1,text:'普通人的生活选择',need:[],shot:'s19'}],captionEmphasis:{sentences:['保持字幕重点']},
    shots:[{id:'s15',firstSentence:0,lastSentence:0,subject:'other',shotCard:'split-compare-slider',
      templateParams:structuredClone(params),nativePresentation:{playbackRate:1,holdAtNativeFrame:200,holdReason:'对比可见'}},
    {id:'s19',firstSentence:1,lastSentence:1,subject:'other',shotCard:'split-compare-slider',
      intent:'保持原样',visual:'锁定已审安排',templateParams:structuredClone(params),nativePresentation:{playbackRate:1,holdAtNativeFrame:200,holdReason:'对比可见'}}],
    materialResearch:{policyVersion:'保留原规划版本',shots:[{shotId:'s15',research:[{kind:'identity',query:'央行官方资料',reason:'真实机构身份',displayField:'srcBefore'}]},
      {shotId:'s19',research:[],background:{decision:'omit',reason:'已审构图'}}]}};
  return {proposal,catalog,aligned:[{start:10,end:17.8},{start:17.8,end:27.666666666666668}],personWindows:[],projectRoot:process.cwd(),
    failedChecks:[{code:'NATIVE_EDITORIAL_PLAN',shotId:'s15'},{code:'template_window_reuse',shotId:'s19',previousShotId:'s15'}]};
}
function response(request,slug='doc-park-left-pill-deal'){
  const choice=request.windows[0].choices.find(c=>c.slug===slug);
  assert.ok(choice,slug);
  const card=catalog.cards.find(c=>c.cardId===slug);
  const queries=Object.fromEntries(Object.keys(card.policy.media).filter(k=>k!=='hostSrc').map(k=>[k,'央行官方资料图']));
  const anchors=request.windows[0].anchorScope.sentences[0].anchors;
  return {schema:'talkcraft-editorial-selection-response-v2',requestId:request.requestId,
    repairs:[{shotId:'s15',choiceId:choice.choiceId,intent:'明确展示央行研究',visual:'使用原卡机构资料与标签',
      templateParams:{cardProps:{docTitle:'央行的预期管理',pills:'收入冲击\n消费传导',notes:'官方研究资料',hint:'查看研究出处'},templateMaterialQueries:queries},
      nativePresentation:{holdAtNativeFrame:100,holdReason:'资料可见时驻留',mobileMinTextPx:12,
        textFields:[{key:'docTitle',visibility:'visible'}],
        wordEvents:[{field:'docTitle',text:'央行的预期管理',fromAnchorId:anchors[3].anchorId,throughAnchorId:anchors.at(-1).anchorId,role:'spoken'}]}}],
    materialResearchUpdates:[{shotId:'s15',research:[{kind:'identity',query:'央行官方资料',reason:'真实机构身份',displayField:choice.sourceDisplayFields[0]}]}]};
}

test('正式编译自动修复错层资料查询且原校验仍拒绝未知字段和冲突',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),correct=response(request);
  const misplaced=structuredClone(correct);
  misplaced.repairs[0].templateMaterialQueries=misplaced.repairs[0].templateParams.templateMaterialQueries;
  delete misplaced.repairs[0].templateParams.templateMaterialQueries;
  const before=structuredClone(misplaced);
  assert.deepEqual(compileEditorialSelection(misplaced,request,args),compileEditorialSelection(correct,request,args));
  assert.deepEqual(misplaced,before);
  misplaced.repairs[0].unexpected='不能悄悄删除';
  assert.throws(()=>compileEditorialSelection(misplaced,request,args),/未授权/);
  delete misplaced.repairs[0].unexpected;
  misplaced.repairs[0].templateParams.templateMaterialQueries={src:'不同内容'};
  assert.throws(()=>compileEditorialSelection(misplaced,request,args),e=>e.issues[0].code==='EDITORIAL_STRUCTURE_CONFLICT');
});

test('第15镜时长失败与第19镜重复只解锁第15镜，全部108卡仍参与联合比较',()=>{
  const args=fixture(),before=structuredClone(args),joint=buildEditorialJointRepairContract(args),request=buildEditorialSelectionRequest(args);
  assert.equal(joint.reviewedCount,108);assert.deepEqual(request.editableShotIds,['s15']);
  assert.deepEqual(request.materialShotIds,['s15']);
  assert.ok(joint.windows[0].rejected.TIMING_OR_SUBJECT_INCOMPATIBLE.includes('split-compare-slider'));
  assert.ok(joint.windows[0].rejected.FIXED_SHOT_REUSE_CONFLICT.includes('split-compare-slider'));
  assert.ok(!request.windows[0].choices.some(c=>c.slug==='split-compare-slider'));
  assert.deepEqual(args,before);
});

test('有效编号由代码编译卡和速度，锁定其他分镜、原句、字幕与资料行',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),before=structuredClone(args.proposal);
  const result=compileEditorialSelection(response(request),request,args);
  assert.equal(result.shots[0].shotCard,'doc-park-left-pill-deal');
  assert.deepEqual(result.shots[0].nativePresentation.wordEvents,[{field:'docTitle',text:'央行的预期管理',role:'spoken',sentenceIndex:0,anchor:'预期管理'}]);
  assert.equal(Object.hasOwn(result.shots[0].nativePresentation,'playbackRate'),false);
  assert.deepEqual(result.shots[1],before.shots[1]);assert.deepEqual(result.sentences,before.sentences);
  assert.deepEqual(result.captionEmphasis,before.captionEmphasis);
  assert.deepEqual(result.materialResearch.shots[1],before.materialResearch.shots[1]);
  assert.equal(result.materialResearch.policyVersion,before.materialResearch.policyVersion);
  assert.deepEqual(args.proposal,before);
});

test('实际请求只含可编辑镜原句；全文、旧画面、失败说明、旧资料创意及调整原文不能进入发送投影',()=>{
  const args=fixture(),foreign='后镜专有哨兵词不得传入';
  args.proposal.sentences[1].text=foreign;
  args.proposal.shots[0].visual=foreign;args.proposal.shots[0].intent=foreign;
  args.proposal.shots[0].templateParams.cardProps={title:foreign};
  Object.assign(args.proposal.materialResearch.shots[0],{backgroundReason:foreign,graphicIntent:foreign,graphicAlternatives:[{reason:foreign}],pureTextReason:foreign});
  args.proposal.materialResearch.shots[0].research[0].reason=foreign;
  args.failedChecks[0].message=foreign;
  const request=buildEditorialSelectionRequest(args),promptCatalog=compactTalkcraftEditorialCatalog(index,catalog);
  const model=editorialSelectionModelInput(request,{promptCatalog});
  const prompt=editorialSelectionPrompt(request,{promptCatalog,modelInput:model,input:foreign,adjustment:foreign});
  assert.ok(JSON.stringify(request).includes(foreign));
  assert.ok(!JSON.stringify(model).includes(foreign));assert.ok(!prompt.includes(foreign));
  assert.deepEqual(model.windows[0].anchorScope.sentences.map(r=>r.text),['央行的预期管理']);
  assert.ok(!JSON.stringify(model.windows.map(w=>w.anchorScope)).includes('anchorId'));
  const row=model.windows[0].anchorScope.sentences[0];
  assert.ok(row.sentenceRef.startsWith(request.windows[0].shotId+':q'));
  assert.ok(row.characters.every(c=>Number.isInteger(c.offset)&&typeof c.text==='string'));
  assert.equal(model.reviewedCount,108);assert.ok(!Object.hasOwn(model,'baseProposal'));
  assert.ok(!model.catalog.contracts.some(c=>Object.hasOwn(c,'dslExamples')));
  const r=response(request);r.materialResearchUpdates[0].research[0].reason='当前新资料理由';
  for(const key of ['backgroundReason','graphicIntent','pureTextReason'])r.materialResearchUpdates[0][key]='按本镜原句重新设计';
  r.materialResearchUpdates[0].graphicAlternatives=[];
  const offsetResponse=structuredClone(r);
  const oldEvents=offsetResponse.repairs[0].nativePresentation.wordEvents;
  for(const e of oldEvents){
    const internal=request.windows[0].anchorScope.sentences.find(s=>s.anchors.some(a=>a.anchorId===e.fromAnchorId));
    const projected=model.windows[0].anchorScope.sentences.find(s=>s.sentenceIndex===internal.sentenceIndex);
    e.sentenceRef=projected.sentenceRef;
    e.fromOffset=internal.anchors.find(a=>a.anchorId===e.fromAnchorId).offset;
    e.throughOffset=internal.anchors.find(a=>a.anchorId===e.throughAnchorId).offset;
    delete e.fromAnchorId;delete e.throughAnchorId;
  }
  assert.deepEqual(compileEditorialSelection(offsetResponse,request,args),compileEditorialSelection(r,request,args));
  const compiled=compileEditorialSelection(r,request,args);
  assert.equal(compiled.materialResearch.shots[0].backgroundReason,'按本镜原句重新设计');
  delete r.materialResearchUpdates[0].graphicIntent;
  assert.throws(()=>compileEditorialSelection(r,request,args),/重新填写资料创意字段/);
});

test('发送前自检核对实际投影；缺锚点、夹带全文、串用旧输入在授权消费前失败',()=>{
  const args=fixture(),promptCatalog=compactTalkcraftEditorialCatalog(index,catalog);
  args.aligned=[{start:0,end:2.5},{start:2.5,end:5},{start:5,end:7.5},{start:7.5,end:10},...args.aligned];
  args.proposal.sentences=[...Array.from({length:4},(_,i)=>({i,text:`开场原句${i}`})),...args.proposal.sentences];
  for(const shot of args.proposal.shots){shot.firstSentence+=4;shot.lastSentence+=4;}
  // This is the same producer invoked before reserveEditorialSubmission.
  const p=prepareEditorialRepairInput({previousFailures:{proposal:args.proposal,failedChecks:args.failedChecks},
    ...args,promptCatalog});
  const audit=selectionModelInput=>auditEditorialRequestContract({...p,selectionModelInput,promptCatalog,catalog});
  assert.equal(audit(p.selectionModelInput).passed,true);
  for(const mutate of [m=>delete m.parameterContracts,m=>m.parameterContracts[0].choices[0].requiredBusinessFields=[],
    m=>delete m.windows[0].anchorScope,m=>m.fullInput='锁定后镜',
    m=>m.windows[0].anchorScope.sentences.push({sentenceIndex:1,text:'后镜'}),m=>m.windows[0].anchorScope.scopeId='旧记录',
    m=>m.windows[0].anchorScope.sentences[0].sentenceRef='其他镜引用',
    m=>m.windows[0].anchorScope.sentences[0].characters[0].offset=999]){
    const m=structuredClone(p.selectionModelInput);mutate(m);
    assert.equal(audit(m).passed,false);
    assert.throws(()=>editorialSelectionPrompt(p.selectionRequest,{promptCatalog,modelInput:m}),/投影不一致/);
  }
  assert.equal(audit(null).passed,false);
  assert.equal(p.requestAudit.externalRequests,0);
});

test('新请求拒绝旧自由句序响应，不修改或迁移已编译历史事务',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),r=response(request);
  r.schema='talkcraft-editorial-selection-response-v1';
  assert.throws(()=>compileEditorialSelection(r,request,args),/协议/);
  // A historical compiled v1 transaction remains provable without rebuilding
  // or silently upgrading the old request/hash.
  const old=structuredClone(request);old.schema='talkcraft-editorial-selection-request-v1';
  delete old.windows[0].anchorScope;delete old.requestId;
  old.requestId=createHash('sha256').update(JSON.stringify(old)).digest('hex');
  const before=structuredClone(old);
  assert.deepEqual([...preservedEditorialSelectionShots(args.proposal,old)],['s19']);
  assert.deepEqual(old,before);
});

test('免费回放193同类跨镜事件：context理由和carry不能变成合法本镜引用',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),before=structuredClone(args.proposal);
  for(const event of [{field:'docTitle',text:'后镜',sentenceIndex:1,anchor:'生活选择',role:'context',reason:'本镜需要后镜内容'},
    {...response(request).repairs[0].nativePresentation.wordEvents[0],carry:true}]){
    const r=response(request);r.repairs[0].nativePresentation.wordEvents=[event];
    assert.throws(()=>compileEditorialSelection(r,request,args),/不得自由填写/);
    assert.deepEqual(args.proposal,before);
  }
});

test('296帧卡放234帧的实际错误不能编码为合法编号，也不能伪造卡名或速度',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  assert.throws(()=>nativeEditorialTimeline(234,296,280,'完整卡可见',1),/速度/);
  const bad=response(request);bad.repairs[0].choiceId='split-compare-slider';
  assert.throws(()=>compileEditorialSelection(bad,request,args),/不兼容/);
  for(const mutate of [r=>r.repairs[0].shotCard='split-compare-slider',r=>r.repairs[0].nativePresentation.playbackRate=1.266,
    r=>r.repairs[0].firstSentence=0,r=>r.shots=args.proposal.shots,r=>r.sentences=[]]){
    const r=response(request);mutate(r);assert.throws(()=>compileEditorialSelection(r,request,args),/未授权/);
  }
});

test('漏镜、重复镜、越范围修改固定镜与遗漏资料同步均拒绝，不默认选择首卡',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  for(const mutate of [r=>r.repairs=[],r=>r.repairs.push(structuredClone(r.repairs[0])),
    r=>r.repairs[0].shotId='s19',r=>r.materialResearchUpdates=[],r=>delete r.repairs[0].choiceId]){
    const r=response(request);mutate(r);assert.throws(()=>compileEditorialSelection(r,request,args));
  }
});

test('篡改方案、过期输入和其他镜头的编号均拒绝',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  assert.deepEqual(auditEditorialSelectionRequest(request,args),[]);
  const tampered=structuredClone(request);tampered.windows[0].choices[0].slug='split-compare-slider';
  assert.ok(auditEditorialSelectionRequest(tampered,args).length);
  assert.throws(()=>compileEditorialSelection(response(request),tampered,args),/篡改|过期/);
  const changed={...args,aligned:structuredClone(args.aligned)};changed.aligned[0].end+=.1;
  assert.throws(()=>compileEditorialSelection(response(request),request,changed),/过期/);
  const wrong=response(request);wrong.requestId='another-request';
  assert.throws(()=>compileEditorialSelection(wrong,request,args),/指纹/);
});

test('正式驻留点仍重新编译，不能凭参考方案、姓名旧字段或无槽记录绕过原门禁',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  const invalidHold=response(request);invalidHold.repairs[0].nativePresentation.holdAtNativeFrame=999;
  assert.throws(()=>compileEditorialSelection(invalidHold,request,args),/驻留/);
  const invalidSlot=response(request);invalidSlot.materialResearchUpdates[0].research[0].displayField='madeUp';
  assert.throws(()=>compileEditorialSelection(invalidSlot,request,args),/真实媒体槽/);
  const missingQuery=response(request);missingQuery.repairs[0].templateParams.templateMaterialQueries={};
  assert.throws(()=>compileEditorialSelection(missingQuery,request,args),/采集计划/);
  const missingResearch=response(request);delete missingResearch.materialResearchUpdates[0].research;
  assert.throws(()=>compileEditorialSelection(missingResearch,request,args),/缺少完整资料规划/);
});

test('修订prompt与生成入口使用局部协议，缺少可行方案在付费前停止',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  const prompt=editorialSelectionPrompt(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog),input:'原稿',rules:'原门禁保留',adjustment:'修15镜'});
  assert.match(prompt,/不重写整片/);assert.match(prompt,/playbackRate/);assert.match(prompt,new RegExp(request.requestId));
  assert.ok(prompt.length<JSON.stringify({catalog,proposal:args.proposal}).length);
  assert.throws(()=>buildEditorialSelectionRequest({...args,catalog:{cards:catalog.cards.filter(c=>c.cardId==='split-compare-slider')}}),/没有固定句范围/);
});

test('入向资料换槽不能删除锁定镜资料或篡改其身份、许可和真实文件',()=>{
  for(const viaBinding of [false,true]){
    const args=fixture(),row=args.proposal.materialResearch.shots[1];
    row.research=[{kind:'identity',query:'官方资料',reason:'集中展示',displayField:'srcBefore',
      ...(!viaBinding?{displayShotId:'s15'}:{})}];
    if(viaBinding)row.bindings=[{kind:'identity',query:'官方资料',displayShotId:'s15',field:'srcBefore',localPath:'original.png',license:'原许可'}];
    const request=buildEditorialSelectionRequest(args),r=response(request);
    assert.deepEqual(request.materialShotIds,['s15','s19']);
    for(const mutate of [v=>v.research=[],v=>v.research[0].query='伪造身份',v=>v.background.reason='改其他镜',
      ...(viaBinding?[v=>v.bindings[0].localPath='replaced.png',v=>v.bindings[0].license='虚假许可']:[])]){
      const bad=structuredClone(r),update=structuredClone(row);mutate(update);bad.materialResearchUpdates.push(update);
      assert.throws(()=>compileEditorialSelection(bad,request,args),/锁定资料行/);
    }
  }
});

test('局部修订使用真实同源规则但不要求返回全局字幕或全片素材对象',()=>{
  const request=buildEditorialSelectionRequest(fixture());
  const prompt=editorialSelectionPrompt(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog),
    input:'原稿',rules:EDITORIAL_SELECTION_NATIVE_RULES+EDITORIAL_SELECTION_MATERIAL_RULES});
  assert.doesNotMatch(prompt,/返回顶层captionEmphasis|返回顶层materialResearch=/);
  assert.match(prompt,/只返回materialResearchUpdates/);
  assert.match(EDITORIAL_NATIVE_RULES,/返回顶层captionEmphasis/);
  assert.match(EDITORIAL_MATERIAL_RULES,/返回顶层materialResearch=/);
  const args=fixture(),r=response(request);r.captionEmphasis=args.proposal.captionEmphasis;
  assert.throws(()=>compileEditorialSelection(r,request,args),/未授权字段：captionEmphasis/);
});

test('局部内容在写入语义前一次报告错理由、跨镜锚点及无量化输入的图表',()=>{
  const args=fixture();args.proposal.sentences[0].sem=['例证'];args.proposal.sentences[0].weight='main';
  const request=buildEditorialSelectionRequest(args),result=structuredClone(request.baseProposal);
  Object.assign(result.shots[0],{shotCard:'shape-wipe-transition',templateParams:{semanticDeviations:{引用:'不能挪用其他镜头理由'}},
    nativePresentation:{textFields:[{key:'chartTitle',visibility:'visible'}],wordEvents:[{field:'chartTitle',role:'spoken',sentenceIndex:1,anchor:'普通人的生活选择'}]}});
  const audit=auditEditorialSelectionContent(result,request,args);
  assert.deepEqual(audit.issues.map(i=>i.code),['SHOT_SEMANTIC_DEVIATION_MISMATCH','EDITORIAL_WORD_EVENT_SCOPE','QUANTITATIVE_INPUT_REQUIRED']);
  assert.equal(audit.passed,false);assert.deepEqual(args.proposal,request.baseProposal);
  const joint=buildEditorialJointRepairContract(args);
  assert.ok(joint.windows[0].rejected.QUANTITATIVE_INPUT_REQUIRED.includes('shape-wipe-transition'));
  assert.ok(!request.windows[0].choices.some(c=>c.slug==='shape-wipe-transition'));
  args.proposal.sentences[0].need=['量化'];
  const allowed=buildEditorialJointRepairContract(args);
  assert.ok(!allowed.windows[0].rejected.QUANTITATIVE_INPUT_REQUIRED?.includes('shape-wipe-transition'));
});

test('空文字计划在局部编译阶段拒绝，不改锁定原稿或等待安装后报错',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args),before=structuredClone(args.proposal);
  for(const field of ['textFields','wordEvents']){
    const r=response(request);r.repairs[0].nativePresentation[field]=[];
    assert.throws(()=>compileEditorialSelection(r,request,args),/缺少可见字段和真实锚词事件/);
    assert.deepEqual(args.proposal,before);
  }
});

test('多句同一字段逐句重复事件可用，跨句与其他镜编号一次完整报告且不改返回',()=>{
  const sentences=[{text:'口袋里的钱，'},{text:'关联度最高。'},{text:'经济冷了，'},{text:'央行降息。'}];
  const window=(shotId,firstSentence,lastSentence)=>({shotId,choices:[{choiceId:`${shotId}-合法编号`}],
    anchorScope:buildEditorialAnchorScope({shotId,firstSentence,lastSentence,sentences,inputSha256:'当前输入'})});
  const request={windows:[window('s05',0,1),window('s07',2,3)]};
  const event=row=>({field:'rows',text:row.text,role:'spoken',fromAnchorId:row.anchors[0].anchorId,throughAnchorId:row.anchors.at(-1).anchorId});
  const response={repairs:request.windows.map(w=>({shotId:w.shotId,choiceId:w.choices[0].choiceId,
    nativePresentation:{wordEvents:w.anchorScope.sentences.map(event)}}))};
  assert.deepEqual(auditEditorialSelectionResponseBindings(response,request),{passed:true,issues:[]});
  for(const [i,w]of request.windows.entries())response.repairs[i].nativePresentation.wordEvents=[{
    ...event(w.anchorScope.sentences[0]),throughAnchorId:w.anchorScope.sentences[1].anchors.at(-1).anchorId}];
  response.repairs[1].choiceId=request.windows[0].choices[0].choiceId;
  const before=structuredClone(response),audit=auditEditorialSelectionResponseBindings(response,request);
  assert.equal(audit.passed,false);
  assert.deepEqual(audit.issues.map(i=>[i.shotId,i.code]),[['s05','EDITORIAL_WORD_EVENT_SCOPE'],
    ['s07','EDITORIAL_REPAIR_SELECTION_INVALID'],['s07','EDITORIAL_WORD_EVENT_SCOPE']]);
  assert.deepEqual(response,before);
});

test('正式局部请求明确同字段多句拆事件，事务编译保留完整错误定位',()=>{
  const args=fixture(),request=buildEditorialSelectionRequest(args);
  const prompt=editorialSelectionPrompt(request,{promptCatalog:compactTalkcraftEditorialCatalog(index,catalog)});
  assert.match(prompt,/同一field允许且需要重复/);assert.match(prompt,/禁止把两句或多句/);
  const r=response(request);r.repairs[0].choiceId='其他镜头的编号';
  r.repairs[0].nativePresentation.wordEvents[0].fromAnchorId='未知锚点';
  assert.throws(()=>compileEditorialSelection(r,request,args),error=>{
    assert.equal(error.issues.length,2);assert.ok(error.issues.every(i=>i.shotId==='s15'));
    assert.equal(error.issues[1].field,'docTitle');assert.equal(error.issues[1].eventIndex,0);return true;
  });
});


test('215同类漏填不能恢复旧设计，发送投影逐字段说明且错误定位完整，不修改原始返回',()=>{
  const args=fixture(),old=args.proposal.materialResearch.shots[0];
  Object.assign(old,{backgroundQuery:'旧背景检索',backgroundDecision:'omit',backgroundConcepts:[],backgroundReason:'旧背景理由',graphicIntent:'旧图形意图',graphicAlternatives:[],pureTextReason:''});
  const request=buildEditorialSelectionRequest(args),r=response(request);
  for(const key of ['backgroundQuery','backgroundDecision','backgroundConcepts','backgroundReason','graphicIntent','graphicAlternatives','pureTextReason'])delete r.materialResearchUpdates[0][key];
  const before=structuredClone(r),prepared=prepareEditorialMaterialUpdates(r,request);
  assert.equal(prepared.passed,false);assert.equal(prepared.issues.length,7);
  assert.deepEqual(new Set(prepared.issues.map(i=>i.field)),new Set(Object.keys(old).filter(k=>['backgroundQuery','backgroundDecision','backgroundConcepts','backgroundReason','graphicIntent','graphicAlternatives','pureTextReason'].includes(k))));
  assert.deepEqual(r,before);assert.throws(()=>compileEditorialSelection(r,request,args),/须重新填写资料创意字段/);
  const promptCatalog=compactTalkcraftEditorialCatalog(index,catalog),model=editorialSelectionModelInput(request,{promptCatalog});
  assert.deepEqual(Object.keys(model.materials[0].designFields),model.materials[0].rewriteFields);
  assert.deepEqual(model.materials[0].designFields,model.responseContract.materials[0].designFields);
  assert.ok(!JSON.stringify(model).includes('旧背景检索'));
  const prompt=editorialSelectionPrompt(request,{promptCatalog,modelInput:model});
  assert.match(prompt,/即使research为空也不能省略背景和图形决定/);
  assert.match(prompt,/materialResearchUpdates行顶层返回/);
});
