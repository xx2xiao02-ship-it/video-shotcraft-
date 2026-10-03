import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {assertProductionOutputDirectory} from './governance-output-guard.mjs';

test('production output is rejected inside governance evidence and fixture directories', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-output-guard-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const protectedPaths = [
    'template/out/card-governance-batch-015',
    'template/out/card-business-data-batch015-v2',
    '.isolated/card-governance-batch-015',
    'template/fixtures/card-business-data-batch015-v2.json',
  ];
  for (const relative of protectedPaths)
    assert.throws(() => assertProductionOutputDirectory(root, relative), /治理证据与夹具目录受保护/);
  assert.equal(assertProductionOutputDirectory(root, 'template/out'), path.join(root, 'template', 'out'));
  assert.equal(assertProductionOutputDirectory(root, path.join(os.tmpdir(), 'shotcraft-production-output')), path.join(os.tmpdir(), 'shotcraft-production-output'));
});

test('console cannot redirect or delete an existing governance video through output settings', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-console-isolation-'));
  const protectedDir = path.join(root, 'template', 'out', 'card-business-data-batch015-v2');
  fs.mkdirSync(protectedDir, {recursive:true});
  const evidenceFile = path.join(protectedDir, 'case-1-landscape.mp4');
  fs.writeFileSync(evidenceFile, 'governance-evidence');
  const port = 25000 + Math.floor(Math.random() * 15000);
  const server = spawn(process.execPath, ['console-server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {...process.env, SHOTCRAFT_ROOT:root, PORT:String(port)},
    stdio:'ignore',
  });
  const exited = new Promise(resolve => {
    server.once('exit', resolve);
    server.once('error', resolve);
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await fetch(`${base}/api/state`); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'console server did not start');

    const redirect = await (await fetch(`${base}/api/output-path`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:protectedDir}),
    })).json();
    assert.equal(redirect.ok, false);
    assert.match(redirect.error, /治理证据与夹具目录受保护/);
    assert.equal(fs.existsSync(path.join(root, '.shotcraft-output.json')), false);

    const productionDir = path.join(root, 'production-output');
    const accepted = await (await fetch(`${base}/api/output-path`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:productionDir}),
    })).json();
    assert.equal(accepted.ok, true);
    assert.equal(accepted.path, productionDir);
    assert.equal(fs.existsSync(productionDir), true);

    fs.writeFileSync(path.join(root, '.shotcraft-output.json'), JSON.stringify({path:protectedDir}));
    const deletion = await (await fetch(`${base}/api/gallery/delete`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({file:path.basename(evidenceFile)}),
    })).json();
    assert.match(deletion.error, /治理证据与夹具目录受保护/);
    assert.equal(fs.readFileSync(evidenceFile, 'utf8'), 'governance-evidence');
  } finally {
    server.kill();
    await exited;
    fs.rmSync(root, {recursive:true, force:true});
  }
});
