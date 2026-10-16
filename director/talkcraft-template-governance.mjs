import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {canonicalCardId,loadTalkcraftGovernedCatalog,validateTalkcraftDesignProps} from './talkcraft-governed-contract.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const compact = value => String(value ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CATALOG=loadTalkcraftGovernedCatalog(readJson(path.join(resolveTalkcraftSkillRoot(ROOT),'references/cards-index.json')));
// Directory membership is not production admission. Every call still needs
// explicit props/source validation plus downstream material/render/QA evidence.
export const PARAMETERIZED_CARD_IDS = new Set(CATALOG.cards.map(card=>card.cardId));

// 开场短模板池只接受治理目录记录的原始完整时长，不超过 3 秒才有资格进入。
// 不能用运行时截断、加速或 templateUnitSec 伪造短卡。
export const OPENING_MAX_TEMPLATE_SEC = 3;
// 窗口长度与单镜长度分别约束，短卡不能通过长驻留绕过开场节奏。
export const OPENING_WINDOW_SEC = 8;
export const OPENING_TARGET_SHOT_SEC = 2.4;
export const OPENING_MAX_SHOT_SEC = 3.4;
// 同一模板在任意连续 30 个镜头内只能正式绑定一次。使用滑动窗口，
// 这样跨分组边界的重复也会被拦截，而不是只检查固定的 1-30、31-60 分组。
export const TEMPLATE_REUSE_WINDOW_SIZE = 30;
// 兼容现有绑定模块的导出名；实际准入仍以治理目录原始时长为准。
export const SHORT_OPENING_POOL = new Map();

export function governedOriginalDurationSec(cardId, catalog = CATALOG) {
  const card = catalog.cards.find(item => item.cardId === canonicalCardId(cardId, catalog));
  const frames = Number(card?.duration?.originalFrames);
  const fps = Number(card?.duration?.fps);
  return Number.isFinite(frames) && Number.isFinite(fps) && fps > 0 ? frames / fps : null;
}

export function isOpeningTemplateEligible(cardId, catalog = CATALOG) {
  const seconds = governedOriginalDurationSec(cardId, catalog);
  return seconds != null && seconds <= OPENING_MAX_TEMPLATE_SEC;
}

// 这些卡片会把整句口播再次排版；全局字幕已经存在时，禁止重复套用。
export const DUPLICATE_SUBTITLE_CARD_IDS = new Set([
  'alt-block-lines',
  'line-by-line-slide',
  'type-contrast-emphasis',
  'word-relay-filmstrip',
  'chapter-progress-list',
]);

export function isOpeningShot(shot) {
  const start = Number(shot?.startSec ?? shot?.start);
  return Number.isFinite(start) && start >= 0 && start < OPENING_WINDOW_SEC;
}

