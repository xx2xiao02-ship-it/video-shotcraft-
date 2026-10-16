import fs from 'node:fs';
import path from 'node:path';
import {DUPLICATE_SUBTITLE_CARD_IDS, SHORT_OPENING_POOL} from './talkcraft-template-governance.mjs';

const CARD_ALIASES = Object.freeze({
  // Runtime and the GitHub card catalog use the base filename as the
  // canonical production ID. Namespaced IDs are accepted as input aliases,
  // but must never be written back into shots.json or cards-used.json.
  'typography/lead-word-zoom-assemble': 'lead-word-zoom-assemble',
  'typography/title-demote-to-label': 'title-demote-to-label',
  'interaction/chip-grid-single-select-blackout': 'chip-grid-single-select-blackout',
});

const EDITORIAL_CARDS = Object.freeze({
  s03: 'data/odometer-digit-roll',
  s07: 'ui-entrance/list-reveal',
  s08: 'outro/neon-triple-marquee',
});


const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

function canonicalCard(value) {
  const raw = String(value || '').trim();
  if (!raw || /^native-scene-/u.test(raw)) return null;
  return CARD_ALIASES[raw] || raw;
}

function cardFromShotbook(markdown, shotId) {
  const heading = new RegExp(`^#{2,4}\\s+${shotId}\\b`, 'imu');
  const start = markdown.search(heading);
  if (start < 0) return null;
  const next = markdown.slice(start + 1).search(/^#{2,4}\s+S\d{2}\b/mu);
  const section = markdown.slice(start, next < 0 ? undefined : start + next + 1);
  const rows = [...section.matchAll(/^\s*-\s*(?:选卡行|蒙皮行|正式模板)\s*[：:]\s*(.+)$/gmu)];
  for (const row of rows) {
    const candidates = row[1].match(/[a-z0-9]+(?:[/-][a-z0-9-]+)+/giu) || [];
    for (const candidate of candidates) {
      const card = canonicalCard(candidate);
      if (card) return card;
    }
  }
  return null;
}

const EDITORIAL_COPY = Object.freeze({
  s01: {title:'50万的购买力，正在变化', labels:['现金更有用','选择权更珍贵']},
  s02: {title:'现金，是越来越珍贵的选择权', labels:['过去：资产普涨','现在：现金选择权','盲目加杠杆']},
  s03: {title:'房产与新能源车，都在降价', labels:['房产 300万 → 200万+','新能源车 20万 → 13万','保住本金就是收益']},
  s04: {title:'留现金的人，先活下来', labels:['借钱扩张','现金过冬','逆势翻新']},
  s05: {title:'赚钱更难，花钱更要谨慎', labels:['过去：机会多','现在：成本高','一万元更难赚']},
  s06: {title:'账面资产，不等于活钱', labels:['几百万账面资产','卡里没有10万','急用钱只认现金']},
  s07: {title:'普通人做好三件事', labels:['砍掉面子消费','清掉高息负债','守住本金']},
  s08: {title:'现金，是全家的安全垫', labels:['生病有底气','工作能转身','存款抵御变数']},
});

function titleForShot(shot, index) {
  const id = String(shot.id || '').toLowerCase();
  return EDITORIAL_COPY[id]?.title || `镜头 ${String(index + 1).padStart(2, '0')}`;
}

function editorialParams(shot, index) {
  const id = String(shot.id || '').toLowerCase();
  const copy = EDITORIAL_COPY[id];
  const title = copy?.title || titleForShot(shot, index);
  const labels = copy?.labels || [];
  return {title, headline:title, body:String(shot.intent || '').slice(0, 52), labels};
}

function isOpening(shot) {
  return Number(shot?.start ?? shot?.startSec) < 8;
}

function durationSecForShot(shot) {
  const duration = Number(shot?.durationSec ?? shot?.duration);
  if (Number.isFinite(duration) && duration > 0) return duration;
  const start = Number(shot?.startSec ?? shot?.start);
  const end = Number(shot?.endSec ?? shot?.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null;
}

function openingCardFor(index, fromShot, fromCards, fromBook) {
  const candidate = [fromShot, fromCards, fromBook].find(card => SHORT_OPENING_POOL.has(card));
  // 没有通过原始时长准入的短卡时返回空值，由治理层阻断；禁止固定轮换长卡。
  return candidate || null;
}

function sectionForShotbook(markdown, shotId) {
  const heading = new RegExp(`^#{2,4}\\s+${shotId}\\b`, 'imu');
  const start = markdown.search(heading);
  if (start < 0) return '';
  const next = markdown.slice(start + 1).search(/^#{2,4}\s+S\d{2}\b/mu);
  return markdown.slice(start, next < 0 ? undefined : start + next + 1);
}

function materialCarrierForShot(markdown, shotId, index) {
  const section = sectionForShotbook(markdown, shotId);
  const materialLine = section.split(/\r?\n/u).find(line => /^\s*-\s*素材[：:]/u.test(line)) || '';
  if (!/(?:\bV\(|图|截图)/u.test(materialLine)) return null;
  // 单条实拍素材交替使用同源底床与 60/40 分屏，避免整片同一种呈现。
  return new Set(['s03', 's06']).has(shotId.toLowerCase()) ? 'split-60-40-story' : 'bed-echo-blur';
}

/**
 * 将编导镜头计划固化为唯一正式绑定。
 * 这一步只做确定性调节：不会随机选卡，也不会把 native-scene 当成正式模板。
 */
export function normalizeTalkcraftBindings(project) {
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  const shotbookFile = path.join(project, 'SHOTBOOK.md');
  if (!fs.existsSync(shotsFile) || !fs.existsSync(shotbookFile)) throw new Error('缺少 shots.json 或 SHOTBOOK.md，无法建立正式绑定');
  const shots = readJson(shotsFile);
  if (!Array.isArray(shots) || !shots.length) throw new Error('shots.json 不是有效镜头数组');
  const shotbook = fs.readFileSync(shotbookFile, 'utf8');
  const cardsFile = path.join(project, 'remotion', 'cards-used.json');
  const cards = fs.existsSync(cardsFile) ? readJson(cardsFile) : {byShot:{}};
  const bindings = [];
  const missing = [];
  const normalized = shots.map((shot, index) => {
    const id = String(shot.id || '').toLowerCase();
    const fromShot = canonicalCard(shot.shotCard);
    const fromCards = canonicalCard(cards.byShot?.[id]?.[0]);
    const fromBook = cardFromShotbook(shotbook, id.toUpperCase());
    // The director's explicit card is authoritative. Opening admission is a
    // separate validation; never substitute a fixed rotation or ID-based card.
    const card = fromShot || fromCards || fromBook;
    if (!card) {
      missing.push(id || `s${String(index + 1).padStart(2, '0')}`);
      return shot;
    }
    // Preserve reviewed parameters and real material/person bindings byte for
    // byte in value. Never generate business copy, hide content, or drop s02 props.
    const nextParams = {...(shot.templateParams && typeof shot.templateParams === 'object' ? shot.templateParams : {})};
    const materialCard = canonicalCard(nextParams.materialCard);
    bindings.push({shotId:id, shotCard:card, templateParams:nextParams, ...(materialCard ? {materialCard} : {})});
    return {...shot, shotCard:card, templateParams:nextParams};
  });
  if (missing.length) throw new Error(`无法确定正式模板绑定：${missing.join(', ')}`);
  writeJson(shotsFile, normalized);
  const bindingFile = path.join(project, 'qa', 'formal-bindings.json');
  fs.mkdirSync(path.dirname(bindingFile), {recursive:true});
  writeJson(bindingFile, {schema:'talkcraft-formal-bindings-v1', bindings});
  // cards-used 是下游治理与审核读取的正式清单，不能继续保留 scaffold 阶段的旧演示卡。
  writeJson(cardsFile, {
    schema: 'talkcraft-cards-used-v1',
    slugs: [...new Set(bindings.map(item => item.shotCard))],
    byShot: Object.fromEntries(bindings.map(item => [item.shotId, [item.shotCard]])),
  });

  const lines = shotbook.split(/\r?\n/u);
  const byShot = new Map(bindings.map(item => [item.shotId, item.shotCard]));
  const out = [];
  let current = null;
  let cardWritten = false;
  let skinWritten = false;
  const flushSection = () => {
    if (current && !cardWritten) {
      const card = byShot.get(current);
      if (card) {
        const materialCard = bindings.find(item => item.shotId === current)?.materialCard;
        const carrier = materialCard ? `${materialCard}, ` : '';
        out.push(`- 正式模板：${card}`);
        cardWritten = true;
      }
    }
  };
  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(S\d{2,}[a-z]?)\b/iu);
    if (heading) {
      flushSection();
      current = heading[1].toLowerCase();
      cardWritten = false;
      skinWritten = false;
      out.push(line);
      continue;
    }
    if (!current) { out.push(line); continue; }
    if (/^\s*-\s*正式模板\s*[：:]/u.test(line)) {
      if (!cardWritten) {
        const card = byShot.get(current);
        if (card) out.push(`- 正式模板：${card}`);
        cardWritten = true;
      }
      continue;
    }
    if (/^\s*-\s*蒙皮行\s*[：:]/u.test(line)) {
      if (!skinWritten) {
        const card = byShot.get(current);
        if (card) {
          const materialCard = bindings.find(item => item.shotId === current)?.materialCard;
          const carrier = materialCard ? `${materialCard}, ` : '';
          out.push(line);
        }
        skinWritten = true;
      }
      continue;
    }
    out.push(line);
  }
  flushSection();
  fs.writeFileSync(shotbookFile, out.join('\n'), 'utf8');
  return {shots:normalized.length, bindings, file:bindingFile};
}

/**
 * 素材分配发生在 scaffold 之后，必须把更新后的 shots.json 回写到渲染源码。
 * 否则 Remotion 仍会读取 scaffold 时的旧背景路径，造成整片复用同一素材。
 */
export function syncTalkcraftShotSource(project) {
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  const sourceFile = path.join(project, 'remotion', 'src', 'shots.ts');
  if (!fs.existsSync(shotsFile) || !fs.existsSync(sourceFile)) throw new Error('缺少 shots.json 或 src/shots.ts，无法同步渲染镜头');
  const planned = readJson(shotsFile);
  const source = fs.readFileSync(sourceFile, 'utf8');
  const match = source.match(/export const SHOTS: Shot\[\] = (\[[\s\S]*?\]);\r?\nexport const shotSequence/u);
  if (!match) throw new Error('src/shots.ts 缺少可同步的 SHOTS 定义');
  const rendered = JSON.parse(match[1]);
  const ids = (items, label) => {
    if (!Array.isArray(items) || !items.length) throw new Error(`${label}不是有效镜头数组`);
    const keys = items.map(shot => shot?.id);
    if (keys.some(id => typeof id !== 'string' || !id) || new Set(keys).size !== keys.length) {
      throw new Error(`${label}存在缺失或重复镜头 ID，不能同步`);
    }
    return keys;
  };
  const plannedIds = ids(planned, '编导计划'), renderedIds = ids(rendered, '渲染源码');
  const missing = plannedIds.filter(id => !renderedIds.includes(id));
  const extra = renderedIds.filter(id => !plannedIds.includes(id));
  if (missing.length || extra.length) {
    throw new Error(`编导与渲染镜头不一致：源码缺少 ${missing.join('、') || '无'}；源码多出 ${extra.join('、') || '无'}。需重新生成对应工程，不能保留旧镜头继续渲染`);
  }
  const byId = new Map(rendered.map(shot => [shot.id, shot]));
  const next = planned.map((latest, index) => {
    const shot = byId.get(latest.id);
    if (shot.shotCard && canonicalCard(shot.shotCard) !== canonicalCard(latest.shotCard)) {
      throw new Error(`镜头 ${latest.id} 模板已改变，需重新生成对应工程及参数表，不能沿用旧组件的参数字段`);
    }
    const start = Number(latest.start), end = Number(latest.end);
    const nextStart = Number(planned[index + 1]?.start);
    const visualEnd = Number.isFinite(nextStart) && nextStart > end + 0.001 ? nextStart : end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
        Math.abs(start - Number(shot.startSec)) > 1e-9 ||
        Math.abs(visualEnd - start - Number(shot.durationSec)) > 1e-9 ||
        !Number.isFinite(Number(shot.startSec)) || !Number.isFinite(Number(shot.durationSec))) {
      throw new Error(`镜头 ${latest.id} 编导与渲染时间轴不一致，需重新生成对应工程；禁止仅替换素材后继续使用旧时间轴`);
    }
    return {...shot, subject:latest.subject || 'other', shotCard:latest.shotCard || null, templateParams:latest.templateParams || {}};
  });
  const updated = source.replace(match[1], JSON.stringify(next, null, 2));
  fs.writeFileSync(sourceFile, updated, 'utf8');
  return {shots:next.length, sourceFile};
}

export function readFormalBindings(project) {
  const file = path.join(project, 'qa', 'formal-bindings.json');
  return fs.existsSync(file) ? readJson(file) : null;
}
