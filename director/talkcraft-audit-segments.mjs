export function buildTalkcraftAuditSegments({auditSentences, semanticSentences, shots, shotbookAvailable}) {
  if (!shotbookAvailable || !Array.isArray(shots) || !shots.length) {
    return {state:'pending', segments:[]};
  }
  if (!Array.isArray(auditSentences) || !Array.isArray(semanticSentences) ||
      semanticSentences.length !== auditSentences.length) {
    return {state:'invalid', segments:[]};
  }

  const sentenceByIndex = new Map(auditSentences.map(sentence => [sentence.index, sentence]));
  const shotIds = new Set(shots.map(shot => shot?.id).filter(Boolean));
  if (shotIds.size !== shots.length || sentenceByIndex.size !== auditSentences.length) {
    return {state:'invalid', segments:[]};
  }

  const groups = new Map(shots.map(shot => [shot.id, []]));
  const seenIndexes = new Set();
  for (const semantic of semanticSentences) {
    const index = Number.isInteger(semantic.i) ? semantic.i + 1 : null;
    if (index === null || !sentenceByIndex.has(index) || seenIndexes.has(index)) {
      return {state:'invalid', segments:[]};
    }
    if (!semantic.shot) return {state:'pending', segments:[]};
    if (!groups.has(semantic.shot)) return {state:'invalid', segments:[]};
    groups.get(semantic.shot).push(sentenceByIndex.get(index));
    seenIndexes.add(index);
  }

  if (seenIndexes.size !== auditSentences.length) return {state:'invalid', segments:[]};
  const segments = [];
  let nextSentenceIndex = 1;
  for (const shot of shots) {
    const sentences = groups.get(shot.id).sort((a, b) => a.index - b.index);
    if (!sentences.length) continue;
    if (sentences.some(sentence => sentence.index !== nextSentenceIndex++)) {
      return {state:'invalid', segments:[]};
    }
    const matches = sentences.map(sentence => sentence.match).filter(Number.isFinite);
    segments.push({
      id:shot.id,
      order:segments.length + 1,
      start:Number.isFinite(sentences[0].start) ? sentences[0].start : shot.start ?? null,
      end:Number.isFinite(sentences.at(-1).end) ? sentences.at(-1).end : shot.end ?? null,
      text:sentences.map(sentence => sentence.text || '').join('\n'),
      sentenceCount:sentences.length,
      minimumMatch:matches.length ? Math.min(...matches) : null,
      alignmentPassed:sentences.every(sentence => sentence.ok === true),
      sentences,
    });
  }

  return segments.length && nextSentenceIndex === auditSentences.length + 1
    ? {state:'ready', segments} : {state:'invalid', segments:[]};
}
