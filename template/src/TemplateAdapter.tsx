import React from 'react';

// ============================================================
// TemplateAdapter — 文案→模板 转译层
// 统一把 storyboard 的 shot 数据转译为组件可用的 props。
//
// 设计原则：
// 1. 不改 221 个组件源码 —— 通过"组件契约"注册表描述每个组件
//    如何接收数据（text/subText/accent/...），转译时按契约注入。
// 2. 组件默认保留原演示内容 —— 未注册的组件原样渲染，字幕浮层兜底。
// 3. 全部走 props 注入，零副作用。
// ============================================================

// ---------- 标准转译接口 ----------
export type ShotData = {
  text: string;              // 主文案（口播句）
  subText?: string;          // 副文案（可选）
  accent?: string;           // 强调色
  bg?: string;               // 背景色
  durationInFrames: number;  // 分镜时长
  baseVideo?: string;        // 素材视频路径（可选）
  media?: string;            // P3 组件媒体输入：用户素材路径（进组件画面，如视频卡片）
};

// 组件契约：描述一个组件如何接收转译数据
export type ComponentContract = {
  shotCard: string;           // 唯一标识（taxonomy 的 shotCard）
  // props 注入映射：组件接收哪些字段，映射到组件 props 的哪个 key
  propsMap: {
    text?: string;            // 如 { text: 'words' } 表示把 shot.text 传给组件 words prop
    subText?: string;
    accent?: string;
    bg?: string;
    durationInFrames?: string;
    media?: string;           // P3：shot.media（素材路径/URL）→ 组件媒体 prop
  };
  // text 注入模式：'words'(默认,词数组) | 'headline'(主标题+副标题) | 'raw'(原样字符串)
  textAs?: 'words' | 'headline' | 'raw';
  // 该组件是否需要转译层处理（默认 true）
  enabled?: boolean;
  // 备注
  note?: string;
};

