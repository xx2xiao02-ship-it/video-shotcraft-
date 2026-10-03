const normalized = text => String(text || '').replace(/[\s，,。！？!?；;：:、]/gu, '').toLowerCase();

export function alignAModeTiming(timing, boundaryLines) {
  const events = boundaryLines.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line))
    .filter(event => event.type === 'SentenceBoundary');
  const segments = timing.segments;
  if (!events.length || !Array.isArray(segments) || !segments.length) return null;
  const eventTexts = events.map(event => normalized(event.text));
  const segmentTexts = segments.map(segment => normalized(segment.text));
  if (eventTexts.join('') !== segmentTexts.join('')) return null;

  let position = 0;
  const eventStarts = events.map((event, index) => {
    const entry = {position, frame:Math.round(event.offset / 10_000_000 * timing.fps),
      length:eventTexts[index].length};
    position += entry.length;
    return entry;
  });
  const cuts = [0];
  let segmentPosition = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    segmentPosition += segmentTexts[i].length;
    const nextEvent = eventStarts.find(event => event.position === segmentPosition);
    if (nextEvent) {
      cuts.push(nextEvent.frame);
      continue;
    }
    const eventIndex = eventStarts.findLastIndex(event => event.position < segmentPosition);
    if (eventIndex < 0) return null;
    const event = eventStarts[eventIndex];
    const endFrame = eventStarts[eventIndex + 1]?.frame ?? timing.totalFrames;
    const estimate = Math.round(event.frame + (endFrame - event.frame) *
      (segmentPosition - event.position) / event.length);
    const low = Math.max(cuts.at(-1) + 1, estimate - 12);
    const high = Math.min(endFrame - 1, timing.totalFrames - (segments.length - i - 1), estimate + 12);
    if (low > high) return null;
    const levels = timing.audioLevels || [];
    const quiet = frame => {
      const start = Math.max(0, frame - 2);
      const end = Math.min(levels.length, frame + 3);
      const window = levels.slice(start, end);
      return window.length ? window.reduce((sum, level) => sum + level, 0) / window.length : 1;
    };
    let best = low;
    for (let frame = low + 1; frame <= high; frame++) {
      if (quiet(frame) + Math.abs(frame - estimate) * 0.003 <
          quiet(best) + Math.abs(best - estimate) * 0.003) best = frame;
    }
    cuts.push(best);
  }
  cuts.push(timing.totalFrames);
  if (cuts.some((cut, index) => index > 0 && cut <= cuts[index - 1])) return null;
  return {...timing, timingMethod:events.length === segments.length
    ? 'edge_sentence_boundary' : 'edge_sentence_boundary_clause_estimate',
  timingBoundaryCount:events.length,
  segments:segments.map((segment, index) => ({...segment,
    fromFrame:cuts[index], durationInFrames:cuts[index + 1] - cuts[index]}))};
}
