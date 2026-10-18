import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseArkJsonResponse} from './a-mode-ark-client.mjs';

const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,message)=>Object.assign(Error(message),{code,retryable:false});
const inputHashes=project=>Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,sha(fs.readFileSync(path.join(project,n)))]));
const submission=project=>read(path.join(project,fs.existsSync(path.join(project,'qa/editorial-single-submission.json'))?
  'qa/editorial-single-submission.json':'qa/editorial-provider-session.json'));
const pointerFile=project=>path.join(project,'qa/editorial-provider-receipt.json');

// This receipt is scoped to one submitted request, never a search across old
// runs. Raw bodies stay local with no Authorization headers or provider keys.
export function captureEditorialResponse(project,{runId,prompt,requestId=null}){
  if(!fs.existsSync(path.join(project,'qa/editorial-single-submission.json'))){
    // Legacy unrestricted callers still retain evidence. This session is only
    // response provenance; it does not grant authorization or permit a retry.
    fs.writeFileSync(path.join(project,'qa/editorial-provider-session.json'),JSON.stringify({submittedAt:new Date().toISOString(),inputs:inputHashes(project)}));
  }
  return (body,meta)=>{
    const r=submission(project),inputs=inputHashes(project);
    if(!r.submittedAt||JSON.stringify(r.inputs)!==JSON.stringify(inputs))throw fail('EDITORIAL_RESPONSE_BINDING_INVALID','响应留存与本次提交输入不一致');
    const envelope={schema:'talkcraft-editorial-provider-envelope-v1',runId,submittedAt:r.submittedAt,inputs,
      requestId,promptSha256:sha(prompt),bodySha256:sha(body),body,
      transport:{httpStatus:meta.httpStatus,phase:meta.phase,attempt:meta.attempt,source:meta.source,endpoint:meta.endpoint}};
    const directory=path.join(project,'qa/editorial-provider-envelopes');fs.mkdirSync(directory,{recursive:true});
    const file=path.join(directory,randomUUID()+'.json'),bytes=JSON.stringify(envelope,null,2);
    fs.writeFileSync(file,bytes,{flag:'wx'});
    fs.writeFileSync(pointerFile(project),JSON.stringify({schema:'talkcraft-editorial-provider-receipt-v1',
      runId,submittedAt:r.submittedAt,file:path.relative(project,file).replaceAll('\\','/'),sha256:sha(bytes)},null,2));
  };
}

export function recoverEditorialResponse(project,{runId,prompt,requestId=null}){
  const r=submission(project),pointer=pointerFile(project);
  if(!fs.existsSync(pointer))throw fail('EDITORIAL_RESPONSE_NOT_RETAINED','本次请求未留存返回原文，无法免费恢复；禁止串用旧结果，未再次调用模型');
  const p=read(pointer);
  if(p.schema!=='talkcraft-editorial-provider-receipt-v1'||p.runId!==runId||p.submittedAt!==r.submittedAt||
    !/^qa\/editorial-provider-envelopes\/[a-f0-9-]+\.json$/u.test(p.file||''))throw fail('EDITORIAL_RESPONSE_BINDING_INVALID','响应记录不属于当前任务及本次提交');
  const file=path.join(project,p.file);
  if(fs.lstatSync(file).isSymbolicLink()||sha(fs.readFileSync(file))!==p.sha256)throw fail('EDITORIAL_RESPONSE_HASH_MISMATCH','响应原文哈希不符，拒绝恢复');
  const e=read(file),inputs=inputHashes(project);
  if(e.schema!=='talkcraft-editorial-provider-envelope-v1'||e.runId!==runId||e.submittedAt!==r.submittedAt||
    JSON.stringify(e.inputs)!==JSON.stringify(inputs)||JSON.stringify(r.inputs)!==JSON.stringify(inputs)||
    e.requestId!==requestId||e.promptSha256!==sha(prompt)||sha(e.body)!==e.bodySha256)
    throw fail('EDITORIAL_RESPONSE_BINDING_INVALID','响应与当前输入、选卡请求或提示词不一致，拒绝串用');
  let payload;try{payload=JSON.parse(e.body);}catch{throw fail('ARK_ENVELOPE_JSON_INVALID','已保存的 HTTP 响应正文不是合法 JSON；未再次调用模型');}
  return parseArkJsonResponse(payload);
}

export function responseFailureDetails(error){
  return {code:error.code||'EDITORIAL_PROVIDER_ERROR',message:String(error.message||error),
    ...(Number.isInteger(error.outputLength)?{outputLength:error.outputLength}:{}),productionAdmitted:false};
}
