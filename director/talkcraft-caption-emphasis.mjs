// Narration annotations and original character clocks only. No shot/card input.
export const CAPTION_EMPHASIS_RULES='口播字幕重点独立于镜头卡片。返回顶层captionEmphasis={schema:"talkcraft-caption-emphasis-plan-v1",sentences:[{i:0,text:"原句",keyword:"原句中的连续重点短语",occurrence:1,reason:"强调依据"}]}，逐句完整覆盖输入句序。纯过渡句可用keyword:""和skipReason说明；有重点的句子应占全文多数。每个显示短句至多一个2至8字重点，不能改写原文、跨字幕行或盲取句尾。无需提供时间：程序从原配音真实字级时钟定位。不能从模板keyword参数推导字幕重点，禁止估算秒数、提前亮色或重复叠加模板口播字幕。';
const BREAKS=new Set(['，','。','？','！','；','：']);
const removed=ch=>/[，。？！；：、\s]/u.test(ch);
export function captionPhrases(timing){
 const out=[];
 for(const [sceneIndex,scene] of timing.scenes.entries()){
  let chars=[],part=0;
  const flush=()=>{
   const visible=chars.filter(c=>!removed(c.ch));
   if(visible.length)out.push({id:`${scene.id}-p${part++}`,sceneIndex,text:visible.map(c=>c.ch).join(''),start:visible[0].t,end:visible.at(-1).e,chars:visible});
   chars=[];
  };
  for(const ch of scene.chars){chars.push(ch);if(BREAKS.has(ch.ch)||chars.length>=24)flush();}
  flush();
 }
 return out.map((p,i)=>({...p,end:out[i+1]?.start??timing.totalSec}));
}
export function validateCaptionAnnotations(plan,sentences){
 const issues=[];
 if(plan?.schema!=='talkcraft-caption-emphasis-plan-v1'||!Array.isArray(plan.sentences)||plan.sentences.length!==sentences.length)
  return ['字幕重点清单须逐句完整覆盖原稿'];
 for(const [i,source] of sentences.entries()){
  const row=plan.sentences[i],text=typeof source==='string'?source:source.text;
  if(row?.i!==i||row.text!==text){issues.push(`第${i+1}句原文或句序已失效`);continue;}
  if(typeof row.keyword!=='string'){issues.push(`第${i+1}句缺少重点或明确的过渡说明`);continue;}
  if(!row.keyword){if(!String(row.skipReason||'').trim())issues.push(`第${i+1}句未强调须有原因`);continue;}
  if(Array.from(row.keyword).length<2||Array.from(row.keyword).length>8||Array.from(row.keyword).some(removed)||!text.includes(row.keyword)||!String(row.reason||'').trim())issues.push(`第${i+1}句重点须为原文2至8字连续短语并说明依据，不跨标点`);
  const count=text.split(row.keyword).length-1;
  if(!Number.isInteger(row.occurrence)||row.occurrence<1||row.occurrence>count)issues.push(`第${i+1}句须明确原文中第几次出现`);
  if(['start','end','spokenSec','startSec','startFrame'].some(k=>k in row))issues.push(`第${i+1}句不得手填重点时间`);
 }
 if(plan.sentences.filter(r=>r?.keyword).length<=sentences.length/2)issues.push('有重点的句子未覆盖全文多数，须完善逐句标注');
 return issues;
}
export function compileCaptionEmphasis(plan,timing,{fps=30}={}){
 const issues=validateCaptionAnnotations(plan,timing.scenes),phrases=captionPhrases(timing),events=[],checks=[];
 if(fps!==30)issues.push('字幕字级时钟只接受明确的30fps');
 if(!issues.length)for(const row of plan.sentences){
  const scene=timing.scenes[row.i];
  if(scene.chars.map(c=>c.ch).join('')!==scene.text){issues.push(`第${row.i+1}句字符与原文不符`);continue;}
  if(!row.keyword){checks.push({i:row.i,text:row.text,highlighted:false,reason:row.skipReason});continue;}
  let from=-1;for(let n=0;n<row.occurrence;n++)from=scene.text.indexOf(row.keyword,from+1);
  const first=Array.from(scene.text.slice(0,from)).length,last=first+Array.from(row.keyword).length;
  const selected=scene.chars.slice(first,last),begin=selected[0],end=selected.at(-1);
  const phrase=phrases.find(p=>p.sceneIndex===row.i&&p.chars.includes(begin)&&p.chars.includes(end));
  if(!phrase){issues.push(`第${row.i+1}句重点跨显示短句，须重新标注`);continue;}
  if(selected.some(c=>!Number.isFinite(c.t)||!Number.isFinite(c.e)||c.e<c.t)||selected.some((c,i)=>i&&c.t<selected[i-1].t)){
   issues.push(`第${row.i+1}句缺少有效真实字级时间`);continue;
  }
  if(events.some(e=>e.phraseId===phrase.id)){issues.push(`第${row.i+1}句同一显示短句重复重点`);continue;}
  const at=phrase.chars.indexOf(begin),textStart=phrase.chars.slice(0,at).map(c=>c.ch).join('').length;
  const event={id:`caption-${row.i+1}`,sentenceIndex:row.i,phraseId:phrase.id,text:row.keyword,phraseText:phrase.text,
   phraseStart:phrase.start,phraseEnd:phrase.end,textStart,textEnd:textStart+row.keyword.length,
   spokenSec:begin.t,spokenEndSec:end.e,startFrame:Math.ceil(begin.t*fps-1e-8),reason:row.reason};
  if(event.startFrame/fps>=phrase.end){issues.push(`第${row.i+1}句重点已超出显示窗口`);continue;}
  events.push(event);checks.push({i:row.i,text:row.text,highlighted:true,keyword:row.keyword,spokenSec:begin.t,startFrame:event.startFrame});
 }
 return {schema:'talkcraft-caption-emphasis-v1',fps,passed:issues.length===0,issues,events,checks,
  coverage:{sentences:timing.scenes.length,highlighted:events.length,ordinary:checks.filter(c=>!c.highlighted).length,
   ratio:timing.scenes.length?events.length/timing.scenes.length:0,displayPhrases:phrases.length},
  timingSource:'original-character-timestamps',dependsOnShotCards:false,userAcceptance:false};
}
export function captionEmphasisForLine(line,events){
 const e=(events||[]).find(e=>e.phraseText===line.text&&e.phraseStart===line.start&&e.phraseEnd===line.end);
 return e?{before:line.text.slice(0,e.textStart),keyword:e.text,after:line.text.slice(e.textEnd),start:e.spokenSec}:null;
}
