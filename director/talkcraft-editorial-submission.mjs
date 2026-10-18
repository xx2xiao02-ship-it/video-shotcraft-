import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {targetFingerprint} from './talkcraft-editorial-fallback.mjs';
const fileFor=project=>path.join(project,'qa/editorial-single-submission.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs=project=>Object.fromEntries(['input.txt','aligned-sentences.json'].map(name=>[name,sha(path.join(project,name))]));
export function reserveEditorialSubmission(project,{requestPlan=[],requireConfiguredFallback=false}={}){
 const file=fileFor(project);if(!fs.existsSync(file))return {limited:false};
 const record=JSON.parse(fs.readFileSync(file,'utf8'));
 const fallback=record.maxTasks===1&&record.allowConfiguredFallback===true;
 if(requireConfiguredFallback&&!fallback)throw Error('旧任务授权按单请求限制，不能关闭固定跌落；请按一次分镜任务核对授权后继续');
 if(record.schema!=='talkcraft-editorial-single-submission-v1'||record.approved!==true||(!fallback&&record.maxRequests!==1)||
    JSON.stringify(record.inputs)!==JSON.stringify(inputs(project)))throw Error('分镜单次授权与当前批准稿、时间轴不一致，禁止提交');
 if(fallback&&record.targetFingerprints&&JSON.stringify(record.targetFingerprints)!==JSON.stringify(requestPlan.map(targetFingerprint)))throw Error('已配置的跌落接入点或凭据发生变化，请重新确认本次任务');
 const resume=fallback&&record.continuationAuthorized===true&&!record.resumedAt;
 if(record.submittedAt&&!resume)throw Error('本次分镜任务授权已使用，请先核对任务日志与服务结果；再次提交需要重新授权');
 fs.writeFileSync(file,JSON.stringify({...record,submittedAt:record.submittedAt||new Date().toISOString(),...(resume?{resumedAt:new Date().toISOString(),continuationAuthorized:false}:{}),outcome:'awaiting-provider-response'},null,2));
 const attempted=new Set((record.attempts||[]).flatMap(a=>[a.targetFingerprint,a.endpoint].filter(Boolean)));
 return fallback
   ? {limited:true,maxRequests:record.maxRequests,allowConfiguredFallback:true,requestPlan:requestPlan.filter(t=>!attempted.has(targetFingerprint(t))&&!attempted.has(t.endpoint))}
   : {limited:true,maxRequests:record.maxRequests};
}
export function editorialSubmissionState(project){
 const file=fileFor(project);if(!fs.existsSync(file))return null;
 try{const r=JSON.parse(fs.readFileSync(file,'utf8')),responseSaved=fs.existsSync(path.join(project,'qa/ark-editorial-response.json'));
  return {limited:true,submittedAt:r.submittedAt||null,responseSaved,requiresAuthorization:!!r.submittedAt&&!responseSaved&&!(r.continuationAuthorized===true&&!r.resumedAt)};
 }catch{return {limited:true,requiresAuthorization:true,invalid:true};}
}
export function recordEditorialAttempt(project,target){
 const file=fileFor(project);if(!fs.existsSync(file))return;
 const record=JSON.parse(fs.readFileSync(file,'utf8')),fingerprint=targetFingerprint(target);
 if((record.attempts||[]).some(a=>a.targetFingerprint===fingerprint))throw Error('本次任务已经尝试该接入点和账号，禁止重复请求');
 fs.writeFileSync(file,JSON.stringify({...record,attempts:[...(record.attempts||[]),{endpoint:target.endpoint,source:target.source,targetFingerprint:fingerprint,startedAt:new Date().toISOString()}]},null,2));
}
export function recordEditorialSubmissionOutcome(project,{error=null,responseSaved=false}={}){
 const file=fileFor(project);if(!fs.existsSync(file))return;
 const record=JSON.parse(fs.readFileSync(file,'utf8'));if(!record.submittedAt)return;
 const httpStatus=Number(/HTTP (\d{3})/u.exec(String(error?.message||error||''))?.[1])||null;
 fs.writeFileSync(file,JSON.stringify({...record,finishedAt:new Date().toISOString(),httpStatus,
  outcome:responseSaved?'response-saved':httpStatus?'provider-http-error':'provider-outcome-unconfirmed'},null,2));
 if(error?.code)fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file,'utf8')),failureCode:error.code,
   ...(String(error.code).startsWith('ARK_')?{outcome:error.code==='ARK_RESPONSE_CAPTURE_FAILED'?'response-retention-failed':'provider-response-invalid'}:{})},null,2));
}
