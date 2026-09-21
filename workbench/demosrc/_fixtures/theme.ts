/**
 * 全局主题色 — 所有 demos 组件统一色调
 * 分类：背景 / 文字 / 强调 / 灰阶
 */

export const THEME = {
  // ---- 背景类 ----
  bg: '#0d0f14',        // 主背景（最深）
  surface: '#1a1d24',   // 面板/卡片背景
  surface2: '#232833',  // 次级面板
  border: '#2a2e38',    // 边框/分割线

  // ---- 文字类 ----
  text: '#e8e6e1',      // 主文字
  textDim: '#8a8680',   // 次要文字
  textFaint: '#5a5a58', // 最弱文字

  // ---- 强调色 ----
  accent: '#d4a853',    // 金色主强调
  accent2: '#4ecdc4',   // 青色次强调
  danger: '#ff6b6b',    // 红色警示

  // ---- 灰阶中间色 ----
  gray: '#3a3a3a',
  grayMid: '#5a5a58',
  grayLight: '#8f8f8d',
  grayLine: '#2a2e38',
} as const;

// ---- 硬编码颜色 → 主题色 映射表 ----
// 用于批量替换 demos 里的硬编码颜色
export const COLOR_MAP: Record<string, string> = {
  // 浅背景 → 深背景
  '#ececea': THEME.bg,
  '#f7f7f6': THEME.surface,
  '#f9f6f1': THEME.bg,
  '#faf7f2': THEME.bg,
  '#f2f2f0': THEME.surface,
  '#f2f3f6': THEME.surface,
  '#f5f5f4': THEME.surface,
  '#f4f4f7': THEME.surface,
  '#f7f7f5': THEME.surface,
  '#f6f6f5': THEME.surface,
  '#f1f1f3': THEME.surface,
  '#eceef1': THEME.surface,
  '#e8e9ee': THEME.surface,
  '#e6e6ea': THEME.surface,
  '#e8e6df': THEME.surface,
  '#e4e4e2': THEME.surface,

  // 深灰文字 → 浅文字
  '#2f2f2f': THEME.text,
  '#111111': THEME.text,
  '#111': THEME.text,
  '#000000': THEME.text,
  '#000': THEME.text,

  // 灰阶统一
  '#5a5a58': THEME.grayMid,
  '#5a5a58': THEME.grayMid,
  '#565b66': THEME.grayMid,
  '#4a4a48': THEME.gray,
  '#7c828c': THEME.grayLight,
  '#8f8f8d': THEME.textDim,
  '#b9bec6': THEME.textDim,
  '#9a9a98': THEME.textDim,
  '#9a9aa0': THEME.textDim,
  '#c9c9ce': THEME.textDim,
  '#d8dbe0': THEME.textDim,
  '#b8b8b6': THEME.textDim,
  '#c9cdd6': THEME.textDim,
  '#777775': THEME.grayMid,
  '#6a707c': THEME.grayMid,
  '#6c6a68': THEME.grayMid,
  '#8d93a0': THEME.grayLight,
  '#454543': THEME.gray,
  '#3c3c3a': THEME.gray,
  '#3a3a38': THEME.gray,
  '#2a2a28': THEME.grayLine,
  '#3a3a3a': THEME.gray,
  '#3a3a42': THEME.gray,
  '#565c66': THEME.grayMid,
  '#3a3d46': THEME.gray,
  '#1e2028': THEME.surface,
  '#1a1c20': THEME.surface,
  '#1d1d1f': THEME.surface,

  // 深色背景统一
  '#0a0b10': THEME.bg,
  '#0b0b0c': THEME.bg,
  '#0a0a0c': THEME.bg,
  '#07080e': THEME.bg,

  // 强调色统一
  '#b45309': THEME.accent,
  '#e6c476': THEME.accent,
  '#7a5af8': THEME.accent2,
  '#6c8cff': THEME.accent2,
  '#5ad0ff': THEME.accent2,
  '#ff5ad0': THEME.danger,
};
