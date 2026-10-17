import {assertNativeCardBinding} from './talkcraft-native-card-binding.mjs';
import {createHash, randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {scaffoldTalkcraftProject} from './talkcraft-scaffold.mjs';
import {normalizeTheme, readCurrentTheme} from './theme-contract.mjs';
import {readTalkcraftStatus, talkcraftProject} from './talkcraft-status.mjs';

const SCHEMA = 'talkcraft-card-calls-v1';
const CARD_SPECS = Object.freeze({
  'alt-block-lines': {
    name: '双色块对句',
    summary: '两行短句分层揭示；仅横屏，短句容量。',
    sourcePath: 'workbench/src/cards/gen/alt-block-lines.tsx',
    exportName: 'card',
    files: ['workbench/src/cards/gen/alt-block-lines.tsx', 'workbench/src/cards/types.ts', 'workbench/src/cards/shared.tsx'],
    reviewedBundleSha256: '724c72c80b26aa8a0cc1256d0328f3ad1ea0d66657862af9f72d2be1211d4f2f',
    minimumDurationSec: props => props.lead + 0.447,
    soundTiming: {key:'lead', default:0.4},
    fields: [
      {type:'text', key:'line1', label:'第一行', default:'', required:true, maxLength:10},
      {type:'text', key:'line2', label:'第二行', default:'', required:true, maxLength:10},
      {type:'slider', key:'fontSize', label:'字号', default:66, min:40, max:96, step:1, unit:'px'},
      {type:'color', key:'blockColor', label:'强调色', default:'#0aa3a3'},
      {type:'color', key:'ink', label:'文字色', default:'#1d1d1f'},
      {type:'number', key:'posX', label:'左侧位置', default:82, min:0, max:500, step:1, unit:'px'},
      {type:'slider', key:'lead', label:'起始延迟', default:0.4, min:0, max:2, step:0.05, unit:'s'},
    ],
  },
  'bar-chart-growth': {
    name: '柱状增长',
    summary: '展示有来源支撑的数值变化；需填写真实数据与来源。',
    sourcePath: 'workbench/src/cards/gen/bar-chart-growth.tsx',
    exportName: 'card',
    files: ['workbench/src/cards/gen/bar-chart-growth.tsx', 'workbench/src/cards/types.ts', 'workbench/src/cards/shared.tsx'],
    reviewedBundleSha256: 'a6be3ea7ecb891278785969466b51d155999d892737ad947abf911d6e516c749',
    minimumDurationSec: props => props.lead + 1.16 + Math.max(0, props.barsData.split('\n').filter(Boolean).length - 1) * 0.06,
    soundTiming: {key:'lead', default:0.3},
    requiresSourceReference: true,
    fields: [
      {type:'text', key:'title', label:'图表标题', default:'', required:true, maxLength:28},
      {type:'textarea', key:'barsData', label:'数据（每行：标签|数值）', default:'', required:true, maxLength:240, help:'只填写 SHOTBOOK 来源能支持的数据。'},
      {type:'text', key:'chipText', label:'结论标记', default:'', required:true, maxLength:22},
      {type:'number', key:'maxVal', label:'量程上限', default:100, min:1, max:1000000000, step:1},
      {type:'color', key:'barColor', label:'图表强调色', default:'#e8720c'},
      {type:'slider', key:'titleSize', label:'标题字号', default:34, min:20, max:56, step:1, unit:'px'},
      {type:'number', key:'posX', label:'横向位置', default:96, min:0, max:600, step:1, unit:'px'},
      {type:'number', key:'posY', label:'纵向位置', default:96, min:0, max:400, step:1, unit:'px'},
      {type:'slider', key:'lead', label:'起始延迟', default:0.3, min:0, max:2, step:0.05, unit:'s'},
    ],
  },
  'highlighter-sweep': {
    name: '荧光笔高亮',
    summary: '从来源内容中突出一条关键句；仅横屏，需填写来源引用。',
    sourcePath: 'workbench/src/cards/highlighter-sweep.tsx',
    exportName: 'highlighterSweepCard',
    files: ['workbench/src/cards/highlighter-sweep.tsx', 'workbench/src/cards/types.ts', 'workbench/src/cards/shared.tsx'],
    reviewedBundleSha256: 'a35427f3d8f0e4cdf0e02d711852a4b5c057071284ae98370f33ff850218ae36',
    minimumDurationSec: props => props.startDelay + props.sweepDur + 0.3,
    soundTiming: {key:'startDelay', default:0.7},
    requiresSourceReference: true,
    fields: [
      {type:'text', key:'docHead', label:'来源标题', default:'', required:true, maxLength:54},
      {type:'textarea', key:'linesBefore', label:'前文', default:'', maxLength:100},
      {type:'textarea', key:'keyText', label:'重点句', default:'', required:true, maxLength:36},
      {type:'textarea', key:'linesAfter', label:'后文', default:'', maxLength:100},
      {type:'color', key:'hlColor', label:'高亮色', default:'#ffe949'},
      {type:'slider', key:'dimTo', label:'其他文字亮度', default:0.4, min:0.1, max:1, step:0.05},
      {type:'slider', key:'startDelay', label:'起始延迟', default:0.7, min:0, max:2, step:0.05, unit:'s'},
      {type:'slider', key:'sweepDur', label:'扫过时长', default:0.6, min:0.2, max:1.5, step:0.05, unit:'s'},
      {type:'slider', key:'fontSize', label:'正文字号', default:21, min:14, max:32, step:1, unit:'px'},
    ],
  },
});

const sha256 = value => createHash('sha256').update(value).digest('hex');
const digestFile = file => sha256(readFileSync(file));
const jsonFile = file => JSON.parse(readFileSync(file, 'utf8'));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function safeSourcePath(skillRoot, relativePath) {
  const file = path.resolve(skillRoot, relativePath);
  const base = path.resolve(skillRoot) + path.sep;
  if (!file.startsWith(base)) throw new Error('Card source path escaped the TalkCraft root');
  return file;
}

function verifiedBundle(skillRoot, cardId) {
  const spec = CARD_SPECS[cardId];
  if (!spec) throw new Error(`Unsupported TalkCraft card: ${cardId}`);
  const files = spec.files.map(file => ({file, sha256:digestFile(safeSourcePath(skillRoot, file))}));
  const implementationSha256 = sha256(JSON.stringify(files));
  if (implementationSha256 !== spec.reviewedBundleSha256) {
    throw new Error(`Reviewed card source changed: ${cardId}`);
  }
  return {spec, files, implementationSha256};
}

function sourceTheme(source, root) {
  return normalizeTheme(source.themeSnapshot || readCurrentTheme(root));
}

function colorChannels(value) {
  const match = /^#([\da-f]{6})$/iu.exec(String(value || ''));
  if (!match) return null;
  const raw = match[1];
  return [0, 2, 4].map(index => parseInt(raw.slice(index, index + 2), 16) / 255);
}

function relativeLuminance(value) {
  const channels = colorChannels(value);
  if (!channels) return null;
  return channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  if (a == null || b == null) return 0;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function themedDefaults(cardId, theme) {
  const values = Object.fromEntries(CARD_SPECS[cardId].fields.map(field => [field.key, field.default]));
  if (cardId === 'alt-block-lines') {
    values.blockColor = theme.tokens.accentPrimary;
    values.ink = theme.tokens.text;
  }
  if (cardId === 'bar-chart-growth') values.barColor = theme.tokens.accentPrimary;
  if (cardId === 'highlighter-sweep') values.hlColor = theme.tokens.accentPrimary;
  return values;
}

function shotCandidateEntry(candidates, shotId) {
  const key = Object.keys(candidates || {}).find(value => value.toLowerCase() === shotId.toLowerCase());
  return key ? {key, value:candidates[key]} : null;
}

function candidateMatches(entry, cardId) {
  const matches = [];
  for (const [semantic, items] of Object.entries(entry?.candidates || {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.slug === cardId) matches.push({semantic, score:item.score, why:Array.isArray(item.why) ? item.why : []});
    }
  }
  return matches;
}

function reasonForTheme(cardId, theme) {
  const background = theme.tokens.background;
  const surface = theme.tokens.surface;
  if (relativeLuminance(background) == null || relativeLuminance(surface) == null ||
      relativeLuminance(background) < 0.65 || relativeLuminance(surface) < 0.6) {
    return '已核实卡片采用白底版式，与当前深色主题不匹配';
  }
  if (cardId === 'alt-block-lines' &&
      (contrastRatio('#ffffff', theme.tokens.accentPrimary) < 3 || contrastRatio('#ffffff', theme.tokens.text) < 4.5)) {
    return '当前主题强调色或文字色对比度不足';
  }
  if (cardId === 'bar-chart-growth' && contrastRatio('#ffffff', theme.tokens.accentPrimary) < 3) {
    return '当前主题强调色与白字结论标记对比度不足';
  }
  return null;
}

function baseShotDuration(shot) {
  const duration = Number(shot.end) - Number(shot.start);
  return Number.isFinite(duration) ? duration : 0;
}

export function readTalkcraftCardOptions(root, skillRoot, runId) {
  const project = talkcraftProject(root, runId);
  const source = jsonFile(path.join(project, 'source-run.json'));
  const shotFile = path.join(project, 'remotion', 'shots.json');
  const shots = existsSync(shotFile) ? jsonFile(shotFile) : [];
  if (!Array.isArray(shots)) throw new Error('TalkCraft shot plan is invalid');
  const status = readTalkcraftStatus(root, runId);
  const theme = sourceTheme(source, root);
  const aspectRatio = source.aspectRatio || source.themeSnapshot?.aspectRatio || theme.aspectRatio || '16:9';
  const candidateFile = path.join(project, 'qa', 'card-candidates.json');
  const candidateData = existsSync(candidateFile) ? jsonFile(candidateFile) : null;
  const globalReasons = [];
  if (!status.preflightCompleted || !status.storyboardApproved) globalReasons.push('请先完成系统自动调节和分镜审核');
  if (!status.candidatesReady || !candidateData) globalReasons.push('官方选卡候选尚未生成');
  if (aspectRatio !== '16:9') globalReasons.push('当前仅有已核实的 16:9 参数化卡');

  const optionShots = shots.map(shot => {
    const entry = candidateData ? shotCandidateEntry(candidateData, shot.id) : null;
    const cardSlugs = [...new Set(Object.values(entry?.value?.candidates || {}).flatMap(items =>
      Array.isArray(items) ? items.map(item => item?.slug).filter(Boolean) : []))];
    const unsupportedCandidates = cardSlugs.filter(cardId => !CARD_SPECS[cardId]).map(cardId => ({
      cardId,
      reason:cardId === 'still-layout-relay'
        ? '依赖工作台别名和逐镜图片绑定，本版未开放'
        : '当前没有经过参数契约与源码审定',
    }));
    const options = [];
    const blockedReasons = [...globalReasons];
    if (!entry) blockedReasons.push('官方候选中没有本镜记录');
    for (const cardId of cardSlugs.filter(value => CARD_SPECS[value])) {
      if (!status.preflightCompleted || !status.storyboardApproved || !status.candidatesReady || aspectRatio !== '16:9') continue;
      let bundle;
      try { bundle = verifiedBundle(skillRoot, cardId); }
      catch (error) {
        blockedReasons.push(String(error.message || error));
        continue;
      }
      const themeReason = reasonForTheme(cardId, theme);
      if (themeReason) {
        blockedReasons.push(`${CARD_SPECS[cardId].name}：${themeReason}`);
        continue;
      }
      const defaults = themedDefaults(cardId, theme);
      if (baseShotDuration(shot) < CARD_SPECS[cardId].minimumDurationSec(defaults)) {
        blockedReasons.push(`${CARD_SPECS[cardId].name}：本镜时长不足以完成动效`);
        continue;
      }
      const matches = candidateMatches(entry.value, cardId);
      const candidateSetSha256 = sha256(JSON.stringify({shotId:shot.id, candidates:entry.value}));
      options.push({
        cardId,
        name:CARD_SPECS[cardId].name,
        summary:CARD_SPECS[cardId].summary,
        fields:CARD_SPECS[cardId].fields,
        defaultProps:defaults,
        requiresSourceReference:CARD_SPECS[cardId].requiresSourceReference === true,
        candidateEvidence:matches,
        candidateSetSha256,
        implementation:{
          source:CARD_SPECS[cardId].sourcePath,
          exportName:CARD_SPECS[cardId].exportName,
          dependencies:CARD_SPECS[cardId].files.filter(file => file !== CARD_SPECS[cardId].sourcePath),
          implementationSha256:bundle.implementationSha256,
        },
      });
    }
    const uniqueReasons = [...new Set(blockedReasons)];
    return {
      shotId:shot.id,
      text:shot.text || '',
      durationSec:baseShotDuration(shot),
      options,
      unsupportedCandidates,
      blockedReasons:uniqueReasons,
      emptyReason:options.length ? null : uniqueReasons[0] || '官方候选与当前受支持卡片没有交集；不会随机替换',
    };
  });
  return {schema:SCHEMA, runId, aspectRatio, themeId:theme.id, themeHash:theme.themeHash,
    ready:status.preflightCompleted && status.storyboardApproved && status.candidatesReady && optionShots.some(shot => shot.options.length > 0), shots:optionShots};
}

function cleanTextValue(field, value) {
  if (typeof value !== 'string') throw new Error(`${field.label}必须是文本`);
  const normalized = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(normalized)) throw new Error(`${field.label}包含无效控制字符`);
  if (field.required && !normalized) throw new Error(`请填写${field.label}`);
  if (normalized.length > field.maxLength) throw new Error(`${field.label}超过 ${field.maxLength} 个字符`);
  if (field.type === 'text' && /[\r\n]/u.test(normalized)) throw new Error(`${field.label}只能填写单行文本`);
  return normalized;
}

function normalizeProps(spec, input, durationSec, evidenceReferences = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('卡片参数必须是对象');
  const allowed = new Set(spec.fields.map(field => field.key));
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`不支持的卡片参数：${unknown.join(', ')}`);
  const props = {};
  for (const field of spec.fields) {
    const value = own(input, field.key) ? input[field.key] : field.default;
    if (field.type === 'text' || field.type === 'textarea') {
      props[field.key] = cleanTextValue(field, value);
      continue;
    }
    if (field.type === 'color') {
      if (typeof value !== 'string' || !/^#[\da-f]{6}$/iu.test(value)) throw new Error(`${field.label}必须是 #RRGGBB 颜色`);
      props[field.key] = value.toLowerCase();
      continue;
    }
    if (field.type === 'number' || field.type === 'slider') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) {
        throw new Error(`${field.label}必须在 ${field.min} 到 ${field.max} 之间`);
      }
      const offset = (value - field.min) / field.step;
      if (Math.abs(offset - Math.round(offset)) > 1e-7) throw new Error(`${field.label}不符合步进 ${field.step}`);
      props[field.key] = value;
      continue;
    }
    if (field.type === 'select') {
      if (!field.options.some(option => option.value === value)) throw new Error(`${field.label}选项无效`);
      props[field.key] = value;
      continue;
    }
    throw new Error(`Unsupported field type: ${field.type}`);
  }
  if (spec.minimumDurationSec(props) > durationSec) throw new Error('本镜时长不足以完成所选卡片动效');
  if (spec.requiresSourceReference && parseSourceReferences(evidenceReferences).length === 0) {
    throw new Error(`${spec.name}必须登记至少一条来源引用`);
  }
  if (spec === CARD_SPECS['bar-chart-growth']) validateBarsData(props);
  return props;
}

