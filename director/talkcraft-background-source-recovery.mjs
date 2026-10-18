import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

// Recover ownership metadata from identical local bytes, never from filenames,
// search ranking, or model claims. Derived clips need their own provenance.
export function recoverBackgroundSourceIdentities(project, shots, {libraryRoot, library}) {
  const recovered = [], issues = [], cachedHashes = new Map();
  for (const shot of shots) {
    const p = shot.templateParams || {};
    if (p.materialRole !== 'background' || !p.materialSrc || p.materialSourceId || p.materialSourceUrl) continue;
    try {
      if (path.isAbsolute(p.materialSrc) || /^(?:[a-z]+:|[/\\])/iu.test(p.materialSrc))
        throw Error('背景必须是当前工程内的相对路径');
      const publicRoot = fs.realpathSync(path.join(project, 'remotion/public'));
      const file = fs.realpathSync(path.resolve(publicRoot, p.materialSrc));
      if (!inside(publicRoot, file) || !fs.statSync(file).isFile() || !/\.(mp4|webm|mov|m4v)$/iu.test(file))
        throw Error('背景文件越界或不是本地视频');
      const digest = hash(file), size = fs.statSync(file).size;
      if (p.materialSha256 && p.materialSha256 !== digest) throw Error('背景文件与原绑定哈希冲突');
      const scenesRoot = fs.realpathSync(path.join(libraryRoot, '_scenes'));
      const matches = [];
      for (const item of library) {
        if (!item.path || path.isAbsolute(item.path) || /^(?:[a-z]+:|[/\\])/iu.test(item.path)) continue;
        const candidate = fs.realpathSync(path.resolve(scenesRoot, item.path));
        if (!inside(scenesRoot, candidate) || !fs.statSync(candidate).isFile() || fs.statSync(candidate).size !== size) continue;
        if (!cachedHashes.has(candidate)) cachedHashes.set(candidate, hash(candidate));
        if (cachedHashes.get(candidate) !== digest) continue;
        if (item.sha256 && item.sha256 !== digest) throw Error('素材库索引哈希与实际源文件冲突');
        matches.push({item, file: candidate, identity: String(item.sourceId || item.sourceUrl || item.path)});
      }
      const identities = new Set(matches.map(m => m.identity.replace(/\\/g, '/').toLowerCase()));
      if (identities.size !== 1) throw Error(identities.size ? '多个原始素材身份对应相同文件，必须核对来源' : '现有素材库无完整哈希一致的原始视频，不能猜测裁切或转码来源');
      const match = matches[0];
      Object.assign(p, {materialSourceId: match.identity, materialSha256: digest});
      recovered.push({shotId: shot.id, materialSrc: p.materialSrc, sha256: digest,
        materialSourceId: match.identity, sourcePath: match.file,
        evidence: 'exact-local-library-sha256', usage: 'context-background',
        licenseStatus: 'existing-user-material-library; no new acquisition or licence inference'});
    } catch (error) {
      issues.push({shotId: shot.id, code: 'BACKGROUND_SOURCE_RECOVERY_REJECTED', reason: error.message});
    }
  }
  return {schema: 'talkcraft-background-source-recovery-v1', recovered, issues, paidCalls: 0, userAcceptance: false};
}
