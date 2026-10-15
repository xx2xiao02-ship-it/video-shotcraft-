// Spoken copy must appear at the voice anchor. Context copy follows the card's
// native entrance and must be visibly evidenced within the audited shot.
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
