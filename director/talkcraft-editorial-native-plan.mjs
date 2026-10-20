import {BACKGROUND_PRESENTATION_RULES} from './talkcraft-background-presentation.mjs';
import {CAPTION_EMPHASIS_RULES} from './talkcraft-caption-emphasis.mjs';
import {saveEditorialCaptionEmphasis} from './talkcraft-caption-emphasis-plan.mjs';
import {MATERIAL_RESEARCH_RULES,MATERIAL_RESEARCH_SELECTION_RULES,saveEditorialMaterialResearch} from './talkcraft-material-research.mjs';
import {VISUAL_PREFERENCE_RULES} from './talkcraft-visual-preference.mjs';
import {TEXT_EFFECT_RULES} from './talkcraft-text-effect-dependencies.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {CONTENT_ONSET_RULES} from './talkcraft-content-onset.mjs';
import {assertNativeMotionRate,assertNativeMediaClock,NATIVE_MIN_RATE,NATIVE_MAX_RATE} from './talkcraft-native-time-map.mjs';
import {assertNativeHoldBudget,NATIVE_HOLD_RULES} from './talkcraft-native-time-map.mjs';

const NATIVE_TIMING_RULES='每镜帧数只能由真实配音边界计算：Math.round(end*30)-Math.round(start*30)。仅模板动效允许0.85～1.15倍速，nativePresentation.playbackRate为可选请求速度；省略时默认1倍，原卡略长时可自动在15%内适配。实际速度按原生和输出首尾帧跨度之比记录，整数帧取整后仍不得超限，超限必须重新选卡。内嵌媒体的原生帧与输出帧必须一一对应，不能驻留冻结或偏移。配音、数字人口型、字级输出锚点和真实切镜时间保持原样，不得跟随模板变速；原卡首尾和动作顺序完整保留。开场原卡仍须不超过3秒，禁止靠加速长卡绕过。驻留帧为0基索引，必须满足 0 <= holdAtNativeFrame < nativeFrames-1；nativeFrames是总帧数，不能填作驻留帧。驻留点必须依据原卡源码中主体尚完整可见的阶段，不能简单减一或在退场后驻留。视觉效果由人工审核。'+CONTENT_ONSET_RULES+TEXT_EFFECT_RULES+BACKGROUND_PRESENTATION_RULES+NATIVE_HOLD_RULES;
const GENERATION_TIMING_RULES='每张目录合同的timingDesign来自正式参数化时序源码：reference只是默认参数预览，不是最终设计。先以最终cardProps重算每个texts展示窗口和effects目标，再与本镜真实字符localFrame比较；同字段多句逐句登记，强调等最后目标文字可读后才开始，载字块只允许各自leadFrames。使用该合同的最晚锚点必要上界排除必定无解方案，再完整编译原生首尾、速率及冻结预算。无法实现时比较其它兼容设计，不沿用默认时序、不挪动真实锚词、不通过改角色绕开规则。正式生成接纳前会用与07相同的字级解析器和时序校验一次检查全部镜头，结构或总时长通过不等于本片时序通过。';
export const EDITORIAL_SELECTION_NATIVE_RULES=NATIVE_TIMING_RULES.replace('nativePresentation.playbackRate为可选请求速度；省略时默认1倍，原卡略长时可自动在15%内适配。','局部修订速度只由choiceId的服务端方案编译；模型禁止返回playbackRate（包括null和1）。')+GENERATION_TIMING_RULES;
export const EDITORIAL_NATIVE_RULES=NATIVE_TIMING_RULES+GENERATION_TIMING_RULES+CAPTION_EMPHASIS_RULES;

export const EDITORIAL_MATERIAL_RULES=MATERIAL_RESEARCH_RULES+VISUAL_PREFERENCE_RULES;
export const EDITORIAL_SELECTION_MATERIAL_RULES=MATERIAL_RESEARCH_SELECTION_RULES+VISUAL_PREFERENCE_RULES;
export const EDITORIAL_HOLD_RULES=NATIVE_HOLD_RULES;

// The same structural gate runs before installation and when rebuilding plans.
// Empty arrays cannot stand in for authored content or real word anchors.
export function assertEditorialTextPlan(proposal){
  if(!Array.isArray(proposal?.textFields)||!proposal.textFields.length||
     !Array.isArray(proposal?.wordEvents)||!proposal.wordEvents.length)
    throw Error('缺少可见字段和真实锚词事件');
}