function validateBarsData(props) {
  const rows = props.barsData.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (rows.length < 2 || rows.length > 7) throw new Error('图表必须填写 2 到 7 行数据');
  for (const row of rows) {
    const match = /^([^|\r\n]{1,12})\|([0-9]+(?:\.[0-9]{1,3})?)$/u.exec(row);
    if (!match || Number(match[2]) <= 0 || Number(match[2]) > props.maxVal) {
      throw new Error('图表数据格式应为“标签|正数”，且数值不能超过量程上限');
    }
  }
}

function parseSourceReferences(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error('来源引用格式无效');
  const references = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('来源引用必须是文本');
    const reference = item.trim();
    if (!reference || reference.length > 500) throw new Error('来源引用长度无效');
    if (/^https?:\/\//iu.test(reference)) {
      let url;
      try { url = new URL(reference); } catch { throw new Error('来源 URL 无效'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('来源 URL 无效');
    } else if (!/^(?:sources\.md|SHOTBOOK\.md)(?:#[\w.-]+)?$/u.test(reference)) {
      throw new Error('来源引用应为 HTTP(S) URL、sources.md 或 SHOTBOOK.md 锚点');
    }
    if (!references.includes(reference)) references.push(reference);
  }
  return references;
}

function shotExportName(shotId) {
  return `${shotId[0].toUpperCase()}${shotId.slice(1)}`;
}

function sceneRelativePath(shotId) {
  return `remotion/src/scenes/${shotId}.tsx`;
}

function sceneBinding(call) {
  return call.evidence.find(item => item?.kind === 'scene-binding');
}

function sceneSource(call, option) {
  const exportName = shotExportName(call.shotId);
  const sourceUnderCards = path.posix.relative('workbench/src/cards', option.implementation.source.replaceAll('\\', '/'));
  const modulePath = `../talkcraft-cards/${sourceUnderCards.replace(/\.tsx$/u, '')}`;
  const params = CARD_SPECS[call.cardId].fields.map(field => ({...field, default:call.props[field.key]}));
  return `// talkcraft-card-call:v1:${call.callId}\n` +
    `import React from 'react';\n` +
    `import {useParams} from '../params';\n` +
    `import type {Shot} from '../shots';\n` +
    `import {${option.implementation.exportName} as CardDefinition} from '${modulePath}';\n` +
    `const Component = CardDefinition.component;\n` +
    `export const PARAMS = ${JSON.stringify(params, null, 2)} as const;\n` +
    `export const ${exportName}: React.FC<{shot:Shot}> = ({shot}) => {\n` +
    `  const props = useParams(shot.id, PARAMS);\n` +
    `  return <Component {...props} />;\n` +
    `};\n`;
}

function sceneIndexSource(calls) {
  const rows = calls.map(call => ({shotId:call.shotId, exportName:shotExportName(call.shotId)}));
  const imports = rows.map(row => `import {${row.exportName}, PARAMS as ${row.exportName}_PARAMS} from './${row.shotId}';`).join('\n');
  const scenes = rows.map(row => `  ${row.shotId}:${row.exportName},`).join('\n');
  const params = rows.map(row => `  ${row.shotId}:${row.exportName}_PARAMS,`).join('\n');
  return `${imports}\n\nexport const SCENES = {\n${scenes}\n};\nexport const SCENE_PARAMS = {\n${params}\n};\n`;
}

function registryIds(indexSource) {
  const match = /export\s+const\s+SCENES\s*=\s*\{([\s\S]*?)\};/u.exec(indexSource);
  if (!match) return [];
  return [...match[1].matchAll(/\b([a-z][a-z0-9]*)\s*:/giu)].map(item => item[1]);
}

function verifyUnmodifiedPriorAssembly(project, previous, shots, skillRoot) {
  const sceneDir = path.join(project, 'remotion', 'src', 'scenes');
  const indexFile = path.join(sceneDir, 'index.ts');
  const index = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : '';
  const oldIds = new Set(previous?.calls?.map(call => call.shotId) || []);
  if (previous) {
    if (previous.schema !== SCHEMA || previous.runId !== path.basename(path.dirname(project)) ||
        !Array.isArray(previous.calls)) throw new Error('Existing card-call record is invalid and was preserved');
    for (const call of previous.calls) {
      if (!call || !Array.isArray(call.evidence)) throw new Error('Existing card-call evidence is invalid and was preserved');
      const spec = CARD_SPECS[call.cardId];
      if (!spec) throw new Error('Existing card-call contains an unsupported card and was preserved');
      const bundle = verifiedBundle(skillRoot, call.cardId);
      if (bundle.implementationSha256 !== call.implementationSha256) throw new Error('Existing card source binding changed and was preserved');
      const file = path.join(project, sceneRelativePath(call.shotId));
      const binding = sceneBinding(call);
      if (!binding || !existsSync(file) || binding.sha256 !== digestFile(file)) {
        throw new Error(`Existing scene ${call.shotId} was edited outside the card-call record and was preserved`);
      }
      const registryBinding = call.evidence.find(item => item?.kind === 'scene-registry');
      if (!registryBinding || registryBinding.path !== 'remotion/src/scenes/index.ts' ||
          !existsSync(indexFile) || registryBinding.sha256 !== digestFile(indexFile)) {
        throw new Error('Existing scene registry was edited outside the card-call record and was preserved');
      }
    }
    if (registryIds(index).some(id => !oldIds.has(id))) throw new Error('Additional manual scenes are present; card-call assembly will not rewrite them');
  } else {
    const hasSceneFile = shots.some(shot => existsSync(path.join(sceneDir, `${shot.id}.tsx`)));
    if (hasSceneFile || registryIds(index).length) throw new Error('Existing scene work was found; card-call assembly will not overwrite it');
  }
}

function writeAtomic(file, content) {
  mkdirSync(path.dirname(file), {recursive:true});
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, 'utf8');
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function writeAtomicBuffer(file, content) {
  mkdirSync(path.dirname(file), {recursive:true});
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function sourceWindowValue(skillRoot, relativePath, property) {
  const file = safeSourcePath(skillRoot, relativePath);
  const window = {};
  runInNewContext(readFileSync(file, 'utf8'), {window});
  const value = window[property];
  if (!value || typeof value !== 'object') throw new Error(`TalkCraft ${property} source is invalid`);
  return {value, sha256:digestFile(file)};
}

function cardSoundPlan(skillRoot, calls, shots) {
  const soundMap = sourceWindowValue(skillRoot, 'demos/_lib/sfx-map.js', 'SFX_MAP');
  const samples = sourceWindowValue(skillRoot, 'demos/_lib/sfx-samples.js', 'SFX_SAMPLES');
  const shotsById = new Map(shots.map(shot => [shot.id, shot]));
  const cues = [];
  const assets = new Map();
  for (const call of calls) {
    const spec = CARD_SPECS[call.cardId];
    let rows = soundMap.value[call.cardId];
    const shot = shotsById.get(call.shotId);
    if (!spec || !Array.isArray(rows) || !rows.length || !shot) {
      throw new Error(`Official SFX cues are missing for ${call.cardId}`);
    }
    if (call.cardId === 'bar-chart-growth') {
      const barCount = call.props.barsData.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).length;
      let ticks = 0;
      rows = rows.flatMap(row => {
        if (row.name === 'pk:mech-lock-quick') return ticks++ < barCount ? [row] : [];
        if (row.name === 'pk:ui-pop') return [{...row,t:row.t - (7 - barCount) * 0.06}];
        return [row];
      });
    }
    const timingShift = Number(call.props[spec.soundTiming.key]) - spec.soundTiming.default;
    for (const row of rows) {
      if (!Number.isFinite(row.t) || typeof row.name !== 'string') throw new Error(`Official SFX cue is invalid for ${call.cardId}`);
      const sample = samples.value[row.name];
      if (typeof sample !== 'string') throw new Error(`Official SFX sample is unavailable: ${row.name}`);
      const file = `${row.name.replace(/^pk:/u, 'pk-')}.mp3`;
      const t = Number((Number(shot.start) + Number(row.t) + timingShift).toFixed(6));
      if (!Number.isFinite(t) || t < Number(shot.start) || t >= Number(shot.end)) {
        throw new Error(`SFX cue falls outside ${call.shotId}: ${row.name}`);
      }
      const cue = {t, file, volume:Math.min(Number.isFinite(row.vol) ? row.vol : 0.3, 0.35)};
      if (row.rate !== undefined) {
        if (!Number.isFinite(row.rate) || row.rate <= 0 || row.rate > 4) throw new Error(`Official SFX rate is invalid: ${row.name}`);
        cue.rate = row.rate;
      }
      if (row.clip !== undefined) {
        if (!Number.isFinite(row.clip) || row.clip <= 0) throw new Error(`Official SFX clip is invalid: ${row.name}`);
        cue.clip = row.clip;
      }
      cues.push(cue);
      const bytes = Buffer.from(sample, 'base64');
      const old = assets.get(file);
      if (old && !old.equals(bytes)) throw new Error(`Official SFX sample name collides: ${file}`);
      assets.set(file, bytes);
    }
  }
  cues.sort((a,b) => a.t-b.t || a.file.localeCompare(b.file));
  const source = `export type SfxCue = {t:number; file:string; volume:number; rate?:number; clip?:number};\n` +
    `export const CUES: SfxCue[] = ${JSON.stringify(cues, null, 2)};\n` +
    `export const SFX_CUES = CUES;\nexport const cues = CUES;\n`;
  const assetBindings = [...assets].map(([file,bytes]) => ({file,sha256:sha256(bytes)})).sort((a,b) => a.file.localeCompare(b.file));
  return {source, cues, assets, assetBindings, sourceMapSha256:soundMap.sha256, sampleBundleSha256:samples.sha256};
}

function writeCardSoundAssets(project, soundPlan) {
  const directory = path.join(project, 'remotion', 'public', 'sfx');
  mkdirSync(directory, {recursive:true});
  for (const [file,bytes] of soundPlan.assets) {
    if (path.basename(file) !== file) throw new Error(`SFX path is invalid: ${file}`);
    const destination = path.join(directory, file);
    if (existsSync(destination)) {
      if (digestFile(destination) !== sha256(bytes)) throw new Error(`Existing SFX asset was preserved: ${file}`);
    } else {
      writeAtomicBuffer(destination, bytes);
    }
  }
}

function verifyPriorCardSounds(project, previous, skillRoot, shots) {
  if (!previous?.sfx || typeof previous.sfx.sourceSha256 !== 'string') {
    throw new Error('Existing card-call record has no sound binding and was preserved');
  }
  const soundPlan = cardSoundPlan(skillRoot, previous.calls, shots);
  if (previous.sfx.sourceMapSha256 !== soundPlan.sourceMapSha256 ||
      previous.sfx.sampleBundleSha256 !== soundPlan.sampleBundleSha256 ||
      JSON.stringify(previous.sfx.cues) !== JSON.stringify(soundPlan.cues) ||
      JSON.stringify(previous.sfx.assets) !== JSON.stringify(soundPlan.assetBindings)) {
    throw new Error('Existing card SFX binding is stale and was preserved');
  }
  const sourceFile = path.join(project, 'remotion', 'src', 'sfx.ts');
  if (!existsSync(sourceFile) || digestFile(sourceFile) !== previous.sfx.sourceSha256 ||
      readFileSync(sourceFile, 'utf8') !== soundPlan.source) {
    throw new Error('Existing SFX table was edited outside the card-call record and was preserved');
  }
  for (const asset of previous.sfx.assets || []) {
    const file = path.join(project, 'remotion', 'public', 'sfx', asset.file);
    if (!existsSync(file) || digestFile(file) !== asset.sha256) throw new Error(`Existing SFX asset was edited and was preserved: ${asset.file}`);
  }
}

function assertEmptyScaffoldSoundTable(project) {
  const file = path.join(project, 'remotion', 'src', 'sfx.ts');
  const expected = `export type SfxCue = {t:number; file:string; volume:number; rate?:number; clip?:number};\n` +
    `export const CUES: SfxCue[] = [];\nexport const SFX_CUES = CUES;\nexport const cues = CUES;\n`;
  if (!existsSync(file) || readFileSync(file, 'utf8') !== expected) {
    throw new Error('Existing SFX table was preserved; card-call assembly will not replace it');
  }
}

function copyCardBundle(project, skillRoot, cardId) {
  const bundle = verifiedBundle(skillRoot, cardId);
  const cardsRoot = path.join(skillRoot, 'workbench', 'src', 'cards');
  const destinationRoot = path.join(project, 'remotion', 'src', 'talkcraft-cards');
  for (const row of bundle.files) {
    const source = safeSourcePath(skillRoot, row.file);
    const relative = path.relative(cardsRoot, source);
    const destination = path.join(destinationRoot, relative);
    if (existsSync(destination)) {
      if (digestFile(destination) !== row.sha256) throw new Error(`Copied card dependency changed: ${path.relative(project, destination)}`);
    } else {
      mkdirSync(path.dirname(destination), {recursive:true});
      copyFileSync(source, destination);
    }
  }
  return bundle;
}

function currentShotFiles(project) {
  const shotFile = path.join(project, 'remotion', 'shots.json');
  const candidateFile = path.join(project, 'qa', 'card-candidates.json');
  if (!existsSync(shotFile) || !existsSync(candidateFile)) throw new Error('Official shot and card-candidate files are required');
  const shots = jsonFile(shotFile);
  const candidateData = jsonFile(candidateFile);
  if (!Array.isArray(shots) || !shots.length) throw new Error('TalkCraft shot plan is invalid');
  return {shots, candidateData, candidateFile};
}

function preparedCalls(root, skillRoot, runId, payload, previous) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).some(key => !['runId', 'calls'].includes(key))) throw new Error('Card-call request has unsupported fields');
  if (payload.runId !== undefined && payload.runId !== runId) throw new Error('Card-call run ID mismatch');
  if (!Array.isArray(payload.calls)) throw new Error('Card calls must be an array');
  const status = readTalkcraftStatus(root, runId);
  if (!status.preflightCompleted || !status.storyboardApproved || !status.candidatesReady) throw new Error('完成系统自动调节、分镜审核并生成官方候选后才能保存选卡');
  const options = readTalkcraftCardOptions(root, skillRoot, runId);
  const {shots} = currentShotFiles(talkcraftProject(root, runId));
  if (!payload.calls.length || payload.calls.length > shots.length) throw new Error('至少为一个镜头选择主卡');
  const byShot = new Map(options.shots.map(shot => [shot.shotId, shot]));
  const previousByShot = new Map((previous?.calls || []).map(call => [call.shotId, call]));
  const shotById = new Map(shots.map(shot => [shot.id, shot]));
  const requestedShotIds = new Set(payload.calls.map(call => call?.shotId).filter(id => typeof id === 'string'));
  const omittedSaved = [...previousByShot.keys()].filter(id => !requestedShotIds.has(id));
  if (omittedSaved.length) throw new Error(`已保存的镜头卡调用不能被静默移除：${omittedSaved.join(', ')}`);
  const seen = new Set();
  const preparedByShot = new Map();
  for (const request of payload.calls) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('卡片调用格式无效');
    if (Object.keys(request).some(key => !['shotId', 'cardId', 'props', 'evidenceReferences'].includes(key))) {
      throw new Error('卡片来源、导出名、依赖和哈希由服务端决定');
    }
    const shot = shotById.get(request.shotId);
    if (!shot || seen.has(shot.id)) throw new Error(`镜头 ${request.shotId || ''} 的选卡调用无效或重复`);
    seen.add(shot.id);
    const shotOptions = byShot.get(shot.id);
    const option = shotOptions?.options.find(item => item.cardId === request.cardId);
    if (!option) throw new Error(`镜头 ${shot.id} 的所选卡不在当前已验证候选中`);
    const spec = CARD_SPECS[request.cardId];
    const references = parseSourceReferences(request.evidenceReferences);
    const props = normalizeProps(spec, request.props || {}, baseShotDuration(shot), references);
    const callId = previousByShot.get(shot.id)?.cardId === request.cardId
      ? previousByShot.get(shot.id).callId : randomUUID();
    preparedByShot.set(shot.id, {shotId:shot.id, request, option, spec, props, references, callId});
  }
  return shots.filter(shot => preparedByShot.has(shot.id)).map(shot => preparedByShot.get(shot.id));
}

