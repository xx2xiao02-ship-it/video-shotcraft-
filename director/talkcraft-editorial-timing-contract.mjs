import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {textEffectContract,checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {assertNativeMediaClock,NATIVE_MAX_RATE} from './talkcraft-native-time-map.mjs';
import {resolveReveal,wordRenderTimingFile} from './talkcraft-word-reveal.mjs';
import {preservedEditorialSelectionShots} from './talkcraft-editorial-selection.mjs';
import {checkNativeGovernance} from './talkcraft-native-governance.mjs';

// Source-derived design input, not another hand-maintained template map. Text
// defaults are never sent as creative content. Array counts/default parameters
// only illustrate the schedule; final props must be evaluated again below.
export function editorialTimingDesignContract(card){
 const defaults=Object.fromEntries(card.fields.map(f=>[f.key,f.default]));
 const reference=textEffectContract(card.cardId,defaults,card.duration.frames);
 return {schema:'talkcraft-editorial-timing-design-v1',fps:30,nativeFrames:card.duration.frames,
  audited:!!reference,referenceOnly:true,reference,
  parameterInputs:card.fields.filter(f=>typeof f.default==='number').map(f=>({key:f.key,default:f.default,
   writable:f.writable===true,...(f.min!==undefined?{min:f.min}:{}),...(f.max!==undefined?{max:f.max}:{}),...(f.step!==undefined?{step:f.step}:{})})),
  rules:{textReadableFrames:3,emphasisAfterTextFrames:1,carrierLead:'only each effect.leadFrames',
   finalEvaluation:'textEffectTiming.evaluator(cardId, finalCardProps, nativeFrames)',
   frameMapping:'actual nativeEditorialTimeline; preserve audio and all original native endpoints',
   latestAnchorNecessaryUpperBound:`durationFrames - ceil((nativeFrames - 1 - effect.begin) / ${NATIVE_MAX_RATE}) - 1 + effect.leadFrames - (effect.leadFrames === 0 ? 1 : 0)`},
  instruction:'先用最终字段和公开参数计算texts/effects，再按本镜真实字符localFrame分配内容。reference仅是默认参数的结构预览，不是最终可行性证明；列表长度、选中项、lead和退场均随最终参数重算。强调必须晚于目标文字；载字块仅允许源码登记的短错峰。超过最晚锚点的必要上界即不可行；未超上界也仍须完整编译检查，内嵌媒体不得使用变速上界冒充可变速。不得挪动锚词、借另一句、删动效或截尾。无合法时序须重新设计参数或比较其它卡，不提交已知无解方案。'};
}

// Run the production word resolver and the production text/effect validator
// against the proposed data BEFORE installing generated render storyboard data. Both
// new generations and retained-response replay enter auditEditorialProposal.
export function auditEditorialTiming(result,{aligned,catalog,projectRoot,selectionRequest}){
 const issues=[],checks=[],rows=[],shots=[],events=[];
 const add=(shotId,code,message)=>issues.push({shotId,code,message});
 let timing;
 try{timing=JSON.parse(fs.readFileSync(wordRenderTimingFile(projectRoot),'utf8'));}
 catch(error){return {passed:false,issues:[{code:'EDITORIAL_TIMING_SOURCE_REQUIRED',message:'生成接纳前缺少一致的真实字级时间轴：'+error.message}],checks};}
 let retained=new Set(),savedRows=[],savedEvents=[];
 if(selectionRequest)try{
  retained=preservedEditorialSelectionShots(result,selectionRequest);
  if(retained.size){
   const gate=checkNativeGovernance(projectRoot,{catalog});
   if(!gate.passed)throw Error('已保留分镜的正式原生门禁未通过');
   savedRows=JSON.parse(fs.readFileSync(path.join(projectRoot,'remotion/native-presentation.json'),'utf8')).shots;
   savedEvents=JSON.parse(fs.readFileSync(path.join(projectRoot,'remotion/word-reveal-plan.json'),'utf8')).events;
  }
 }catch(error){return {passed:false,issues:[{code:'EDITORIAL_RETAINED_TIMING_CHANGED',message:error.message}],checks};}
 for(const shot of result.shots||[]){
  const card=catalog.cards.find(c=>c.cardId===shot.shotCard),p=shot.nativePresentation;
  if(!card||!p||!Array.isArray(p.wordEvents)||!p.wordEvents.length)continue; // Original structural gate owns these errors.
  try{
   const startFrame=Math.round(aligned[shot.firstSentence].start*30),endFrame=Math.round(aligned[shot.lastSentence].end*30);
   const row={shotId:shot.id,startFrame,endFrame,nativeFrames:card.duration.frames,
    timeline:nativeEditorialTimeline(endFrame-startFrame,card.duration.frames,p.holdAtNativeFrame,p.holdReason,p.playbackRate)};
   if(retained.has(shot.id)){
    const prior=savedRows.find(r=>r.shotId===shot.id);
    const expectedEvents=p.wordEvents.map(({sentenceIndex,...e},i)=>({...e,id:`${shot.id}-text-${i+1}`,beatId:shot.id,sentence:`s${sentenceIndex+1}`}));
    if(!prior||prior.cardId!==shot.shotCard||prior.startFrame!==startFrame||prior.endFrame!==endFrame||prior.nativeFrames!==card.duration.frames||
     !isDeepStrictEqual(prior.textFields,p.textFields)||!isDeepStrictEqual(savedEvents.filter(e=>e.beatId===shot.id),expectedEvents))
     throw Error('锁定镜头的正式时间计划或字级事件与本次锁定基稿不一致');
    // Keep a previously executed centre-approved timing repair. Rebuilding its
    // old single hold from the immutable provider blueprint would undo it.
    row.timeline=prior.timeline;
   }
   assertNativeMediaClock(row.timeline,card.policy?.media,shot.templateParams?.cardProps);
   const resolved=[];
   for(const [i,event]of p.wordEvents.entries()){
    if(!Number.isInteger(event.sentenceIndex)||event.sentenceIndex<shot.firstSentence||event.sentenceIndex>shot.lastSentence)
     throw Error('锚点必须属于本镜真实原句，不能用carry越过镜头范围');
    const sentence=timing.scenes?.[event.sentenceIndex];
    if(sentence?.text!==result.sentences?.[event.sentenceIndex]?.text)throw Error('原句与真实字符时钟不一致');
    resolved.push(resolveReveal(timing,{id:shot.id,card:shot.shotCard,startFrame,endFrame},
     {...event,id:`${shot.id}-text-${i+1}`,sentence:sentence.id}));
   }
   rows.push(row);shots.push(shot);events.push(...resolved);
  }catch(error){add(shot.id,'EDITORIAL_TIMING_INVALID',`${shot.id}生成时序编译失败：${error.message}`);}
 }
 if(shots.length){const report=checkTextEffectDependencies(shots,{shots:rows},{events});issues.push(...report.issues);checks.push(...report.checks);}
 return {schema:'talkcraft-editorial-timing-audit-v1',passed:issues.length===0,issues,checks,externalRequests:0,productionAdmitted:false};
}
