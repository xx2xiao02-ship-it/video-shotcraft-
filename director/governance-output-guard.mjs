import fs from 'node:fs';
import path from 'node:path';

function canonicalPath(candidate) {
  let cursor = path.resolve(candidate);
  const tail = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return path.resolve(candidate);
    tail.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(fs.realpathSync.native(cursor), ...tail);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isGovernancePath(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  const parts = relative.split(path.sep).map(part => part.toLowerCase());
  const startsBatch = value => value?.startsWith('card-governance-') || value?.startsWith('card-business-');
  return (parts[0] === '.isolated' && startsBatch(parts[1])) ||
    (parts[0] === 'template' && parts[1] === 'out' && startsBatch(parts[2])) ||
    (parts[0] === 'template' && parts[1] === 'fixtures' && startsBatch(parts[2]));
}

export function assertProductionOutputDirectory(root, candidate) {
  const projectRoot = path.resolve(root);
  const outputPath = path.resolve(projectRoot, candidate);
  const physicalRoot = fs.existsSync(projectRoot) ? fs.realpathSync.native(projectRoot) : projectRoot;
  const physicalOutput = canonicalPath(outputPath);
  if ((isWithin(projectRoot, outputPath) && isGovernancePath(projectRoot, outputPath)) ||
      (isWithin(physicalRoot, physicalOutput) && isGovernancePath(physicalRoot, physicalOutput))) {
    throw new Error('卡片治理证据与夹具目录受保护，不能设置为操作台成片导出目录');
  }
  return outputPath;
}
