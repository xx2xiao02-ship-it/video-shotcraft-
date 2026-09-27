// 视频外包装 - 独立密钥配置（Windows DPAPI 加密落盘）。
// 隔离约束：复刻 provider-config.mjs 的模式但不 import、不改其 key 清单，
// 配置落到独立文件 packaging-config.dpapi.json。
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const CONFIG_DIR = process.env.SHOTCRAFT_CONFIG_DIR
  || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'VideoShotCraft');
const CONFIG_FILE = path.join(CONFIG_DIR, 'packaging-config.dpapi.json');
const SECRET_KEYS = ['openaiApiKey'];
const PUBLIC_KEYS = ['openaiBaseUrl', 'openaiImageModel', 'openaiChatModel'];
const DEFAULTS = {
  openaiBaseUrl:'https://api.openai.com/v1',
  openaiImageModel:'gpt-image-2.5-flare',
  openaiChatModel:'gpt-4o-mini',
};

function protect(value) {
  return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $bytes=[Text.Encoding]::UTF8.GetBytes($s); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))'],
  {input:String(value), encoding:'utf8', timeout:15000, windowsHide:true}).trim();
}

function unprotect(value) {
  return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd().Trim(); $bytes=[Convert]::FromBase64String($s); [Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))'],
  {input:String(value), encoding:'utf8', timeout:15000, windowsHide:true}).trim();
}

export function packagingConfigPath() { return CONFIG_FILE; }

export function readStoredPackagingConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    const result = {...raw.public};
    for (const key of SECRET_KEYS) if (raw.secrets?.[key]) result[key] = unprotect(raw.secrets[key]);
    return result;
  } catch {
    return {};
  }
}

export function writeStoredPackagingConfig(input = {}) {
  mkdirSync(CONFIG_DIR, {recursive:true});
  const previous = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {public:{}, secrets:{}};
  const publicConfig = {...(previous.public || {})};
  const secrets = {...(previous.secrets || {})};
  for (const key of PUBLIC_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] || '').trim();
    if (value) publicConfig[key] = value;
    else delete publicConfig[key];
  }
  for (const key of SECRET_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] || '').trim();
    if (value) secrets[key] = protect(value);
    else delete secrets[key];
  }
  writeFileSync(CONFIG_FILE, JSON.stringify({schema:'packaging-config-dpapi-v1', public:publicConfig, secrets}, null, 2),
    {encoding:'utf8', mode:0o600});
  return {path:CONFIG_FILE, public:publicConfig, configured:Object.fromEntries(SECRET_KEYS.map(key => [key, Boolean(secrets[key])]))};
}

// env → DPAPI 存储 → 默认值 三级优先（照 api-center.mjs 的解析次序）
export function packagingRuntimeConfig(env = process.env) {
  const stored = readStoredPackagingConfig();
  const baseUrl = String(env.OPENAI_BASE_URL || stored.openaiBaseUrl || DEFAULTS.openaiBaseUrl).replace(/\/+$/, '');
  const apiKey = String(env.OPENAI_API_KEY || stored.openaiApiKey || '').trim();
  return {
    baseUrl,
    apiKey,
    imageModel:String(env.OPENAI_IMAGE_MODEL || stored.openaiImageModel || DEFAULTS.openaiImageModel).trim(),
    chatModel:String(env.OPENAI_CHAT_MODEL || stored.openaiChatModel || DEFAULTS.openaiChatModel).trim(),
    configured:Boolean(apiKey),
    configPath:CONFIG_FILE,
  };
}

// 对外只暴露 configured 布尔与模型名，绝不回传 apiKey
export function packagingAiReadiness(env = process.env) {
  const config = packagingRuntimeConfig(env);
  return {configured:config.configured, baseUrl:config.baseUrl, imageModel:config.imageModel, chatModel:config.chatModel};
}
