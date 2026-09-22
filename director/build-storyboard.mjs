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

// ---------- 模板参数注册表（与 template/src/TemplateAdapter.tsx 契约保持单一数据源） ----------
// 候选池只允许"已注册、可注入文案"的模板——未注册装饰类组件（fracture/hatch-depth 等）
// 一律不进入文案镜头候选，杜绝"选了模板但参数填不进→显示演示内容"。
const templateRegistry = existsSync(join(directorDir, 'template-registry.json'))
  ? JSON.parse(readFileSync(join(directorDir, 'template-registry.json'), 'utf-8'))
  : { templates: [] };
const REGISTERED_SHOTCARDS = new Set(
  (templateRegistry.templates || []).filter(t => t.enabled !== false).map(t => t.shotCard)
);
// raw 整句组件（吃短句，过长会溢出版面）——与契约 textAs:'raw' 对应
const RAW_CARD_PATTERN = /scramble|typewriter|text-on-path|font-weight-pump|lead-word|split-text|letter-drop|letterform|tracking-expand/;
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
  // 高优先级：学习成长/自我提升（职场干货类文案核心语义）——素材库有 商务/办公场景/会议场景 标签可命中
  { re: /收藏|干货|学习|成长|笔记|知识|认知|方法论|阅读|读书|课程|职场|沟通|理财|时间管理|自我提升|能力|技能|复盘|进步|行动/, tags: ['商务', '办公场景', '会议场景', '科技'] },
  { re: /数据|统计|图表|数字|指标|增长|报告|调查/, tags: ['数据可视化', '科技', '商务'] },
  { re: /科技|AI|人工智能|智能|算法|模型|数字化/, tags: ['科技', '未来感', '高端品质'] },
  { re: /商务|合作|签约|会议|公司|企业|创业|团队/, tags: ['商务', '办公场景', '会议场景', '合作'] },
  { re: /地图|导航|谷歌|街道|定位/, tags: ['城市', '地图', '科技'] },
  // 家庭类只用强词——"生活"太宽泛（几乎任何文案都含），会错配到家庭素材
  { re: /家庭|孩子|老人|幸福|陪伴|亲子|父母/, tags: ['家庭', '温馨', '有人物'] },
  { re: /城市|大楼|高楼|CBD|都市|写字楼/, tags: ['城市建筑', '城市', '全景构图'] },
  { re: /夜晚|星空|灯光|夜景/, tags: ['夜晚', '城市灯光', '城市'] },
  { re: /运动|健身|跑步|训练/, tags: ['运动', '活力', '户外'] },
  { re: /美食|餐厅|食物|咖啡/, tags: ['美食', '餐饮', '生活'] },
  { re: /自然|风景|山水|森林|大海|天空/, tags: ['自然', '风景', '户外'] },
  { re: /汽车|车|交通|马路|出行/, tags: ['汽车', '交通', '城市'] },
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

// ---------- 情绪推断（P3：文案情绪 → 素材情绪匹配） ----------
const MOOD_KEYWORDS = [
  { re: /激情|励志|热血|奋斗|冲|突破|逆袭|坚持|成功|改变|行动/, mood: '活力' },
  { re: /科技|AI|人工智能|智能|算法|模型|数据|数字化|创新/, mood: '科技感' },
  { re: /专业|深度|干货|方法论|认知|系统|严谨|复盘|逻辑/, mood: '沉稳' },
  { re: /生活|家庭|幸福|温暖|治愈|陪伴|健康|日常/, mood: '温暖' },
  { re: /焦虑|恐惧|危险|警告|代价|失控|崩盘|陷阱/, mood: '紧张' },
];
function extractMood(text) {
  for (const { re, mood } of MOOD_KEYWORDS) {
    if (re.test(text || '')) return mood;
  }
  return '中性';
}
// 素材情绪（由已有标签推断；打标时直接加情绪词即可命中）
const TAG_TO_MOOD = {
  '活力': '活力', '动感': '活力', '运动': '活力', '户外': '活力',
  '科技': '科技感', '未来感': '科技感', '数码': '科技感', '屏幕': '科技感', '数据可视化': '科技感', '创新': '科技感',
  '商务': '沉稳', '办公空间': '沉稳', '高端品质': '沉稳', '金融': '沉稳', '城市建筑': '沉稳',
  '温馨': '温暖', '家庭': '温暖', '生活': '温暖', '美食': '温暖', '自然': '温暖', '风景': '温暖',
};
function inferMaterialMood(tags) {
  for (const t of tags || []) {
    if (TAG_TO_MOOD[t]) return TAG_TO_MOOD[t];
  }
  return '中性';
}