export function readTalkcraftCardCalls(root, runId) {
  const project = talkcraftProject(root, runId);
  const file = path.join(project, 'qa', 'card-calls.json');
  if (!existsSync(file)) return {present:false, record:{schema:SCHEMA, runId, calls:[]}};
  const record = jsonFile(file);
  if (record.schema !== SCHEMA || record.runId !== runId || !Array.isArray(record.calls)) {
    throw new Error('Saved TalkCraft card-call record is invalid');
  }
  return {present:true, record, sha256:digestFile(file)};
}

export function writeTalkcraftCardCalls(root, skillRoot, runId, payload) {
  const project = talkcraftProject(root, runId);
  const callFile = path.join(project, 'qa', 'card-calls.json');
  const previous = existsSync(callFile) ? jsonFile(callFile) : null;
  const prepared = preparedCalls(root, skillRoot, runId, payload, previous);
  const {shots} = currentShotFiles(project);
  const sampleFile = path.join(project, 'remotion', 'out', 'preview', 's01.mp4');
  if (existsSync(sampleFile) && previous?.calls?.some(call => call.shotId === 's01')) {
    const oldCall = previous.calls.find(call => call.shotId === 's01');
    const nextCall = prepared.find(item => item.request.shotId === 's01');
    const oldCandidate = oldCall.evidence.find(item => item?.kind === 'card-candidate')?.candidateSetSha256 || null;
    const nextSignature = nextCall ? JSON.stringify({cardId:nextCall.request.cardId,
      implementationSha256:nextCall.option.implementation.implementationSha256,
      props:nextCall.props, candidateSetSha256:nextCall.option.candidateSetSha256}) : null;
    const oldSignature = JSON.stringify({cardId:oldCall.cardId, implementationSha256:oldCall.implementationSha256,
      props:oldCall.props, candidateSetSha256:oldCandidate});
    if (nextSignature !== oldSignature) throw new Error('首镜样板已生成，不能再修改 s01 卡片或参数；请新建运行重做首镜');
  }
  const srcRoot = path.join(project, 'remotion', 'src');
  if (existsSync(srcRoot) && !existsSync(path.join(srcRoot, 'index.ts'))) {
    throw new Error('Existing Remotion source is incomplete; card-call assembly will not replace it');
  }
  verifyUnmodifiedPriorAssembly(project, previous, shots, skillRoot);
  if (previous) verifyPriorCardSounds(project, previous, skillRoot, shots);
  if (!existsSync(path.join(srcRoot, 'index.ts'))) scaffoldTalkcraftProject(root, skillRoot, runId,{emptyScenes:true});
  if (!previous) assertEmptyScaffoldSoundTable(project);

  const sceneDir = path.join(srcRoot, 'scenes');
  const sceneIndexFile = path.join(sceneDir, 'index.ts');
  const indexSource = existsSync(sceneIndexFile) ? readFileSync(sceneIndexFile, 'utf8') : '';
  if (registryIds(indexSource).length && !previous) throw new Error('Existing scene registry was preserved');
  const soundPlan = cardSoundPlan(skillRoot, prepared.map(item => ({shotId:item.request.shotId,
    cardId:item.request.cardId, props:item.props})), shots);

  const calls = [];
  for (const item of prepared) {
    const bundle = copyCardBundle(project, skillRoot, item.request.cardId);
    if (bundle.implementationSha256 !== item.option.implementation.implementationSha256) {
      throw new Error(`Card source changed while assembling ${item.request.cardId}`);
    }
    const call = {
      callId:item.callId,
      shotId:item.request.shotId,
      cardId:item.request.cardId,
      implementationSha256:bundle.implementationSha256,
      props:item.props,
      evidence:[
        ...item.option.candidateEvidence.map(candidate => ({kind:'card-candidate', ...candidate,
          candidateSetSha256:item.option.candidateSetSha256})),
        ...item.references.map(reference => ({kind:'source-reference', reference})),
      ],
    };
    const source = sceneSource(call, item.option);
    const sceneFile = path.join(sceneDir, `${call.shotId}.tsx`);
    writeAtomic(sceneFile, source);
    call.evidence.push({kind:'scene-binding', path:sceneRelativePath(call.shotId), sha256:digestFile(sceneFile)});
    calls.push(call);
  }
  writeAtomic(sceneIndexFile, sceneIndexSource(calls));
  const sceneRegistrySha256 = digestFile(sceneIndexFile);
  for (const call of calls) call.evidence.push({kind:'scene-registry', path:'remotion/src/scenes/index.ts', sha256:sceneRegistrySha256});
  writeCardSoundAssets(project, soundPlan);
  const soundFile = path.join(srcRoot, 'sfx.ts');
  writeAtomic(soundFile, soundPlan.source);
  const sfx = {sourceMapSha256:soundPlan.sourceMapSha256, sampleBundleSha256:soundPlan.sampleBundleSha256,
    sourceSha256:digestFile(soundFile), assets:soundPlan.assetBindings, cues:soundPlan.cues};
  const record = {schema:SCHEMA, runId, calls, sfx};
  mkdirSync(path.dirname(callFile), {recursive:true});
  writeAtomic(callFile, `${JSON.stringify(record, null, 2)}\n`);
  return {present:true, record, assembly:{scenes:calls.length, sfxCues:soundPlan.cues.length,
    sceneRegistry:'remotion/src/scenes/index.ts'}};
}

