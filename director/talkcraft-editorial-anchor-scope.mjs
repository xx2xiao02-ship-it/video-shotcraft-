import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid=message=>Object.assign(Error(message),{issues:[{code:'EDITORIAL_WORD_EVENT_SCOPE',message}]});

// IDs bind source characters to this input, shot and sentence. They are not
// timestamps: the existing word-timing pipeline still owns the actual clock.
export function buildEditorialAnchorScope({shotId,firstSentence,lastSentence,sentences,aligned,inputSha256}){
  const rows=[];
  for(let i=firstSentence;i<=lastSentence;i++){
    const row=sentences[i],text=row?.text;
    if(typeof text!=='string'||!text.trim()||aligned?.[i]?.text!==undefined&&aligned[i].text!==text)
      throw invalid(`${shotId}第${i}句与真实时间轴原文不一致`);
    rows.push({sentenceIndex:i,text,sem:row.sem||[],need:row.need||[],weight:row.weight});
  }
  const scopeId=hash({shotId,inputSha256,rows});
  return {scopeId,sentences:rows.map(row=>({...row,anchors:[...row.text].flatMap((text,offset)=>
    /[\p{L}\p{N}\p{S}]/u.test(text)?[{anchorId:`a_${hash({scopeId,i:row.sentenceIndex,offset}).slice(0,24)}`,offset,text}]:[])}))};
}

export function compileEditorialAnchorEvents(events,scope,shotId){
  if(!Array.isArray(events)||!events.length)throw invalid(`${shotId}缺少可见字段和真实锚词事件`);
  const anchors=new Map(scope.sentences.flatMap(row=>row.anchors.map(a=>[a.anchorId,{...a,row}])));
  return events.map(event=>{
    if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(k=>
      !['field','text','fromAnchorId','throughAnchorId','role','reason'].includes(k)))
      throw invalid(`${shotId}只允许本镜字符编号，不得自由填写sentenceIndex、anchor、carry或时间`);
    const from=anchors.get(event.fromAnchorId),through=anchors.get(event.throughAnchorId);
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
    const {fromAnchorId,throughAnchorId,...rest}=event;
    return {...rest,sentenceIndex:from.row.sentenceIndex,anchor};
  });
}