export function nativeEditorialTimeline(duration,nativeFrames,holdAt,reason,playbackRate){
  if(!Number.isInteger(duration)||duration<1||!Number.isInteger(nativeFrames)||nativeFrames<1)
    throw Error('镜头和原卡总帧数必须为正整数');
  if(playbackRate!==undefined&&(!Number.isFinite(playbackRate)||playbackRate<NATIVE_MIN_RATE||playbackRate>NATIVE_MAX_RATE))
    throw Error('请求动效速度必须在0.85～1.15倍以内，超限必须重新选卡');
  const motion=(fromFrame,length,nativeFromFrame,nativeToFrame)=>{
    const segment={kind:'motion',fromFrame,toFrame:fromFrame+length-1,nativeFromFrame,nativeToFrame};
    segment.playbackRate=length===1&&nativeFromFrame===nativeToFrame?1:(nativeToFrame-nativeFromFrame)/(length-1);
    assertNativeMotionRate(segment);return segment;
  };
  const requested=playbackRate??(duration<nativeFrames?(nativeFrames-1)/(duration-1):1);
  const lengthFor=span=>span===0?1:Math.max(Math.ceil(span/NATIVE_MAX_RATE)+1,
    Math.min(Math.floor(span/NATIVE_MIN_RATE)+1,Math.round(span/requested)+1));
  // No hold required: map the complete native card, never crop an endpoint.
  const fullLength=lengthFor(nativeFrames-1);
  if(duration<=fullLength)return [motion(0,duration,0,nativeFrames-1)];
  if(!Number.isInteger(holdAt)||holdAt<0||holdAt>=nativeFrames-1||!String(reason||'').trim())
    throw Error('长镜头需要原卡内容仍完整可见的驻留帧和依据，不能在退场后空等');
  const firstLength=lengthFor(holdAt),lastLength=lengthFor(nativeFrames-holdAt-2),extra=duration-firstLength-lastLength;
  if(extra<0)throw Error('整数帧动效与驻留无法容纳，必须重新规划或选卡');
  const timeline=[motion(0,firstLength,0,holdAt),
    ...(extra?[{kind:'hold',fromFrame:firstLength,toFrame:firstLength+extra-1,nativeFromFrame:holdAt,nativeToFrame:holdAt,reason}]:[]),
    motion(firstLength+extra,lastLength,holdAt+1,nativeFrames-1)];
  assertNativeHoldBudget(timeline,duration);return timeline;
}

