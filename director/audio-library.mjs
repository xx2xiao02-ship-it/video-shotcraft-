import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ffprobePath} from './packaging-media.mjs';

const KINDS = new Set(['bgm', 'sfx']);
const SOURCES = new Set(['builtin', 'uploaded']);
const LICENSES = new Set(['unknown', 'owned', 'licensed', 'restricted']);
const AUDIO_NAME = /^[^<>:"/\\|?*\x00-\x1f]+\.(mp3|wav)$/i;
const BUILTIN_SFX = new Set([
  'click-camera.mp3', 'impact-cine.mp3', 'keyboard.mp3', 'pop.mp3', 'riser-cine.mp3',
  'sparkle.mp3', 'swoosh-quick.mp3', 'transition-snap.mp3', 'transition-soft.mp3',
  'whoosh-big.mp3', 'whoosh-fast.mp3',
]);

function validateLocation(kind, source, name) {
  if (!KINDS.has(kind) || !SOURCES.has(source) || !AUDIO_NAME.test(name || '') || name !== path.basename(name)) {
    throw new Error('音频素材位置无效');
  }
}

export function audioFolder(root, kind, source) {
  if (!KINDS.has(kind) || !SOURCES.has(source)) throw new Error('音频素材分类无效');
  if (kind === 'bgm') return source === 'builtin'
    ? path.join(root, 'assets', 'audio', 'bgm') : path.join(root, 'materials', '_music');
  return source === 'builtin'
    ? path.join(root, 'template', 'public', 'audio') : path.join(root, 'materials', '_sfx');
}

export function audioFile(root, kind, source, name) {
  validateLocation(kind, source, name);
  const file = path.join(audioFolder(root, kind, source), name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('音频素材不存在');
  return file;
}

function indexPath(root) {
  return path.join(root, 'materials', '_audio-index.json');
}

function readIndex(root) {
  const file = indexPath(root);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) throw new Error('音频索引格式无效');
  return data;
}

function saveIndex(root, entries) {
  const file = indexPath(root);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function key(item) {
  return `${item.kind}:${item.source}:${item.name}`;
}

function probeDuration(file) {
  try {
    const raw = execFileSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file],
      {encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore']});
    const duration = Number(JSON.parse(raw).format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch { return null; }
}

function inspectFile(root, kind, source, name, previous = {}) {
  const file = audioFile(root, kind, source, name);
  const stat = fs.statSync(file);
  return {
    kind, source, name, bytes: stat.size, mtimeMs: stat.mtimeMs, durationSec: probeDuration(file),
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    tags: Array.isArray(previous.tags) ? previous.tags : [],
    licenseStatus: LICENSES.has(previous.licenseStatus) ? previous.licenseStatus : 'unknown',
  };
}

export function listAudioLibrary(root, kind) {
  if (!KINDS.has(kind)) throw new Error('音频素材分类无效');
  const indexed = new Map(readIndex(root).map(item => [key(item), item]));
  return ['builtin', 'uploaded'].flatMap(source => {
    const folder = audioFolder(root, kind, source);
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder, {withFileTypes: true})
      .filter(entry => entry.isFile() && AUDIO_NAME.test(entry.name) &&
        (kind !== 'sfx' || source !== 'builtin' || BUILTIN_SFX.has(entry.name) ||
          indexed.has(key({kind, source, name: entry.name}))))
      .map(entry => {
        const name = entry.name;
        const previous = indexed.get(key({kind, source, name}));
        const stat = fs.statSync(path.join(folder, name));
        const fresh = previous?.bytes === stat.size && previous?.mtimeMs === stat.mtimeMs;
        return {kind, source, name, bytes: stat.size,
          durationSec: fresh ? previous.durationSec : null, sha256: fresh ? previous.sha256 : null,
          tags: previous?.tags ?? [], licenseStatus: previous?.licenseStatus ?? 'unknown',
          indexed: fresh};
      });
  });
}

export function indexAudioFile(root, kind, source, name) {
  const entries = readIndex(root);
  const previous = entries.find(item => key(item) === key({kind, source, name}));
  const entry = inspectFile(root, kind, source, name, previous);
  const next = entries.filter(item => key(item) !== key(entry));
  next.push(entry);
  saveIndex(root, next);
  return entry;
}

export function updateAudioMetadata(root, kind, source, name, metadata) {
  const tags = metadata?.tags;
  if (!Array.isArray(tags) || tags.length > 12 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 24) ||
      !LICENSES.has(metadata?.licenseStatus)) throw new Error('标签或授权状态无效');
  const entries = readIndex(root);
  const entry = inspectFile(root, kind, source, name, entries.find(item => key(item) === key({kind, source, name})));
  const updated = {...entry, tags: [...new Set(tags.map(tag => tag.trim()))], licenseStatus: metadata.licenseStatus};
  saveIndex(root, [...entries.filter(item => key(item) !== key(updated)), updated]);
  return updated;
}

export function uploadAudio(root, kind, name, data) {
  validateLocation(kind, 'uploaded', name);
  const ext = path.extname(name).toLowerCase();
  const valid = ext === '.wav'
    ? data.length > 44 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
    : data.length > 4 && (data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0));
  if (!valid) throw new Error('文件内容与音频格式不符');
  const folder = audioFolder(root, kind, 'uploaded');
  fs.mkdirSync(folder, {recursive: true});
  const base = path.basename(name, ext);
  let candidate = name;
  for (let number = 2; fs.existsSync(path.join(folder, candidate)); number++) candidate = `${base} (${number})${ext}`;
  fs.writeFileSync(path.join(folder, candidate), data, {flag: 'wx'});
  indexAudioFile(root, kind, 'uploaded', candidate);
  return candidate;
}

export function recommendBackgroundMusic(root, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 10000) throw new Error('文案应为 1 至 10000 字');
  const query = text.toLocaleLowerCase('zh-CN');
  return listAudioLibrary(root, 'bgm')
    .filter(item => item.indexed && ['owned', 'licensed'].includes(item.licenseStatus))
    .map(item => ({...item, matchedTags: item.tags.filter(tag => query.includes(tag.toLocaleLowerCase('zh-CN')))}))
    .filter(item => item.matchedTags.length)
    .sort((left, right) => right.matchedTags.length - left.matchedTags.length)
    .slice(0, 5);
}
