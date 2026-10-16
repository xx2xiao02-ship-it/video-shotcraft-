import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const EDITORIAL_NATIVE_RULES='每镜帧数只能由真实配音边界计算：Math.round(end*30)-Math.round(start*30)。选卡 nativeFrames 必须小于等于本镜帧数，同时满足开场原卡短模板规则；不得拿不超过 3 秒代替实际镜头容量。驻留帧为 0 基索引，必须满足 0 <= holdAtNativeFrame < nativeFrames-1；nativeFrames 是总帧数，不能填作驻留帧。驻留点必须依据原卡源码中主体尚完整可见的阶段，不能简单减一或在退场后驻留。每个原卡动作仍须完整播放一次，视觉是否合格留待实帧检查。';

export function nativeEditorialTimeline(duration,nativeFrames,holdAt,reason){
  if(!Number.isInteger(duration)||!Number.isInteger(nativeFrames)||duration<nativeFrames)
    throw Error('镜头时长不足以完整播放原卡，必须重新选卡或调整语义切镜，禁止截断或加速');
  if(duration===nativeFrames)return [{kind:'motion',fromFrame:0,toFrame:duration-1,nativeFromFrame:0,nativeToFrame:nativeFrames-1}];
  if(!Number.isInteger(holdAt)||holdAt<0||holdAt>=nativeFrames-1||!String(reason||'').trim())
    throw Error('长镜头需要原卡内容仍完整可见的驻留帧和依据，不能在退场后空等');
  const extra=duration-nativeFrames;
  return [{kind:'motion',fromFrame:0,toFrame:holdAt,nativeFromFrame:0,nativeToFrame:holdAt},
    {kind:'hold',fromFrame:holdAt+1,toFrame:holdAt+extra,nativeFromFrame:holdAt,nativeToFrame:holdAt,reason},
    {kind:'motion',fromFrame:holdAt+extra+1,toFrame:duration-1,nativeFromFrame:holdAt+1,nativeToFrame:nativeFrames-1}];
}

// Model proposals retain their saved response provenance. Frame boundaries and
// sentence IDs come from the application's actual audio/shot records.
export function prepareEditorialNativePlans(project,catalog,result){
  const read=name=>JSON.parse(fs.readFileSync(path.join(project,name),'utf8'));
  const shots=read('remotion/shots.json'),source=read('source-run.json'),rows=[],events=[],issues=[],checks=[];
  for(const shot of shots){
    const raw=result?.shots?.find(s=>s.id===shot.id),proposal=raw?.nativePresentation,card=catalog.cards.find(c=>c.cardId===shot.shotCard);
    if(!proposal||!card){issues.push(`${shot.id} 缺少正式模板展示与逐词设计`);continue;}
    try{
      const startFrame=Math.round(shot.start*30),endFrame=Math.round(shot.end*30),nativeFrames=card.duration.frames;
      checks.push({shotId:shot.id,cardId:shot.shotCard,startFrame,endFrame,durationFrames:endFrame-startFrame,
        nativeFrames,proposedHoldFrame:proposal.holdAtNativeFrame,maxHoldFrame:nativeFrames-2,
        motionFits:endFrame-startFrame>=nativeFrames});
      const timeline=nativeEditorialTimeline(endFrame-startFrame,nativeFrames,proposal.holdAtNativeFrame,proposal.holdReason);
      if(!Array.isArray(proposal.textFields)||!proposal.textFields.length||!Array.isArray(proposal.wordEvents)||!proposal.wordEvents.length)
        throw Error('缺少可见字段和真实锚词事件');
      rows.push({shotId:shot.id,cardId:shot.shotCard,startFrame,endFrame,nativeFrames,
        humanLayout:source.isDigitalHuman&&shot.subject==='person'?'person':'none',mobileMinTextPx:proposal.mobileMinTextPx,
        textFields:proposal.textFields,timeline});
      for(const [i,event] of proposal.wordEvents.entries()){
        if(!event||!Number.isInteger(event.sentenceIndex)||event.sentenceIndex<0||event.sentenceIndex>shot.lastSentence||
          event.sentenceIndex<shot.firstSentence&&!event.carry)throw Error('锚词须明确绑定本镜真实句序，延续前文须说明');
        const {sentenceIndex,...props}=event;
        events.push({...props,id:`${shot.id}-text-${i+1}`,beatId:shot.id,sentence:`s${sentenceIndex+1}`});
      }
    }catch(error){issues.push(`${shot.id}：${error.message}`);}
  }
  const qa=path.join(project,'qa');fs.mkdirSync(qa,{recursive:true});
  const sourceFile=path.join(qa,'ark-editorial-response.json');
  fs.writeFileSync(path.join(qa,'native-editorial-plan.json'),JSON.stringify({schema:'talkcraft-native-editorial-plan-v1',
    responseSha256:fs.existsSync(sourceFile)?createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'):null,
    issues,checks,structuralDraftReady:issues.length===0,runtimeVerified:false,userAcceptance:false},null,2));
  if(issues.length)return {prepared:false,issues};
  for(const [name,value] of [['native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:rows}],
    ['word-reveal-plan.json',{scope:'native-shots',fps:30,events}]]){
    const file=path.join(project,'remotion',name);
    // Never overwrite edited plans or quietly migrate old paid results.
    if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
  }
  return {prepared:true,shots:rows.length,events:events.length,runtimeVerified:false};
}
