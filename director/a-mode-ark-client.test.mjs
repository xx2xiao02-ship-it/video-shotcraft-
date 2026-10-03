import assert from 'node:assert/strict';
import test from 'node:test';
import {ARK_RESPONSES_URL, arkDirector, parseArkJsonResponse} from './a-mode-ark-client.mjs';

const config = {apiKey:'private-test-key', proEndpoint:'ep-pro-test', turboEndpoint:'ep-turbo-test',
  globalModel:'pro', shotModel:'turbo'};

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

test('enabled fallback retries primary once then uses independent backup key and endpoint', async () => {
  const calls = [], waits = [], states = [];
  const result = await arkDirector('same prompt', {config:fallbackConfig, phase:'global',
    waitImpl:async ms => waits.push(ms), onAttempt:state => states.push(state),
    fetchImpl:async (_url, options) => {
      calls.push({body:JSON.parse(options.body), key:options.headers.Authorization});
      if (calls.length < 3) throw new DOMException('timed out', 'TimeoutError');
      return completed();
    }});
  assert.deepEqual(result, {shots:[]});
  assert.deepEqual(calls.map(call => call.body.model), ['ep-pro-test','ep-pro-test','ep-backup']);
  assert.deepEqual(calls.map(call => call.key), ['Bearer private-test-key','Bearer private-test-key','Bearer backup-test-key']);
  assert.ok(calls.every(call => call.body.input[0].content[0].text === 'same prompt'));
  assert.deepEqual(waits, [5000, 5000]);
  assert.deepEqual(states.map(state => state.fallback), [false, false, true]);
});

test('successful primary, authentication failures and invalid JSON never spend a fallback call', async () => {
  for (const [response, error] of [[completed(), null], [{ok:false,status:401,json:async () => ({})}, /HTTP 401/], [{ok:true,json:async () => ({output_text:'invalid'})}, /合法 JSON/]]) {
    let calls = 0;
    const promise = arkDirector('prompt', {config:fallbackConfig, phase:'shot', fetchImpl:async () => {calls++; return response;}});
    if (error) await assert.rejects(promise, error); else assert.deepEqual(await promise, {shots:[]});
    assert.equal(calls, 1);
  }
});

test('fallback has a hard three-attempt limit and redacts both keys in provider errors', async () => {
  let calls = 0;
  await assert.rejects(arkDirector('prompt', {config:fallbackConfig, phase:'shot', waitImpl:async () => {},
    fetchImpl:async () => {calls++; return {ok:false,status:503,json:async () => ({error:{message:'private-test-key backup-test-key'}})};}}), error => {
      assert.doesNotMatch(error.message, /private-test-key|backup-test-key/);
      return true;
    });
  assert.equal(calls, 3);
});

test('rate limit respects Retry-After and refuses incomplete fallback before requests', async () => {
  let calls = 0;
  const waits = [];
  await arkDirector('prompt', {config:fallbackConfig, phase:'shot', waitImpl:async ms => waits.push(ms),
    fetchImpl:async () => ++calls === 1 ? {ok:false,status:429,headers:new Headers({'Retry-After':'12'}),json:async () => ({})} : completed()});
  assert.deepEqual(waits, [12000]);
  await assert.rejects(arkDirector('prompt', {config:{...fallbackConfig, fallbackEndpoint:''}, phase:'shot', fetchImpl:async () => {throw new Error('must not request');}}), /备用接入点/);
});

test('backup Pro and Turbo follow the main global and shot model selectors', async () => {
  for (const globalModel of ['pro','turbo']) for (const shotModel of ['pro','turbo']) {
    for (const phase of ['global','shot']) {
      const calls = [];
      await arkDirector('prompt', {config:{...fallbackConfig,globalModel,shotModel,
        fallbackProEndpoint:'ep-backup-pro', fallbackTurboEndpoint:'ep-backup-turbo'}, phase,
        waitImpl:async () => {}, fetchImpl:async (_url, options) => {
          calls.push(JSON.parse(options.body).model);
          if (calls.length < 3) throw new DOMException('timed out','TimeoutError');
          return completed();
        }});
      const choice = phase === 'global' ? globalModel : shotModel;
      assert.deepEqual(calls,[config[`${choice}Endpoint`],config[`${choice}Endpoint`],`ep-backup-${choice}`]);
    }
  }
});
