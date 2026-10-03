import React from 'react';
import type {TemplateSkin} from '../../demos/_fixtures/TemplateSkin';
import {GRAPHIC_CONTRACTS,validateGraphicParams,BUSINESS_CARD_CONTRACTS,validateBusinessCardParams} from '../../director/graphic-contracts.mjs';
import {NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration} from '../../director/numeric-card-contracts.mjs';
import {KARAOKE_CARD,validateKaraokeTimings} from '../../director/karaoke-timing.mjs';
import {LIST_CARD_IDS,validateListCardParams} from '../../director/list-card-contracts.mjs';
import {SCREEN_CARD_IDS,validateScreenCardParams} from '../../director/screen-card-contracts.mjs';

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
  lines?: string[];           // 编导确认的画面排版
  subText?: string;          // 副文案（可选）
  accent?: string;           // 强调色
  bg?: string;               // 背景色
  durationInFrames: number;  // 分镜时长
  baseVideo?: string;        // 素材视频路径（可选）
  media?: string;            // P3 组件媒体输入：用户素材路径（进组件画面，如视频卡片）
  mediaPlaybackRate?: number;
  skin?: TemplateSkin;       // A 模式可选主题皮肤；模板独立演示保持原状
  templateParams?: Record<string, unknown>;
  narration?: string;
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
    mediaPlaybackRate?: string;
  };
  // 业务结构化参数字段映射：来源字段来自 shot.templateParams，目标字段是组件 prop。
  paramsMap?: Record<string,string>;
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
  'effects/fui-hud-moves/reticle-lock-on': {
    shotCard:'effects/fui-hud-moves/reticle-lock-on',
    propsMap:{text:'focusLabel',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'真实页面截图与同会话实测目标区域；focusLabel 使用本镜短标签',
  },
  'effects/brand-frame-snap': {
    shotCard:'effects/brand-frame-snap',
    propsMap:{text:'words',durationInFrames:'durationInFrames'},
    note:'真实模式A/B页面截图及对应竖版截图；words 提供两种模式标签',
  },
  'effects/spotlight-sweep-moves/glow-wake-sleep-panel': {
    shotCard:'effects/spotlight-sweep-moves/glow-wake-sleep-panel',
    propsMap:{text:'words',durationInFrames:'durationInFrames'},
    note:'真实本地页面截图与短标签',
  },
  'effects/spotlight-sweep-moves/slide-spotlight-pan': {
    shotCard:'effects/spotlight-sweep-moves/slide-spotlight-pan',
    propsMap:{text:'words',durationInFrames:'durationInFrames'},
    note:'真实本地页面截图与短标签',
  },
  'effects/spotlight-sweep-moves/corner-spotlight-reveal': {
    shotCard:'effects/spotlight-sweep-moves/corner-spotlight-reveal',
    propsMap:{text:'words',durationInFrames:'durationInFrames'},
    note:'真实本地页面截图与短标签',
  },
  'effects/radial-ripple-phone-chips': {
    shotCard:'effects/radial-ripple-phone-chips',
    propsMap:{text:'words',durationInFrames:'durationInFrames'},
    note:'真实手机长截图与两项业务标签',
  },
  'outro/edit-hook-moves/logo-sting-button': {
    shotCard:'outro/edit-hook-moves/logo-sting-button',
    propsMap:{text:'words',durationInFrames:'durationInFrames'},
    note:'真实前镜和彩蛋详情截图、同会话实测区域及品牌词',
  },
  'data/scroll-brake-moves/changelog-scroll-brake': {
    shotCard: 'data/scroll-brake-moves/changelog-scroll-brake',
    propsMap: { text: 'words' }, textAs: 'words',
    note: '真实完整列表与唯一目标ID；停点行不可使用默认演示',
  },
  'data/scroll-brake-moves/brake-reticle-lock': {
    shotCard: 'data/scroll-brake-moves/brake-reticle-lock',
    propsMap: { text: 'words' }, textAs: 'words',
    note: '真实完整列表、唯一目标ID与旁弹说明；急刹与准星同帧',
  },
  'data/cycle-glass-node-morph': {shotCard:'data/cycle-glass-node-morph',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'rhythm/smear-multiples': {shotCard:'rhythm/smear-multiples',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'rhythm/sakuga-timing-shift': {shotCard:'rhythm/sakuga-timing-shift',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'data/ring-diagram-annotation-reveal': {shotCard:'data/ring-diagram-annotation-reveal',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'data/timeline-travel': {shotCard:'data/timeline-travel',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'rhythm/beat-step-list-theme-cycle': {shotCard:'rhythm/beat-step-list-theme-cycle',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/riso-print-hits/riso-beat-pump': {shotCard:'effects/riso-print-hits/riso-beat-pump',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/glow-flyline-moves/glow-orb-ambient': {shotCard:'effects/glow-flyline-moves/glow-orb-ambient',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/glow-flyline-moves/orb-flyline-relay': {shotCard:'effects/glow-flyline-moves/orb-flyline-relay',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/glow-flyline-moves/flyline-arc': {shotCard:'effects/glow-flyline-moves/flyline-arc',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/chip-lift-to-user-pill': {shotCard:'interaction/chip-lift-to-user-pill',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/collab-cursor-moves/cursor-dialogue-duet': {shotCard:'interaction/collab-cursor-moves/cursor-dialogue-duet',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/collab-cursor-moves/cursor-cast-ensemble': {shotCard:'interaction/collab-cursor-moves/cursor-cast-ensemble',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'ui-entrance/svg-shape-morph': {shotCard:'ui-entrance/svg-shape-morph',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'ui-entrance/value-stagger-gradient': {shotCard:'ui-entrance/value-stagger-gradient',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/canvas-materialize-moves/diagram-cascade-build': {shotCard:'interaction/canvas-materialize-moves/diagram-cascade-build',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/canvas-materialize-moves/panel-to-canvas-materialize': {shotCard:'interaction/canvas-materialize-moves/panel-to-canvas-materialize',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'ui-entrance/paper-craft-moves/masking-tape-slap': {shotCard:'ui-entrance/paper-craft-moves/masking-tape-slap',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/light-play-moves/spotlight-sweep-reveal': {shotCard:'effects/light-play-moves/spotlight-sweep-reveal',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/light-play-moves/sheen-sweep-retry': {shotCard:'effects/light-play-moves/sheen-sweep-retry',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/light-play-moves/halation-bloom': {shotCard:'effects/light-play-moves/halation-bloom',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/fui-hud-moves/line-unfold-panel': {shotCard:'effects/fui-hud-moves/line-unfold-panel',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'outro/grain-dissolve': {shotCard:'outro/grain-dissolve',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'ui-entrance/draw-svg-trace': {shotCard:'ui-entrance/draw-svg-trace',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/riso-print-hits/riso-misregistration-hit': {shotCard:'effects/riso-print-hits/riso-misregistration-hit',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'opening/stroke-segment-build': {shotCard:'opening/stroke-segment-build',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/icon-performance-moves/pop-burst-confirm': {shotCard:'effects/icon-performance-moves/pop-burst-confirm',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/icon-performance-moves/attention-bounce': {shotCard:'effects/icon-performance-moves/attention-bounce',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'opening/fracture': {shotCard:'opening/fracture',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'outro/neon-triple-marquee': {shotCard:'outro/neon-triple-marquee',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/line-boil': {shotCard:'effects/line-boil',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/segmented-thumb-hero': {shotCard:'interaction/segmented-thumb-hero',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/picker-carousel-feature-cycle': {shotCard:'interaction/picker-carousel-feature-cycle',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/scan-bracket-sweep': {shotCard:'effects/scan-bracket-sweep',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'interaction/autolayout-gap-dial': {shotCard:'interaction/autolayout-gap-dial',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'effects/aurora-bloom-bg-flip': {shotCard:'effects/aurora-bloom-bg-flip',propsMap:{text:'words',durationInFrames:'durationInFrames'}},
  'transition/bottom-push-stack-wipe': {
    shotCard:'transition/bottom-push-stack-wipe', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{chapters:'chapters'}, note:'真实章节标题、颜色和卡片种子驱动四次推入',
  },
  'transition/bubble-swarm-takeover': {
    shotCard:'transition/bubble-swarm-takeover', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{capsules:'capsules',sourceLabel:'sourceLabel',targetLabel:'targetLabel'}, note:'真实前后页面标签和三条业务胶囊',
  },
  'transition/card-flip-reveal': {
    shotCard:'transition/card-flip-reveal', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{results:'results',title:'title'}, note:'真实功能结果指标逐卡翻面揭示',
  },
  'transition/card-flock-tumble': {
    shotCard:'transition/card-flock-tumble', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{titles:'titles',finale:'finale'}, note:'真实三页标题和收束口号',
  },
  'transition/circle-match-iris': {
    shotCard:'transition/circle-match-iris', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{value:'value',metricLabel:'metricLabel'}, note:'真实匹配百分比与指标标签',
  },
  'transition/color-block-step-wipe': {
    shotCard:'transition/color-block-step-wipe', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{badgeText:'badgeText',pageLabel:'pageLabel'}, note:'真实接管徽章和页面标签',
  },
  'transition/gradient-transition': {
    shotCard:'transition/gradient-transition', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{labels:'labels'}, note:'真实章节背景阶段标签',
  },
  'transition/line-carry-transition': {
    shotCard:'transition/line-carry-transition', propsMap:{durationInFrames:'durationInFrames'},
    paramsMap:{sourceTitle:'sourceTitle',targetTitle:'targetTitle',targetLabel:'targetLabel'}, note:'真实起点/终点页面标题和目标状态',
  },
  // ---- typography 类 ----
  // ---- P3 组件媒体输入 ----
  'ui-entrance/clipcard-looping': {
    shotCard: 'ui-entrance/clipcard-looping',
    propsMap: { media: 'src', mediaPlaybackRate: 'playbackRate', durationInFrames: 'durationInFrames' },
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
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
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
  'opening/brand-ink-open': {
    shotCard:'opening/brand-ink-open', propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'typography/pill-chip-slot-cycle-handled': {
    shotCard:'typography/pill-chip-slot-cycle-handled', propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'typography/pill-slot-cycle': {
    shotCard:'typography/pill-slot-cycle', propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'typography/split-flap-title': {
    shotCard:'typography/split-flap-title', propsMap:{text:'text',durationInFrames:'durationInFrames'},textAs:'raw',
  },
  'typography/title-demote-to-label': {
    shotCard:'typography/title-demote-to-label', propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'typography/text-column-converge': {
    shotCard:'typography/text-column-converge', propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'typography/vertical-word-roll-blur-cycle': {
    shotCard: 'typography/vertical-word-roll-blur-cycle',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'typography/word-relay-filmstrip': {
    shotCard: 'typography/word-relay-filmstrip',
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
    paramsMap: { words: 'words', screens: 'screens' },
    note: 'words 与真实页面纹理 screens 一一对应',
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
  'ui-entrance/cloner-depth-echo': {
    shotCard:'ui-entrance/cloner-depth-echo',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/neon-frame-orbit-drop': {
    shotCard:'ui-entrance/neon-frame-orbit-drop',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/skeleton-reveal': {
    shotCard:'ui-entrance/skeleton-reveal',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/radial-wave': {
    shotCard:'ui-entrance/radial-wave',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/element-body-moves/axial-stretch': {
    shotCard:'ui-entrance/element-body-moves/axial-stretch',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/element-body-moves/contact-shadow-lift': {
    shotCard:'ui-entrance/element-body-moves/contact-shadow-lift',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/platform-hinge-rise': {
    shotCard:'ui-entrance/platform-hinge-rise',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'interaction/glass-pill-dictation-typing': {
    shotCard:'interaction/glass-pill-dictation-typing',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'interaction/hashtag-to-pill-materialize': {
    shotCard:'interaction/hashtag-to-pill-materialize',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'interaction/command-palette-summon': {
    shotCard:'interaction/command-palette-summon',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'interaction/chip-grid-single-select-blackout': {
    shotCard:'interaction/chip-grid-single-select-blackout',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'opening/letterspace-materialize': {
    shotCard:'opening/letterspace-materialize',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'effects/assemble-then-type-flyin': {
    shotCard:'effects/assemble-then-type-flyin',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'typography/typing-code-block': {
    shotCard:'typography/typing-code-block',propsMap:{text:'words',durationInFrames:'durationInFrames'},
  },
  'ui-entrance/bezier-source-converge-merge': {
    shotCard: 'ui-entrance/bezier-source-converge-merge',
    propsMap: { text: 'capWords', durationInFrames: 'durationInFrames' },
    paramsMap: { sources: 'sources', target: 'target' },
  },
  'data/hatch-depth': {
    shotCard:'data/hatch-depth', propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
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
    propsMap: { text: 'words', durationInFrames: 'durationInFrames' },
  },
  'outro/ui-to-brand-morph/icon-flip-bloom-logo': {
    shotCard: 'outro/ui-to-brand-morph/icon-flip-bloom-logo',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
    paramsMap: { word: 'word' },
  },
  'outro/ui-to-brand-morph/input-morphs-into-logo': {
    shotCard: 'outro/ui-to-brand-morph/input-morphs-into-logo',
    propsMap: { text: 'word', durationInFrames: 'durationInFrames' },
    paramsMap: { word: 'word' },
  },

  // ---- batch 16 structured business inputs ----
  'interaction/ai-stream-response/stream-response': {
    shotCard: 'interaction/ai-stream-response/stream-response',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { summary: 'summary', rows: 'rows', backplate: 'backplate' },
    note: '摘要、证据行和背景图均来自真实业务输入',
  },
  'interaction/type-and-filter': {
    shotCard: 'interaction/type-and-filter',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { query: 'query', targetId: 'targetId', texture: 'texture' },
    note: '搜索词、目标卡和页面纹理来自真实业务输入',
  },
  'ui-entrance/avatar-bracket-carousel': {
    shotCard: 'ui-entrance/avatar-bracket-carousel',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { avatars: 'avatars' },
    note: '头像图片与角色标签来自真实业务输入',
  },
  'data/avatar-grid-radial-build-colorize': {
    shotCard: 'data/avatar-grid-radial-build-colorize',
    propsMap: { text: 'title', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
    paramsMap: { title: 'title', items: 'items', legend: 'legend' },
    note: '56个真实网格条目、状态、素材及图例由业务参数提供',
  },
  'ui-entrance/card-stack': {
    shotCard: 'ui-entrance/card-stack',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { labels: 'labels' },
    note: '8张卡面标签由真实业务输入逐项提供',
  },
  'ui-entrance/carousel-3d': {
    shotCard: 'ui-entrance/carousel-3d',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { labels: 'labels' },
    note: '8个环形卡片标签由真实业务输入逐项提供',
  },
  'ui-entrance/research-card-stack-scroll': {
    shotCard: 'ui-entrance/research-card-stack-scroll',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { titles: 'titles' },
    note: '8个研究标题由真实业务输入逐项提供',
  },
  'ui-entrance/floating-glossy-label-pills': {
    shotCard: 'ui-entrance/floating-glossy-label-pills',
    propsMap: { durationInFrames: 'durationInFrames' },
    paramsMap: { labels: 'labels' },
    note: '4个功能标签由真实业务输入逐项提供',
  },

  // ---- data 类 ----
  'data/odometer-digit-roll': {
    shotCard: 'data/odometer-digit-roll',
    propsMap: { text: 'title', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
    note: '结构化真实数位、单位与标签，必须通过本镜原文证据及144帧长版门禁',
  },
  'data/counter-confetti': {
    shotCard: 'data/counter-confetti',
    propsMap: { text: 'title', durationInFrames: 'durationInFrames' },
    textAs: 'raw',
    note: '业务数值、单位与标签由结构化参数提供；原文证据和长版阅读停留必须通过校验',
  },
  'data/chart-live-moves/axis-rescale-shock': {
    shotCard:'data/chart-live-moves/axis-rescale-shock',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'比较当前准入与全量审计范围；真实数据必须越过原量程后再重标',
  },
  'data/chart-live-moves/oscilloscope-stream': {
    shotCard:'data/chart-live-moves/oscilloscope-stream',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'批次序列和峰值索引均取自本地有效准入记录',
  },
  'data/chart-live-moves/unit-dot-swarm-regroup': {
    shotCard:'data/chart-live-moves/unit-dot-swarm-regroup',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'每个粒子代表一个有效变体，分组数量必须与准入类别数据一致',
  },
  'data/gauge-readout-moves/needle-sweep': {
    shotCard:'data/gauge-readout-moves/needle-sweep',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'三个同单位治理计数按真实量程定位指针',
  },
  'data/gauge-readout-moves/tape-scroll-fixed-pointer': {
    shotCard:'data/gauge-readout-moves/tape-scroll-fixed-pointer',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'批次前后真实快照输入到固定指针与全量刻度带',
  },
  'data/particle-celebrate-hits/confetti-crossfire': {
    shotCard:'data/particle-celebrate-hits/confetti-crossfire',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'纸屑庆祝的数值、单位与指标标签来自一个真实里程碑',
  },
  'data/particle-celebrate-hits/counter-tick-sparks': {
    shotCard:'data/particle-celebrate-hits/counter-tick-sparks',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'计数、指标标签与火星打点间隔来自经验证的治理参数',
  },
  'data/particle-sand-fill': {
    shotCard:'data/particle-sand-fill',
    propsMap:{text:'title',durationInFrames:'durationInFrames'},textAs:'raw',
    note:'每根粒子柱消费本地审计快照中的完整标签、计数与单位',
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
  if (SCREEN_CARD_IDS.has(shotCard) && (shot.skin || shot.templateParams)) {
    Object.assign(props,validateScreenCardParams(shotCard,shot.templateParams));
  }
  if (LIST_CARD_IDS.has(shotCard) && (shot.skin || shot.templateParams)) {
    Object.assign(props,validateListCardParams(shotCard,shot.templateParams));
  }
  if (NUMERIC_CARD_CONTRACTS[shotCard]) {
    const params = validateNumericCardParams(shotCard,shot.templateParams,shot.narration || shot.text);
    assertNumericCardDuration(shotCard,shot.durationInFrames,30);
    if (shot.lines && (shot.lines.length !== 1 || typeof shot.lines[0]!=='string' ||
        !shot.lines[0].trim() || [...shot.lines[0]].length > 14))
      throw new Error('数字卡标题最多一行14字，不得裁切文案');
    for (const key of ['value','unit','label']) props[key] = params[key];
  }
  const graphic = GRAPHIC_CONTRACTS[shotCard];
  if (graphic && (shot.skin || shot.templateParams)) {
    if (!shot.templateParams) throw new Error(`模板 ${shotCard} 缺少已验证图形参数，不能显示演示内容`);
    Object.assign(props,validateGraphicParams(shotCard,shot.templateParams,shot.narration || shot.text));
  }
  const business = BUSINESS_CARD_CONTRACTS[shotCard];
  if (business && (shot.skin || shot.templateParams)) {
    if (!shot.templateParams) throw new Error(`模板 ${shotCard} 缺少已验证业务参数，不能显示演示内容`);
    Object.assign(props,validateBusinessCardParams(shotCard,shot.templateParams,shot.narration || shot.text));
  }
  const lines = shot.lines?.map(line => line.trim()).filter(Boolean);
  if(shotCard===KARAOKE_CARD && shot.skin){
    props.timedWords=validateKaraokeTimings(shot.templateParams?.timedWords,lines,shot.durationInFrames);
  }
  if (contract.propsMap.text) {
    if (contract.textAs === 'headline') {
      props[contract.propsMap.text] = lines?.length ? [lines[0]] : splitToHeadline(shot.text).headline;
    } else if (contract.textAs === 'raw') {
      props[contract.propsMap.text] = lines?.length ? lines.join('\n') : shot.text;
    } else {
      props[contract.propsMap.text] = lines?.length ? lines : splitToWords(shot.text);
    }
  }
  if (contract.propsMap.subText) {
    props[contract.propsMap.subText] = lines?.length ? lines.slice(1) : splitToHeadline(shot.text).subhead;
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
    if (contract.propsMap.mediaPlaybackRate) props[contract.propsMap.mediaPlaybackRate] = shot.mediaPlaybackRate ?? 1;
  }
  if (contract.paramsMap && (shot.templateParams || shot.skin)) {
    const params = shot.templateParams || {};
    for (const [source, target] of Object.entries(contract.paramsMap)) {
      if (!Object.hasOwn(params, source)) throw new Error(`模板 ${shotCard} 缺少结构化字段 ${source}`);
      props[target] = params[source];
    }
  }
  if (shot.skin) props.skin = shot.skin;
  return props;
}

// 判断一个 shotCard 是否有转译契约
export function hasContract(shotCard: string | undefined): boolean {
  return !!shotCard && !!COMPONENT_CONTRACTS[shotCard];
}
