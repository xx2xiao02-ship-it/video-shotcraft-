// Use the existing reason/direction field so planning, rendering and reporting
// agree without introducing a second storyboard contract.
export const BACKGROUND_EXEMPTION_PREFIX = '特殊强调免背景：';

export function isBackgroundExempt(shot) {
  const reason = String(shot.direction ?? shot.reason ?? '').trim();
  return !shot.material && shot.materialRole === 'none' &&
    ['claim', 'keypoint', 'quote'].includes(shot.type) &&
    reason.startsWith(BACKGROUND_EXEMPTION_PREFIX) &&
    reason.slice(BACKGROUND_EXEMPTION_PREFIX.length).trim().length > 0;
}

export function backgroundCoverage(shots) {
  const backgroundShots = [], exemptShots = [], missingShots = [];
  shots.forEach((shot, index) => {
    if (shot.material && ['background', 'backdrop'].includes(shot.materialRole)) backgroundShots.push(index + 1);
    else if (isBackgroundExempt(shot)) exemptShots.push(index + 1);
    else missingShots.push(index + 1);
  });
  return {backgroundShots, exemptShots, missingShots};
}

export function assertBackgroundCoverage(shots) {
  const coverage = backgroundCoverage(shots);
  if (coverage.missingShots.length)
    throw new Error(`第 ${coverage.missingShots.join('、')} 镜缺少背景视频，请补编导后再渲染；元素视频不算背景，特殊强调免除须单独写明理由`);
  // A default cannot be implemented by exempting most of the sequence.
  if (shots.length >= 3 && coverage.exemptShots.length >= shots.length / 2)
    throw new Error('免背景镜头占一半或以上，不符合默认视频背景要求，请重新编导；不得把普通观点普遍列为特殊强调');
  return coverage;
}
