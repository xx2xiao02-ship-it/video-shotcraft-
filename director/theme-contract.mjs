import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

export const THEME_SCHEMA = 'shotcraft-theme-v2';
export const VIDEO_ASPECT_RATIOS = Object.freeze({
  '16:9': Object.freeze({width: 1920, height: 1080}),
  '9:16': Object.freeze({width: 1080, height: 1920}),
});

export function videoDimensions(aspectRatio = '16:9') {
  if (!Object.hasOwn(VIDEO_ASPECT_RATIOS, aspectRatio)) throw new Error('视频画幅仅支持横版 16:9 或竖版 9:16');
  return VIDEO_ASPECT_RATIOS[aspectRatio];
}

const DEFAULTS = {
  id: 'c4-0',
  name: '黑金高级',
  bg: '#0d0f14',
  ink: '#e8e6e1',
  mid: '#8a8680',
  accent: '#d4a853',
  accent2: '#b48020',
  card: '#1a1d24',
  border: '#2a2e38',
  overlay: '#000000',
  overlayAlpha: 60,
  fontFamily: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  titleSize: 36,
  radius: 12,
  captionSize: 36,
  captionWeight: 600,
  captionColor: '#ffffff',
  materialOpacity: 0.6,
  fallbackSize: 96,
  fallbackAlpha: 0.14,
};

const DEFAULT_VIDEO_PROFILE = {
  id: 'knowledge-explainer',
  allowedCategories: ['typography', 'data', 'interaction', 'effects'],
  preferredCards: ['number-counter', 'source-converge', 'highlighter-sweep'],
  rhythm: 'standard',
  digitalHumanPolicy: 'optional',
};

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutHash(theme) {
  const copy = {...theme};
  delete copy.themeHash;
  return copy;
}

