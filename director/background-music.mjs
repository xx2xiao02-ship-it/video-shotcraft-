import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MODES = new Set(['A', 'B']);
const SOURCES = new Set(['builtin', 'uploaded']);
const NAME = /^[^<>:"/\\|?*\x00-\x1f]+\.(mp3|wav)$/i;

export function musicFile(root, selection) {
  if (!selection || !SOURCES.has(selection.source) || typeof selection.name !== 'string' ||
      !NAME.test(selection.name) || selection.name !== path.basename(selection.name)) {
    throw new Error('背景音乐文件无效');
  }
  const folder = selection.source === 'builtin'
    ? path.join(root, 'assets', 'audio', 'bgm')
    : path.join(root, 'materials', '_music');
  const file = path.join(folder, selection.name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('所选背景音乐不存在');
  return file;
}

export function normalizeMusicSelection(root, selection) {
  if (selection === null) return null;
  const volume = Number(selection?.volume);
  if (!Number.isFinite(volume) || volume < 0 || volume > 0.5) throw new Error('背景音乐音量应在 0 到 0.5 之间');
  musicFile(root, selection);
  return {source: selection.source, name: selection.name, volume};
}

export function readMusicSelection(root, mode) {
  if (!MODES.has(mode)) throw new Error('视频模式无效');
  const file = path.join(root, 'materials', '_music-selection.json');
  if (!fs.existsSync(file)) return null;
  const selection = JSON.parse(fs.readFileSync(file, 'utf8'))[mode] || null;
  if (selection) musicFile(root, selection);
  return selection;
}

export function writeMusicSelection(root, mode, selection) {
  if (!MODES.has(mode)) throw new Error('视频模式无效');
  const value = normalizeMusicSelection(root, selection);
  const file = path.join(root, 'materials', '_music-selection.json');
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  current[mode] = value;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(current, null, 2), 'utf8');
  return value;
}

export function stageBackgroundMusic(root, mode, publicDir, selectionOverride) {
  const selection = selectionOverride === undefined ? readMusicSelection(root, mode) : normalizeMusicSelection(root, selectionOverride);
  if (!selection) return null;
  const source = musicFile(root, selection);
  const bytes = fs.readFileSync(source);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const name = `bgm-${hash}${path.extname(source).toLowerCase()}`;
  const target = path.join(publicDir, 'audio', name);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, {flag: 'wx'});
  return {src: `audio/${name}`, volume: selection.volume, source: selection.source, name: selection.name};
}

export function writeTalkcraftMusicSnapshot(root, remotionDir, selection) {
  const normalized = normalizeMusicSelection(root, selection);
  const propsFile = path.join(remotionDir, 'bgm-props.json');
  if (fs.existsSync(propsFile)) {
    const existing = JSON.parse(fs.readFileSync(propsFile, 'utf8')).bgm;
    if (JSON.stringify(existing && {source: existing.source, name: existing.name, volume: existing.volume}) !== JSON.stringify(normalized)) {
      throw new Error('当前任务的背景音乐已锁定，不能覆盖');
    }
    return 'bgm-props.json';
  }
  if (normalized && !fs.readFileSync(path.join(remotionDir, 'src', 'Main.tsx'), 'utf8').includes('bgm?:')) {
    throw new Error('当前 TalkCraft 工程未接入背景音乐音轨');
  }
  const bgm = normalized ? stageBackgroundMusic(root, 'B', path.join(remotionDir, 'public'), normalized) : null;
  fs.writeFileSync(propsFile, JSON.stringify({bgm}, null, 2), 'utf8');
  return 'bgm-props.json';
}

export function talkcraftMusicProps(root, remotionDir, lockSelection) {
  const propsFile = path.join(remotionDir, 'bgm-props.json');
  if (fs.existsSync(propsFile)) return 'bgm-props.json';
  const selection = lockSelection ? readMusicSelection(root, 'B') : null;
  if (selection && !fs.readFileSync(path.join(remotionDir, 'src', 'Main.tsx'), 'utf8').includes('bgm?:')) {
    throw new Error('当前 TalkCraft 工程未接入背景音乐音轨');
  }
  if (!lockSelection) console.warn('当前任务没有样板镜选曲快照，按原音轨合成');
  const bgm = selection ? stageBackgroundMusic(root, 'B', path.join(remotionDir, 'public')) : null;
  fs.writeFileSync(propsFile, JSON.stringify({bgm}, null, 2), 'utf8');
  return 'bgm-props.json';
}
