import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateSpeechRate} from './voice-speed.mjs';
import {tts2Request} from './volcengine-tts2.mjs';
import {voicePreviewFile, createVoicePreviewCache} from './voice-preview-cache.mjs';
import {createAModeRun} from './a-mode-run.mjs';

test('speech rate defaults and bounds reject invalid external input', () => {
  for (const value of [undefined, null, 0, '0']) assert.equal(validateSpeechRate(value), 0);
  for (const value of [-15, 15, '10']) assert.equal(validateSpeechRate(value), Number(value));
  for (const value of [-16, 16, 1.5, '', ' ', true, [], 'NaN']) assert.throws(() => validateSpeechRate(value), /语速/);
  assert.equal(tts2Request('测试', 'zh_female_vv_uranus_bigtts', 12).req_params.audio_params.speech_rate, 12);
  assert.equal(tts2Request('测试', 'zh_female_vv_uranus_bigtts').req_params.audio_params.speech_rate, 0);
});

test('preview preserves normal-speed cache and isolates speed with request deduplication', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'speech-rate-'));
  try {
    const calls = [];
    const cache = createVoicePreviewCache(root, '测试', async ({speechRate}) => {
      calls.push(speechRate);
      return Buffer.concat([Buffer.from('ID3'), Buffer.alloc(150)]);
    });
    assert.equal(voicePreviewFile(root, 'speaker', '测试'), voicePreviewFile(root, 'speaker', '测试', 0));
    assert.notEqual(voicePreviewFile(root, 'speaker', '测试'), voicePreviewFile(root, 'speaker', '测试', 12));
    await cache.getOrCreate('speaker');
    await Promise.all([cache.getOrCreate('speaker', 12), cache.getOrCreate('speaker', 12)]);
    assert.deepEqual(calls, [0, 12]);
    assert.ok(cache.read('speaker', 12));
    await assert.rejects(cache.getOrCreate('speaker', 100), /语速/);
    assert.deepEqual(calls, [0, 12]);
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test('A input freezes speed and defaults older callers to normal', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'a-speech-rate-'));
  try {
    mkdirSync(path.join(root, 'director'), {recursive:true});
    for (const speechRate of [undefined, 12]) {
      const run = createAModeRun(root, {text:'测试语速。', speechRate});
      assert.equal(JSON.parse(readFileSync(path.join(run.dir, 'input.json'))).speechRate, speechRate ?? 0);
    }
  } finally { rmSync(root, {recursive:true, force:true}); }
});
