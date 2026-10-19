import {createHash} from 'node:crypto';
import {editorialRangeFeasibility} from './talkcraft-editorial-planning-contract.mjs';
import {auditEditorialMaterialContract,editorialSourceDisplayFields} from './talkcraft-editorial-material-contract.mjs';
import {auditTemplateReuse} from './talkcraft-template-governance.mjs';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {assertNativeMediaClock,assertNativeHoldBudget} from './talkcraft-native-time-map.mjs';
import {visualContentContract,isTextDominant} from './talkcraft-visual-content-contract.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const kindFor={身份:'identity',证据:'evidence',量化:'data'};

export function editorialQuantitativeInput(proposal,shot){
  return (proposal.sentences||[]).slice(shot.firstSentence,shot.lastSentence+1)
    .some(s=>s.need?.includes('量化')||s.sem?.includes('数据'))||
    !!proposal.materialResearch?.shots?.find(r=>r.shotId===shot.id)?.research?.some(r=>r.kind==='data');
}
export function editorialRequiredNumericFields(card){
  return Object.entries(card?.policy?.dsl||{}).filter(([field,dsl])=>
    dsl.numeric===true&&card.policy.required?.includes(field)).map(([field])=>field);
}

// This is a comparison contract, not a new selector. Keep semantic matching,
// source acquisition, business props and actual visibility in their own gates.
export function buildEditorialJointRepairContract({proposal,failedChecks=[],aligned,catalog,personWindows=[],projectRoot,repairBatch}){
  if(!proposal?.shots?.length)return null;
  const shots=proposal.shots,rows=proposal.materialResearch?.shots||[];
  const materials=auditEditorialMaterialContract({shots,sentences:proposal.sentences,
    researchPlan:proposal.materialResearch,catalog,projectRoot});
  // A reuse issue names both ends; repair an independently failing end first,
  // rather than unlocking its otherwise valid counterpart as collateral work.
  const ids=new Set(failedChecks.filter(i=>i.code!=='template_window_reuse')
    .flatMap(i=>[i.shotId,i.displayShotId,...(i.shotIds||[])]).filter(Boolean));
  for(const issue of failedChecks.filter(i=>i.code==='template_window_reuse'))
    if(!ids.has(issue.shotId)&&!ids.has(issue.previousShotId)&&issue.shotId)ids.add(issue.shotId);
  if(!ids.size)shots.forEach(s=>ids.add(s.id));
  const pending=shots.filter(s=>ids.has(s.id));
  // A film-wide quota does not require EVERY text shot to become graphics.
  // Prefer ranges that actually have a graphic duration domain; short text
  // ranges must not deadlock all other feasible film-wide improvements.
  const graphicDomains=new Map();
  const graphicDomain=shot=>{
   if(graphicDomains.has(shot.id))return graphicDomains.get(shot.id);
   const possible=editorialRangeFeasibility({...shot,aligned,catalog,personWindows}).cards.some(c=>{
    const card=catalog.cards.find(k=>k.cardId===c.slug);
    return card&&!isTextDominant({shotCard:card.cardId},catalog)&&!visualContentContract(card).placeholder;
   });graphicDomains.set(shot.id,possible);return possible;
  };
  if(failedChecks.some(i=>i.code==='FILM_TEXT_DOMINANCE'))pending.sort((a,b)=>Number(graphicDomain(b))-Number(graphicDomain(a))||
    (aligned[b.lastSentence].end-aligned[b.firstSentence].start)-(aligned[a.lastSentence].end-aligned[a.firstSentence].start));
  if(repairBatch&&(!Number.isInteger(repairBatch.maxShots)||repairBatch.maxShots<1||repairBatch.maxShots>2))
    throw Error('局部修订批量必须是1或2镜');
  const targets=repairBatch?pending.slice(0,repairBatch.maxShots):pending;
  // Deferred shots are LOCKED during this request. Recompute all candidate
  // conflicts against that smaller editable set, not the original failure set.
  if(repairBatch){ids.clear();targets.forEach(s=>ids.add(s.id));}
  const windows=targets.map(shot=>{
    if(!Number.isInteger(shot.firstSentence)||!Number.isInteger(shot.lastSentence)||shot.firstSentence<0||
      shot.lastSentence<shot.firstSentence||shot.lastSentence>=aligned.length)
      return {shotId:shot.id,issues:['句序范围无效，先修订真实句边界'],candidates:[],rejected:{}};
    const range=editorialRangeFeasibility({...shot,aligned,catalog,personWindows});
    const obligations=materials.checks.filter(c=>c.displayShotId===shot.id).map(c=>({
      sourceShotId:c.shotId,kind:c.kind,query:c.query,previousField:c.field}));
    const requiredKinds=[...new Set((proposal.sentences||[]).slice(shot.firstSentence,shot.lastSentence+1)
      .flatMap(s=>(s.need||[]).map(n=>kindFor[n]).filter(Boolean)))];
    const row=rows.find(r=>r.shotId===shot.id);
    const missingKinds=requiredKinds.filter(kind=>!row?.research?.some(r=>r.kind===kind));
    // A core person cannot evade the local slot requirement by an invalid
    // cross-shot plan. The unchanged material gate still checks approval.
    const corePeople=(row?.research||[]).filter(r=>r.entityType==='person'&&
      row?.personDisplays?.find(d=>d.entityName===r.entityName)?.role!=='mention').map(r=>r.entityName);
    const retainedInternalSlots=(row?.materialBindings||[]).map(b=>({field:b.field,localPath:b.localPath,
      sourceUrl:b.sourceUrl||b.url,identityReason:b.identityReason||b.reason||b.matchReason,
      matchReason:b.matchReason,contentLanguage:b.contentLanguage}));
    const requiresSource=!!(obligations.length||missingKinds.length||corePeople.length||retainedInternalSlots.length);
    const requireGraphicReplacement=graphicDomain(shot)&&failedChecks.some(i=>i.code==='FILM_TEXT_DOMINANCE'&&
      (i.shotId===shot.id||i.shotIds?.includes(shot.id)));
    const rejected={},candidates=[];
    const reject=(code,slug)=>(rejected[code]??=[]).push(slug);
    for(const card of catalog.cards){
      const reasons=[],offer=range.cards.find(c=>c.slug===card.cardId),sourceDisplayFields=editorialSourceDisplayFields(card);
      if(!offer)reasons.push('TIMING_OR_SUBJECT_INCOMPATIBLE');
      if(requiresSource&&!sourceDisplayFields.length)reasons.push('SOURCE_DISPLAY_SLOT_REQUIRED');
      if(retainedInternalSlots.some(b=>!b.field||!['image','image-or-video'].includes(card.policy?.media?.[b.field])||/host/iu.test(b.field)))
        reasons.push('RETAINED_INTERNAL_SOURCE_SLOT_REQUIRED');
      // A fixed illustration with no authored content or media inlet cannot
      // implement a new content design under the existing native text gate.
      const capability=card.policy?.capabilities;
      const visual=visualContentContract(card);
      if(visual.placeholder)reasons.push('DEMO_VISUAL_NOT_REPLACEABLE');
      if(requireGraphicReplacement&&isTextDominant({shotCard:card.cardId},catalog))reasons.push('GRAPHIC_REPLACEMENT_REQUIRED');
      if(range.requiredSubject==='person'&&visual.hostConflict)reasons.push('HOST_CONTENT_REGION_CONFLICT');
      if(capability?.illustrationOnlyWithoutAdapter===true&&capability.parameterizedContent===false&&capability.nativeMedia===false)
        reasons.push('AUTHORED_CONTENT_SLOT_UNAVAILABLE');
      if(editorialRequiredNumericFields(card).length&&!editorialQuantitativeInput(proposal,shot))
        reasons.push('QUANTITATIVE_INPUT_REQUIRED');
      const replacement=shots.map(s=>s.id===shot.id?{...s,shotCard:card.cardId}:s);
      const conflicts=auditTemplateReuse(replacement).filter(i=>i.shotId===shot.id||i.previousShotId===shot.id);
      const counterpart=i=>i.shotId===shot.id?i.previousShotId:i.shotId;
      const fixedConflicts=conflicts.filter(i=>!ids.has(counterpart(i)));
      if(fixedConflicts.length)reasons.push('FIXED_SHOT_REUSE_CONFLICT');
      if(reasons.length){reasons.forEach(code=>reject(code,card.cardId));continue;}
      // Re-run the production compiler, exposing integer-frame evidence rather
      // than asking the model to calculate nativeFrames / speed in prose.
      const holdAt=Math.min(1,card.duration.frames-2);
      const timeline=nativeEditorialTimeline(range.frames,card.duration.frames,holdAt,
        '仅容量参考，编导须另选源码中内容完整可见的驻留点',offer.requestedPlaybackRate);
      assertNativeMediaClock(timeline,card.policy?.media,{});
      candidates.push({slug:card.cardId,nativeFrames:card.duration.frames,sourceDisplayFields,
        mediaAlternatives:card.policy?.mediaAlternatives||[],
        timing:{requestedPlaybackRate:offer.requestedPlaybackRate??null,
          actualRates:timeline.filter(s=>s.kind==='motion').map(s=>s.playbackRate),
          holdFrames:assertNativeHoldBudget(timeline,range.frames).holdFrames,
          referenceHoldAtNativeFrame:holdAt,visibilityVerified:false},
        ...(conflicts.length?{requiresGroupReuseCheck:conflicts.map(counterpart)}:{})});
    }
    const selectedCard=catalog.cards.find(c=>c.cardId===shot.shotCard),selectedIssues=[];
    let selectedTiming=null;
    try{
      if(!selectedCard)throw Error('未登记模板');
      const p=shot.nativePresentation||{},timeline=nativeEditorialTimeline(range.frames,selectedCard.duration.frames,
        p.holdAtNativeFrame,p.holdReason,p.playbackRate);
      assertNativeMediaClock(timeline,selectedCard.policy?.media,shot.templateParams?.cardProps);
      selectedTiming={actualRates:timeline.filter(s=>s.kind==='motion').map(s=>s.playbackRate),
        holdFrames:assertNativeHoldBudget(timeline,range.frames).holdFrames};
    }catch(error){selectedIssues.push({code:'NATIVE_EDITORIAL_PLAN',message:error.message});}
    selectedIssues.push(...materials.issues.filter(i=>i.shotId===shot.id||i.displayShotId===shot.id),
      ...auditTemplateReuse(shots).filter(i=>i.shotId===shot.id||i.previousShotId===shot.id));
    return {shotId:shot.id,firstSentence:shot.firstSentence,lastSentence:shot.lastSentence,frames:range.frames,
      requiredSubject:range.requiredSubject,requiresSource,requiredKinds,missingKinds,corePeople,obligations,retainedInternalSlots,
      selected:{slug:shot.shotCard,requestedPlaybackRate:shot.nativePresentation?.playbackRate??null,
        timing:selectedTiming,issues:selectedIssues},candidates,rejected,
      nextAction:candidates.length?'编导比较可行卡并同时重写参数、资料展示字段和原生展示计划':'按真实自然句边界重排；已生成口型窗口仍精确保留'};
  });
  return {schema:'talkcraft-editorial-joint-repair-v1',
    inputSha256:digest({proposal,failedChecks,aligned,personWindows,...(repairBatch?{repairBatch}:{})}),reviewedCount:catalog.cards.length,
    ...(repairBatch?{batch:{maxShots:repairBatch.maxShots,pendingShotIds:pending.map(s=>s.id),
      deferredShotIds:pending.filter(s=>!ids.has(s.id)).map(s=>s.id)}}:{}),
    windows,materialIssues:materials.issues,
    rules:'全108张已审卡仍可比较，排除项是后端硬约束而非语义白名单。candidates只证明当前句范围的时长/人物、真实资料槽能力及与固定镜头的去重可行性，不代替语义、参数、来源授权、实际槽位绑定或文字可见性检查；修订镜之间仍须联合去重。requestedPlaybackRate=null表示正式字段省略，绝非填1；参考驻留点只用于算容量，正式驻留须依据源码重新计算并通过全部原门禁。换卡必须同步重写cardProps、templateMaterialQueries、research的displayShotId/displayField、personDisplays的姓名字段和nativePresentation；不得复用旧卡方案或用理由豁免硬约束。无可行卡时按真实句边界重排，不自动选第一名、不改原配音或口型、不触发付费调用。',
    productionAdmitted:false,userAcceptance:false};
}

export function auditEditorialJointRepairContract(contract,inputs){
  const expected=buildEditorialJointRepairContract(inputs);
  return JSON.stringify(contract)===JSON.stringify(expected)?[]:['逐镜联合修订契约缺失、过期或与正式计算不一致'];
}