export function assertTalkcraftCardCallsBound(root, skillRoot, runId,
  {requireCardCalls = false, requiredShotIds = [], requireCompleteCoverage = false} = {}) {
  const stored = readTalkcraftCardCalls(root, runId);
  if (!stored.present) {
    if (requireCardCalls && !existsSync(path.join(talkcraftProject(root,runId),'remotion/src/scenes/scene-shared.tsx')))
      throw new Error('新运行必须先为每个镜头显式保存一张主卡，或完成已审核的正式模板工程');
    if (requireCardCalls || (requireCompleteCoverage && existsSync(path.join(talkcraftProject(root,runId),"remotion/src/scenes/scene-shared.tsx")))) return assertNativeCardBinding(talkcraftProject(root,runId),skillRoot,{requiredShotIds,requireCompleteCoverage});
    return {present:false, record:stored.record, project:talkcraftProject(root, runId)};
  }
  const project = talkcraftProject(root, runId);
  const options = readTalkcraftCardOptions(root, skillRoot, runId);
  const {shots} = currentShotFiles(project);
  const shotMap = new Map(shots.map(shot => [shot.id, shot]));
  if (!Array.isArray(requiredShotIds) || requiredShotIds.some(id => typeof id !== 'string' || !shotMap.has(id))) {
    throw new Error('Required card-call shot IDs are invalid');
  }
  if (stored.record.calls.length > shots.length ||
      (requireCompleteCoverage && stored.record.calls.length !== shots.length)) {
    throw new Error('仍有镜头未绑定主卡');
  }
  const callIds = new Set();
  const sceneIds = new Set();
  for (const call of stored.record.calls) {
    if (!call || typeof call.callId !== 'string' || !call.callId || callIds.has(call.callId)) throw new Error('Card-call IDs are invalid or duplicated');
    if (!Array.isArray(call.evidence)) throw new Error('Card-call evidence is invalid');
    callIds.add(call.callId);
    if (sceneIds.has(call.shotId) || !shotMap.has(call.shotId)) throw new Error('Card calls contain an invalid or duplicate shot ID');
    sceneIds.add(call.shotId);
    const option = options.shots.find(item => item.shotId === call.shotId)?.options.find(item => item.cardId === call.cardId);
    if (!option) throw new Error(`Card ${call.cardId} is no longer an eligible official candidate for ${call.shotId}`);
    if (call.implementationSha256 !== option.implementation.implementationSha256) throw new Error(`Card implementation hash changed for ${call.shotId}`);
    const references = call.evidence.filter(item => item?.kind === 'source-reference').map(item => item.reference);
    const props = normalizeProps(CARD_SPECS[call.cardId], call.props, baseShotDuration(shotMap.get(call.shotId)), references);
    if (JSON.stringify(props) !== JSON.stringify(call.props)) throw new Error(`Saved card props changed shape for ${call.shotId}`);
    const candidateEvidence = call.evidence.filter(item => item?.kind === 'card-candidate');
    if (!candidateEvidence.length || candidateEvidence.some(item => item.candidateSetSha256 !== option.candidateSetSha256)) {
      throw new Error(`Official candidate evidence is stale for ${call.shotId}; refresh and save the selections`);
    }
    const bundle = copyCardBundleReadOnly(project, skillRoot, call.cardId);
    if (bundle.implementationSha256 !== call.implementationSha256) throw new Error(`Copied source binding is invalid for ${call.shotId}`);
    const binding = sceneBinding(call);
    const sceneFile = path.join(project, sceneRelativePath(call.shotId));
    if (!binding || binding.path !== sceneRelativePath(call.shotId) || !existsSync(sceneFile) || binding.sha256 !== digestFile(sceneFile)) {
      throw new Error(`Formal scene source binding is invalid for ${call.shotId}`);
    }
    const source = readFileSync(sceneFile, 'utf8');
    if (!source.startsWith(`// talkcraft-card-call:v1:${call.callId}\n`)) throw new Error(`Formal scene ownership marker is invalid for ${call.shotId}`);
  }
  const soundPlan = cardSoundPlan(skillRoot, stored.record.calls, shots);
  const soundFile = path.join(project, 'remotion', 'src', 'sfx.ts');
  if (!stored.record.sfx || stored.record.sfx.sourceMapSha256 !== soundPlan.sourceMapSha256 ||
      stored.record.sfx.sampleBundleSha256 !== soundPlan.sampleBundleSha256 ||
      !existsSync(soundFile) || stored.record.sfx.sourceSha256 !== digestFile(soundFile) ||
      readFileSync(soundFile, 'utf8') !== soundPlan.source ||
      JSON.stringify(stored.record.sfx.assets) !== JSON.stringify(soundPlan.assetBindings) ||
      JSON.stringify(stored.record.sfx.cues) !== JSON.stringify(soundPlan.cues)) {
    throw new Error('Formal card SFX source binding is invalid');
  }
  for (const [file,bytes] of soundPlan.assets) {
    const assetFile = path.join(project, 'remotion', 'public', 'sfx', file);
    if (!existsSync(assetFile) || digestFile(assetFile) !== sha256(bytes)) throw new Error(`Formal card SFX asset binding is invalid: ${file}`);
  }
  const sceneIndex = readFileSync(path.join(project, 'remotion', 'src', 'scenes', 'index.ts'), 'utf8');
  const sceneRegistrySha256 = digestFile(path.join(project, 'remotion', 'src', 'scenes', 'index.ts'));
  for (const call of stored.record.calls) {
    const name = shotExportName(call.shotId);
    if (!sceneIndex.includes(`from './${call.shotId}'`) || !new RegExp(`\\b${call.shotId}\\s*:\\s*${name}\\b`, 'u').test(sceneIndex) ||
        !new RegExp(`\\b${call.shotId}\\s*:\\s*${name}_PARAMS\\b`, 'u').test(sceneIndex)) {
      throw new Error(`Formal scene ${call.shotId} is not registered with its workbench parameters`);
    }
    const registryBinding = call.evidence.find(item => item?.kind === 'scene-registry');
    if (!registryBinding || registryBinding.path !== 'remotion/src/scenes/index.ts' || registryBinding.sha256 !== sceneRegistrySha256) {
      throw new Error('Formal scene registry binding is invalid');
    }
  }
  const missingRequired = requiredShotIds.filter(id => !sceneIds.has(id));
  if (missingRequired.length) throw new Error(`必需镜头尚未保存主卡：${missingRequired.join(', ')}`);
  if (requireCompleteCoverage) {
    const missing = shots.map(shot => shot.id).filter(id => !sceneIds.has(id));
    if (missing.length) throw new Error(`整片渲染前仍有镜头未绑定主卡：${missing.join(', ')}`);
  }
  return {present:true, complete:sceneIds.size === shots.length, record:stored.record, project, sha256:stored.sha256};
}

