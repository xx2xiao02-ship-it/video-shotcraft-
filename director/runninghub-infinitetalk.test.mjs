import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RunningHubInfiniteTalkTransport,
  RunningHubValidationError,
  buildRunningHubPayload,
  normalizeApiKey,
  pickRunningHubVideo,
} from './runninghub-infinitetalk.mjs';

const KEY = '0123456789abcdef0123456789abcdef';

test('normalizes bearer and rejects malformed keys', () => {
  assert.equal(normalizeApiKey(`Bearer ${KEY}`), KEY);
  assert.throws(() => normalizeApiKey('short'), RunningHubValidationError);
});

test('builds the verified InfiniteTalk node contract', () => {
  const payload = buildRunningHubPayload({imageFile: 'image.png', audioFile: 'audio.wav', prompt: '自然说话'});
  assert.deepEqual(payload.nodeInfoList.map(item => item.nodeId), ['284', '312', '125', '314', '369', '370']);
  assert.equal(payload.nodeInfoList[3].fieldValue, '自然说话');
  assert.equal(payload.nodeInfoList[1].fieldValue, '1080');
});

test('creates, polls, selects mp4, and downloads without exposing the key', async () => {
  const calls = [];
  let queryCount = 0;
  const fakeFetch = async (url, options = {}) => {
    calls.push({url, options});
    if (url.endsWith('/media/upload/binary')) return {ok: true, status: 200, json: async () => ({code: 0, data: {fileName: 'uploaded.bin'}})};
    if (url.endsWith('/run/ai-app/2006270540499128322')) return {ok: true, status: 200, json: async () => ({taskId: 'task-1', status: 'QUEUED'})};
    if (url.endsWith('/query')) {
      queryCount += 1;
      return {ok: true, status: 200, json: async () => queryCount < 2 ? {taskId: 'task-1', status: 'RUNNING'} : {taskId: 'task-1', status: 'SUCCESS', results: [{nodeId: '2', outputType: 'mp4', url: 'https://files.example/result.mp4'}], usage: {consumeCoins: 1}}};
    }
    if (url === 'https://files.example/result.mp4') return {ok: true, status: 200, headers: {get: () => 'video/mp4'}, arrayBuffer: async () => Uint8Array.from([0, 1, 2, 3]).buffer};
    throw new Error(`unexpected ${url}`);
  };
  const transport = new RunningHubInfiniteTalkTransport({apiKey: KEY, fetchImpl: fakeFetch, sleep: async () => {}, maxWaitMs: 1000});
  const created = await transport.create({imageBytes: Buffer.from('image'), audioBytes: Buffer.from('audio')});
  const result = await transport.waitForResult(created.taskId);
  const bytes = await transport.download(result.outputUrl);
  assert.equal(result.outputUrl, 'https://files.example/result.mp4');
  assert.equal(bytes.length, 4);
  assert.equal(calls.filter(item => item.url.endsWith('/media/upload/binary')).length, 2);
  assert.equal(JSON.stringify(created.payload).includes(KEY), false);
  assert.equal(JSON.stringify({taskId: created.taskId, outputUrl: result.outputUrl, usage: result.usage}).includes(KEY), false);
});

test('prefers a video result over a non-video result', () => {
  assert.equal(pickRunningHubVideo({results: [{outputType: 'png', url: 'https://x/a.png'}, {outputType: 'mp4', url: 'https://x/a.mp4'}]}), 'https://x/a.mp4');
});