// ---------- 组件契约注册表 ----------
// 这里注册"文字驱动型"组件（内部有硬编码文案、需要注入 shot.text 的）。
// 注册后，转译层会把 shot 数据按 propsMap 注入组件 props。
// 未注册的组件：原样渲染（保留演示内容），由字幕浮层承担文案展示。
export const COMPONENT_CONTRACTS: Record<string, ComponentContract> = {
  // ---- typography 类 ----
  // ---- P3 组件媒体输入 ----
  'ui-entrance/clipcard-looping': {
    shotCard: 'ui-entrance/clipcard-looping',
    propsMap: { media: 'src', durationInFrames: 'durationInFrames' },
    note: '视频卡片：注入用户素材 src 时单卡承载（素材进组件画面），无 src 保持三场景演示',
  },
  'typography/cel-flash-stomp': {
    shotCard: 'typography/cel-flash-stomp',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
    note: '三个大字逐词拍落，words 传字符串数组',
  },
  'typography/flying-words': {
    shotCard: 'typography/flying-words',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
    note: '单词飞入',
  },
  'typography/blur-slide': {
    shotCard: 'typography/blur-slide',
    propsMap: { text: 'headline', subText: 'subhead', durationInFrames: 'durationInFrames' },
    textAs: 'headline',
    note: '标题逐词模糊入场，headline 为标题词数组，subhead 为副标题',
  },
  'typography/type-entrance-moves/letter-drop-physics': {
    shotCard: 'typography/type-entrance-moves/letter-drop-physics',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
    note: '单字物理掉落',
  },
  'typography/type-entrance-moves/scramble-decode': {
    shotCard: 'typography/type-entrance-moves/scramble-decode',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/type-assembly-moves/split-text-stagger': {
    shotCard: 'typography/type-assembly-moves/split-text-stagger',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/type-assembly-moves/text-on-path': {
    shotCard: 'typography/type-assembly-moves/text-on-path',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
  },
  'typography/type-assembly-moves/letterform-drift-assembly': {
    shotCard: 'typography/type-assembly-moves/letterform-drift-assembly',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/type-assembly-moves/tracking-expand-reveal': {
    shotCard: 'typography/type-assembly-moves/tracking-expand-reveal',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/type-rhythm-sync/font-weight-pump': {
    shotCard: 'typography/type-rhythm-sync/font-weight-pump',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/type-rhythm-sync/karaoke-fill-sync': {
    shotCard: 'typography/type-rhythm-sync/karaoke-fill-sync',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
  },
  'typography/scramble': {
    shotCard: 'typography/scramble',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/typewriter-moves/terminal-typewriter': {
    shotCard: 'typography/typewriter-moves/terminal-typewriter',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
    note: '终端打字机',
  },
  'typography/typewriter-moves/typewriter-error-retype': {
    shotCard: 'typography/typewriter-moves/typewriter-error-retype',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/countdown-arc-scatter': {
    shotCard: 'typography/countdown-arc-scatter',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/paper-title-card': {
    shotCard: 'typography/paper-title-card',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/marker-underline-title': {
    shotCard: 'typography/marker-underline-title',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/outline-word-fill': {
    shotCard: 'typography/outline-word-fill',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/gradient-word-sweep': {
    shotCard: 'typography/gradient-word-sweep',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/lead-word-zoom-assemble': {
    shotCard: 'typography/lead-word-zoom-assemble',
    propsMap: { text: 'text', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
  },
  'typography/word-relay-geometry': {
    shotCard: 'typography/word-relay-geometry',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/glitch-cycle': {
    shotCard: 'typography/glitch-cycle',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/brace-expand': {
    shotCard: 'typography/brace-expand',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/brand-ink-open': {
    shotCard: 'typography/brand-ink-open',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/vertical-word-roll-blur-cycle': {
    shotCard: 'typography/vertical-word-roll-blur-cycle',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/word-relay-filmstrip': {
    shotCard: 'typography/word-relay-filmstrip',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },

  // ---- ui-entrance 类 ----
  'ui-entrance/list-reveal': {
    shotCard: 'ui-entrance/list-reveal',
    propsMap: { text: 'labels', durationInFrames: 'durationInFrames' },
    note: '列表逐项揭示，labels 传字符串数组',
  },
  'ui-entrance/list-stack-press': {
    shotCard: 'ui-entrance/list-stack-press',
    propsMap: { text: 'labels', durationInFrames: 'durationInFrames' },
  },
  'ui-entrance/bezier-source-converge-merge': {
    shotCard: 'ui-entrance/bezier-source-converge-merge',
    propsMap: { text: 'capWords', durationInFrames: 'durationInFrames' },
  },
  'ui-entrance/neon-frame-forerun': {
    shotCard: 'ui-entrance/neon-frame-forerun',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'ui-entrance/morph-from-primitive': {
    shotCard: 'ui-entrance/morph-from-primitive',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },

  // ---- outro 类 ----
  'outro/logo-shrink-wordmark-lockup': {
    shotCard: 'outro/logo-shrink-wordmark-lockup',
    propsMap: { text: 'wordmark', durationInFrames: 'durationInFrames' },
  },
  'outro/ui-to-brand-morph/icon-flip-bloom-logo': {
    shotCard: 'outro/ui-to-brand-morph/icon-flip-bloom-logo',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
  },
  'outro/ui-to-brand-morph/input-morphs-into-logo': {
    shotCard: 'outro/ui-to-brand-morph/input-morphs-into-logo',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
  },

  // ---- data 类 ----
  'data/odometer-digit-roll': {
    shotCard: 'data/odometer-digit-roll',
    propsMap: { text: 'value', durationInFrames: 'durationInFrames' },
    enabled: false, // 数据牌组件：保留演示数字，文案走字幕浮层（数据契约后续接入）
    note: '数据展示型，暂不注入整句',
  },
  'data/counter-confetti': {
    shotCard: 'data/counter-confetti',
    propsMap: { text: 'value', durationInFrames: 'durationInFrames' },
    enabled: false, // 数据牌组件：保留演示数字，文案走字幕浮层
    note: '数据展示型，暂不注入整句',
  },
};

// ---------- 文本转译工具 ----------
// 把一句话按语义切分为"词数组"（中文按短句/逗号切，英文按空格切）
export function splitToWords(text: string, max = 3): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [' '];
  // 单段容量：中文每段 ≤10 字、英文每段 ≤3 词（标点断句优先，完整短语整段呈现不硬切）
  const MAX_CHUNK = 10;
  const chunkChinese = (s: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i += MAX_CHUNK) out.push(s.slice(i, i + MAX_CHUNK));
    return out;
  };
  if (/[\u4e00-\u9fff]/.test(cleaned)) {
    const parts = cleaned
      .split(/[，。！？；、,.!?;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    // 先按标点切段，长段再按 6 字硬切 → 保证每个词块大字区放得下
    const out: string[] = [];
    for (const p of parts) {
      if (p.length > MAX_CHUNK) out.push(...chunkChinese(p));
      else out.push(p);
    }
    // 无标点时整体按 6 字切
    if (parts.length === 0) out.push(...chunkChinese(cleaned));
    return out.slice(0, max);
  }
  // 英文：按空格切，每段 ≤3 词
  const words = cleaned.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 3) chunks.push(words.slice(i, i + 3).join(' '));
  return chunks.slice(0, max);
}

// 把一句话切为"两段"（主标题 + 副标题）
export function splitToHeadline(text: string): { headline: string[]; subhead: string[] } {
  const cleaned = text.trim();
  if (/[\u4e00-\u9fff]/.test(cleaned)) {
    const parts = cleaned.split(/[，。！？；、,.!?;]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        headline: parts[0].split('').slice(0, 8),
        subhead: parts.slice(1).join(' ').split('').slice(0, 12),
      };
    }
    const mid = Math.ceil(cleaned.length / 2);
    return {
      headline: cleaned.slice(0, mid).split('').slice(0, 8),
      subhead: cleaned.slice(mid).split('').slice(0, 12),
    };
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  const mid = Math.ceil(words.length / 2);
  return {
    headline: words.slice(0, mid).slice(0, 8),
    subhead: words.slice(mid).slice(0, 12),
  };
}

// ---------- 转译入口 ----------
// 根据 shotCard 找契约，把 shot 数据转译为组件 props
export function translateShot(shotCard: string, shot: ShotData): Record<string, unknown> | null {
  const contract = COMPONENT_CONTRACTS[shotCard];
  if (!contract || contract.enabled === false) return null;

  const props: Record<string, unknown> = {};
  if (contract.propsMap.text) {
    if (contract.textAs === 'headline') {
      const { headline } = splitToHeadline(shot.text);
      props[contract.propsMap.text] = headline;
    } else if (contract.textAs === 'raw') {
      props[contract.propsMap.text] = shot.text;
    } else {
      props[contract.propsMap.text] = splitToWords(shot.text);
    }
  }
  if (contract.propsMap.subText) {
    const { subhead } = splitToHeadline(shot.text);
    props[contract.propsMap.subText] = subhead;
  }
  if (contract.propsMap.accent && shot.accent) {
    props[contract.propsMap.accent] = shot.accent;
  }
  if (contract.propsMap.bg && shot.bg) {
    props[contract.propsMap.bg] = shot.bg;
  }
  if (contract.propsMap.durationInFrames) {
    props[contract.propsMap.durationInFrames] = shot.durationInFrames;
  }
  if (contract.propsMap.media && shot.media) {
    props[contract.propsMap.media] = shot.media;
  }
  return props;
}

// 判断一个 shotCard 是否有转译契约
export function hasContract(shotCard: string | undefined): boolean {
  return !!shotCard && !!COMPONENT_CONTRACTS[shotCard];
}