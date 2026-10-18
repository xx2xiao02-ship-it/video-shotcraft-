import {Agent} from 'undici';
import {arkDirector,parseArkJsonResponse} from './a-mode-ark-client.mjs';
import {ACCTOKEN_BASE_URL,ACCTOKEN_MODEL} from './talkcraft-editorial-provider.mjs';
import {targetFingerprint} from './talkcraft-editorial-fallback.mjs';

// A multi-shot structured revision can exceed the generic 120s request budget.
// This is one finite request deadline, never authorization to retry a timeout.
export const ACCTOKEN_EDITORIAL_TIMEOUT_MS=600000;

export async function talkcraftEditorialDirector(prompt,options){
 const {config,requestPlan,fetchImpl=globalThis.fetch,timeoutMs=config?.provider==='acctoken'?ACCTOKEN_EDITORIAL_TIMEOUT_MS:120000,maxOutputTokens,
  phase='global',onAttempt=()=>{},onResponse}=options;
 if(config.provider!=='acctoken')return arkDirector(prompt,options);
 const target={provider:'acctoken',responsesUrl:`${ACCTOKEN_BASE_URL}/responses`,endpoint:ACCTOKEN_MODEL,apiKey:config.apiKey};
 if(config.responsesUrl!==target.responsesUrl||config.proEndpoint!==target.endpoint||!config.apiKey||/[\s"']/u.test(config.apiKey)||
    !Array.isArray(requestPlan)||requestPlan.length!==1||targetFingerprint(requestPlan[0])!==targetFingerprint(target))
  throw Error('AccToken本次请求与已核验的单次模型计划不一致，未发送');
 if(typeof onResponse!=='function')throw Error('AccToken正式请求必须留存原始返回，未发送');
 const dispatcher=new Agent({headersTimeout:timeoutMs+1000,bodyTimeout:timeoutMs+1000});
 try{
  onAttempt({phase,attempt:1,fallback:false,source:'acctoken',endpoint:target.endpoint,totalAttempts:1});
  const res=await fetchImpl(target.responsesUrl,{method:'POST',dispatcher,signal:AbortSignal.timeout(timeoutMs),
   headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:target.endpoint,store:false,stream:false,
    input:[{role:'user',content:[{type:'input_text',text:prompt}]}],
    ...(Number.isInteger(maxOutputTokens)&&maxOutputTokens>0?{max_output_tokens:maxOutputTokens}:{})})});
  const body=await res.text();
  try{await onResponse(body,{httpStatus:res.status,phase,attempt:1,source:'acctoken',endpoint:target.endpoint,
   provider:target.provider,responsesUrl:target.responsesUrl});}
  catch{throw Object.assign(Error('AccToken响应留存失败，禁止自动追加请求'),{code:'ARK_RESPONSE_CAPTURE_FAILED'});}
  if(!res.ok)throw Object.assign(Error(`AccToken请求失败（HTTP ${res.status}），已保留原文，不自动重试`),{status:res.status});
  let envelope;try{envelope=JSON.parse(body);}catch{throw Object.assign(Error('AccToken HTTP返回不是合法JSON'),{code:'ARK_ENVELOPE_JSON_INVALID'});}
  return parseArkJsonResponse(envelope);
 }catch(error){
  // Network errors can echo request headers. Do not expose the error object,
  // cause, stack from the transport, or an unbounded provider body.
  throw Object.assign(Error(String(error.message||'AccToken请求失败').replaceAll(config.apiKey,'[REDACTED]')),
   {code:error.code||'EDITORIAL_PROVIDER_REQUEST_FAILED',retryable:false,
    ...(error.name==='TimeoutError'||error.name==='AbortError'?{providerOutcomeUnknown:true}:{}),
    ...(error.status?{status:error.status}:{})});
 }finally{await dispatcher.close();}
}
