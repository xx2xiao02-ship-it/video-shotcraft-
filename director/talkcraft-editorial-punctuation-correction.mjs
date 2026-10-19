import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {editorialAnchorModelScope,compileEditorialAnchorEvents} from './talkcraft-editorial-anchor-scope.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const punctuation=x=>/^\p{P}+$/u.test(x);

// A node proposes only source-proven clock attachment. No copy, card, reason,
// role, sentence reference or source offset outside the declared span is guessed.
export function proposeEditorialPunctuationCorrection(raw,request){
  const changes=[];
  if(raw?.requestId!==request?.requestId)throw Error('标点修正不属于当前请求');
  for(const row of raw.repairs||[]){
    if(!request.editableShotIds.includes(row.shotId))continue;
    const scope=request.windows?.find(w=>w.shotId===row.shotId)?.anchorScope;
    if(!scope)continue;
    const sentences=editorialAnchorModelScope(scope,row.shotId).sentences;
    const events=row.nativePresentation?.wordEvents;
    if(!Array.isArray(events))continue;
    for(const [eventIndex,event]of events.entries()){
      const sentence=sentences.find(s=>s.sentenceRef===event?.sentenceRef);
      if(!sentence||event.role!=='spoken'||!Number.isInteger(event.fromOffset)||!Number.isInteger(event.throughOffset))continue;
      const chars=[...sentence.text],from=event.fromOffset,end=event.throughOffset;
      if(from<0||end<from||end>=chars.length||event.text!==chars.slice(from,end+1).join(''))continue;
      const replacement=structuredClone(event);let evidence;
      const anchors=sentence.characters.filter(c=>c.offset>=from&&c.offset<=end);
      if(anchors.length){
        const last=anchors.at(-1).offset;
        if(anchors[0].offset!==from||last===end||!punctuation(chars.slice(last+1,end+1).join('')))continue;
        replacement.throughOffset=last;
        evidence={kind:'exact-source-trailing-punctuation',sourceRange:[from,end]};
      }else{
        // Standalone punctuation may follow exactly one already valid spoken
        // event in this sentence. Attach to its final spoken character only.
        if(!punctuation(event.text)||row.templateParams?.cardProps?.[event.field]!==event.text)continue;
        const parents=events.flatMap((parent,index)=>{
          if(index>=eventIndex||parent?.sentenceRef!==event.sentenceRef||parent.role!=='spoken'||parent.throughOffset!==from-1||
            parent.text!==chars.slice(parent.fromOffset,parent.throughOffset+1).join(''))return [];
          try{compileEditorialAnchorEvents([parent],scope,row.shotId);return [{parent,index}];}catch{return [];}
        });
        if(parents.length!==1)continue;
        replacement.fromOffset=from-1;replacement.throughOffset=from-1;
        evidence={kind:'exact-source-adjacent-punctuation',sourceRange:[from,end],parentEventIndex:parents[0].index};
      }
      try{compileEditorialAnchorEvents([replacement],scope,row.shotId);}catch{continue;}
      changes.push({shotId:row.shotId,eventIndex,sourceValue:structuredClone(event),replacement,evidence});
    }
  }
  return {schema:'talkcraft-editorial-punctuation-plan-v1',requestId:request.requestId,
    rawSha256:hash(raw),contractSha256:hash(request),changes,externalRequests:0,productionAdmitted:false};
}

// Central approval independently reconstructs the node's proof. A modified
// proposal or different transaction can never authorize a patch.
export function approveEditorialPunctuationCorrection(plan,raw,request){
  const expected=proposeEditorialPunctuationCorrection(raw,request);
  return {approved:isDeepStrictEqual(plan,expected),planSha256:hash(plan),requestId:request.requestId,
    externalRequests:0,productionAdmitted:false};
}

export function executeEditorialPunctuationCorrection(raw,request,plan,approval){
  const current=approveEditorialPunctuationCorrection(plan,raw,request);
  if(!current.approved||!isDeepStrictEqual(approval,current))throw Error('标点修正方案未获当前合同审批');
  const response=structuredClone(raw);
  for(const change of plan.changes){
    const row=response.repairs.find(r=>r.shotId===change.shotId);
    row.nativePresentation.wordEvents[change.eventIndex]=structuredClone(change.replacement);
  }
  return response;
}
