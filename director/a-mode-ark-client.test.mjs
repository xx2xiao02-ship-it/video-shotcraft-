import assert from 'node:assert/strict';
import test from 'node:test';
import {ARK_RESPONSES_URL, arkDirector, parseArkJsonResponse} from './a-mode-ark-client.mjs';

const config = {apiKey:'private-test-key', proEndpoint:'ep-pro-test', turboEndpoint:'ep-turbo-test',
  globalModel:'pro', shotModel:'turbo'};

test('retains both HTTP and output JSON failures before parsing, never tries another paid endpoint',async()=>{
  for(const [body,code] of [['{"status":"completed","output_text":"{broken"}','ARK_OUTPUT_JSON_INVALID'],['not http json','ARK_ENVELOPE_JSON_INVALID']]){
    let calls=0,saved;
    await assert.rejects(()=>arkDirector('prompt',{config:{...config,fallbackEndpoint:'ep-backup'},phase:'global',
      fetchImpl:async()=>{calls++;return {ok:true,status:200,text:async()=>body};},
      onResponse:async(raw,meta)=>{await Promise.resolve();saved={raw,meta};}}),error=>error.code===code);
    assert.equal(calls,1);assert.equal(saved.raw,body);assert.equal(saved.meta.attempt,1);assert.equal(saved.meta.httpStatus,200);
    assert.equal(Object.hasOwn(saved.meta,'apiKey'),false);
  }
});

test('retention disk failure stops even when error contains HTTP, without retrying a paid endpoint',async()=>{
  let calls=0;
  await assert.rejects(()=>arkDirector('prompt',{config:{...config,fallbackEndpoint:'ep-backup'},phase:'global',
    fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({output_text:'{}'})};},
    onResponse:()=>{throw Error('HTTP 500 storage secret');}}),error=>error.code==='ARK_RESPONSE_CAPTURE_FAILED'&&!error.message.includes('secret'));
  assert.equal(calls,1);
});

test('routes global and shot director to distinct Ark Responses models', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({url, options});
    return {ok:true, json:async () => ({status:'completed', output:[{content:[{type:'output_text', text:'{"shots":[]}'}]}]})};
  };
  await arkDirector('global prompt', {config, phase:'global', fetchImpl});
  await arkDirector('shot prompt', {config, phase:'shot', fetchImpl});
  assert.deepEqual(requests.map(({url, options}) => [url, JSON.parse(options.body).model]),
    [[ARK_RESPONSES_URL, 'ep-pro-test'], [ARK_RESPONSES_URL, 'ep-turbo-test']]);
  assert.deepEqual(JSON.parse(requests[0].options.body).input,
    [{role:'user', content:[{type:'input_text', text:'global prompt'}]}]);
  assert.equal(JSON.parse(requests[0].options.body).store, false);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer private-test-key');
  assert.equal(typeof requests[0].options.dispatcher.dispatch, 'function');
});

test('rejects failed and malformed responses without retrying a billable call', async () => {
  assert.throws(() => parseArkJsonResponse({status:'failed', output_text:'{}'}), /未完成/);
  assert.throws(() => parseArkJsonResponse({status:'completed', output_text:'not json'}), /合法 JSON/);
  let calls = 0;
  await assert.rejects(() => arkDirector('prompt', {config, phase:'global', fetchImpl:async () => {
    calls++;
    return {ok:false, status:429, json:async () => ({error:{message:'rate limit'}})};
  }}), /HTTP 429/);
  assert.equal(calls, 1);
});

test('surfaces the transport cause without leaking the key or retrying', async () => {
  let calls = 0;
  await assert.rejects(() => arkDirector('prompt', {config, phase:'global', fetchImpl:async () => {
    calls++;
    throw new TypeError('fetch failed', {cause:Object.assign(new Error(`timeout ${config.apiKey}`),
      {code:'UND_ERR_HEADERS_TIMEOUT'})});
  }}), error => {
    assert.match(error.message, /UND_ERR_HEADERS_TIMEOUT/);
    assert.doesNotMatch(error.message, /private-test-key/);
    return true;
  });
  assert.equal(calls, 1);
});

const fallbackConfig = {...config, fallbackEnabled:true, fallbackEndpoint:'ep-backup', fallbackApiKey:'backup-test-key'};
const completed = () => ({ok:true, json:async () => ({output_text:'{"shots":[]}'})});

test('跌落依次尝试不同接入点，旧关闭字段不能关闭备用账号', async () => {
  const calls = [], waits = [], states = [];
  const result = await arkDirector('same prompt', {config:{...fallbackConfig,fallbackEnabled:false}, phase:'global',
    waitImpl:async ms => waits.push(ms), onAttempt:state => states.push(state),
    fetchImpl:async (_url, options) => {
      calls.push({body:JSON.parse(options.body), key:options.headers.Authorization});
      if (calls.length < 2) throw new DOMException('timed out', 'TimeoutError');
      return completed();
    }});
  assert.deepEqual(result, {shots:[]});
  assert.deepEqual(calls.map(call => call.body.model), ['ep-pro-test','ep-backup']);
  assert.deepEqual(calls.map(call => call.key), ['Bearer private-test-key','Bearer backup-test-key']);
  assert.ok(calls.every(call => call.body.input[0].content[0].text === 'same prompt'));
  assert.deepEqual(waits, [5000]);
  assert.deepEqual(states.map(state => state.fallback), [false, true]);
});

