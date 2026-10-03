import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const CONFIG_DIR = process.env.SHOTCRAFT_CONFIG_DIR
  || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'VideoShotCraft');
const CONFIG_FILE = path.join(CONFIG_DIR, 'a-mode-ark-config.dpapi.json');
const MODEL_CHOICES = new Set(['pro', 'turbo']);
const ENDPOINT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function readStoredPublicConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  return {...(raw.public || {})};
}

function protect(value) {
  return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($s); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))'],
  {input:value, encoding:'utf8', timeout:15000, windowsHide:true}).trim();
}

function unprotect(value) {
  return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd().Trim(); $b=[Convert]::FromBase64String($s); [Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))'],
  {input:value, encoding:'utf8', timeout:15000, windowsHide:true}).trim();
}

export function readStoredAModeConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  return {...raw.public, ...(raw.secret ? {apiKey:unprotect(raw.secret)} : {})};
}

export function writeStoredAModeConfig(input = {}) {
  const previous = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {public:{}};
  const publicConfig = {...(previous.public || {})};
  for (const key of ['proEndpoint', 'turboEndpoint', 'fallbackEndpoint', 'fallbackProEndpoint', 'fallbackTurboEndpoint']) {
    if (input[key] === undefined) continue;
    const value = String(input[key] || '').trim();
    if (value && !ENDPOINT_ID.test(value)) throw new Error(`${key} 必须填写火山方舟接入点或模型 ID`);
    publicConfig[key] = value;
  }
  for (const key of ['globalModel', 'shotModel']) {
    if (input[key] === undefined) continue;
    if (!MODEL_CHOICES.has(input[key])) throw new Error(`${key} 只能选择 Pro 或 Turbo`);
    publicConfig[key] = input[key];
  }
  const apiKey = String(input.apiKey || '').trim();
  if (apiKey && /[\s"']/.test(apiKey)) throw new Error('方舟 API Key 含空格或引号，请检查复制内容');
  const fallbackApiKey = String(input.fallbackApiKey || '').trim();
  if (fallbackApiKey && /[\s"']/.test(fallbackApiKey)) throw new Error('备用 API Key 含空格或引号，请检查复制内容');
  if (input.fallbackEnabled !== undefined) {
    if (typeof input.fallbackEnabled !== 'boolean') throw new Error('跌落开关必须为布尔值');
    publicConfig.fallbackEnabled = input.fallbackEnabled;
  }
  if (publicConfig.fallbackEnabled) {
    for (const choice of [publicConfig.globalModel || 'pro', publicConfig.shotModel || 'turbo']) {
      const key = choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint';
      if (!(publicConfig[key] ?? publicConfig.fallbackEndpoint)) throw new Error(`启用跌落前请填写备用 ${choice === 'pro' ? 'Pro' : 'Turbo'} 接入点 ID`);
    }
  }
  const secret = apiKey ? protect(apiKey) : previous.secret;
  const fallbackSecret = fallbackApiKey ? protect(fallbackApiKey) : previous.fallbackSecret;
  mkdirSync(CONFIG_DIR, {recursive:true});
  writeFileSync(CONFIG_FILE, JSON.stringify({schema:'a-mode-ark-config-dpapi-v1', public:publicConfig, secret, fallbackSecret}, null, 2),
    {encoding:'utf8', mode:0o600});
  return aModeReadiness();
}

export function aModeRuntimeConfig(env = process.env, {decryptFallback = true} = {}) {
  const envApiKey = String(env.A_MODE_ARK_API_KEY || env.ARK_API_KEY || '').trim();
  // The runtime bridge injects the decrypted key through the environment. In
  // that case read only public settings; this keeps readiness independent from
  // PowerShell child-process permissions while never writing the key to disk.
  const stored = envApiKey ? readStoredPublicConfig() : readStoredAModeConfig();
  const proEndpoint = String(stored.proEndpoint ?? env.A_MODE_ARK_PRO_MODEL ?? '').trim();
  const turboEndpoint = String(stored.turboEndpoint ?? env.A_MODE_ARK_TURBO_MODEL ?? '').trim();
  const globalModel = stored.globalModel ?? env.A_MODE_GLOBAL_MODEL ?? 'pro';
  const shotModel = stored.shotModel ?? env.A_MODE_SHOT_MODEL ?? 'turbo';
  const apiKey = envApiKey || String(stored.apiKey || '').trim();
  if (!MODEL_CHOICES.has(globalModel) || !MODEL_CHOICES.has(shotModel)) throw new Error('A 模式模型选择无效');
  if (apiKey && /[\s"']/.test(apiKey)) throw new Error('方舟 API Key 含空格或引号，请检查配置');
  const fallbackEnabled = stored.fallbackEnabled === true;
  const fallbackEndpoint = String(stored.fallbackEndpoint || '').trim();
  const fallbackProEndpoint = String(stored.fallbackProEndpoint ?? stored.fallbackEndpoint ?? '').trim();
  const fallbackTurboEndpoint = String(stored.fallbackTurboEndpoint ?? stored.fallbackEndpoint ?? '').trim();
  // Only decrypt the independent backup credential when fallback is enabled.
  const raw = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
  const fallbackApiKey = fallbackEnabled && decryptFallback ? (raw.fallbackSecret ? unprotect(raw.fallbackSecret) : apiKey) : '';
  if ([fallbackEndpoint, fallbackProEndpoint, fallbackTurboEndpoint].some(value => value && !ENDPOINT_ID.test(value))) throw new Error('备用接入点 ID 无效');
  return {apiKey, proEndpoint, turboEndpoint, globalModel, shotModel, fallbackEnabled, fallbackEndpoint, fallbackProEndpoint, fallbackTurboEndpoint, fallbackApiKey,
    fallbackKeyConfigured:Boolean(raw.fallbackSecret)};
}

export function aModeReadiness(env = process.env) {
  const config = aModeRuntimeConfig(env, {decryptFallback:false});
  const globalEndpoint = config[`${config.globalModel}Endpoint`];
  const shotEndpoint = config[`${config.shotModel}Endpoint`];
  const backupFor = choice => config[choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint'];
  const fallbackEndpointsConfigured = Boolean(backupFor(config.globalModel) && backupFor(config.shotModel));
  return {provider:'volcengine-ark', apiKeyConfigured:Boolean(config.apiKey),
    proEndpoint:config.proEndpoint, turboEndpoint:config.turboEndpoint,
    globalModel:config.globalModel, shotModel:config.shotModel,
    fallbackEnabled:config.fallbackEnabled, fallbackEndpoint:config.fallbackEndpoint,
    fallbackProEndpoint:config.fallbackProEndpoint, fallbackTurboEndpoint:config.fallbackTurboEndpoint,
    fallbackKeyConfigured:config.fallbackKeyConfigured,
    fallbackConfigured:Boolean(fallbackEndpointsConfigured && (config.fallbackKeyConfigured || config.apiKey)),
    configured:Boolean(config.apiKey && globalEndpoint && shotEndpoint && (!config.fallbackEnabled || fallbackEndpointsConfigured))};
}
