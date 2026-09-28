import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createVoicePreviewCache, voicePreviewFile} from './voice-preview-cache.mjs';

const speakerId = 'zh_female_xiaohe_uranus_bigtts';
const text = '你好，欢迎试听我的声音。';
const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(150)]);

test('preview file is reused across cache instances without another synthesis', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'voice-preview-'));
  let calls = 0;
  try {
    const create = async () => { calls++; return audio; };
    const cache = createVoicePreviewCache(root, text, create);
    assert.equal(cache.read(speakerId), null);
    assert.deepEqual(await cache.getOrCreate(speakerId), audio);
    assert.equal(existsSync(voicePreviewFile(root, speakerId, text)), true);
    const restarted = createVoicePreviewCache(root, text, create);
    assert.deepEqual(restarted.read(speakerId), audio);
    assert.deepEqual(await restarted.getOrCreate(speakerId), audio);
    assert.equal(calls, 1);
    assert.notEqual(voicePreviewFile(root, speakerId, text), voicePreviewFile(root, speakerId, `${text}再见。`));
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test('concurrent requests synthesize once and failures leave no file', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'voice-preview-'));
  let calls = 0;
  try {
    const cache = createVoicePreviewCache(root, text, async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return audio;
    });
    await Promise.all([cache.getOrCreate(speakerId), cache.getOrCreate(speakerId)]);
    assert.equal(calls, 1);
    const failed = createVoicePreviewCache(root, text, async () => Buffer.from('invalid'));
    await assert.rejects(failed.getOrCreate('zh_male_m191_uranus_bigtts'), /有效试听音频/);
    assert.equal(existsSync(voicePreviewFile(root, 'zh_male_m191_uranus_bigtts', text)), false);
  } finally { rmSync(root, {recursive:true, force:true}); }
});
