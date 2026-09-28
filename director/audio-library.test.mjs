import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {indexAudioFile, listAudioLibrary, recommendBackgroundMusic, updateAudioMetadata} from './audio-library.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function wav() {
  const data = Buffer.alloc(44 + 1600);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(1600, 40);
  return data;
}

test('audio catalog separates BGM and SFX without writing during reads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-audio-'));
  try {
    fs.mkdirSync(path.join(root, 'assets', 'audio', 'bgm'), {recursive: true});
    fs.mkdirSync(path.join(root, 'template', 'public', 'audio'), {recursive: true});
    fs.writeFileSync(path.join(root, 'assets', 'audio', 'bgm', 'bed.wav'), wav());
    fs.writeFileSync(path.join(root, 'template', 'public', 'audio', 'pop.mp3'), Buffer.from('ID3\0sample'));
    fs.writeFileSync(path.join(root, 'template', 'public', 'audio', 'bgm-0123456789abcdef.mp3'), Buffer.from('ID3\0sample'));
    fs.writeFileSync(path.join(root, 'template', 'public', 'audio', 'voice.mp3'), Buffer.from('ID3\0sample'));
    assert.deepEqual(listAudioLibrary(root, 'bgm').map(item => item.name), ['bed.wav']);
    assert.deepEqual(listAudioLibrary(root, 'sfx').map(item => item.name), ['pop.mp3']);
    assert.deepEqual(recommendBackgroundMusic(root, '科技视频'), []);
    assert.equal(fs.existsSync(path.join(root, 'materials', '_audio-index.json')), false);
    indexAudioFile(root, 'bgm', 'builtin', 'bed.wav');
    updateAudioMetadata(root, 'bgm', 'builtin', 'bed.wav', {tags: ['科技'], licenseStatus: 'owned'});
    assert.equal(recommendBackgroundMusic(root, '科技视频').length, 1);
    fs.appendFileSync(path.join(root, 'assets', 'audio', 'bgm', 'bed.wav'), Buffer.from([0]));
    assert.equal(listAudioLibrary(root, 'bgm')[0].indexed, false);
    assert.deepEqual(recommendBackgroundMusic(root, '科技视频'), []);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('audio API indexes uploads, edits metadata and recommends without choosing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-audio-http-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const builtin = path.join(root, 'assets', 'audio', 'bgm');
  fs.mkdirSync(builtin, {recursive: true});
  fs.copyFileSync(path.join(projectRoot, 'assets', 'audio', 'bgm', 'cat-walk.mp3'), path.join(builtin, 'bed.mp3'));
  const server = spawn(process.execPath, ['console-server.mjs'], {
    cwd: projectRoot, env: {...process.env, SHOTCRAFT_ROOT: root, PORT: String(port)}, stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  const json = (route, method, body) => fetch(`${base}${route}`, {
    method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  }).then(response => response.json());
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(`${base}/api/library/audio?kind=bgm`); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready);
    const first = await (await fetch(`${base}/api/library/audio?kind=bgm`)).json();
    assert.equal(first.items[0].indexed, false);
    assert.equal(fs.existsSync(path.join(root, 'materials', '_audio-index.json')), false);
    const indexed = await json('/api/library/audio/index', 'POST', {kind: 'bgm', source: 'builtin', name: 'bed.mp3'});
    assert.equal(indexed.ok, true);
    assert.ok(indexed.item.durationSec > 1);
    const tagged = await json('/api/library/audio/metadata', 'PUT', {
      kind: 'bgm', source: 'builtin', name: 'bed.mp3', tags: ['科技', '轻快'], licenseStatus: 'licensed',
    });
    assert.deepEqual(tagged.item.tags, ['科技', '轻快']);
    const before = fs.readFileSync(path.join(root, 'materials', '_audio-index.json'));
    const suggested = await json('/api/library/audio/recommend', 'POST', {text: '科技产品视频'});
    assert.deepEqual(suggested.items.map(item => item.name), ['bed.mp3']);
    assert.deepEqual(suggested.items[0].matchedTags, ['科技']);
    assert.deepEqual(fs.readFileSync(path.join(root, 'materials', '_audio-index.json')), before);
    assert.equal(fs.existsSync(path.join(root, 'materials', '_music-selection.json')), false);
    const uploaded = await fetch(`${base}/api/library/audio/upload?kind=sfx&name=hit.wav`, {method: 'POST', body: wav()});
    assert.equal((await uploaded.json()).name, 'hit.wav');
    const sounds = await (await fetch(`${base}/api/library/audio?kind=sfx`)).json();
    assert.deepEqual(sounds.items.map(item => item.name), ['hit.wav']);
    assert.equal(sounds.items[0].indexed, true);
    const audio = await fetch(`${base}/api/library/audio/file?kind=sfx&source=uploaded&name=hit.wav`, {headers: {range: 'bytes=0-3'}});
    assert.equal(audio.status, 206);
    assert.equal(await audio.text(), 'RIFF');
    assert.equal((await fetch(`${base}/api/library/audio/file?kind=sfx&source=uploaded&name=..%2Fhit.wav`)).status, 404);
    assert.equal((await json('/api/library/audio/metadata', 'PUT', {
      kind: 'sfx', source: 'uploaded', name: 'hit.wav', tags: [], licenseStatus: 'invalid',
    })).ok, false);
  } finally {
    server.kill();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