// Model proposals retain their saved response provenance. Frame boundaries and
// sentence IDs come from the application's actual audio/shot records.
export function prepareEditorialNativePlans(project,catalog,result,{repairDerivedFieldAliases=false}={}){
  const read=name=>JSON.parse(fs.readFileSync(path.join(project,name),'utf8'));
  const shots=read('remotion/shots.json'),source=read('source-run.json'),rows=[],events=[],issues=[],checks=[];
  for(const shot of shots){
    const raw=result?.shots?.find(s=>s.id===shot.id),proposal=raw?.nativePresentation,card=catalog.cards.find(c=>c.cardId===shot.shotCard);
    if(!proposal||!card){issues.push(`${shot.id} 缺少正式模板展示与逐词设计`);continue;}
    try{
      const startFrame=Math.round(shot.start*30),endFrame=Math.round(shot.end*30),nativeFrames=card.duration.frames;
      checks.push({shotId:shot.id,cardId:shot.shotCard,startFrame,endFrame,durationFrames:endFrame-startFrame,
        nativeFrames,proposedHoldFrame:proposal.holdAtNativeFrame,maxHoldFrame:nativeFrames-2,
        motionFits:(nativeFrames-1)/(endFrame-startFrame-1)<=NATIVE_MAX_RATE});
      const timeline=nativeEditorialTimeline(endFrame-startFrame,nativeFrames,proposal.holdAtNativeFrame,proposal.holdReason,proposal.playbackRate);
      assertNativeMediaClock(timeline,card.policy?.media,shot.templateParams?.cardProps);
      assertEditorialTextPlan(proposal);
      rows.push({shotId:shot.id,cardId:shot.shotCard,startFrame,endFrame,nativeFrames,
        humanLayout:source.isDigitalHuman&&shot.subject==='person'?'person':'none',mobileMinTextPx:proposal.mobileMinTextPx,
        textFields:proposal.textFields,requestedPlaybackRate:proposal.playbackRate??null,timeline});
      for(const [i,event] of proposal.wordEvents.entries()){
        if(!event||!Number.isInteger(event.sentenceIndex)||event.sentenceIndex<0||event.sentenceIndex>shot.lastSentence||
          event.sentenceIndex<shot.firstSentence&&!event.carry)throw Error('锚词须明确绑定本镜真实句序，延续前文须说明');
        const {sentenceIndex,...props}=event;
        events.push({...props,id:`${shot.id}-text-${i+1}`,beatId:shot.id,sentence:`s${sentenceIndex+1}`});
      }
    }catch(error){issues.push(`${shot.id}：${error.message}`);}
  }
  const captionEmphasis=saveEditorialCaptionEmphasis(project,result);
  const materialResearch=saveEditorialMaterialResearch(project,result);
  const qa=path.join(project,'qa');fs.mkdirSync(qa,{recursive:true});
  fs.writeFileSync(path.join(qa,'caption-emphasis-editorial.json'),JSON.stringify(captionEmphasis,null,2));
  fs.writeFileSync(path.join(qa,'material-research-editorial.json'),JSON.stringify(materialResearch,null,2));
  const sourceFile=path.join(qa,'ark-editorial-response.json');
  fs.writeFileSync(path.join(qa,'native-editorial-plan.json'),JSON.stringify({schema:'talkcraft-native-editorial-plan-v1',
    responseSha256:fs.existsSync(sourceFile)?createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'):null,
    issues,checks,structuralDraftReady:issues.length===0,runtimeVerified:false,userAcceptance:false},null,2));
  if(issues.length)return {prepared:false,issues};
  if(repairDerivedFieldAliases){
    const nativeFile=path.join(project,'remotion/native-presentation.json'),wordFile=path.join(project,'remotion/word-reveal-plan.json');
    const expected={schema:'talkcraft-native-presentation-v1',fps:30,shots:rows};
    const expectedWords={scope:'native-shots',fps:30,events};
    if(fs.existsSync(wordFile)&&!isDeepStrictEqual(read('remotion/word-reveal-plan.json'),expectedWords))
      return {prepared:false,issues:['免费结构恢复不能覆盖已修改的字级事件计划']};
    if(fs.existsSync(nativeFile)){
      const previous=read('remotion/native-presentation.json'),normalized=structuredClone(previous),changes=[];
      for(const row of normalized.shots||[])for(const [i,f]of (row.textFields||[]).entries()){
        if(!f||typeof f.field!=='string')continue;
        if(Object.hasOwn(f,'key')&&f.key!==f.field)return {prepared:false,issues:['既有展示字段别名冲突，不能覆盖']};
        changes.push({shotId:row.shotId,index:i,from:'field',to:'key',value:f.field});f.key=f.field;delete f.field;
      }
      if(!isDeepStrictEqual(normalized,expected))return {prepared:false,issues:['既有展示计划与本次正式编译结果存在别名之外的差异，不能覆盖人工修改']};
      if(changes.length){
        const bytes=fs.readFileSync(nativeFile),beforeSha256=createHash('sha256').update(bytes).digest('hex');
        const directory=path.join(qa,'editorial-free-replay-artifacts');fs.mkdirSync(directory,{recursive:true});
        const backup=path.join(directory,'native-presentation.json.'+beforeSha256);
        if(!fs.existsSync(backup))fs.writeFileSync(backup,bytes,{flag:'wx'});
        if(!fs.readFileSync(backup).equals(bytes))return {prepared:false,issues:['既有展示计划备份校验失败，未覆盖']};
        const output=JSON.stringify(expected,null,2);fs.writeFileSync(nativeFile,output);
        fs.writeFileSync(path.join(qa,'native-derived-alias-repair.json'),JSON.stringify({schema:'talkcraft-native-derived-alias-repair-v1',
          beforeSha256,afterSha256:createHash('sha256').update(output).digest('hex'),changes,externalRequests:0,productionAdmitted:false},null,2));
      }
    }
  }
  for(const [name,value] of [['native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:rows}],
    ['word-reveal-plan.json',{scope:'native-shots',fps:30,events}]]){
    const file=path.join(project,'remotion',name);
    // Never overwrite edited plans or quietly migrate old paid results.
    if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
  }
  return {prepared:true,shots:rows.length,events:events.length,runtimeVerified:false};
}
