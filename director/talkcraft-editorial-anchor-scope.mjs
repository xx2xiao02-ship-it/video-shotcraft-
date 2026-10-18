import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid=message=>Object.assign(Error(message),{issues:[{code:'EDITORIAL_WORD_EVENT_SCOPE',message}]});

// IDs bind source characters to this input, shot and sentence. They are not
// timestamps: the existing word-timing pipeline still owns the actual clock.
export function buildEditorialAnchorScope({shotId,firstSentence,lastSentence,sentences,aligned,inputSha256,projectRoot,includeTiming=true}){
  const canonical=includeTiming&&projectRoot&&path.join(projectRoot,'remotion/timing.json');
  const copy=projectRoot&&path.join(projectRoot,'remotion/src/timing.json');
  const timing=canonical&&fs.existsSync(canonical)?JSON.parse(fs.readFileSync(canonical,'utf8')):null;
  if(timing&&fs.existsSync(copy)&&!isDeepStrictEqual(timing,JSON.parse(fs.readFileSync(copy,'utf8'))))
    throw invalid('规划字级时间轴与渲染副本不一致，未发送');
  if(includeTiming&&!timing&&projectRoot&&fs.existsSync(path.join(projectRoot,'audio/full.mp3')))
    throw invalid('正式编导缺少真实字级时间轴，不能估算锚点帧数');
  const rows=[];
  for(let i=firstSentence;i<=lastSentence;i++){
    const row=sentences[i],text=row?.text;
    if(typeof text!=='string'||!text.trim()||aligned?.[i]?.text!==undefined&&aligned[i].text!==text)
      throw invalid(`${shotId}第${i}句与真实时间轴原文不一致`);
    const chars=timing?.scenes?.[i]?.chars;
    if(timing&&(timing.scenes?.[i]?.text!==text||!Array.isArray(chars)||chars.map(c=>c.ch).join('')!==text))
      throw invalid(`${shotId}第${i}句真实字符时钟与原句不一致`);
    const clock=chars&&[...text].flatMap((ch,offset)=>{
      if(!/[\p{L}\p{N}\p{S}]/u.test(ch))return [];
      const c=chars[offset];if(!Number.isFinite(c.t)||!Number.isFinite(c.e)||c.e<=c.t)
        throw invalid(`${shotId}第${i}句第${offset}字缺少真实时间`);
      return [{offset,spokenSec:c.t,localFrame:Math.max(0,Math.round(c.t*30)-Math.round(aligned[firstSentence].start*30))}];
    });
    rows.push({sentenceIndex:i,text,sem:row.sem||[],need:row.need||[],weight:row.weight,...(clock?{clock}:{} )});
  }
  const scopeId=hash({shotId,inputSha256,rows});
  return {scopeId,sentences:rows.map(row=>({...row,anchors:[...row.text].flatMap((text,offset)=>
    /[\p{L}\p{N}\p{S}]/u.test(text)?[{anchorId:`a_${hash({scopeId,i:row.sentenceIndex,offset}).slice(0,24)}`,offset,text}]:[])}))};
}

// Model projection exposes one sentence reference, never combinable endpoint IDs.
// Keep the persisted request scope unchanged so bound provider results remain replayable.
export function editorialAnchorModelScope(scope,shotId){
  return {scopeId:scope.scopeId,sentences:scope.sentences.map(row=>({
    ...Object.fromEntries(Object.entries(row).filter(([key])=>!['anchors','clock'].includes(key))),
    sentenceRef:`${shotId}:q${row.sentenceIndex}:${hash([scope.scopeId,shotId,row.sentenceIndex]).slice(0,24)}`,
    characters:row.anchors.map(({offset,text})=>({offset,text,...(row.clock?.find(c=>c.offset===offset)||{})}))
  }))};
}

export function compileEditorialAnchorEvents(events,scope,shotId){
  if(!Array.isArray(events)||!events.length)throw invalid(`${shotId}缺少可见字段和真实锚词事件`);
  const anchors=new Map(scope.sentences.flatMap(row=>row.anchors.map(a=>[a.anchorId,{...a,row}])));
  const projected=editorialAnchorModelScope(scope,shotId);
  return events.map(event=>{
    const single=event&&Object.hasOwn(event,'sentenceRef');
    if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(k=>
      !(single?['field','text','sentenceRef','fromOffset','throughOffset','role','reason']:
        ['field','text','fromAnchorId','throughAnchorId','role','reason']).includes(k)))
      throw invalid(`${shotId}只允许本镜字符编号，不得自由填写sentenceIndex、anchor、carry或时间`);
    let from,through;
    if(single){
      const index=projected.sentences.findIndex(row=>row.sentenceRef===event.sentenceRef);
      const row=scope.sentences[index];
      if(!row||!Number.isInteger(event.fromOffset)||!Number.isInteger(event.throughOffset))
        throw invalid(`${shotId}单句引用未知、过期、跨镜或字符位置不是整数`);
      const first=row.anchors.find(a=>a.offset===event.fromOffset);
      const last=row.anchors.find(a=>a.offset===event.throughOffset);
      from=first&&{...first,row};through=last&&{...last,row};
    }else{
      from=anchors.get(event.fromAnchorId);through=anchors.get(event.throughAnchorId);
    }
    if(!from||!through||from.row!==through.row||from.offset>through.offset)
      throw invalid(`${shotId}锚点编号未知、过期、跨镜、跨句或倒序`);
    const anchor=[...from.row.text].slice(from.offset,through.offset+1).join('');
    // Downstream resolves an anchor by text. Do not silently select the first
    // occurrence if a character span would become ambiguous in that protocol.
    const first=from.row.text.indexOf(anchor);
    if(from.row.text.indexOf(anchor,first+1)!==-1)
      throw invalid(`${shotId}锚词“${anchor}”在本句重复，须选择更长的唯一原文范围`);
    if(typeof event.field!=='string'||!event.field.trim()||typeof event.text!=='string'||!event.text.trim()||
      !['spoken','context'].includes(event.role)||event.role==='context'&&(typeof event.reason!=='string'||!event.reason.trim()))
      throw invalid(`${shotId}事件缺少字段、展示文字、角色或背景说明依据`);
    const {fromAnchorId,throughAnchorId,sentenceRef,fromOffset,throughOffset,...rest}=event;
    return {...rest,sentenceIndex:from.row.sentenceIndex,anchor};
  });
}