function shotDurationSec(shot) {
  const start = Number(shot?.startSec ?? shot?.start);
  const end = Number(shot?.endSec ?? shot?.end);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  const duration = Number(shot?.durationSec ?? shot?.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function hasRepeatedSubtitle(shot) {
  const params = shot?.templateParams || {};
  const narration = compact(shot?.intent || params.body);
  if (!narration || narration.length < 6) return false;
  const candidates = [params.body, params.title, ...(Array.isArray(params.labels) ? params.labels : [])]
    .map(compact).filter(Boolean);
  return candidates.some(text => text === narration || (text.length >= 12 && (text.includes(narration) || narration.includes(text))));
}

export function auditTemplateReuse(shots, {windowSize = TEMPLATE_REUSE_WINDOW_SIZE} = {}) {
  const size = Number.isInteger(windowSize) && windowSize > 0 ? windowSize : TEMPLATE_REUSE_WINDOW_SIZE;
  const issues = [];
  const rows = Array.isArray(shots) ? shots : [];
  for (let index = 0; index < rows.length; index += 1) {
    const card = canonicalCardId(rows[index]?.shotCard, CATALOG);
    if (!card) continue;
    const first = Math.max(0, index - size + 1);
    for (let previous = first; previous < index; previous += 1) {
      const previousCard = canonicalCardId(rows[previous]?.shotCard, CATALOG);
      if (previousCard !== card) continue;
      issues.push({
        shotId: rows[index]?.id,
        previousShotId: rows[previous]?.id,
        code: 'template_window_reuse',
        cardId: card,
        windowSize: size,
        message: `${rows[index]?.id || '当前镜头'} 与 ${rows[previous]?.id || '前一镜'} 在连续 ${size} 镜窗口内重复使用 ${card}；正式绑定必须换用不同模板`,
      });
    }
  }
  return issues;
}

export function auditTalkcraftTemplateGovernance(shots,{projectRoot=ROOT}={}) {
  const issues = [];
  issues.push(...auditTemplateReuse(shots));
  for (const shot of shots || []) {
    const card = String(shot?.shotCard || '');
    const governedCard = canonicalCardId(card, CATALOG);
    if (!PARAMETERIZED_CARD_IDS.has(governedCard)) {
      issues.push({shotId:shot?.id, code:'non_parameterized_template', message:`${shot?.id} 使用 ${card || '空模板'}，没有当前 B 模式业务参数绑定`});
    }
    if (isOpeningShot(shot)) {
      const shotDuration = shotDurationSec(shot);
      if (shotDuration != null && shotDuration > OPENING_MAX_SHOT_SEC + 1e-9) {
        issues.push({shotId:shot?.id, code:'opening_shot_duration_exceeded',
          actualDurationSec:shotDuration,maxDurationSec:OPENING_MAX_SHOT_SEC,
          message:`${shot?.id} 开场镜头实际持续 ${shotDuration.toFixed(3)} 秒（含驻留），超过 ${OPENING_MAX_SHOT_SEC} 秒；须依据真实字级时间戳在自然短句处重新编排，目标约 ${OPENING_TARGET_SHOT_SEC} 秒。不能截断语义、加速模板或仅缩短声明时长`});
      }
      const originalSec = governedOriginalDurationSec(governedCard, CATALOG);
      if (!isOpeningTemplateEligible(governedCard, CATALOG)) {
        issues.push({shotId:shot?.id,code:'opening_template_duration_exceeded',
          message:`${shot?.id} 使用 ${governedCard}，治理目录原始完整时长 ${originalSec == null ? '未知' : `${originalSec.toFixed(3)} 秒`}，开场要求不超过 ${OPENING_MAX_TEMPLATE_SEC} 秒；禁止截断、加速或用 templateUnitSec 冒充`});
      }
    }
    if(shot?.templateParams?.subtitlePolicy==='visual-only') issues.push({shotId:shot.id,code:'hidden_template_content',message:`${shot.id} 使用隐藏模板文字策略，必须在内容设计阶段修正`});
    if (DUPLICATE_SUBTITLE_CARD_IDS.has(governedCard) && hasRepeatedSubtitle(shot)) {
      issues.push({shotId:shot?.id, code:'duplicate_subtitle_template', message:`${shot?.id} 的 ${card} 重复排版已存在的口播字幕`});
    }
  }
  const check=validateTalkcraftDesignProps(shots||[],{catalog:CATALOG,projectRoot});
  issues.push(...check.errors.map(issue=>({...issue,message:`${issue.shotId || '分镜'} ${issue.at}: ${issue.message}`})));
  return {passed:issues.length === 0, issues,pending:check.pending,productionAdmitted:false};
}

export function assertTalkcraftTemplateGovernance(project) {
  const file = path.join(project, 'remotion', 'shots.json');
  if (!fs.existsSync(file)) throw new Error('缺少 shots.json，无法执行模板治理');
  const result = auditTalkcraftTemplateGovernance(readJson(file),{projectRoot:project});
  if (!result.passed) {
    throw new Error(`模板治理阻断：\n${result.issues.map((item, i) => `${i + 1}. [${item.code}] ${item.message}`).join('\n')}`);
  }
  return result;
}