function copyCardBundleReadOnly(project, skillRoot, cardId) {
  const bundle = verifiedBundle(skillRoot, cardId);
  const cardsRoot = path.join(skillRoot, 'workbench', 'src', 'cards');
  const destinationRoot = path.join(project, 'remotion', 'src', 'talkcraft-cards');
  for (const row of bundle.files) {
    const relative = path.relative(cardsRoot, safeSourcePath(skillRoot, row.file));
    const destination = path.join(destinationRoot, relative);
    if (!existsSync(destination) || digestFile(destination) !== row.sha256) throw new Error(`Copied card dependency mismatch: ${row.file}`);
  }
  return bundle;
}

export function talkcraftCardCallsQaEvidence(root, skillRoot, runId) {
  const binding = assertTalkcraftCardCallsBound(root, skillRoot, runId, {requireCompleteCoverage:true});
  if (binding.governed) return {...binding.evidence,runId};
  if (!binding.present) return null;
  const overridesFile = path.join(binding.project, 'remotion', 'overrides.json');
  return {
    schema:'talkcraft-card-calls-evidence-v1',
    runId,
    recordFile:'qa/card-calls.json',
    recordSha256:binding.sha256,
    sfxSourceSha256:binding.record.sfx.sourceSha256,
    sfxAssetsSha256:sha256(JSON.stringify(binding.record.sfx.assets)),
    cuesSha256:existsSync(path.join(binding.project, 'remotion', 'cues.json'))
      ? digestFile(path.join(binding.project, 'remotion', 'cues.json')) : null,
    cardsUsedSha256:existsSync(path.join(binding.project, 'remotion', 'cards-used.json'))
      ? digestFile(path.join(binding.project, 'remotion', 'cards-used.json')) : null,
    overridesSha256:existsSync(overridesFile) ? digestFile(overridesFile) : null,
    calls:binding.record.calls.map(call => ({callId:call.callId, shotId:call.shotId, cardId:call.cardId,
      implementationSha256:call.implementationSha256,
      sceneSha256:sceneBinding(call).sha256,
      candidateSetSha256:call.evidence.find(item => item?.kind === 'card-candidate')?.candidateSetSha256 || null})),
  };
}

export function assertTalkcraftCardCallsQaEvidence(root, skillRoot, runId, evidence) {
  const expected = talkcraftCardCallsQaEvidence(root, skillRoot, runId);
  if (!expected) return true;
  if (expected.schema === "talkcraft-native-card-binding-v1") {
    if (JSON.stringify(expected)!==JSON.stringify(evidence)) throw Error("正式模板 QA 绑定已过期");
    return true;
  }
  if (!evidence || evidence.schema !== expected.schema || evidence.runId !== runId ||
      evidence.recordFile !== expected.recordFile || evidence.recordSha256 !== expected.recordSha256 ||
      evidence.sfxSourceSha256 !== expected.sfxSourceSha256 || evidence.sfxAssetsSha256 !== expected.sfxAssetsSha256 ||
      evidence.cuesSha256 !== expected.cuesSha256 || evidence.cardsUsedSha256 !== expected.cardsUsedSha256 ||
      evidence.overridesSha256 !== expected.overridesSha256 || JSON.stringify(evidence.calls) !== JSON.stringify(expected.calls)) {
    throw new Error('Card-call QA evidence is missing or stale');
  }
  return true;
}

export const TALKCRAFT_CARD_CALL_SCHEMA = SCHEMA;
