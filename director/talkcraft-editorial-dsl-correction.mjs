import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {compileEditorialAnchorEvents} from './talkcraft-editorial-anchor-scope.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// The chapter parser renders an optional marker separately from its label.
// A source-proven word accidentally split into that marker can be moved back
// while restoring only its structural ordinal, never a factual number,
// label, event, or source offset.
export function proposeEditorialDslCorrection(raw,request,catalog){
 const changes=[];
 if(raw?.requestId!==request?.requestId)throw Error('DSL修正不属于当前请求');
 for(const row of raw.repairs||[]){
  if(!request.editableShotIds.includes(row.shotId))continue;
  const window=request.windows?.find(w=>w.shotId===row.shotId);
  const choice=window?.choices?.find(c=>c.choiceId===row.choiceId);
  const card=catalog?.cards?.find(c=>c.cardId===choice?.slug);
  if(!card||!window.anchorScope)continue;
  for(const [field,dsl]of Object.entries(card.policy?.dsl||{})){
   const before=row.templateParams?.cardProps?.[field];
   if(dsl.syntax!=='chapter'||typeof before!=='string')continue;
   const events=row.nativePresentation?.wordEvents?.filter(e=>e.field===field)||[];
   try{compileEditorialAnchorEvents(events,window.anchorScope,row.shotId);}catch{continue;}
   const lines=before.split('\n');let changed=false;
   const after=lines.map((line,index)=>{
    const parts=line.split('|').map(s=>s.trim());
    if(![2,3].includes(parts.length)||parts.length===3&&parts[2]!=='current'||
     !parts[0]||!parts[1]||!/^\p{Script=Han}+$/u.test(parts[0]))return line;
    const text=parts[0]+parts[1];
    if(events.filter(e=>e.role==='spoken'&&e.text===text).length!==1||
      events.some(e=>e.text===parts[0]||e.text===parts[1]))return line;
    // Keep numbering deterministic and disallow collisions with other rows.
    const ordinal=String(index+1).padStart(2,'0');
    if(lines.some((other,i)=>i!==index&&Number(other.split('|')[0].trim())===index+1))return line;
    changed=true;return [ordinal,text,...parts.slice(2)].join('|');
   }).join('\n');
   if(changed)changes.push({shotId:row.shotId,field,before,after,cardId:card.cardId,
    evidence:'exact-same-sentence-event-rejoins-marker-and-label'});
  }
 }
 return {schema:'talkcraft-editorial-dsl-correction-v1',requestId:request.requestId,
  inputsSha256:hash({raw,request,catalog}),changes,paidCalls:0,productionAdmitted:false};
}
export function approveEditorialDslCorrection(plan,raw,request,catalog){
 return {approved:isDeepStrictEqual(plan,proposeEditorialDslCorrection(raw,request,catalog)),planSha256:hash(plan)};
}
export function executeEditorialDslCorrection(plan,approval,raw,request,catalog){
 if(!approval?.approved||!isDeepStrictEqual(approval,approveEditorialDslCorrection(plan,raw,request,catalog)))throw Error('DSL修正未通过当前合同审批');
 const result=structuredClone(raw);
 for(const c of plan.changes)result.repairs.find(r=>r.shotId===c.shotId).templateParams.cardProps[c.field]=c.after;
 return result;
}
