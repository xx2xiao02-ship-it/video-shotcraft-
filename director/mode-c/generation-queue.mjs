import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

function readJson(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function safeName(value) {
  return String(value || 'shot').replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'shot';
}

function flattenCandidateValues(entry) {
  const candidates = entry?.candidates && typeof entry.candidates === 'object' ? entry.candidates : {};
  return Object.values(candidates).flatMap(value => Array.isArray(value) ? value : []);
}

function missingMaterial(entry) {
  if (entry?.missingMaterial === true || entry?.materialStatus === 'missing' || entry?.materialStatus === 'insufficient') return true;
  const text = JSON.stringify(entry || '');
  return /缺素材|素材不足|待采|没有素材|无可行卡|多图.*一张/iu.test(text);
}

function assetKind(entry) {
  if (entry?.assetKind === 'video' || entry?.assetKind === 'image') return entry.assetKind;
  if (entry?.assetKind === 'evidence') return 'evidence';
  const text = `${entry?.assetKind || ''} ${entry?.media || ''} ${JSON.stringify(entry?.missing || '')} ${JSON.stringify(entry?.reason || '')}`;
  if (/截图|真实页面|evidence/iu.test(text)) return 'evidence';
  if (/\bV\b|视频|B-roll|video/iu.test(text)) return 'video';
  return 'image';
}

function requestedCount(entry) {
  if (Number.isInteger(entry?.assetCount) && entry.assetCount > 0) return entry.assetCount;
  const text = JSON.stringify(entry || '');
  return /多图|multi[-_ ]?image/iu.test(text) ? 2 : 1;
}

function promptFor(entry, shotId, kind, index, aspectRatio) {
  const sentence = String(entry?.text || entry?.sentence || '').trim();
  const cardSlug = String(entry?.cardSlug || flattenCandidateValues(entry)[0]?.slug || 'material-fallback');
  const medium = kind === 'video' ? 'cinematic B-roll video' : 'cinematic still image';
  return [
    `Asset type: ${medium}`,
    `Shot: ${shotId}`,
    `Card: ${cardSlug}`,
    `Frame: ${aspectRatio} ${aspectRatio === '9:16' ? 'vertical portrait' : 'horizontal landscape'}`,
    sentence ? `Narration meaning: ${sentence}` : '',
    'Composition: leave clean negative space for Chinese subtitles, no logos, no invented UI, no readable text.',
    `Variant: ${index + 1}`,
  ].filter(Boolean).join('\n');
}

export function buildGenerationQueue({projectRoot, config, candidatesFile = path.join(projectRoot, 'qa', 'card-candidates.json')}) {
  const document = readJson(candidatesFile);
  const entries = document && typeof document === 'object' ? Object.entries(document) : [];
  const jobs = [];
  for (const [shotId, entry] of entries) {
    if (!missingMaterial(entry)) continue;
    const kind = assetKind(entry);
    const count = requestedCount(entry);
    const cardSlug = String(entry.cardSlug || flattenCandidateValues(entry)[0]?.slug || 'material-fallback');
    if (kind === 'evidence') {
      jobs.push({jobId:`${safeName(shotId)}-evidence`, shotId, cardSlug, assetKind:'evidence', status:'blocked',
        state:'blocked', reason:'截图或真实页面必须采集真实证据，模式 C 不用 AIGC 替代', source:'mode-c'});
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      const provider = kind === 'video' ? config.video.provider : config.image.provider;
      const model = kind === 'video' ? config.video.model : config.image.model;
      jobs.push({jobId:`${safeName(shotId)}-${kind}-${String(index + 1).padStart(2, '0')}`,
        shotId, cardSlug, assetKind:kind, provider, model,
        prompt:promptFor(entry, shotId, kind, index, config.aspectRatio),
        durationSec:kind === 'video' ? config.video.durationSeconds : null,
        aspectRatio:config.aspectRatio, status:'pending_generation', state:'pending_generation', source:'mode-c',
        outputPath:`mode-c/generated/${safeName(shotId)}-${kind}-${String(index + 1).padStart(2, '0')}.${kind === 'video' ? 'mp4' : 'png'}`});
    }
  }
  return {schema:'mode-c-generation-queue-v1', mode:'C', aspectRatio:config.aspectRatio,
    sourceCandidates:path.relative(projectRoot, candidatesFile), jobs,
    counts:{total:jobs.length, image:jobs.filter(job => job.assetKind === 'image').length,
      video:jobs.filter(job => job.assetKind === 'video').length, blocked:jobs.filter(job => job.status === 'blocked').length}};
}

export function writeGenerationQueue(projectRoot, queue) {
  const manifestDir = path.join(projectRoot, 'mode-c', 'manifests');
  mkdirSync(manifestDir, {recursive:true});
  const file = path.join(manifestDir, 'generation-queue.json');
  writeFileSync(file, JSON.stringify({...queue, writtenAt:new Date().toISOString()}, null, 2), 'utf8');
  return file;
}
