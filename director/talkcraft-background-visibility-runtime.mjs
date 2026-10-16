// Visible fraction over black: 0 = black, 1 = full footage. Stable per beat.
export const DEFAULT_BACKGROUND_VISIBILITY = 0.45;
export function backgroundVisibility(value = DEFAULT_BACKGROUND_VISIBILITY) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('背景可见度必须是 0 到 1 的有限数值');
  return value;
}
export function backgroundBrightness(value = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.5 || value > 4)
    throw new Error('背景素材亮度倍数必须是 0.5 到 4 的有限数值');
  return value;
}
