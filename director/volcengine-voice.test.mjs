import assert from 'node:assert/strict';
import test from 'node:test';
import {CLONE_URL, parseVolcengineTtsResponse, trainVolcengineVoice, volcengineVoiceReadiness} from './volcengine-voice.mjs';
import {checkProviderConnectivity} from './provider-connectivity.mjs';
import {createTalkcraftInput} from './talkcraft-input.mjs';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';

test('parses Volcengine JSON lines and combines audio chunks', () => {
  const body = [
    JSON.stringify({code:0, message:'OK', data:Buffer.from('one').toString('base64'), sentence:{words:[{word:'你'}]}}),
    JSON.stringify({code:0, message:'OK', data:Buffer.from('two').toString('base64'), sentence:{words:[{word:'好'}]}}),
  ].join('\n');
  const parsed = parseVolcengineTtsResponse(body);
  assert.equal(parsed.audioBytes.toString(), 'onetwo');
  assert.equal(parsed.words.length, 2);
});

test('provider error retains a nonzero code even when message says OK', () => {
  assert.throws(() => parseVolcengineTtsResponse(JSON.stringify({code:55000000, message:'OK'})), /code 55000000/);
});

test('HTTP stream accepts terminal OK record after audio and timestamps', () => {
  const body = [
    {code:0, message:'', data:Buffer.from('audio').toString('base64')},
    {code:0, message:'', sentence:{words:[{word:'你', startTime:0, endTime:0.2}]}},
    {code:20000000, message:'OK'},
  ].map(record => JSON.stringify(record)).join('\n');
  const result = parseVolcengineTtsResponse(body);
  assert.equal(result.audioBytes.toString(), 'audio');
  assert.equal(result.words[0].word, '你');
  assert.throws(() => parseVolcengineTtsResponse(JSON.stringify({code:20000000, message:'OK'})), /code 20000000/);
});

test('readiness does not expose secret values', () => {
  const readiness = volcengineVoiceReadiness();
  assert.equal(typeof readiness.apiKeyConfigured, 'boolean');
  assert.equal(typeof readiness.synthesisConfigured, 'boolean');
  assert.equal(readiness.cloneTrainingConfigured, readiness.apiKeyConfigured);
  assert.equal(readiness.tts2Configured, readiness.apiKeyConfigured);
  assert.equal(Object.hasOwn(readiness, 'apiKey'), false);
  assert.equal(Object.hasOwn(readiness, 'accessToken'), false);
});

test('TalkCraft input accepts a validated Volcengine speaker id', () => {
  const root = mkdtempSync(path.join(path.resolve('tmp'), 'volcengine-input-'));
  try {
    const created = createTalkcraftInput(root, {text:'你好。', voice:'', voiceMode:'volcengine-clone', speakerId:'S_demo_01', avatarBytes:readFileSync(path.resolve('gallery/og-image.jpg'))});
    const source = JSON.parse(readFileSync(path.join(created.project, 'source-run.json'), 'utf8'));
    assert.equal(source.voiceMode, 'volcengine-clone');
    assert.equal(source.speakerId, 'S_demo_01');
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test('clone training uses the documented v3 API key and audio object', async () => {
  const previous = process.env.VOLCENGINE_TTS_API_KEY;
  process.env.VOLCENGINE_TTS_API_KEY = 'test-key';
  try {
    let request;
    const result = await trainVolcengineVoice({audioBytes:Buffer.from('sample'), audioFormat:'mp3', speakerId:'S_sample_01',
      promptText:'测试语音', fetchImpl:async (url, options) => {
        request = {url, options};
        return new Response(JSON.stringify({code:0, status:2, speaker_id:'S_sample_01'}), {status:200});
      }});
    assert.equal(request.url, CLONE_URL);
    assert.equal(request.options.headers['X-Api-Key'], 'test-key');
    assert.equal(request.options.headers.Authorization, undefined);
    assert.equal(request.options.headers['X-Api-Request-Id'].length, 36);
    assert.deepEqual(JSON.parse(request.options.body), {speaker_id:'S_sample_01',
      audio:{data:Buffer.from('sample').toString('base64'), format:'mp3'}, text:'测试语音', language:0,
      extra_params:{enable_audio_denoise:false}});
    assert.equal(result.status, 2);
  } finally {
    if (previous === undefined) delete process.env.VOLCENGINE_TTS_API_KEY;
    else process.env.VOLCENGINE_TTS_API_KEY = previous;
  }
});

test('clone training requires a speaker id before any request', async () => {
  let called = false;
  await assert.rejects(trainVolcengineVoice({audioBytes:Buffer.from('sample'), audioFormat:'mp3', speakerId:'',
    fetchImpl:async () => { called = true; }}));
  assert.equal(called, false);
});

test('Volcengine network probe does not claim authentication or submit training', async () => {
  let request;
  const result = await checkProviderConnectivity('volcengine', {fetchImpl:async (url, options) => {
    request = {url:String(url), options};
    return new Response('', {status:405});
  }});
  assert.equal(request.url, CLONE_URL);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.body, undefined);
  assert.equal(request.options.headers, undefined);
  assert.equal(result.reachable, true);
  assert.equal(result.authVerified, false);
  assert.equal(result.authStatus, 'not_tested');
});

test('RunningHub query verifies an existing matching task without creating one', async () => {
  const previous = process.env.INFINITETALK_API_KEY;
  process.env.INFINITETALK_API_KEY = '0123456789abcdef0123456789abcdef';
  try {
    let request;
    const result = await checkProviderConnectivity('runninghub', {taskId:'existing-task', fetchImpl:async (url, options) => {
      request = {url:String(url), options};
      return Response.json({code:0, taskId:'existing-task', status:'SUCCESS'});
    }});
    assert.match(request.url, /\/query$/u);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, `Bearer ${process.env.INFINITETALK_API_KEY}`);
    assert.deepEqual(JSON.parse(request.options.body), {taskId:'existing-task'});
    assert.equal(result.authStatus, 'authenticated');
    assert.equal(result.authVerified, true);
  } finally {
    if (previous === undefined) delete process.env.INFINITETALK_API_KEY;
    else process.env.INFINITETALK_API_KEY = previous;
  }
});

test('RunningHub response without matching task is inconclusive', async () => {
  const previous = process.env.INFINITETALK_API_KEY;
  process.env.INFINITETALK_API_KEY = '0123456789abcdef0123456789abcdef';
  try {
    const result = await checkProviderConnectivity('runninghub', {taskId:'existing-task',
      fetchImpl:async () => Response.json({code:1007, message:'task not found'})});
    assert.equal(result.authStatus, 'inconclusive');
    assert.equal(result.authVerified, false);
  } finally {
    if (previous === undefined) delete process.env.INFINITETALK_API_KEY;
    else process.env.INFINITETALK_API_KEY = previous;
  }
});

test('RunningHub unauthorized response is not marked verified', async () => {
  const previous = process.env.INFINITETALK_API_KEY;
  process.env.INFINITETALK_API_KEY = '0123456789abcdef0123456789abcdef';
  try {
    const result = await checkProviderConnectivity('runninghub', {taskId:'existing-task',
      fetchImpl:async () => new Response('', {status:401})});
    assert.equal(result.authStatus, 'invalid_credentials');
    assert.equal(result.authVerified, false);
  } finally {
    if (previous === undefined) delete process.env.INFINITETALK_API_KEY;
    else process.env.INFINITETALK_API_KEY = previous;
  }
});
