import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {materialMatchPreviewEnabled, previewMaterialMatches} from './material-match-preview.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = [
  {path: 'office.mp4', duration_sec: 5, tags: ['办公场景']},
  {path: 'screen.mp4', duration_sec: 5, tags: ['科技界面']},
];

test('preview stays opt-in and keeps one result per scene without writing the index', () => {
  assert.equal(materialMatchPreviewEnabled({}), false);
  assert.equal(materialMatchPreviewEnabled({SHOTCRAFT_MATCH_PREVIEW: '1'}), true);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-match-'));
  try {
    const folder = path.join(root, 'materials');
    fs.mkdirSync(folder);
    const file = path.join(folder, '_index.json');
    const original = JSON.stringify(index);
    fs.writeFileSync(file, original);
    const matches = previewMaterialMatches(root, [{text: '职场沟通'}, {text: '手机屏幕'}]).matches;
    assert.equal(matches.length, 2);
    assert.deepEqual(matches.map(match => match.sceneIndex), [0, 1]);
    assert.deepEqual(matches.map(match => match.review), ['pending', 'pending']);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.deepEqual(fs.readdirSync(root), ['materials']);
    assert.throws(() => previewMaterialMatches(root, [{text: ''}]), /分镜文案/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('shared listener exposes matching only when enabled', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-match-http-'));
  const folder = path.join(root, 'materials');
  fs.mkdirSync(folder);
  const file = path.join(folder, '_index.json');
  const original = JSON.stringify(index);
  fs.writeFileSync(file, original);
  try {
    for (const enabled of [false, true]) {
      const port = 20000 + Math.floor(Math.random() * 20000);
      const server = spawn(process.execPath, ['console-server.mjs'], {
        cwd: projectRoot,
        env: {...process.env, SHOTCRAFT_ROOT: root, PORT: String(port), SHOTCRAFT_MATCH_PREVIEW: enabled ? '1' : '0'},
        stdio: 'ignore',
      });
      const base = `http://127.0.0.1:${port}`;
      try {
        let status;
        for (let attempt = 0; attempt < 40; attempt++) {
          try { status = await (await fetch(`${base}/api/isolated/material-match/status`)).json(); break; }
          catch { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert.equal(status?.enabled, enabled);
        const response = await fetch(`${base}/api/isolated/material-match`, {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({scenes: [{text: '职场沟通'}, {text: '手机屏幕'}]}),
        });
        assert.equal(response.status, enabled ? 200 : 404);
        if (enabled) {
          const result = await response.json();
          assert.equal(result.ok, true);
          assert.deepEqual(result.matches.map(match => match.sceneIndex), [0, 1]);
          assert.deepEqual(result.matches.map(match => match.review), ['pending', 'pending']);
          const oversized = await (await fetch(`${base}/api/isolated/material-match`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: ' '.repeat(64 * 1024 + 1),
          })).json();
          assert.equal(oversized.ok, false);
          assert.match(oversized.error, /请求过大/);
        }
        assert.equal(fs.readFileSync(file, 'utf8'), original);
        assert.deepEqual(fs.readdirSync(root), ['materials']);
      } finally { server.kill(); }
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
