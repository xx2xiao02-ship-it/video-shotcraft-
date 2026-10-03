import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SHORT_REPORT = 'director/short-card-production-admission.json';
export function readShortAcceptance(root) {
  const file = path.join(root, SHORT_REPORT);
  if (!fs.existsSync(file)) return null;
  let report;
  try {report = JSON.parse(fs.readFileSync(file, 'utf8'));} catch {return null;}
  if (report.schema !== 'short-card-acceptance-v1' || report.fps !== 30 || report.localVisualReview !== 'passed' || !Array.isArray(report.cards) ||
      !Object.keys(report.sourceHashes || {}).length) return null;
  for (const [relative, expected] of Object.entries(report.sourceHashes)) {
    const source = path.resolve(root, relative);
    if (!source.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(source) ||
        crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') !== expected) return null;
  }
  return report;
}

export function shortCapability(id, report) {
  const entry = report?.cards?.find(card => card.id === id);
  return entry ? {id,status:entry.status,fps:entry.fps,acceptedFrames:entry.acceptedFrames,
    completionFrame:entry.completionFrame,holdFrames:entry.holdFrames,exitFrames:entry.exitFrames,
    maxLines:entry.maxLines,maxChars:entry.maxChars,kind:entry.kind,graphicLimits:entry.graphicLimits,
    reason:entry.reason,evidence:SHORT_REPORT} : {
    id, status:'not-accepted', fps:30, acceptedFrames:[],
    reason:report ? '未通过短时长业务验收，不能凭标注截短' : '缺少有效验收证据或源码已变化',
  };
}

export function assertShortShot(shot, frames, report) {
  if (!shot.shotCard) {
    if (!shot.material || frames < 1 || frames > 60) throw new Error('开场实拍镜头需要素材且不能超过2秒');
    if (shot.displayLines && (shot.displayLines.length > 1 || shot.displayLines.some(line=>[...line].length>3)))
      throw new Error('1秒实拍开场最多一行3字，避免短时文案不可读');
    return;
  }
  const policy = shortCapability(shot.shotCard, report);
  const minimum=policy.completionFrame+policy.holdFrames+policy.exitFrames;
  if (policy.status !== 'accepted' || !Number.isFinite(minimum) || frames<minimum ||
      !policy.acceptedFrames.includes(frames))
    throw new Error(`模板 ${shot.shotCard} 未通过 ${frames / 30} 秒验收，不得压缩长模板`);
  if (shot.displayLines && (shot.displayLines.length > policy.maxLines ||
      shot.displayLines.some(line => [...line].length > policy.maxChars)))
    throw new Error('开场短镜头文案超出验收容量');
  const params=shot.templateParams;
  const limits=policy.graphicLimits;
  if(params && limits) {
    if(params.sources && (params.sources.length>limits.maxSources || params.sources.some(text=>[...text].length>limits.maxSourceChars) ||
        [...params.target].length>limits.maxTargetChars)) throw new Error('2秒汇聚图信息过密，来源最多3项且每项2字，结果最多4字');
    if(params.rows && (params.rows.length>limits.maxRows || params.rows.some(row=>[...row.label].length>limits.maxLabelChars) ||
        [...params.unit].length>limits.maxUnitChars)) throw new Error('2秒对比图信息过密，最多2项数据、每项标签4字');
  }
}
