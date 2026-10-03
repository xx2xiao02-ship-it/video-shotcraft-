import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('A mode Ark readiness exposes no key and needs selected endpoints', async t => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-ark-config-test-'));
  t.after(() => fs.rmSync(configDir, {recursive:true, force:true}));
  const previousDir = process.env.SHOTCRAFT_CONFIG_DIR;
  process.env.SHOTCRAFT_CONFIG_DIR = configDir;
  let aModeReadiness, aModeRuntimeConfig;
  try {
    ({aModeReadiness, aModeRuntimeConfig} = await import(`./a-mode-provider-config.mjs?isolated=${Date.now()}`));
  } finally {
    if (previousDir === undefined) delete process.env.SHOTCRAFT_CONFIG_DIR;
    else process.env.SHOTCRAFT_CONFIG_DIR = previousDir;
  }
  const env = {A_MODE_ARK_API_KEY:'private-test-key', A_MODE_ARK_PRO_MODEL:'ep-pro-test',
    A_MODE_ARK_TURBO_MODEL:'ep-turbo-test'};
  const status = aModeReadiness(env);
  assert.equal(status.configured, true);
  assert.equal(status.globalModel, 'pro');
  assert.equal(status.shotModel, 'turbo');
  assert.equal(JSON.stringify(status).includes('private-test-key'), false);
  assert.equal(aModeReadiness({A_MODE_ARK_API_KEY:'private-test-key'}).configured, false);
  assert.throws(() => aModeRuntimeConfig({...env, A_MODE_ARK_API_KEY:'"bad key"'}), /空格或引号/);
});

test('Injected runtime key reads public settings without invoking DPAPI', async t => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-ark-public-test-'));
  t.after(() => fs.rmSync(configDir, {recursive:true, force:true}));
  const previousDir = process.env.SHOTCRAFT_CONFIG_DIR;
  process.env.SHOTCRAFT_CONFIG_DIR = configDir;
  fs.writeFileSync(path.join(configDir, 'a-mode-ark-config.dpapi.json'), JSON.stringify({
    public: {proEndpoint:'ep-public-pro', turboEndpoint:'ep-public-turbo', globalModel:'pro', shotModel:'turbo'},
    secret: 'not-read-when-env-key-is-present',
  }));
  try {
    const {aModeReadiness, aModeRuntimeConfig} = await import(`./a-mode-provider-config.mjs?public=${Date.now()}`);
    const status = aModeReadiness({A_MODE_ARK_API_KEY:'injected-runtime-key'});
    assert.equal(status.configured, true);
    assert.equal(status.proEndpoint, 'ep-public-pro');
    const runtime = aModeRuntimeConfig({A_MODE_ARK_API_KEY:'injected-runtime-key',
      A_MODE_GLOBAL_MODEL:'turbo', A_MODE_SHOT_MODEL:'pro', A_MODE_ARK_PRO_MODEL:'ep-stale'});
    assert.equal(runtime.globalModel, 'pro');
    assert.equal(runtime.shotModel, 'turbo');
    assert.equal(runtime.proEndpoint, 'ep-public-pro');
  } finally {
    if (previousDir === undefined) delete process.env.SHOTCRAFT_CONFIG_DIR;
    else process.env.SHOTCRAFT_CONFIG_DIR = previousDir;
  }
});

test('fallback settings round-trip with DPAPI, retain blank backup key, and never expose keys', async t => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-fallback-config-'));
  t.after(() => fs.rmSync(configDir, {recursive:true, force:true}));
  const previousDir = process.env.SHOTCRAFT_CONFIG_DIR;
  const previousKey = process.env.A_MODE_ARK_API_KEY;
  process.env.SHOTCRAFT_CONFIG_DIR = configDir;
  process.env.A_MODE_ARK_API_KEY = 'main-test-key';
  try {
    const {writeStoredAModeConfig, aModeRuntimeConfig, aModeReadiness} = await import(`./a-mode-provider-config.mjs?fallback=${Date.now()}`);
    assert.throws(() => writeStoredAModeConfig({fallbackEnabled:true}), /备用.*接入点/);
    assert.throws(() => writeStoredAModeConfig({fallbackEndpoint:'invalid endpoint'}), /接入点/);
    assert.throws(() => writeStoredAModeConfig({fallbackApiKey:'"bad key"'}), /备用 API Key/);
    const status = writeStoredAModeConfig({proEndpoint:'ep-pro',turboEndpoint:'ep-turbo',
      fallbackEnabled:true,fallbackEndpoint:'ep-backup',fallbackApiKey:'backup-test-key'});
    assert.equal(status.fallbackConfigured, true);
    assert.equal(status.fallbackEnabled, true);
    assert.equal(status.fallbackKeyConfigured, true);
    assert.doesNotMatch(JSON.stringify(status), /main-test-key|backup-test-key/);
    const file = path.join(configDir,'a-mode-ark-config.dpapi.json');
    const stored = JSON.parse(fs.readFileSync(file,'utf8'));
    assert.doesNotMatch(JSON.stringify(stored), /main-test-key|backup-test-key/);
    assert.equal(aModeRuntimeConfig().fallbackApiKey, 'backup-test-key');
    writeStoredAModeConfig({fallbackProEndpoint:'ep-backup-pro', fallbackTurboEndpoint:'ep-backup-turbo'});
    assert.equal(aModeReadiness().fallbackProEndpoint, 'ep-backup-pro');
    assert.equal(aModeReadiness().fallbackTurboEndpoint, 'ep-backup-turbo');
    assert.throws(() => writeStoredAModeConfig({fallbackProEndpoint:''}), /备用 Pro/);
    assert.equal(aModeReadiness().fallbackProEndpoint, 'ep-backup-pro');
    writeStoredAModeConfig({fallbackProEndpoint:'', globalModel:'turbo', shotModel:'turbo'});
    assert.equal(aModeReadiness().fallbackConfigured,true);
    assert.equal(aModeRuntimeConfig().fallbackProEndpoint,'');
    assert.throws(() => writeStoredAModeConfig({globalModel:'pro'}), /备用 Pro/);
    writeStoredAModeConfig({fallbackApiKey:'',fallbackEndpoint:'ep-backup-next'});
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).fallbackSecret,stored.fallbackSecret);
    assert.equal(aModeRuntimeConfig().fallbackEndpoint, 'ep-backup-next');
    writeStoredAModeConfig({fallbackEnabled:false});
    assert.equal(aModeRuntimeConfig().fallbackApiKey, '');
    // Saving an endpoint without a separate key deliberately reuses the main key.
    fs.writeFileSync(file,JSON.stringify({public:{fallbackEnabled:true,fallbackEndpoint:'ep-shared'}}));
    assert.equal(aModeRuntimeConfig().fallbackApiKey,'main-test-key');
    assert.equal(aModeRuntimeConfig().fallbackProEndpoint,'ep-shared');
    assert.equal(aModeRuntimeConfig().fallbackTurboEndpoint,'ep-shared');
    assert.equal(aModeReadiness().fallbackKeyConfigured,false);
  } finally {
    if (previousDir === undefined) delete process.env.SHOTCRAFT_CONFIG_DIR; else process.env.SHOTCRAFT_CONFIG_DIR = previousDir;
    if (previousKey === undefined) delete process.env.A_MODE_ARK_API_KEY; else process.env.A_MODE_ARK_API_KEY = previousKey;
  }
});
