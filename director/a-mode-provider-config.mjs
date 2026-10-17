import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const CONFIG_DIR = process.env.SHOTCRAFT_CONFIG_DIR
  || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'VideoShotCraft');
const CONFIG_FILE = path.join(CONFIG_DIR, 'a-mode-ark-config.dpapi.json');
const MODEL_CHOICES = new Set(['pro', 'turbo']);
const ENDPOINT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function normalizeEndpointList(value, key = '通用跌落接入点') {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\r\n,，]+/u);
  const result = values.map(item => String(item || '').trim()).filter(Boolean);
  if (result.some(item => !ENDPOINT_ID.test(item))) throw new Error(`${key} ID 无效`);
  return [...new Set(result)];
}

function readStoredPublicConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  return {...(raw.public || {})};
}

function runPowerShell(command, input) {
  const args=['-NoProfile','-NonInteractive','-Command',command];
  try {
    return execFileSync('powershell.exe', args, {input, encoding:'utf8', timeout:15000, windowsHide:true}).trim();
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    // 受限 Windows 进程上下文可能禁止 Node 直接 spawn PowerShell；cmd 间接启动保持同一用户 DPAPI 范围。
    return execFileSync('cmd.exe', ['/d','/c','powershell.exe',...args],
      {input, encoding:'utf8', timeout:15000, windowsHide:true}).trim();
  }
}

function protect(value) {
  return runPowerShell(
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($s); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))',
    value);
}

function unprotect(value) {
  return runPowerShell(
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd().Trim(); $b=[Convert]::FromBase64String($s); [Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))',
    value);
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
  for (const [key, label] of [['genericFallbackEndpoints', '主 API 通用跌落接入点'], ['auxiliaryGenericFallbackEndpoints', '辅助 API 通用跌落接入点']]) {
    if (input[key] === undefined) continue;
    publicConfig[key] = normalizeEndpointList(input[key], label);
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
  // Compatibility field only: every mode uses fallback; stale clients cannot disable it.
  publicConfig.fallbackEnabled = true;
  {
    const genericFallbackConfigured = (publicConfig.genericFallbackEndpoints || []).length > 0
      || (publicConfig.auxiliaryGenericFallbackEndpoints || []).length > 0;
    for (const choice of [publicConfig.globalModel || 'pro', publicConfig.shotModel || 'turbo']) {
      const key = choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint';
      if (!(publicConfig[key] ?? publicConfig.fallbackEndpoint) && !genericFallbackConfigured) {
        throw new Error(`请填写备用 ${choice === 'pro' ? 'Pro' : 'Turbo'} 接入点 ID，或至少填写一个通用跌落接入点`);
      }
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
  const envFallbackApiKey = String(env.A_MODE_ARK_FALLBACK_API_KEY || '').trim();
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
  const fallbackEnabled = true;
  const fallbackEndpoint = String(stored.fallbackEndpoint || '').trim();
  const fallbackProEndpoint = String(stored.fallbackProEndpoint ?? stored.fallbackEndpoint ?? '').trim();
  const fallbackTurboEndpoint = String(stored.fallbackTurboEndpoint ?? stored.fallbackEndpoint ?? '').trim();
  const genericFallbackEndpoints = normalizeEndpointList(stored.genericFallbackEndpoints || [], '主 API 通用跌落接入点');
  const auxiliaryGenericFallbackEndpoints = normalizeEndpointList(stored.auxiliaryGenericFallbackEndpoints || [], '辅助 API 通用跌落接入点');
  // Fallback is mandatory; readiness alone may omit secret decryption.
  const raw = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
  // The managed Windows launcher injects the already-decrypted primary key.
  // Re-decrypting the fallback DPAPI secret here starts a second PowerShell
  // child process and can fail with EPERM even though the provider is ready.
  // A saved independent backup must retain its own account even when only
  // the primary key was injected. Readiness never decrypts this secret.
  const fallbackApiKey = decryptFallback
    ? (envFallbackApiKey || (raw.fallbackSecret ? unprotect(raw.fallbackSecret) : apiKey))
    : '';
  if ([fallbackEndpoint, fallbackProEndpoint, fallbackTurboEndpoint].some(value => value && !ENDPOINT_ID.test(value))) throw new Error('备用接入点 ID 无效');
  return {apiKey, proEndpoint, turboEndpoint, globalModel, shotModel, fallbackEnabled, fallbackEndpoint, fallbackProEndpoint, fallbackTurboEndpoint,
    genericFallbackEndpoints, auxiliaryGenericFallbackEndpoints, fallbackApiKey,
    fallbackKeyConfigured:Boolean(raw.fallbackSecret)};
}

export function aModeReadiness(env = process.env) {
  const config = aModeRuntimeConfig(env, {decryptFallback:false});
  const globalEndpoint = config[`${config.globalModel}Endpoint`];
  const shotEndpoint = config[`${config.shotModel}Endpoint`];
  const backupFor = choice => config[choice === 'pro' ? 'fallbackProEndpoint' : 'fallbackTurboEndpoint'];
  const fallbackEndpointsConfigured = Boolean((backupFor(config.globalModel) && backupFor(config.shotModel))
    || config.genericFallbackEndpoints.length || config.auxiliaryGenericFallbackEndpoints.length);
  return {provider:'volcengine-ark', apiKeyConfigured:Boolean(config.apiKey),
    proEndpoint:config.proEndpoint, turboEndpoint:config.turboEndpoint,
    globalModel:config.globalModel, shotModel:config.shotModel,
    fallbackEnabled:config.fallbackEnabled, fallbackEndpoint:config.fallbackEndpoint,
    fallbackProEndpoint:config.fallbackProEndpoint, fallbackTurboEndpoint:config.fallbackTurboEndpoint,
    genericFallbackEndpoints:config.genericFallbackEndpoints, auxiliaryGenericFallbackEndpoints:config.auxiliaryGenericFallbackEndpoints,
    fallbackKeyConfigured:config.fallbackKeyConfigured,
    fallbackConfigured:Boolean(fallbackEndpointsConfigured && (config.fallbackKeyConfigured || config.apiKey)),
    configured:Boolean(config.apiKey && globalEndpoint && shotEndpoint && fallbackEndpointsConfigured)};
}
