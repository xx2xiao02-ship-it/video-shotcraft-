// 视频外包装 - 主题读取：只读 director/current-theme.json 数据文件，不 import 任何现有模块。
// 兼容 v2 嵌套 tokens 与 v1 扁平别名（bg/ink/accent...），读不到时回退黑金基线。
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const THEME_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'current-theme.json');

const FALLBACK_TOKENS = {
  background:'#0d0f14', surface:'#1a1d24', text:'#e8e6e1', textMuted:'#8a8680',
  accentPrimary:'#d4a853', accentSecondary:'#b48020', border:'#2a2e38',
};

const ALIASES = {bg:'background', card:'surface', ink:'text', mid:'textMuted', accent:'accentPrimary', accent2:'accentSecondary'};
const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizePackagingTheme(raw) {
  const nested = raw?.tokens && typeof raw.tokens === 'object' ? raw.tokens : {};
  const flat = raw && typeof raw === 'object' ? raw : {};
  const tokens = {};
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const value = nested[canonical] ?? nested[alias] ?? flat[canonical] ?? flat[alias];
    if (typeof value === 'string' && HEX.test(value.trim())) tokens[canonical] = value.trim().toLowerCase();
  }
  return {
    id:String(raw?.id || 'fallback'),
    name:String(raw?.name || '回退主题'),
    tokens:{...FALLBACK_TOKENS, ...tokens},
  };
}

export function readPackagingTheme() {
  if (!existsSync(THEME_FILE)) return normalizePackagingTheme(null);
  try {
    return normalizePackagingTheme(JSON.parse(readFileSync(THEME_FILE, 'utf8')));
  } catch {
    return normalizePackagingTheme(null);
  }
}
