import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ADMISSION_SOURCE_POLICY = 'director/admission-source-policy.mjs';

export const HISTORICAL_EVIDENCE_TOOLS = new Set([
  'template/accept-business-text-batch004.mjs',
  'template/cached-still-renderer.mjs',
  'template/render-business-text-videos.mjs',
]);

function currentFile(root, relative, expected) {
  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  const withinRoot = path.relative(base, file);
  return withinRoot !== '' && withinRoot !== '..' && !withinRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(withinRoot) &&
    fs.existsSync(file) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === expected;
}

export function admissionSourcesCurrent(root, sourceHashes) {
  if (!sourceHashes || typeof sourceHashes !== 'object' || !Object.keys(sourceHashes).length ||
      !currentFile(root, ADMISSION_SOURCE_POLICY, sourceHashes[ADMISSION_SOURCE_POLICY])) return false;
  for (const [relative, expected] of Object.entries(sourceHashes)) {
    if (HISTORICAL_EVIDENCE_TOOLS.has(relative.replaceAll('\\', '/'))) continue;
    if (!currentFile(root, relative, expected)) return false;
  }
  return true;
}

export function admissionArtifactsCurrent(root, record) {
  if (!record?.report || !record.reportSha256 || !currentFile(root, record.report, record.reportSha256) ||
      !Array.isArray(record.evidence) || !record.evidence.length) return false;
  return record.evidence.every(item => {
    const file = item.file || item.video;
    const sha256 = item.sha256 || item.videoSha256;
    return Boolean(file && sha256 && currentFile(root, file, sha256));
  });
}
