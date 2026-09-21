/**
 * 自动分镜生成器 v3：读 timing.json → 出 storyboard.json
 * 升级：
 *  - 全局色调统一（theme 注入）
 *  - 分镜时长硬约束（45-150 帧 = 1.5-5s）
 *  - 时长→模板节奏匹配
 *  - 素材库自动检索（proof 类型优先匹配本地素材）
 *  v3 新增：
 *  - 语义关键词→标签词典（从分镜文本提取语义，优先匹配）
 *  - 素材时长适配（素材时长须 ≥ 镜头时长 70%，排序取最优）
 *  - 失败回退（匹配不到 → fallback 渐变底 + 关键词占位）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const directorDir = join(process.cwd(), 'director');
const timing = JSON.parse(readFileSync(join(directorDir, 'timing.json'), 'utf-8'));
const taxonomy = JSON.parse(readFileSync(join(directorDir, 'taxonomy.json'), 'utf-8'));
const L2 = taxonomy.levels.L2;
const L3 = taxonomy.levels.L3;

const FPS = timing.fps || 30;
const MIN_FRAMES = Math.round(1.5 * FPS);  // 45 帧
const MAX_FRAMES = Math.round(5 * FPS);   // 150 帧

// ---------- 全局模式（A/B/C）----------
const globalMode = (process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || process.env.MODE || 'A').toUpperCase();
const pitByL2 = taxonomy.pitByL2 || {};
console.log(`  全局模式: ${globalMode}`);

// ---------- 坑位治理主线（来自 taxonomy.slots） ----------
const SLOTS = taxonomy.slots || { rules: [], defaults: { slot: 'text-hero', materialRole: 'background' }, overrides: {} };

// 根据 shotCard 查坑位（先查覆盖，再按前缀规则，最后默认）
function resolveSlot(shotCard) {
  if (SLOTS.overrides && SLOTS.overrides[shotCard]) return SLOTS.overrides[shotCard];
  for (const r of SLOTS.rules) {
    if (shotCard.startsWith(r.prefix)) return { slot: r.slot, materialRole: r.materialRole };
  }
  return { slot: SLOTS.defaults.slot, materialRole: SLOTS.defaults.materialRole };
}

// 坑位 → 素材检索标签（不同素材角色匹配不同风格的素材）
const ROLE_TO_TAGS = {
  background: ['空镜', '日间', '全景构图', '高端品质'],      // 做底：要淡、不抢戏
  'inline-element': ['有人物', '中景构图', '特写', '科技'],   // 进图表/卡片：主体突出
  hero: ['有人物', '叙事', '中景构图', '温馨'],               // 全屏主体：有故事感
  split: ['城市建筑', '全景构图', '办公空间', '科技'],         // 分屏：中性可裁切
  none: [],                                                   // 纯模板不匹配素材
};

// ---------- 语义关键词→标签词典（v3） ----------
// 从分镜文本提取关键词 → 命中词典 → 得到语义标签，优先用于素材匹配
const SEMANTIC_TAGS = [
  { re: /地图|导航|谷歌|街道|定位/, tags: ['城市', '地图', '科技'] },
  { re: /数据|统计|图表|数字|指标|增长/, tags: ['数据可视化', '科技', '商务'] },
  { re: /家庭|孩子|老人|生活|幸福/, tags: ['家庭', '温馨', '有人物'] },
  { re: /科技|AI|人工智能|智能|算法|模型/, tags: ['科技', '未来感', '高端品质'] },
  { re: /商务|合作|签约|会议|公司|企业|创业/, tags: ['商务', '办公空间', '合作'] },
  { re: /城市|大楼|高楼|CBD|都市|写字楼/, tags: ['城市建筑', '城市', '全景构图'] },
  { re: /夜晚|星空|灯光|夜景/, tags: ['夜晚', '城市灯光', '城市'] },
  { re: /运动|健身|跑步|训练/, tags: ['运动', '活力', '户外'] },
  { re: /美食|餐厅|食物|咖啡/, tags: ['美食', '餐饮', '生活'] },
  { re: /自然|风景|山水|森林|大海|天空/, tags: ['自然', '风景', '户外'] },
  { re: /汽车|车|交通|马路|出行/, tags: ['汽车', '交通', '城市'] },
  { re: /人|用户|客户|大家|我们|你/, tags: ['有人物', '人物', '人群'] },
  { re: /未来|创新|前沿|突破/, tags: ['科技', '未来感', '创新'] },
  { re: /财富|金钱|投资|赚钱|收益/, tags: ['商务', '金融', '高端品质'] },
  { re: /速度|快|效率|高效|敏捷/, tags: ['科技', '动感', '速度'] },
  { re: /手机|电脑|屏幕|APP|应用|软件/, tags: ['科技', '数码', '屏幕'] },
];

// 从文本提取语义标签（最多 2 组，避免过度匹配）
function extractSemanticTags(text) {
  const hits = [];
  for (const { re, tags } of SEMANTIC_TAGS) {
    if (re.test(text)) {
      hits.push(...tags);
      if (hits.length >= 6) break;
    }
  }
  return [...new Set(hits)];
}

// 提取 fallback 关键词（2-6 字，用于占位大字）
function extractKeyword(text) {
  // 去掉常见虚词
  const clean = text.replace(/[，。！？、；：""''（）\s]/g, '');
  if (!clean) return 'KEY';
  // 找最长的连续片段（4-8字）
  if (clean.length <= 8) return clean;
  // 取中间一段（口播重点通常在句中）
  return clean.slice(Math.floor(clean.length / 2) - 3, Math.floor(clean.length / 2) + 3);
}

// ---------- 素材库索引 ----------
const indexPath = join(process.cwd(), 'materials', '_index.json');
const materialIndex = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : [];
console.log(`  素材库: ${materialIndex.length} 个镜头`);

/**
 * 检索素材 v3：语义优先 + 时长适配 + 排序取最优
 * @param tags 基础标签（坑位角色标签）
 * @param semanticTags 语义标签（从文本提取）
 * @param targetDurationSec 目标时长（镜头时长）
 */
