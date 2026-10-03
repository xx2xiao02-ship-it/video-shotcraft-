export function validateSpeechRate(value = 0) {
  if (value == null) return 0;
  if (typeof value !== 'number' && typeof value !== 'string' || String(value).trim() === '') {
    throw new Error('语速需为 -15 到 15 的整数（0.85–1.15 倍）');
  }
  const rate = Number(value);
  if (!Number.isInteger(rate) || rate < -15 || rate > 15) {
    throw new Error('语速需为 -15 到 15 的整数（0.85–1.15 倍）');
  }
  return rate;
}