export function themeHash(theme) {
  return createHash('sha256').update(stable(withoutHash(theme))).digest('hex');
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/**
 * Converts the existing flat A-mode theme and the new nested contract to one
 * canonical shape. Flat aliases remain intentionally duplicated so old A
 * storyboard builders and third-party callers keep working.
 */
export function normalizeTheme(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const nested = raw.tokens && typeof raw.tokens === 'object' ? raw.tokens : {};
  const value = (name, ...aliases) => {
    for (const candidate of [nested[name], ...aliases.map(key => raw[key])]) {
      if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
    }
    return DEFAULTS[name];
  };
  const tokens = {
    background: value('background', 'bg'),
    surface: value('surface', 'card'),
    text: value('text', 'ink', 'textColor'),
    textMuted: value('textMuted', 'mid', 'sub'),
    accentPrimary: value('accentPrimary', 'accent'),
    accentSecondary: value('accentSecondary', 'accent2'),
    border: value('border'),
    overlay: value('overlay'),
    overlayAlpha: numberOr(value('overlayAlpha'), DEFAULTS.overlayAlpha),
    fontFamily: value('fontFamily'),
    titleSize: numberOr(value('titleSize'), DEFAULTS.titleSize),
    radius: numberOr(value('radius'), DEFAULTS.radius),
    captionSize: numberOr(value('captionSize'), DEFAULTS.captionSize),
    captionWeight: numberOr(value('captionWeight'), DEFAULTS.captionWeight),
    captionColor: value('captionColor'),
    materialOpacity: numberOr(value('materialOpacity'), DEFAULTS.materialOpacity),
    fallbackSize: numberOr(value('fallbackSize'), DEFAULTS.fallbackSize),
    fallbackAlpha: numberOr(value('fallbackAlpha'), DEFAULTS.fallbackAlpha),
  };
  const normalized = {
    schema: THEME_SCHEMA,
    schemaVersion: 2,
    id: raw.id || DEFAULTS.id,
    name: raw.name || DEFAULTS.name,
    compatibility: Array.isArray(raw.compatibility) && raw.compatibility.length ? [...raw.compatibility] : ['A', 'B'],
    aspectRatio: raw.aspectRatio ?? '16:9',
    tokens,
    // v1 aliases: retained as a deliberate compatibility layer for A mode.
    bg: tokens.background,
    ink: tokens.text,
    mid: tokens.textMuted,
    accent: tokens.accentPrimary,
    accent2: tokens.accentSecondary,
    card: tokens.surface,
    border: tokens.border,
    overlay: tokens.overlay,
    overlayAlpha: tokens.overlayAlpha,
    fontFamily: tokens.fontFamily,
    titleSize: tokens.titleSize,
    radius: tokens.radius,
    captionSize: tokens.captionSize,
    captionWeight: tokens.captionWeight,
    captionColor: tokens.captionColor,
    materialOpacity: tokens.materialOpacity,
    fallbackSize: tokens.fallbackSize,
    fallbackAlpha: tokens.fallbackAlpha,
    videoProfile: {
      ...DEFAULT_VIDEO_PROFILE,
      ...(raw.videoProfile && typeof raw.videoProfile === 'object' ? raw.videoProfile : {}),
      allowedCategories: Array.isArray(raw.videoProfile?.allowedCategories) && raw.videoProfile.allowedCategories.length
        ? [...raw.videoProfile.allowedCategories] : [...DEFAULT_VIDEO_PROFILE.allowedCategories],
      preferredCards: Array.isArray(raw.videoProfile?.preferredCards)
        ? [...raw.videoProfile.preferredCards] : [...DEFAULT_VIDEO_PROFILE.preferredCards],
    },
  };
  videoDimensions(normalized.aspectRatio);
  return {...normalized, themeHash: themeHash(normalized)};
}

export function readCurrentTheme(root) {
  const file = path.join(root, 'director', 'current-theme.json');
  if (!existsSync(file)) return normalizeTheme(DEFAULTS);
  try { return normalizeTheme(JSON.parse(readFileSync(file, 'utf8'))); }
  catch { return normalizeTheme(DEFAULTS); }
}

export function writeCurrentTheme(root, input) {
  const theme = normalizeTheme(input);
  writeFileSync(path.join(root, 'director', 'current-theme.json'), JSON.stringify(theme, null, 2), 'utf8');
  return theme;
}

export function themeAdapter(themeInput, mode) {
  const theme = normalizeTheme(themeInput);
  if (mode === 'A') {
    return {
      mode: 'A', schema: THEME_SCHEMA, themeId: theme.id, themeHash: theme.themeHash,
      aspectRatio: theme.aspectRatio,
      style: {bg:theme.bg, text:theme.ink, accent:theme.accent, sub:theme.mid,
        fontFamily:theme.fontFamily, captionSize:theme.captionSize,
        captionWeight:theme.captionWeight, captionColor:theme.captionColor,
        materialOpacity:theme.materialOpacity, overlayAlpha:theme.overlayAlpha / 100,
        fallbackSize:theme.fallbackSize,
        fallbackAlpha:theme.fallbackAlpha},
      theme: {bg:theme.bg, surface:theme.card, text:theme.ink, textDim:theme.mid,
        accent:theme.accent, accent2:theme.accent2, danger:'#ff6b6b'},
    };
  }
  if (mode === 'B') {
    return {
      mode: 'B', schema: THEME_SCHEMA, themeId: theme.id, themeHash: theme.themeHash,
      aspectRatio: theme.aspectRatio,
      tokens: {...theme.tokens},
      cssVars: {
        '--sc-bg':theme.tokens.background, '--sc-surface':theme.tokens.surface,
        '--sc-text':theme.tokens.text, '--sc-text-muted':theme.tokens.textMuted,
        '--sc-accent':theme.tokens.accentPrimary, '--sc-accent-2':theme.tokens.accentSecondary,
        '--sc-border':theme.tokens.border, '--sc-overlay':theme.tokens.overlay,
        '--sc-overlay-alpha':String(theme.tokens.overlayAlpha / 100),
        '--sc-font-family':theme.tokens.fontFamily, '--sc-radius':`${theme.tokens.radius}px`,
        '--sc-caption-color':theme.tokens.captionColor,
      },
    };
  }
  throw new Error(`Unknown theme mode: ${mode}`);
}
