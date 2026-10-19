import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sha=f=>fs.existsSync(f)?createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null;
const read=f=>{try{return JSON.parse(fs.readFileSync(f));}catch{return null;}};
export function paidRepairScope(checks,shotIds,proposal){
 const ids=new Set(shotIds);
 return [...new Set(checks.filter(i=>ids.has(i.shotId)).map(i=>JSON.stringify({code:i.code,shotId:i.shotId,shotCard:proposal?.shots?.find(s=>s.id===i.shotId)?.shotCard,field:i.field})))].sort();
}
// Refusal evidence only: never authorizes a request, restores content, or marks
// a gate passed. A submitted request with uncertain outcome is also not retried.
export function repeatedPaidRepairScope(project,feedback,revisionPlan){
 const ids=revisionPlan?.editableShotIds;
 if(!ids?.length)return null;
 if(ids.some(id=>typeof feedback?.proposal?.shots?.find(s=>s.id===id)?.shotCard!=='string'))return null;
 const current=paidRepairScope(feedback?.failedChecks||[],ids,feedback.proposal);if(!current.length)return null;
 const base=path.join(project,'qa/node-repairs');if(!fs.existsSync(base))return null;
 const identity=['input.txt','aligned-sentences.json','audio/full.mp3'];
 for(const entry of fs.readdirSync(base,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;
  const work=path.join(base,entry.name,'work');
  if(!fs.existsSync(work)||fs.lstatSync(work).isSymbolicLink())continue;
  if(sha(path.join(work,'source-run.json'))!==sha(path.join(project,'source-run.json'))||
    identity.some(n=>!sha(path.join(project,n))||sha(path.join(work,n))!==sha(path.join(project,n))))continue;
  const submission=read(path.join(work,'qa/editorial-single-submission.json'));
  if(submission?.schema!=='talkcraft-editorial-single-submission-v1'||!submission.submittedAt||
    ['input.txt','aligned-sentences.json'].some(n=>submission.inputs?.[n]!==sha(path.join(project,n))))continue;
  const request=read(path.join(work,'qa/editorial-selection-request.json'));if(!request)continue;
  const {requestId,...contract}=request;
  if(request.schema!=='talkcraft-editorial-selection-request-v2'||!requestId||requestId!==digest(contract)||
    JSON.stringify([...request.editableShotIds||[]].sort())!==JSON.stringify([...ids].sort())||
    !Array.isArray(request.failedChecks)||ids.some(id=>typeof request.baseProposal?.shots?.find(s=>s.id===id)?.shotCard!=='string'))continue;
  const prior=new Set(paidRepairScope(request.failedChecks,ids,request.baseProposal)),repeated=current.filter(i=>prior.has(i));
  if(repeated.length)
    return {requestId,directory:path.relative(project,work).replaceAll('\\','/'),shotIds:ids,scope:repeated};
 }
 return null;
}
