import fs from 'node:fs';
import path from 'node:path';

export function resolveLibraryVideo(root, requestedPath) {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) return null;
  const indexPath = path.join(root, 'materials', '_index.json');
  if (!fs.existsSync(indexPath)) return null;
  const requested = requestedPath.replace(/\\/g, '/');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const item = index.find(entry => entry.path?.replace(/\\/g, '/') === requested);
  if (!item || !/\.mp4$/i.test(item.path)) return null;
  const base = path.resolve(root, 'materials', '_scenes');
  const file = path.resolve(base, item.path);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return {path:item.path, file, durationSeconds:Number(item.duration_sec) || 0};
}
