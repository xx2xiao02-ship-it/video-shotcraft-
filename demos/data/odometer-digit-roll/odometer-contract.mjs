export function odometerValue(value = 99.98) {
  if (typeof value!=='number' && typeof value!=='string') throw new Error('Odometer value must be a number or plain numeric string');
  const text = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) ||
      text.replace('.', '').length > 6) {
    throw new Error('Odometer requires a nonnegative plain value, at most six digits and two decimal places');
  }
  return text;
}

export function odometerTiming(digitCount) {
  if (!Number.isInteger(digitCount) || digitCount < 1 || digitCount > 6) throw new Error('Invalid odometer digit count');
  const lock = 42 + (digitCount - 1) * 7;
  const pulseEnd = lock + 8;
  const labelEnd = lock + 21;
  return {lock, pulseEnd, labelEnd, minFrames: labelEnd + 46};
}

export function validateOdometerProps({value, unit = '', label = '', title = ''}, frames, fps) {
  if (value === undefined) throw new Error('Business odometer requires an explicit value');
  const text = odometerValue(value);
  for (const [key, content, max] of [['unit', unit, 6], ['label', label, 12], ['title', title, 24]]) {
    if (typeof content !== 'string' || [...content].length > max || /[\r\n]/.test(content)) {
      throw new Error(`Odometer ${key} exceeds its single-line capacity (${max})`);
    }
  }
  const timing = odometerTiming(text.replace('.', '').length);
  if (fps !== 30 || !Number.isInteger(frames) || frames < timing.minFrames) {
    throw new Error(`Odometer requires 30fps and at least ${timing.minFrames} frames including 45 still frames`);
  }
  return {text, ...timing};
}
