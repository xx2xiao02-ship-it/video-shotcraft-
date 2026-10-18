import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {captureEditorialResponse,recoverEditorialResponse} from './talkcraft-editorial-response.mjs';
import {arkDirector} from './a-mode-ark-client.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
function fixture(t){const project=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-response-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'qa'));fs.writeFileSync(path.join(project,'input.txt'),'real text');fs.writeFileSync(path.join(project,'aligned-sentences.json'),'[]');
  const record={submittedAt:'this-submission',inputs:Object.fromEntries(['input.txt','aligned-sentences.json'].map(n=>[n,sha(fs.readFileSync(path.join(project,n)))]))};
  fs.writeFileSync(path.join(project,'qa/editorial-single-submission.json'),JSON.stringify(record));
  return {project,options:{runId:'this-run',prompt:'current prompt',requestId:'current request'},record};
}
const meta={httpStatus:200,phase:'global',attempt:1,source:'primary',endpoint:'ep-test'};
test('saved HTTP body is replayed locally with no model access; repeat replay is read-only',t=>{
  const {project,options}=fixture(t);captureEditorialResponse(project,options)(JSON.stringify({output_text:'{"selections":[]}'}),meta);
  const before=fs.readFileSync(path.join(project,'qa/editorial-provider-receipt.json'));
  for(let i=0;i<2;i++)assert.deepEqual(recoverEditorialResponse(project,options),{selections:[]});
  assert.deepEqual(fs.readFileSync(path.join(project,'qa/editorial-provider-receipt.json')),before);
});
test('missing current receipt never searches or borrows a previous parsed result',t=>{
  const {project,options}=fixture(t);fs.writeFileSync(path.join(project,'qa/ark-editorial-response.json'),'{"shots":[]}');
  assert.throws(()=>recoverEditorialResponse(project,options),e=>e.code==='EDITORIAL_RESPONSE_NOT_RETAINED');
});
test('response replay rejects changed prompt, run, request, body hash, original text and submission',t=>{
  for(const change of ['prompt','runId','requestId','body','input','submission']){
    const {project,options,record}=fixture(t);captureEditorialResponse(project,options)('{"output_text":"{}"}',meta);
    const other={...options};if(['prompt','runId','requestId'].includes(change))other[change]='other';
    if(change==='input')fs.writeFileSync(path.join(project,'input.txt'),'changed');
    if(change==='submission')fs.writeFileSync(path.join(project,'qa/editorial-single-submission.json'),JSON.stringify({...record,submittedAt:'new'}));
    if(change==='body'){const receipt=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-provider-receipt.json')));fs.appendFileSync(path.join(project,receipt.file),' ');}
    assert.throws(()=>recoverEditorialResponse(project,other),e=>['EDITORIAL_RESPONSE_BINDING_INVALID','EDITORIAL_RESPONSE_HASH_MISMATCH'].includes(e.code),change);
  }
});
test('real transport captures malformed output for a strict free replay, no extra network call',async t=>{
  const {project,options}=fixture(t);let calls=0;const body='{"status":"completed","output_text":"{unfinished"}';
  await assert.rejects(()=>arkDirector(options.prompt,{config:{apiKey:'test-key',proEndpoint:'ep-test',globalModel:'pro'},phase:'global',
    fetchImpl:async()=>{calls++;return {ok:true,status:200,text:async()=>body};},onResponse:captureEditorialResponse(project,options)}),e=>e.code==='ARK_OUTPUT_JSON_INVALID');
  assert.throws(()=>recoverEditorialResponse(project,options),e=>e.code==='ARK_OUTPUT_JSON_INVALID');assert.equal(calls,1);
  const receipt=JSON.parse(fs.readFileSync(path.join(project,'qa/editorial-provider-receipt.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(project,receipt.file))).body,body);
});
