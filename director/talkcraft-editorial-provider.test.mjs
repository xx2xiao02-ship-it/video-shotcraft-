import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ACCTOKEN_BASE_URL,ACCTOKEN_MODEL,editorialProviderSelection,talkcraftEditorialConfig,editorialProviderBinding} from './talkcraft-editorial-provider.mjs';
import {talkcraftEditorialDirector,ACCTOKEN_EDITORIAL_TIMEOUT_MS} from './talkcraft-editorial-provider-client.mjs';
import {editorialFallbackPlan,targetFingerprint} from './talkcraft-editorial-fallback.mjs';
import {captureEditorialResponse,recoverBoundEditorialSelectionResponse} from './talkcraft-editorial-response.mjs';
import {createHash} from 'node:crypto';
const runId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
test('AccToken局部修订有独立有限等待预算，显式超时仍只发一次且账单结果未知',async t=>{
 const f=fixture(t),config=f.config(),deadlines=[];let requests=0;
 t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return new AbortController().signal;});
 const options={config,requestPlan:editorialFallbackPlan(config),onResponse:()=>{},fetchImpl:async()=>{requests++;return new Response('{"output_text":"{}"}');}};
 await talkcraftEditorialDirector('本次局部修订',options);
 assert.deepEqual(deadlines,[600000]);assert.equal(ACCTOKEN_EDITORIAL_TIMEOUT_MS,600000);
 await assert.rejects(()=>talkcraftEditorialDirector('本次局部修订',{...options,timeoutMs:50,fetchImpl:async()=>{requests++;throw new DOMException('deadline exceeded','TimeoutError');}}),e=>{
  assert.equal(e.retryable,false);assert.equal(e.providerOutcomeUnknown,true);return true;
 });
 assert.deepEqual(deadlines,[600000,50]);assert.equal(requests,2);
});
const selection={schema:'talkcraft-editorial-provider-v1',runId,provider:'acctoken',baseUrl:ACCTOKEN_BASE_URL,model:ACCTOKEN_MODEL,wireApi:'responses'};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b-provider-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const env={SHOTCRAFT_CONFIG_DIR:dir,ACCTOKEN_API_KEY:'private-test-key'};
 const file=path.join(dir,'b-mode-editorial-providers',runId+'.json');fs.mkdirSync(path.dirname(file));
 const write=v=>fs.writeFileSync(file,JSON.stringify(v));write(selection);
 return {dir,env,write,config:()=>talkcraftEditorialConfig(runId,{env})};
}
test('按任务选择AccToken，env或本机密钥可读；缺失/错误配置不静默回退',t=>{
 const f=fixture(t),c=f.config();assert.equal(c.provider,'acctoken');assert.equal(c.proEndpoint,ACCTOKEN_MODEL);
 assert.equal(c.responsesUrl,ACCTOKEN_BASE_URL+'/responses');
 assert.equal(talkcraftEditorialConfig(runId,{env:{SHOTCRAFT_CONFIG_DIR:f.dir},readSecret:()=> 'local-test-key'}).apiKey,'local-test-key');
 assert.deepEqual(talkcraftEditorialConfig('different-run',{env:f.env,legacyConfig:()=>({legacy:true})}),{legacy:true});
 for(const apiKey of ['','bad key','"quoted"'])assert.throws(()=>talkcraftEditorialConfig(runId,{env:{...f.env,ACCTOKEN_API_KEY:apiKey},readSecret:()=>apiKey}),/Key/);
 for(const patch of [{runId:'old-run'},{baseUrl:'https://wrong.example/v1'},{model:'other-model'},{wireApi:'chat'},{apiKey:'must-not-store'}]){
  f.write({...selection,...patch});assert.throws(()=>f.config(),/配置无效/);
 }
 assert.throws(()=>editorialProviderSelection('../other',{env:f.env}),/任务ID/);
});
test('单接入点指纹绑定供应商、URL、模型和Key，配置不携带旧方舟跌落',t=>{
 const f=fixture(t),c=f.config(),p=editorialFallbackPlan({...c,fallbackEndpoint:'old-ark',genericFallbackEndpoints:['old-ark']});
 assert.equal(p.length,1);const b=editorialProviderBinding(runId,{env:f.env});assert.equal(b.targetFingerprint,targetFingerprint(p[0]));
 for(const patch of [{provider:'other'},{responsesUrl:'https://other.example/responses'},{endpoint:'other'},{apiKey:'changed'}])
  assert.notEqual(targetFingerprint({...p[0],...patch}),b.targetFingerprint);
 assert.ok(!JSON.stringify(b).includes(c.apiKey));
});
test('正式Responses报文与模型精确对应，完整原文先留存再解析；两镜JSON保持原样',async t=>{
 const f=fixture(t),config=f.config(),order=[],response={repairs:[{shotId:'s03',templateParams:{cardProps:{}}},{shotId:'s08',templateParams:{cardProps:{}}}]};
 const result=await talkcraftEditorialDirector('本次两镜提示',{config,requestPlan:editorialFallbackPlan(config),maxOutputTokens:32768,
  onAttempt:m=>{order.push('attempt');assert.equal(m.totalAttempts,1);assert.equal(m.fallback,false);},
  fetchImpl:async(url,o)=>{order.push('fetch');assert.equal(url,ACCTOKEN_BASE_URL+'/responses');
   assert.equal(o.headers.Authorization,'Bearer private-test-key');const b=JSON.parse(o.body);
   assert.equal(b.model,ACCTOKEN_MODEL);assert.equal(b.store,false);assert.equal(b.stream,false);assert.equal(b.max_output_tokens,32768);
   assert.equal(b.input[0].content[0].text,'本次两镜提示');return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}]}));},
  onResponse:(body,meta)=>{order.push('capture');assert.equal(meta.provider,'acctoken');assert.equal(meta.endpoint,ACCTOKEN_MODEL);assert.ok(body.includes('cardProps'));}});
 assert.deepEqual(result,response);assert.deepEqual(order,['attempt','fetch','capture']);
});
test('超时、HTTP错误、未完成、空文本和非法JSON均只请求一次；密钥不出现在错误中',async t=>{
 const f=fixture(t),config=f.config();
 const cases=[()=>{throw Error('network '+config.apiKey);},()=>new Response('denied',{status:401}),()=>new Response('limited',{status:429}),
  ()=>new Response('upstream',{status:500}),()=>new Response('not json'),()=>new Response(JSON.stringify({status:'incomplete',output_text:'{}'})),
  ()=>new Response('{}'),()=>new Response(JSON.stringify({output_text:'invalid'}))];
 for(const response of cases){let count=0;await assert.rejects(()=>talkcraftEditorialDirector('p',{config,requestPlan:editorialFallbackPlan(config),
  fetchImpl:async()=>{count++;return response();},onResponse:()=>{}}),e=>{assert.equal(e.retryable,false);assert.ok(!String(e).includes(config.apiKey));return true;});assert.equal(count,1);}
});
test('计划串用、无原文留存入口和保存失败都不能追加调用',async t=>{
 const f=fixture(t),config=f.config();let count=0;const options={config,requestPlan:editorialFallbackPlan(config),fetchImpl:async()=>{count++;return new Response('{"output_text":"{}"}');},onResponse:()=>{}};
 for(const patch of [{requestPlan:[]},{requestPlan:[...options.requestPlan,...options.requestPlan]},{config:{...config,responsesUrl:'https://wrong.example'}},{onResponse:undefined}])
  await assert.rejects(()=>talkcraftEditorialDirector('p',{...options,...patch}));
 assert.equal(count,0);await assert.rejects(()=>talkcraftEditorialDirector('p',{...options,onResponse:()=>{throw Error('disk full');}}),/留存失败/);assert.equal(count,1);
});
test('AccToken回执能免费恢复同一请求，跨任务或输入变化拒绝且不读取新密钥',async t=>{
 const f=fixture(t),config=f.config(),project=path.join(f.dir,'project');fs.mkdirSync(path.join(project,'qa'),{recursive:true});
 const hash=v=>createHash('sha256').update(v).digest('hex');
 for(const n of ['input.txt','aligned-sentences.json'])fs.writeFileSync(path.join(project,n),'current-input');
 fs.writeFileSync(path.join(project,'qa/editorial-single-submission.json'),JSON.stringify({submittedAt:'current',inputs:Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,hash('current-input')]))}));
 const contract={schema:'talkcraft-editorial-selection-request-v2',editableShotIds:['s03','s08']},request={requestId:hash(JSON.stringify(contract)),...contract};
 const result={schema:'test-result',repairs:[]};
 await talkcraftEditorialDirector('p',{config,requestPlan:editorialFallbackPlan(config),fetchImpl:async()=>new Response(JSON.stringify({output_text:JSON.stringify(result)})),
  onResponse:captureEditorialResponse(project,{runId,prompt:'p',requestId:request.requestId})});
 const receipt=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-provider-receipt.json')));
 const envelope=JSON.parse(fs.readFileSync(path.join(project,receipt.file)));
 assert.equal(envelope.transport.provider,'acctoken');assert.ok(!JSON.stringify(envelope).includes(config.apiKey));
 assert.deepEqual(recoverBoundEditorialSelectionResponse(project,{runId,request}),result);
 assert.throws(()=>recoverBoundEditorialSelectionResponse(project,{runId:'old-run',request}),/当前任务/);
 fs.writeFileSync(path.join(project,'input.txt'),'changed');assert.throws(()=>recoverBoundEditorialSelectionResponse(project,{runId,request}),/不一致/);
});
