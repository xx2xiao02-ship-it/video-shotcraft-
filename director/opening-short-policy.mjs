import path from 'node:path';
import {readShortAcceptance} from './short-card-admission.mjs';

// The pilot consumes the same hash-bound evidence as the production index.
const report = readShortAcceptance(path.resolve(import.meta.dirname,'..'));
export const OPENING_SHORT_CARDS = Object.freeze({
  'video-only': {completionFrame:0, holdFrames:30, exitFrames:0, maxLines:1, maxChars:6},
  ...Object.fromEntries((report?.cards || []).filter(card=>card.status==='accepted').map(card=>[card.id,card])),
});

export function validateOpeningPilot(shots, fps = 30, policies = OPENING_SHORT_CARDS) {
  if (fps !== 30) throw new Error('开场样板使用30fps，不能混用帧数');
  let frames = 0;
  for (const [index,shot] of shots.entries()) {
    if (!Number.isInteger(shot.durationInFrames) || shot.durationInFrames < 1 || shot.durationInFrames > 60)
      throw new Error(`开场第${index+1}镜超过2秒或时长无效`);
    const policy = policies[shot.shotCard || 'video-only'];
    if (!policy) throw new Error(`模板 ${shot.shotCard} 未通过短镜头审查，不得截断长模板`);
    const min = policy.completionFrame + policy.holdFrames + policy.exitFrames;
    if (shot.durationInFrames < min) throw new Error(`模板 ${shot.shotCard || '实拍'} 没有足够时间完整呈现和停留`);
    if (!Array.isArray(shot.displayLines) || !shot.displayLines.length || shot.displayLines.length > policy.maxLines ||
      shot.displayLines.some(line => !line.trim() || [...line].length > policy.maxChars))
      throw new Error('短镜头文案太长，无法保证可读停留');
    frames += shot.durationInFrames;
  }
  if (frames !== 150) throw new Error('开场必须精确覆盖前5秒，不得越过边界');
  return shots;
}
