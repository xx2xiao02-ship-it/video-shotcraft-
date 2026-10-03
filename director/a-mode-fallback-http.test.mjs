import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

test('isolated console API saves encrypted backup config and reloads public state without any model call', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ark-fallback-http-'));
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['console-server.mjs'], {
    cwd:path.resolve('.'), windowsHide:true,
    env:{...process.env, PORT:String(port), SHOTCRAFT_ROOT:root, SHOTCRAFT_CONFIG_DIR:root,
      A_MODE_ARK_API_KEY:'primary-http-test', A_MODE_ARK_PRO_MODEL:'ep-test-pro', A_MODE_ARK_TURBO_MODEL:'ep-test-turbo'},
    stdio:['ignore','pipe','pipe'],
  });
  const exit = once(child, 'exit');
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated server did not start')), 10000);
    child.stdout.on('data', chunk => {if (String(chunk).includes('Server running:')) {clearTimeout(timer);resolve();}});
    child.once('error', error => {clearTimeout(timer);reject(error);});
    child.once('exit', () => {clearTimeout(timer);reject(new Error('Isolated server exited before readiness'));});
  });
  const base = `http://127.0.0.1:${port}/api/a-mode/provider`;
  const save = async body => (await fetch(base, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})).json();
  try {
    await started;
    let result = await save({fallbackEnabled:true,fallbackProEndpoint:'ep-http-backup-pro',fallbackTurboEndpoint:'ep-http-backup-turbo',fallbackApiKey:'backup-http-test'});
    assert.equal(result.ok,true);
    assert.equal(result.fallbackKeyConfigured,true);
    assert.doesNotMatch(JSON.stringify(result), /primary-http-test|backup-http-test/);
    const file = path.join(root, 'a-mode-ark-config.dpapi.json');
    const encrypted = JSON.parse(readFileSync(file,'utf8')).fallbackSecret;
    assert.ok(encrypted);
    assert.doesNotMatch(readFileSync(file,'utf8'), /backup-http-test/);
    result = await save({fallbackEnabled:false,fallbackProEndpoint:'ep-http-backup-pro',fallbackTurboEndpoint:'ep-http-backup-turbo',fallbackApiKey:''});
    assert.equal(result.ok,true);
    assert.equal(JSON.parse(readFileSync(file,'utf8')).fallbackSecret,encrypted);
    const restored = await (await fetch(base)).json();
    assert.equal(restored.fallbackProEndpoint,'ep-http-backup-pro');
    assert.equal(restored.fallbackTurboEndpoint,'ep-http-backup-turbo');
    assert.equal(restored.fallbackEnabled,false);
    assert.equal(restored.fallbackKeyConfigured,true);
    assert.equal((await save({fallbackEndpoint:'bad endpoint'})).ok,false);
  } finally {
    child.kill();
    await exit;
    rmSync(root,{recursive:true,force:true});
  }
});