function findMaterial(tags, semanticTags, targetDurationSec) {
  if (materialIndex.length === 0) return null;
  const allTags = [...(semanticTags || []), ...(tags || [])];
  if (allTags.length === 0) return null;

  const minDur = targetDurationSec * 0.7; // 素材至少能撑住 70% 时长
  let matched = materialIndex.filter(m => {
    if (m.duration_sec < minDur) return false;
    const mTags = m.tags || [];
    const hit = allTags.filter(t => mTags.includes(t));
    return hit.length >= 2;
  });

  // 如果语义匹配太少，放宽：只要命中 >= 2 个标签即可（不限语义/基础）
  if (matched.length === 0) {
    matched = materialIndex.filter(m => {
      if (m.duration_sec < minDur) return false;
      const mTags = m.tags || [];
      const hit = allTags.filter(t => mTags.includes(t));
      return hit.length >= 2;
    });
  }
  if (matched.length === 0) return null;

  // 打分排序：标签命中数多优先，时长接近优先（≥目标时长且差距小）
  const scored = matched.map(m => {
    const mTags = m.tags || [];
    const hitCount = allTags.filter(t => mTags.includes(t)).length;
    const durGap = Math.abs(m.duration_sec - targetDurationSec);
    // 权重：命中数 70%，时长差距 30%（越接近越好，素材比目标长可裁剪，短了露馅）
    let score = hitCount * 10 - durGap;
    if (m.duration_sec >= targetDurationSec) score += 5; // 够长优先
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // 从前 5 个里随机（避免每次同一个素材）
  const top = scored.slice(0, Math.min(5, scored.length));
  return top[Math.floor(Math.random() * top.length)].m;
}

// 分镜 l2 → 素材标签映射（兜底）
const L2_TO_TAGS = {
  'example': ['商务', '办公空间', '合作'],
  'data': ['商务', '数据可视化', '城市'],
  'causal': ['城市', '科技', '商务'],
  'method': ['商务', '办公空间', '科技'],
  'process': ['城市', '商务', '科技'],
  'status': ['城市', '家庭生活', '日常'],
  'misconception': ['科技', '商务', '城市'],
  'anxiety': ['城市', '夜晚', '思考'],
  'compare': ['商务', '科技', '对比'],
};

// ---------- 时长→模板节奏筛选 ----------
// 根据 durationInFrames 选适配节奏的 shotCard
function pickShotCardByDuration(l2key, durationInFrames) {
  const candidates = L3[l2key] || ['typography/blur-slide'];
  if (candidates.length === 1) return candidates[0];

  // 短分镜（<60帧）→ 快节奏模板优先
  // 中分镜（60-120帧）→ 标准模板
  // 长分镜（>120帧）→ 循环动画模板优先
  const fastPatterns = ['glitch', 'scramble', 'smash', 'strobe', 'impact', 'crash', 'slam', 'punch'];
  const loopPatterns = ['orbit', 'marquee', 'ticker', 'ripple', 'cycle', 'loop', 'filmstrip', 'carousel'];

  if (durationInFrames <= 60) {
    const fast = candidates.filter(c => fastPatterns.some(p => c.toLowerCase().includes(p)));
    if (fast.length > 0) return fast[Math.floor(Math.random() * fast.length)];
  } else if (durationInFrames >= 120) {
    const loop = candidates.filter(c => loopPatterns.some(p => c.toLowerCase().includes(p)));
    if (loop.length > 0) return loop[Math.floor(Math.random() * loop.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---------- 镜头类型 ----------
function pickShotType(text, index, total) {
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  for (const [key, val] of Object.entries(L2)) {
    if (['hook', 'pain', 'claim', 'proof', 'quote'].includes(val.parent)) {
      for (const pat of val.patterns) {
        if (new RegExp(pat).test(text)) return val.parent;
      }
    }
  }
  return 'proof';
}

// ---------- 主流程 ----------
let rawShots = timing.segments.map((seg, i) => {
  const type = pickShotType(seg.text, i, timing.segments.length);
  const l2keys = Object.keys(L2).filter(k => L2[k].parent === type);
  const l2key = l2keys.length > 0 ? l2keys[Math.floor(Math.random() * l2keys.length)] : 'status';
  const rawDuration = seg.duration_frames + 9;

  // 时长约束
  let durationInFrames = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, rawDuration));

  // 选模板（考虑时长节奏）
  const shotCard = pickShotCardByDuration(l2key, durationInFrames);

  // 坑位治理：根据 shotCard 解析坑位身份 + 素材角色
  const { slot, materialRole } = resolveSlot(shotCard);

  // 语义标签（v3：从文案提取）
  const semanticTags = extractSemanticTags(seg.text);

  // 按坑位素材角色匹配素材（materialRole=none 不匹配）
  let material = null;
  if (materialRole !== 'none' && (type === 'proof' || type === 'pain' || type === 'hook')) {
    const tags = ROLE_TO_TAGS[materialRole] || L2_TO_TAGS[l2key] || [];
    material = findMaterial(tags, semanticTags, durationInFrames / FPS);
  }

  // 失败回退（v3）：没匹配到素材 → fallback 占位（渐变 + 关键词）
  let fallback = null;
  if (!material && materialRole !== 'none' && (type === 'proof' || type === 'pain' || type === 'hook')) {
    fallback = {
      keyword: extractKeyword(seg.text),
      gradient: ['#1a1d24', '#0d0f14'],
    };
  }

  // 4层坑位：从 pitByL2 读取当前模式配置
  const pitCfg = pitByL2[l2key]?.[globalMode] || { subject: 'remotion', content: { type: 'text' }, position: 'element' };
  const pit = {
    mode: globalMode,
    subject: pitCfg.subject,
    content: { ...pitCfg.content },
    position: pitCfg.position,
    ...(pitCfg.loop ? { loop: true } : {}),
  };
  // proof 类且坑位要求素材 → 给 content 补素材路径
  if ((pit.subject === 'local-material' || pit.content.type === 'video-local') && material) {
    pit.content.path = material.path;
  }

  return {
    type,
    l2: l2key,
    shotCard,
    slot,
    materialRole,
    pit,
    text: seg.text,
    durationInFrames,
    ...(material ? { material: material.path } : {}),
    ...(fallback ? { fallback } : {}),
  };
});

// ---------- 时长合并/拆分后处理 ----------
// 超短合并：两个相邻分镜都不足 MIN_FRAMES，合并成一个
const merged = [];
for (let i = 0; i < rawShots.length; i++) {
  const s = rawShots[i];
  if (merged.length > 0 && merged[merged.length - 1].durationInFrames + s.durationInFrames <= MAX_FRAMES) {
    // 前一个太短或当前太短，尝试合并
    if (merged[merged.length - 1].durationInFrames < MIN_FRAMES || s.durationInFrames < MIN_FRAMES) {
      const prev = merged.pop();
      merged.push({
        ...prev,
        text: prev.text + s.text,
        durationInFrames: Math.min(MAX_FRAMES, prev.durationInFrames + s.durationInFrames),
      });
      continue;
    }
  }
  merged.push(s);
}
// ---------- 全局色调 ----------
const storyboard = {
  title: '口播视频',
  style: {
    bg: '#0d0f14',
    text: '#e8e6e1',
    accent: '#d4a853',
    sub: '#8a8680',
    captionStyle: 'pill',
  },
  // 全局 theme（DynamicVideo 注入 CSS 变量，所有组件色调统一）
  theme: {
    bg: '#0d0f14',
    surface: '#1a1d24',
    text: '#e8e6e1',
    textDim: '#8a8680',
    accent: '#d4a853',
    accent2: '#4ecdc4',
    danger: '#ff6b6b',
  },
  fps: FPS,
  audio: 'audio/voiceover.mp3',
  shots: merged,
};

writeFileSync(join(directorDir, 'storyboard.json'), JSON.stringify(storyboard, null, 2));
const totalFrames = merged.reduce((s, c) => s + c.durationInFrames, 0);
const withMaterial = merged.filter(s => s.material).length;
const withFallback = merged.filter(s => s.fallback).length;
console.log(`✓ 分镜生成: ${merged.length} 镜头 (原始 ${rawShots.length}), 总 ${totalFrames} 帧 = ${(totalFrames / FPS).toFixed(1)}s`);
console.log(`✓ 素材匹配: ${withMaterial} 个镜头使用本地素材`);
console.log(`✓ 回退占位: ${withFallback} 个镜头使用渐变占位`);
console.log(`✓ 时长约束: ${MIN_FRAMES}-${MAX_FRAMES} 帧 (${MIN_FRAMES / FPS}s-${MAX_FRAMES / FPS}s)`);

// 坑位统计
const slotCount = {};
const roleCount = {};
for (const s of merged) {
  slotCount[s.slot] = (slotCount[s.slot] || 0) + 1;
  roleCount[s.materialRole] = (roleCount[s.materialRole] || 0) + 1;
}
console.log(`✓ 坑位分布: ${JSON.stringify(slotCount)}`);
console.log(`✓ 素材角色: ${JSON.stringify(roleCount)}`);
