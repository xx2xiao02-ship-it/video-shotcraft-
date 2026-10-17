import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {resolveTalkcraftTemplateMaterials} from './talkcraft-template-material-resolver.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function cardSource(project, card) {
  if (!card) return '';
  const file = path.join(project, 'remotion', 'src', 'cards', `${card}.tsx`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function hasProp(source, prop) {
  return new RegExp(`\\b${prop}\\??\\s*:`).test(source) || new RegExp(`\\b${prop}\\??\\s*[,}]`).test(source);
}

function sourceFile(project, shot) {
  const material = shot?.templateParams?.materialSrc;
  if (typeof material !== 'string' || !material) return null;
  const file = path.join(project, 'remotion', 'public', material.replaceAll('/', path.sep));
  return fs.existsSync(file) ? file : null;
}

function projectRoot(project) {
  return path.resolve(project, '..', '..', '..', '..');
}

function templateCandidates(project, shot, usedSources) {
  const root = projectRoot(project);
  const indexFile = path.join(root, 'materials', '_index.json');
  if (!fs.existsSync(indexFile)) return [];
  const index = readJson(indexFile);
  const query = [shot.intent, shot.visual, ...(shot.templateParams?.labels || [])]
    .filter(Boolean).join(' ').toLowerCase();
  const tokens = query.match(/[\p{L}\p{N}]{2,}/gu) || [];
  const backgroundSource = String(shot.templateParams?.materialSourceId || '').toLowerCase();
  return index.filter(item => {
    const id = String(item.sourceId || item.path || '').toLowerCase();
    const file = path.join(root, 'materials', '_scenes', String(item.path || '').replaceAll('/', path.sep));
    return item?.path && fs.existsSync(file) && !usedSources.has(id) && id !== backgroundSource;
  }).map(item => {
    const haystack = `${item.path || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 2 : 0), 0);
    return {item, file:path.join(root, 'materials', '_scenes', String(item.path).replaceAll('/', path.sep)), score};
  }).sort((a, b) => b.score - a.score || Number(b.item.duration_sec || 0) - Number(a.item.duration_sec || 0));
}

function extractFrame(video, output, atSeconds) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  if (imageExt.has(path.extname(video).toLowerCase())) {
    fs.copyFileSync(video, output);
    return;
  }
  // Windows 上受控 Node 进程可能无法直接 spawn ffmpeg（EPERM）；经 cmd.exe 调用与渲染链一致。
  const q = value => `'${String(value).replaceAll("'", "''")}'`;
  const command = `& ffmpeg -y -v error -ss ${Math.max(0, atSeconds)} -i ${q(video)} -frames:v 1 -vf scale=720:-2 -q:v 3 ${q(output)}`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {stdio: 'pipe'});
}

function digitalHumanPath(project, shotId) {
  const dir = path.join(project, 'remotion', 'public', 'digital-human');
  const candidates = [`${shotId}-transparent.webm`, `${shotId}.webm`, `${shotId}-transparent.mp4`, `${shotId}.mp4`];
  const name = candidates.find(item => fs.existsSync(path.join(dir, item)));
  return name ? `digital-human/${name}` : null;
}

/**
 * 为正式镜头模板填充内部素材槽位。
 * 这里绑定的是卡片内部的 srcs/src/hostSrc，不是全屏 background 素材。
 */
// Retained for cleanup review only; the production export below never calls it.
function allocateLegacyTemplateMaterials(project) {
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  if (!fs.existsSync(shotsFile)) throw new Error('缺少 remotion/shots.json，无法绑定模板内部素材');
  const shots = readJson(shotsFile);
  const adjustments = [];
  const usedTemplateSources = new Set();
  const next = shots.map(shot => {
    const source = cardSource(project, shot.shotCard);
    if (!source) return shot;
    const params = shot.templateParams && typeof shot.templateParams === 'object'
      ? {...shot.templateParams} : {};
    const cardProps = params.cardProps && typeof params.cardProps === 'object'
      ? {...params.cardProps} : null;
    const material = sourceFile(project, shot);
    const labels = Array.isArray(params.labels) ? params.labels : [];
    const slotCount = Math.max(4, Math.min(6, labels.length || 4));

    if (hasProp(source, 'srcs') && !Array.isArray(cardProps?.srcs)) {
      const candidates = templateCandidates(project, shot, usedTemplateSources);
      const selected = candidates.slice(0, slotCount);
      const sourceFiles = selected.length >= slotCount
        ? selected.map(candidate => candidate.file)
        : (material ? [material] : []);
      if (!sourceFiles.length) return {...shot, templateParams: params};
      const rel = [];
      const sourceIds = [];
      for (let i = 0; i < slotCount; i++) {
        const name = `${shot.id}-${i + 1}.jpg`;
        const out = path.join(project, 'remotion', 'public', 'template-materials', name);
        const candidateFile = sourceFiles[i] || material;
        if (!candidateFile) break;
        const duration = Number(selected[i]?.item?.duration_sec) > 0 ? Number(selected[i].item.duration_sec)
          : (Number(params.materialDurationSec) > 0 ? Number(params.materialDurationSec) : Math.max(1, Number(shot.durationSec) || 1));
        extractFrame(candidateFile, out, Math.min(duration - 0.05, Math.max(0.05, duration * ((i + 1) / (slotCount + 1)))));
      rel.push(`/template-materials/${name}`);
        const sourceId = String(selected[i]?.item?.sourceId || selected[i]?.item?.path || candidateFile).toLowerCase();
        sourceIds.push(sourceId);
        usedTemplateSources.add(sourceId);
      }
      params.templateMaterialSrcs = rel;
      params.templateMaterialSources = sourceIds;
      adjustments.push(`${shot.id}：已从本地素材库为 ${shot.shotCard} 的内部 srcs 槽绑定 ${rel.length} 张独立镜头素材截图`);
    }

    if (hasProp(source, 'hostSrc') && !cardProps?.hostSrc) {
      const host = digitalHumanPath(project, shot.id);
      if (host) {
        params.templateHostSrc = `/${host}`;
        adjustments.push(`${shot.id}：已将数字人透明视频绑定到 ${shot.shotCard} 的 hostSrc 槽`);
      }
    }

    if (cardProps) params.cardProps = cardProps;
    return {...shot, templateParams: params};
  });
  writeJson(shotsFile, next);
  return {shots: next.length, adjustments, file: shotsFile};
}

export function allocateTemplateMaterials(project,options) {
  return resolveTalkcraftTemplateMaterials(project,options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const project = process.argv[2];
  if (!project) throw new Error('用法：node talkcraft-template-materials.mjs <run-project>');
  console.log(JSON.stringify(allocateTemplateMaterials(path.resolve(project)), null, 2));
}