// ---------- 使用频率（P3：高频素材降权，均衡轮换） ----------
const usagePath = join(process.cwd(), 'director', 'usage.json');
let usage = {};
if (existsSync(usagePath)) {
  try { usage = JSON.parse(readFileSync(usagePath, 'utf-8')); } catch (e) { usage = {}; }
}
function recordUsage(materialPath) {
  if (!materialPath) return;
  usage[materialPath] = (usage[materialPath] || 0) + 1;
}
function saveUsage() {
  try { writeFileSync(usagePath, JSON.stringify(usage, null, 2), 'utf-8'); } catch (e) {}
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
function findMaterial(tags, semanticTags, targetDurationSec, mood) {
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

  // 打分排序：标签命中 + 时长接近 + 情绪匹配 + 使用降权
  const scored = matched.map(m => {
    const mTags = m.tags || [];
    const hitCount = allTags.filter(t => mTags.includes(t)).length;
    const durGap = Math.abs(m.duration_sec - targetDurationSec);
    let score = hitCount * 10 - durGap;
    if (m.duration_sec >= targetDurationSec) score += 5; // 够长优先
    // P3：情绪匹配 +15（文案情绪非中性且素材情绪命中）
    if (mood && mood !== '中性' && inferMaterialMood(mTags) === mood) score += 15;
    // P3：使用频率降权（每次用过 -3，用得越少越优先）
    score -= (usage[m.path] || 0) * 3;
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

// ---------- 镜头卡语义库（U2：gallery library.json 元数据） ----------
const CARD_META = {};
try {
  const libJson = JSON.parse(readFileSync(join(process.cwd(), 'gallery', 'api', 'library.json'), 'utf-8'));
  for (const cc of libJson.cards || []) CARD_META[cc.name] = cc;
} catch (e) {}
// 兜底元数据：gallery 未收录的注册模板（时长/节奏硬约束，key 为叶子名）
const META_OVERRIDE = {
  'clipcard-looping': { duration: '约 4s（循环，可长可短）' },
  'letter-drop-physics': { duration: '约 2.5s（75f@30fps）' },
};
function cardMeta(leaf) { return CARD_META[leaf] || META_OVERRIDE[leaf] || null; }

// ---------- 镜头运用治理 v4：语义→镜头语言 ----------
// 1) l2key 按文案语义选择（不再是随机）；2) 效果卡按时长节奏 + 情绪 + 使用降权打分；
// 3) 同一 type 内 l2 / 同一效果卡使用降权，避免同屏重复与语义错配。

// 语义规则：文案关键词 → 优先 l2key（按命中顺序）
const L2_SEMANTIC = [
  { re: /第一步|第二步|第三步|然后|接着|流程|循环/, l2s: ['process', 'method'] },
  { re: /数据|统计|研究|增长|指标|报告|调查|数字|%|倍/, l2s: ['data', 'number'] },
  { re: /因为|所以|导致|来自|源于|回馈/, l2s: ['causal', 'data'] },
  { re: /方法|步骤|怎么做|练习|三步/, l2s: ['method', 'process'] },
  { re: /不是.*而是|看似.*其实|别人.*你|对比|反而|更像/, l2s: ['compare', 'judgment'] },
  { re: /概念|心理学|本质|定义|认知|卸载|称为|这叫/, l2s: ['definition', 'concept'] },
  { re: /误区|误解|以为|误以为|真相|其实|没想到|大多数人/, l2s: ['misconception', 'anti-common'] },
  { re: /比如|就像|举个例子|朋友|当你|每天|如果/, l2s: ['example', 'scene'] },
  { re: /焦虑|陷阱|代价|浪费|危险|风险|失控|停/, l2s: ['anxiety', 'impact'] },
  { re: /记住|关键|最重要|核心|收藏是|起点/, l2s: ['insight', 'emphasis'] },
  { re: /开始|停止|今天|从.*开始|删掉|去做/, l2s: ['action', 'summary'] },
  { re: /为什么|吗|\?|\？/, l2s: ['question'] },
];

// 镜头类型兜底（无语义命中时的稳定默认）
const TYPE_DEFAULT_L2 = {
  hook: ['question', 'scene', 'impact'],
  pain: ['status', 'anxiety', 'compare'],
  claim: ['concept', 'judgment', 'definition'],
  proof: ['example', 'data', 'method', 'causal'],
  quote: ['insight', 'emphasis'],
  cta: ['action', 'summary'],
};

// 情绪 → 效果风格关键词（池内精排用）
const MOOD_STYLE = {
  '活力': ['crash', 'slam', 'punch', 'strobe', 'impact', 'fracture', 'speed'],
  '科技感': ['data', 'glitch', 'scanline', 'chart', 'hatch', 'odometer', 'ring', 'glass'],
  '沉稳': ['paper', 'marker', 'underline', 'list', 'type-entrance', 'draw', 'timeline'],
  '温暖': ['blur-slide', 'grain', 'graze', 'type-entrance', 'dissolve'],
  '紧张': ['rhythm-interrupt', 'speed-ramp', 'depth', 'tension', 'freeze'],
};

// 节奏关键词
const FAST_PATTERNS = ['glitch', 'scramble', 'smash', 'strobe', 'impact', 'crash', 'slam', 'punch', 'fracture', 'speed'];
const LOOP_PATTERNS = ['orbit', 'marquee', 'ticker', 'ripple', 'cycle', 'loop', 'filmstrip', 'carousel', 'converge', 'merge'];

// 选 l2key：语义命中优先 → type 兜底 → 同 type 使用降权
function pickL2Key(type, text, l2Usage) {
  let candidates = [];
  for (const { re, l2s } of L2_SEMANTIC) {
    if (re.test(text)) { candidates = candidates.concat(l2s); break; } // 只取第一条命中（规则按优先级排）
  }
  if (candidates.length === 0) candidates = TYPE_DEFAULT_L2[type] || ['status'];
  // 同 type 内已用过的 l2 降权（避免同屏同 l2 堆叠）：取使用次数最少的前几个
  const scored = candidates.map(l2 => ({ l2, n: l2Usage[l2] || 0 }));
  scored.sort((a, b) => a.n - b.n || Math.random() - 0.5);
  const bestN = scored[0].n;
  const pool = scored.filter(s => s.n <= bestN + 1); // 允许轻微轮换
  return pool[Math.floor(Math.random() * pool.length)].l2;
}

// 叙事能量匹配：hook 要瞬时高能、quote 要收束低能、proof 要信息持续
const ENERGY_MATCH = {
  hook: ['高', '冲击'], pain: ['高', '中高', '紧张'], claim: ['中高', '中'],
  proof: ['中高', '中', '持续'], quote: ['低', '收束'], cta: ['中', '低', '收束'],
};
function energyScore(card, type) {
  const meta = cardMeta(card.split('/').pop());
  if (!meta?.energy) return 0;
  return ENERGY_MATCH[type]?.some(k => meta.energy.includes(k)) ? 8 : 0;
}

// 时长解析：优先"约 Xs"总时长 → 其次"总 X f@30fps" → 再兜底第一个数字（秒优先）
function parseRecDuration(text) {
  if (!text) return null;
  let m = text.match(/约\s*([\d.]+)\s*s/i) || text.match(/([\d.]+)\s*s\b/i);
  if (m) return { sec: +m[1] };
  m = text.match(/([\d.]+)\s*f\s*@\s*30fps/i) || text.match(/总\s*([\d.]+)\s*f/i) || text.match(/([\d.]+)\s*f\b/i);
  if (m) return { sec: +m[1] / 30 };
  return null;
}
// 时长体质校验（U2）：stretch 任意；loop 长镜头/金句；fixed 需在推荐时长 ±40% 内（附 gap 供 fallback 排序）
function physiqueOk(card, durationInFrames, type) {
  const meta = cardMeta(card.split('/').pop());
  if (!meta?.duration) return { ok: true, gap: 0 };
  if (/归一化|stretch|任意|任何时长/i.test(meta.duration)) return { ok: true, gap: 0 };
  if (/loop|无限|循环/i.test(meta.duration)) return { ok: durationInFrames >= 90 || type === 'quote', gap: Math.max(0, 90 - durationInFrames) / 30 };
  const rec = parseRecDuration(meta.duration);
  if (!rec) return { ok: true, gap: 0 };
  const targetSec = durationInFrames / 30;
  const gap = Math.abs(targetSec - rec.sec);
  return { ok: gap / rec.sec <= 0.4, gap };
}

// 模式差异化加权（U3）：A 模板主导 / B 素材人像 / C 氛围
const MODE_STYLE_WEIGHT = {
  A: { 'typography/': 8, 'data/': 8, 'ui-entrance/': 6, 'interaction/': 6, 'opening/': 4, 'outro/': 4, 'camera/': 2 },
  B: { 'camera/': 8, 'opening/': 6, 'effects/': 5, 'rhythm/': 3, 'typography/': -4 },
  C: { 'effects/': 8, 'rhythm/': 8, 'transition/': 6, 'data/': 4, 'typography/': 2 },
};

// 选效果卡：节奏 + 情绪 + 能量叙事 + 模式加权 + 使用降权（同分随机）
function pickShotCard(l2key, durationInFrames, mood, cardUsage, type, mode, text) {
  // 双向匹配①：坑位→模板——候选池只保留"已注册可注入文案"的模板（叶子级）
  let candidates = (L3[l2key] || []).filter(c => REGISTERED_SHOTCARDS.has(c));
  // 回退：该 l2 无注册模板 → 从全部注册模板里按模式类别加权兜底
  if (candidates.length === 0) candidates = [...REGISTERED_SHOTCARDS];
  if (candidates.length === 1) return candidates[0];
  // 双向匹配②：模板→坑位——文字形态校验（raw 整句组件吃短句；words 切词组件可吃任意长句）
  const t = (text || '').trim();
  const textOk = (card) => {
    const low = card.toLowerCase();
    if (RAW_CARD_PATTERN.test(low)) return t.length <= 14;   // 整句组件：≤14字短句直接呈现，超长不选raw模板
    return true;                                              // 切词组件：切词数组自适应
  };
  candidates = candidates.filter(textOk);
  if (candidates.length === 0) candidates = (L3[l2key] || []).filter(c => REGISTERED_SHOTCARDS.has(c));
  // 重复硬剔除：同篇已用卡排除（池>1 时），彻底防同屏重复
  const used = Object.keys(cardUsage);
  const fresh = candidates.filter(c => !used.includes(c));
  if (fresh.length > 0) candidates = fresh;
  const style = MOOD_STYLE[mood] || [];
  const modePref = MODE_STYLE_WEIGHT[mode] || {};

  const scored = candidates.map(card => {
    const low = card.toLowerCase();
    let score = 0;
    // 节奏：短→快节奏 +12，长→循环 +12
    if (durationInFrames <= 60 && FAST_PATTERNS.some(p => low.includes(p))) score += 12;
    else if (durationInFrames >= 120 && LOOP_PATTERNS.some(p => low.includes(p))) score += 12;
    // 情绪风格匹配 +10
    if (style.some(p => low.includes(p))) score += 10;
    // U2：energy × 叙事匹配 +8
    score += energyScore(card, type);
    // U3：模式卡类别加权
    for (const [k, w] of Object.entries(modePref)) {
      if (low.startsWith(k)) { score += w; break; }
    }
    // 使用降权：同篇内已用过 -20/次（防同屏重复）
    score -= (cardUsage[card] || 0) * 20;
    const phy = physiqueOk(card, durationInFrames, type);
    return { card, score, ok: phy.ok, gap: phy.gap };
  });
  const valid = scored.filter(s => s.ok);
  if (valid.length === 0) {
    // 体质全不满足 → 按时长差距最小选（坑位时长优先于风格，避免 1.5s 坑位配 3.2s 模板）
    scored.sort((a, b) => a.gap - b.gap);
    return scored[0].card;
  }
  valid.sort((a, b) => b.score - a.score);
  // top 内随机（避免确定性单卡），top1 明显领先（≥5 分）则直取
  const top = valid.slice(0, Math.min(3, valid.length));
  if (top[0].score - (top[1]?.score ?? -999) >= 5) return top[0].card;
  return top[Math.floor(Math.random() * top.length)].card;
}

// ================= 主体决策层（坑位预排）：L0 模式后先定 subject =================
const MODE_PRESET = {
  A: { subjectRatio: { remotion: 0.70, material: 0.25, aigc: 0.05 }, materialPriority: ['example', 'scene', 'status'], templateForce: ['quote', 'cta'], aigcRole: 'fallback' },
  B: { subjectRatio: { person: 0.60, remotion: 0.28, material: 0.12 }, materialPriority: ['proof', 'example'], templateForce: ['quote', 'cta', 'data'], aigcRole: 'fallback' },
  C: { subjectRatio: { aigc: 0.55, remotion: 0.30, material: 0.15 }, materialPriority: ['hook', 'pain'], templateForce: ['data', 'quote', 'cta'], aigcRole: 'primary' },
};

// L4 坑位一致性：slot → 布局反推（subject 由预排层统一决定，pitByL2 仅兜底）
const SLOT_TO_PIT = {
  'text-hero': { content: { type: 'text' }, position: 'element' },
  'data-show': { content: { type: 'video-local' }, position: 'element' },
  'case-show': { content: { type: 'video-local' }, position: 'background' },
  'process-show': { content: { type: 'video-local' }, position: 'element' },
  'transition-slot': { content: { type: 'text' }, position: 'element' },
  'compare-slot': { content: { type: 'video-local' }, position: 'split' },
};

// 预排：强制模板 → 素材优先（有料） → AIGC 主通道 → 比例轮转
function preassignSubject(type, text, mode, hasGoodMaterial, subjCount) {
  const preset = MODE_PRESET[mode] || MODE_PRESET.A;
  if (preset.templateForce.includes(type)) return 'remotion';
  if (preset.materialPriority.includes(type) && hasGoodMaterial) return 'material';
  if (preset.aigcRole === 'primary' && type === 'pain' && !hasGoodMaterial) return 'aigc';
  const total = Object.values(subjCount).reduce((a, b) => a + b, 0) + 1;
  let want = 'remotion', maxGap = -Infinity;
  for (const [s, r] of Object.entries(preset.subjectRatio)) {
    const gap = r - (subjCount[s] || 0) / total;
    if (gap > maxGap) { maxGap = gap; want = s; }
  }
  return want;
}

// 模板契约 textAs（与 template/src/TemplateAdapter.tsx 的 textAs:'raw' 清单保持一致）
// 'raw'=整句字符串注入组件；其余默认 'words'=切词数组注入（大字展示类）
const RAW_TEXT_CARDS = new Set([
  'scramble', 'scramble-decode', 'split-text-stagger', 'lead-word-zoom-assemble',
  'font-weight-pump', 'terminal-typewriter', 'typewriter-error-retype',
  'letter-drop-physics', 'letterform-drift-assembly', 'tracking-expand-reveal',
]);

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

// ---------- 主流程（v4.1：预排主体 → 分支决策） ----------
const l2Usage = {};   // 同 type 内 l2 使用次数（防堆叠）
const cardUsage = {}; // 同篇效果卡使用次数（防同屏重复）
const subjCount = { remotion: 0, material: 0, person: 0, aigc: 0 }; // 主体计数（比例轮转）
let rawShots = timing.segments.map((seg, i) => {
  const type = pickShotType(seg.text, i, timing.segments.length);
  const mood = extractMood(seg.text);
  const l2key = pickL2Key(type, seg.text, l2Usage);
  l2Usage[l2key] = (l2Usage[l2key] || 0) + 1;
  // 语音时间轴：每句真实帧数（tts.py 按语音总时长×字数占比摊派）。不 clamp 上限——
  // 2026-09-22 修复：原 clamp 到 [45,150] 帧会把 99.96s 语音轴压成 79.2s，导致字幕与语音错位 20s
  const rawDuration = seg.duration_frames;
  let durationInFrames = Math.max(Math.round(0.8 * FPS), rawDuration); // 仅 0.8s 保底，上限放开跟随语音
  const semanticTags = extractSemanticTags(seg.text);

  // ① 主体决策层：素材预检索（决定能否当主体）+ 预排 subject
  const preset = MODE_PRESET[globalMode] || MODE_PRESET.A;
  const probeMaterial = preset.materialPriority.includes(type)
    ? findMaterial(ROLE_TO_TAGS.hero || [], semanticTags, durationInFrames / FPS, mood)
    : null;
  const subject = preassignSubject(type, seg.text, globalMode, probeMaterial !== null, subjCount);
  subjCount[subject] = (subjCount[subject] || 0) + 1;

  let shotCard = null, slot = null, materialRole = 'none', material = null, fallback = null, media = null;

  if (subject === 'material') {
    // ② 素材主体：默认纯素材全屏（hero 坑位）；P3 增强——部分素材镜头配视频卡片模板承载素材进组件画面
    material = probeMaterial;
    if (!material) material = findMaterial(ROLE_TO_TAGS.hero || [], semanticTags, durationInFrames / FPS, mood);
    slot = 'case-show';
    materialRole = 'hero';
    if (material && Math.random() < 0.35) {
      shotCard = 'ui-entrance/clipcard-looping';   // P3 组件媒体输入：素材进组件画面
      media = 'http://127.0.0.1:8765/api/library/video?path=' + encodeURIComponent(material.path); // 服务端视频流（零复制，ClipCard http 分支）
      material = null;                              // 组件内嵌即主体，不再做全屏底
      materialRole = 'inline-element';
    } else {
      shotCard = null;
    }
    if (!material && !media) fallback = { keyword: extractKeyword(seg.text), gradient: ['#1a1d24', '#0d0f14'] };
  } else if (subject === 'aigc') {
    // ③ AIGC 主体：登记生成标记（渲染暂用 Fallback 渐变兜底，后续接 AIGC 通道）
    slot = 'case-show';
    shotCard = null;
    fallback = { keyword: extractKeyword(seg.text), gradient: ['#1a1d24', '#0d0f14'] };
  } else if (subject === 'person') {
    // ③b 口播主体（B 模式）：人像素材全屏（无则 fallback），模板只做标注位
    slot = 'case-show';
    materialRole = 'hero';
    shotCard = null;
    material = findMaterial(ROLE_TO_TAGS.hero || [], semanticTags, durationInFrames / FPS, mood);
    if (!material) fallback = { keyword: extractKeyword(seg.text), gradient: ['#1a1d24', '#0d0f14'] };
  } else {
    // ④ remotion 模板主体：双向赋权选卡（语义池 → 节奏/情绪/能量/模式/降权）
    shotCard = pickShotCard(l2key, durationInFrames, mood, cardUsage, type, globalMode, seg.text);
    cardUsage[shotCard] = (cardUsage[shotCard] || 0) + 1;
    const rs = resolveSlot(shotCard);
    slot = rs.slot;
    materialRole = rs.materialRole;
    if (materialRole !== 'none' && (type === 'proof' || type === 'pain' || type === 'hook')) {
      const tags = ROLE_TO_TAGS[materialRole] || L2_TO_TAGS[l2key] || [];
      material = findMaterial(tags, semanticTags, durationInFrames / FPS, mood);
    }
    if (!material && materialRole !== 'none' && (type === 'proof' || type === 'pain' || type === 'hook')) {
      fallback = { keyword: extractKeyword(seg.text), gradient: ['#1a1d24', '#0d0f14'] };
    }
  }

  // ⑤ L4 坑位一致性：pit 由 slot 反推（主体分支定制），pitByL2 仅兜底
  let pit;
  if (subject === 'material') {
    if (media) {
      pit = { mode: globalMode, subject: 'remotion', content: { type: 'video-local', path: media }, position: 'element' };
      recordUsage(media);
    } else {
      pit = { mode: globalMode, subject: 'local-material', content: { type: 'video-local', ...(material ? { path: material.path } : {}) }, position: 'background' };
      if (material) recordUsage(material.path);
    }
  } else if (subject === 'aigc') {
    pit = { mode: globalMode, subject: 'aigc-material', content: { type: 'video-aigc' }, position: 'background', aigc: true };
  } else if (subject === 'person') {
    pit = { mode: globalMode, subject: 'person', content: { type: 'video-local', ...(material ? { path: material.path } : {}) }, position: 'background' };
    if (material) recordUsage(material.path);
  } else {
    const base = SLOT_TO_PIT[slot] || pitByL2[l2key]?.[globalMode] || { content: { type: 'text' }, position: 'element' };
    pit = { mode: globalMode, subject: 'remotion', content: { ...base.content }, position: base.position, ...(base.loop ? { loop: true } : {}) };
    if ((pit.subject === 'local-material' || pit.content.type === 'video-local') && material) {
      pit.content.path = material.path;
      recordUsage(material.path);
    }
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
    ...(media ? { media } : {}),
    ...(fallback ? { fallback } : {}),
    ...(shotCard ? {
      params: {
        textAs: RAW_TEXT_CARDS.has(String(shotCard).split('/').pop()) ? 'raw' : 'words',
        mediaType: media ? 'component' : (material ? 'material' : (fallback ? 'fallback' : 'none')),
      },
    } : {}),
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
// ---------- 全局色调（读风格中心当前主题，无则回退黑金默认） ----------
let CUR = null;
const curPath = join(directorDir, 'current-theme.json');
if (existsSync(curPath)) {
  try { CUR = JSON.parse(readFileSync(curPath, 'utf8')); } catch (e) {}
}
const _bg = (CUR && CUR.bg) || '#0d0f14';
const _ink = (CUR && CUR.ink) || '#e8e6e1';
const _mid = (CUR && CUR.mid) || '#8a8680';
const _accent = (CUR && CUR.accent) || '#d4a853';
const _accent2 = (CUR && CUR.accent2) || '#4ecdc4';
const _card = (CUR && CUR.card) || '#1a1d24';
// P1/P2：文字与媒体公共参数（与 current-theme.json 同字段名，一次读取全量注入——数据调用链路单一权威）
const _fontFamily = (CUR && CUR.fontFamily) || "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif";
const _captionSize = (CUR && CUR.captionSize) || 36;
const _captionWeight = (CUR && CUR.captionWeight) || 600;
const _captionColor = (CUR && CUR.captionColor) || '#ffffff';
const _materialOpacity = (CUR && CUR.materialOpacity) || 0.6;
const _fallbackSize = (CUR && CUR.fallbackSize) || 96;
const _fallbackAlpha = (CUR && CUR.fallbackAlpha) || 0.14;// ---------- 音效编排（转场 / 提示音 / 底噪） ----------
// 音效库：template/public/audio（复用既有素材；ambient-room.mp3 为按风格生成的底噪）
const SFX = {
  transition: ['audio/transition-soft.mp3', 'audio/transition-snap.mp3', 'audio/swoosh-quick.mp3'],
  whoosh: ['audio/whoosh-fast.mp3', 'audio/whoosh-big.mp3'],
  hit: ['audio/pop.mp3', 'audio/sparkle.mp3', 'audio/click-camera.mp3'],
};
let _sfxIdx = { transition: 0, whoosh: 0, hit: 0 };
const nextSfx = (pool) => SFX[pool][_sfxIdx[pool]++ % SFX[pool].length];
const assignAudio = (shots) => shots.map((s) => {
  const card = String(s.shotCard || '');
  let audio;
  if (card.startsWith('transition/')) {
    audio = { src: nextSfx('whoosh'), volume: 0.3 };          // 转场模板 → whoosh 类
  } else if (s.durationInFrames < 60 || s.params?.textAs === 'raw') {
    audio = { src: nextSfx('hit'), volume: 0.32 };             // 短词/关键词镜头 → pop/sparkle/click
  } else if (s.shotCard) {
    audio = { src: nextSfx('transition'), volume: 0.16 };      // 常规模板镜头 → 轻量切点扫
  } else {
    audio = { src: 'audio/transition-soft.mp3', volume: 0.14 };// 素材镜头 → 最轻切点扫
  }
  return { ...s, audio };
});

const storyboard = {
  title: '口播视频',
  style: {
    bg: _bg,
    text: _ink,
    accent: _accent,
    sub: _mid,
    captionStyle: 'pill',
    fontFamily: _fontFamily,
    captionSize: _captionSize,
    captionWeight: _captionWeight,
    captionColor: _captionColor,
    materialOpacity: _materialOpacity,
    fallbackSize: _fallbackSize,
    fallbackAlpha: _fallbackAlpha,
  },
  // 全局 theme（DynamicVideo 注入 CSS 变量，所有组件色调统一；来源：风格中心 C4 当前主题）
  theme: {
    bg: _bg,
    surface: _card,
    text: _ink,
    textDim: _mid,
    accent: _accent,
    accent2: _accent2,
    danger: '#ff6b6b',
  },
  fps: FPS,
  audio: 'audio/voiceover.mp3',
  shots: assignAudio(merged),
};

writeFileSync(join(directorDir, 'storyboard.json'), JSON.stringify(storyboard, null, 2));
saveUsage(); // P3：素材使用频率落盘
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
