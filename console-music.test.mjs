import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {readMusicSelection, stageBackgroundMusic, talkcraftMusicProps, writeTalkcraftMusicSnapshot} from './director/background-music.mjs';

test('console inline script parses', () => {
  const html = fs.readFileSync(new URL('./console-ui.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script);
  new vm.Script(script[1]);
  assert.match(html, /id="audio-kind-bgm"/);
  assert.match(html, /id="audio-kind-sfx"/);
  assert.match(html, /id="production-music"/);
  assert.match(html, /id="production-music-panel" hidden/);
  assert.doesNotMatch(html, /id="music-mode-[ab]"/);
});

test('music library lists, uploads, preserves names and streams audio', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-music-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const builtin = path.join(root, 'assets', 'audio', 'bgm');
  fs.mkdirSync(builtin, {recursive: true});
  fs.writeFileSync(path.join(builtin, 'builtin.mp3'), Buffer.from('ID3\0sample'));
  const server = spawn(process.execPath, ['console-server.mjs'], {
    cwd: import.meta.dirname,
    env: {...process.env, SHOTCRAFT_ROOT: root, PORT: String(port)},
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(`${base}/api/library/music`); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'console server did not start');
    const before = await (await fetch(`${base}/api/library/music`)).json();
    assert.deepEqual(before.items.map(item => item.name), ['builtin.mp3']);
    const invalidRender = await (await fetch(`${base}/api/render/confirm`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({bgm: {source: 'uploaded', name: 'missing.mp3', volume: 0.18}}),
    })).json();
    assert.equal(invalidRender.ok, false);
    assert.deepEqual((await (await fetch(`${base}/api/state`)).json()).tasks, []);
    const wav = Buffer.alloc(48);
    wav.write('RIFF', 0);
    wav.write('WAVE', 8);
    const upload = () => fetch(`${base}/api/library/music/upload?name=sample.wav`, {method: 'POST', body: wav});
    assert.equal((await (await upload()).json()).name, 'sample.wav');
    assert.equal((await (await upload()).json()).name, 'sample (2).wav');
    const invalid = await (await fetch(`${base}/api/library/music/upload?name=bad.wav`, {method: 'POST', body: Buffer.from('not audio')})).json();
    assert.equal(invalid.ok, false);
    const after = await (await fetch(`${base}/api/library/music`)).json();
    assert.equal(after.items.length, 3);
    const selected = {source: 'uploaded', name: 'sample.wav', volume: 0.18};
    const saved = await (await fetch(`${base}/api/library/music/selection`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode: 'A', selection: selected}),
    })).json();
    assert.deepEqual(saved.selection, selected);
    assert.deepEqual(readMusicSelection(root, 'A'), selected);
    const staged = stageBackgroundMusic(root, 'A', path.join(root, 'public-a'));
    assert.ok(fs.existsSync(path.join(root, 'public-a', staged.src)));
    assert.equal(stageBackgroundMusic(root, 'A', path.join(root, 'public-a'), null), null);
    const remotion = path.join(root, 'remotion-b');
    fs.mkdirSync(path.join(remotion, 'src'), {recursive: true});
    fs.writeFileSync(path.join(remotion, 'src', 'Main.tsx'), 'bgm?:');
    const selectedB = await (await fetch(`${base}/api/library/music/selection`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode: 'B', selection: selected}),
    })).json();
    assert.equal(selectedB.ok, true);
    talkcraftMusicProps(root, remotion, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(remotion, 'bgm-props.json'), 'utf8')).bgm.volume, 0.18);
    const taskRemotion = path.join(root, 'remotion-task');
    fs.mkdirSync(path.join(taskRemotion, 'src'), {recursive: true});
    fs.writeFileSync(path.join(taskRemotion, 'src', 'Main.tsx'), 'bgm?:');
    writeTalkcraftMusicSnapshot(root, taskRemotion, selected);
    assert.throws(() => writeTalkcraftMusicSnapshot(root, taskRemotion, null), /已锁定/);
    await fetch(`${base}/api/library/music/selection`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode: 'B', selection: null}),
    });
    assert.equal(talkcraftMusicProps(root, remotion, false), 'bgm-props.json');
    assert.equal(JSON.parse(fs.readFileSync(path.join(remotion, 'bgm-props.json'), 'utf8')).bgm.name, 'sample.wav');
    await fetch(`${base}/api/library/music/selection`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode: 'B', selection: selected}),
    });
    const legacy = path.join(root, 'legacy-remotion');
    fs.mkdirSync(legacy, {recursive: true});
    assert.equal(talkcraftMusicProps(root, legacy, false), 'bgm-props.json');
    assert.equal(JSON.parse(fs.readFileSync(path.join(legacy, 'bgm-props.json'), 'utf8')).bgm, null);
    const audio = await fetch(`${base}/api/library/music/audio?source=uploaded&name=sample.wav`, {headers: {range: 'bytes=0-3'}});
    assert.equal(audio.status, 206);
    assert.equal(await audio.text(), 'RIFF');
    assert.equal((await fetch(`${base}/api/library/music/audio?source=uploaded&name=..%2Fsample.wav`)).status, 400);
  } finally {
    server.kill();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
