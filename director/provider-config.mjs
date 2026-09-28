import {execFileSync} from 'node:child_process';
import {mkdirSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const CONFIG_DIR = process.env.SHOTCRAFT_CONFIG_DIR || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'VideoShotCraft');
const CONFIG_FILE = path.join(CONFIG_DIR, 'provider-config.dpapi.json');
const SECRET_KEYS = ['runninghubApiKey', 'volcengineApiKey', 'volcengineAccessToken'];

function protect(value) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $bytes=[Text.Encoding]::UTF8.GetBytes($s); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))'],
  {input:String(value), encoding:'utf8', timeout:5000, windowsHide:true}).trim();
}

function unprotect(value) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd().Trim(); $bytes=[Convert]::FromBase64String($s); [Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))'],
    {input:String(value), encoding:'utf8', timeout:5000, windowsHide:true}).trim();
}

export function readStoredProviderConfig() {
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

export function writeStoredProviderConfig(input = {}) {
  mkdirSync(CONFIG_DIR, {recursive:true});
  const previous = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {public:{}, secrets:{}};
  const publicConfig = {...(previous.public || {})};
  const secrets = {...(previous.secrets || {})};
  const publicKeys = ['runninghubBaseUrl', 'runninghubAppId', 'volcengineAppId', 'volcengineTtsResourceId', 'volcengineCloneResourceId', 'volcengineModel'];
  for (const key of publicKeys) if (input[key] !== undefined) publicConfig[key] = String(input[key] || '').trim();
  for (const key of SECRET_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] || '').trim();
    if (value) secrets[key] = protect(value);
    else delete secrets[key];
  }
  writeFileSync(CONFIG_FILE, JSON.stringify({schema:'provider-config-dpapi-v1', public:publicConfig, secrets}, null, 2), {encoding:'utf8', mode:0o600});
  return {path:CONFIG_FILE, public:publicConfig, configured:Object.fromEntries(SECRET_KEYS.map(key => [key, Boolean(secrets[key])]))};
}

export function providerConfigPath() { return CONFIG_FILE; }
