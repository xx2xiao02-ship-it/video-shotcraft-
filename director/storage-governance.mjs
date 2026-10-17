import fs from 'node:fs';

export const DEFAULT_TALKCRAFT_MIN_FREE_BYTES = 10 * 1024 ** 3;

function minimumFreeBytesFromEnv(env = process.env) {
  const raw = env.SHOTCRAFT_MIN_FREE_GB;
  if (raw === undefined || raw === '') return DEFAULT_TALKCRAFT_MIN_FREE_BYTES;
  const gb = Number(raw);
  if (!Number.isFinite(gb) || gb < 1 || gb > 1024) {
    throw new Error('SHOTCRAFT_MIN_FREE_GB 必须是 1 到 1024 之间的数字');
  }
  return Math.round(gb * 1024 ** 3);
}

export function readDiskFreeBytes(root) {
  const stat = fs.statfsSync(root);
  const unit = stat.frsize || stat.bsize;
  const availableBlocks = stat.bavail ?? stat.bfree;
  if (!Number.isFinite(unit) || unit <= 0 || !Number.isFinite(availableBlocks)) {
    throw new Error(`无法读取磁盘可用空间：${root}`);
  }
  return availableBlocks * unit;
}

export function inspectTalkcraftRenderDiskSpace(root, options = {}) {
  const freeBytes = options.freeBytes ?? readDiskFreeBytes(root);
  const minimumFreeBytes = options.minimumFreeBytes ?? minimumFreeBytesFromEnv(options.env);
  if (!Number.isFinite(freeBytes) || freeBytes < 0) throw new Error('磁盘可用空间读数无效');
  return {
    root,
    freeBytes,
    minimumFreeBytes,
    passed: freeBytes >= minimumFreeBytes,
  };
}

export function assertTalkcraftRenderDiskSpace(root, options = {}) {
  const report = inspectTalkcraftRenderDiskSpace(root, options);
  if (!report.passed) {
    const freeGb = (report.freeBytes / 1024 ** 3).toFixed(2);
    const minimumGb = (report.minimumFreeBytes / 1024 ** 3).toFixed(2);
    throw new Error(`磁盘可用空间不足，已阻止开始渲染：当前 ${freeGb} GiB，最低要求 ${minimumGb} GiB`);
  }
  return report;
}