test('成功结果或成功响应中的非法JSON均不会继续跌落重复生成', async () => {
  for (const [response, error] of [[completed(), null], [{ok:true,json:async () => ({output_text:'invalid'})}, /合法 JSON/]]) {
    let calls = 0;
    const promise = arkDirector('prompt', {config:fallbackConfig, phase:'shot', fetchImpl:async () => {calls++; return response;}});
    if (error) await assert.rejects(promise, error); else assert.deepEqual(await promise, {shots:[]});
    assert.equal(calls, 1);
  }
});

test('跌落耗尽配置目标即停止，服务商错误不能泄漏两个账号密钥', async () => {
  let calls = 0;
  await assert.rejects(arkDirector('prompt', {config:fallbackConfig, phase:'shot', waitImpl:async () => {},
    fetchImpl:async () => {calls++; return {ok:false,status:503,json:async () => ({error:{message:'private-test-key backup-test-key'}})};}}), error => {
      assert.doesNotMatch(error.message, /private-test-key|backup-test-key/);
      return true;
    });
  assert.equal(calls, 2);
});

test('overdue primary skips retry and switches once to the independent backup account', async () => {
  const keys = [], states = [];
  const result = await arkDirector('prompt', {config:fallbackConfig, phase:'global',
    onAttempt:state => states.push(state), waitImpl:async () => assert.fail('no primary retry'),
    fetchImpl:async (_url, options) => {
      keys.push(options.headers.Authorization);
      return keys.length === 1 ? {ok:false,status:403,json:async () => ({error:{message:'account has an overdue balance'}})} : completed();
    }});
  assert.deepEqual(result, {shots:[]});
  assert.deepEqual(keys, ['Bearer private-test-key', 'Bearer backup-test-key']);
  assert.deepEqual(states.map(s => s.fallback), [false, true]);
});

test('403依次耗尽已配置目标，即使旧配置写关闭也不会跳过跌落', async () => {
  for (const [cfg, message] of [[fallbackConfig,'permission denied'],
    [{...fallbackConfig,fallbackApiKey:config.apiKey},'overdue balance'],
    [{...fallbackConfig,fallbackEnabled:false},'overdue balance']]) {
    let calls = 0;
    await assert.rejects(arkDirector('prompt', {config:cfg,phase:'global',fetchImpl:async () => {
      calls++;
      return {ok:false,status:403,json:async () => ({error:{message}})};
    }}), /HTTP 403/);
    assert.equal(calls, 2);
  }
});

test('rate limit respects Retry-After and refuses incomplete fallback before requests', async () => {
  let calls = 0;
  const waits = [];
  await arkDirector('prompt', {config:fallbackConfig, phase:'shot', waitImpl:async ms => waits.push(ms),
    fetchImpl:async () => ++calls === 1 ? {ok:false,status:429,headers:new Headers({'Retry-After':'12'}),json:async () => ({})} : completed()});
  assert.deepEqual(waits, [12000]);
  await assert.rejects(arkDirector('prompt', {config:{...fallbackConfig, fallbackEndpoint:'',apiKey:'',fallbackApiKey:''}, phase:'shot', fetchImpl:async () => {throw new Error('must not request');}}), /接入点计划无效/);
});

test('backup Pro and Turbo follow the main global and shot model selectors', async () => {
  for (const globalModel of ['pro','turbo']) for (const shotModel of ['pro','turbo']) {
    for (const phase of ['global','shot']) {
      const calls = [];
      await arkDirector('prompt', {config:{...fallbackConfig,globalModel,shotModel,
        fallbackProEndpoint:'ep-backup-pro', fallbackTurboEndpoint:'ep-backup-turbo'}, phase,
        waitImpl:async () => {}, fetchImpl:async (_url, options) => {
          calls.push(JSON.parse(options.body).model);
          if (calls.length < 2) throw new DOMException('timed out','TimeoutError');
          return completed();
        }});
      const choice = phase === 'global' ? globalModel : shotModel;
      assert.deepEqual(calls,[config[`${choice}Endpoint`],`ep-backup-${choice}`]);
    }
  }
});

test('generic fallback pools are not assigned to Pro or Turbo and use both API accounts', async () => {
  const calls = [];
  const genericConfig = {...fallbackConfig,
    genericFallbackEndpoints:['ep-main-generic-1','ep-main-generic-2','ep-main-generic-3'],
    auxiliaryGenericFallbackEndpoints:['ep-aux-generic-1','ep-aux-generic-2','ep-aux-generic-3']};
  await arkDirector('prompt', {config:genericConfig, phase:'global', waitImpl:async () => {},
    fetchImpl:async (_url, options) => {
      calls.push({model:JSON.parse(options.body).model, key:options.headers.Authorization});
      if (calls.length < 3) throw new DOMException('timed out', 'TimeoutError');
      return completed();
    }});
  assert.deepEqual(calls.map(call => call.model), ['ep-pro-test','ep-backup','ep-main-generic-1']);
  assert.deepEqual(calls.map(call => call.key), ['Bearer private-test-key','Bearer backup-test-key','Bearer private-test-key']);
});
