// Spoken copy must appear at the voice anchor. Context copy follows the card's
// native entrance and must be visibly evidenced within the audited shot.
export function validateTextBindings({frames,rows,events}){
 const failures=[];
 for(const frame of frames)if(!rows.some(r=>r.frame===frame))failures.push({frame,reason:'缺少文字绑定实帧证据'});
 for(const e of events.filter(e=>!e.deferredTo)){
  if(!rows.some(r=>frames.includes(r.frame)&&r.beatId===e.beatId&&r.events?.some(v=>v.id===e.id&&v.found)))
   failures.push({id:e.id,shotId:e.beatId,text:e.text,reason:'计划文字未绑定实际画面，请核对公共匹配规则与模板字段'});
 }
 return failures;
}
export function summarizeWordFailures(failures,rows=[]){
 const groups=new Map();
 for(const failure of failures){
  for(const issue of failure.issues?.length?failure.issues:[failure]){
   const shot=issue.id?.split('-text')[0]||rows.find(r=>r.frame===failure.frame)?.beatId||'全片';
   const rawReason=issue.reason||failure.reason;
   const reason=({'late/hidden reveal':'文字在口播锚点后仍未显示','target absent at voice anchor':'口播锚点处缺少对应文字',
    'early reveal':'文字早于口播锚点出现','no runtime evidence':'缺少实际画面证据',
    'missing event evidence':'缺少文字事件证据','unplanned visible business text':'画面出现计划外文字',
    'native content exited before shot ended':'内容在镜头结束前退场',
    'context text never visibly evidenced':'说明文字未实际显示','layout not readable':'实际布局不可读'})[rawReason]||rawReason;
   const key=shot+'|'+reason;
   const group=groups.get(key)||{shot,reason,frames:new Set(),minimum:null};
   if(Number.isFinite(failure.frame))group.frames.add(failure.frame);
   if(Number.isFinite(issue.mobilePx))group.minimum=Math.min(group.minimum??Infinity,issue.mobilePx);
   groups.set(key,group);
  }
 }
 return [...groups.values()].map(g=>`${g.shot}：${g.reason}${g.minimum!==null?`（最小 ${g.minimum.toFixed(2)}px）`:''}${g.frames.size?`，${g.frames.size} 个抽查帧`:''}`);
}
export function validateWordRuntime({frames,rows,events,beats,native}) {
 const failures=[];
 const firstVisibleByBeat=new Map();
 if(native)for(const row of rows){
  if(row.contentVisible&&!firstVisibleByBeat.has(row.beatId))firstVisibleByBeat.set(row.beatId,row.frame);
 }
 for(const frame of frames){
  const row=rows.find(r=>r.frame===frame);
  if(!row){failures.push({frame,reason:'no runtime evidence'});continue;}
  const beat=beats.find(b=>b.id===row.beatId);
  for(const target of events.filter(e=>e.beatId===row.beatId)){
   const e=row.events.find(e=>e.id===target.id);
   if(!e){failures.push({frame,id:target.id,reason:'missing event evidence'});continue;}
   if(e.visible&&(e.deferred||frame<target.globalFrame))failures.push({frame,id:e.id,reason:'early reveal'});
   const after=Math.min(beat.endFrame-1,Math.max(beat.startFrame,target.globalFrame)+3);
   if(target.role!=='context'&&!target.deferredTo&&frame===after&&(!e.found||!e.visible))
    failures.push({frame,id:e.id,reason:!e.found?'target absent at voice anchor':'late/hidden reveal'});
  }
  if(row.unplanned.length)failures.push({frame,reason:'unplanned visible business text',text:row.unplanned});
  if(row.layoutIssues?.length)failures.push({frame,reason:'layout not readable',issues:row.layoutIssues});
  // Native cards may spend their opening frames entering. Once the first
  // visible frame is evidenced, however, an unexpected empty frame is a real
  // early-exit failure. This keeps the gate strict without treating entrance
  // animation as a premature exit.
  const firstVisible=firstVisibleByBeat.get(row.beatId);
  if(native&&!row.contentVisible&&beat&&firstVisible!==undefined&&frame>firstVisible&&frame<beat.endFrame-15)
   failures.push({frame,reason:'native content exited before shot ended'});
 }
 for(const e of events.filter(e=>e.role==='context'&&!e.deferredTo)){
  if(!rows.some(r=>frames.includes(r.frame)&&r.beatId===e.beatId&&r.events.some(v=>v.id===e.id&&v.found&&v.visible)))
   failures.push({id:e.id,reason:'context text never visibly evidenced'});
 }
 return failures;
}
