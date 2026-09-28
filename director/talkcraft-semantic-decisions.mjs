import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const NEEDS = new Set(['证据', '身份', '量化', '对比', '结构', '强调', '无']);
const WEIGHTS = new Set(['main', 'sub']);

export function applySemanticDecisions(project, skillRoot) {
  const semanticsFile = path.join(project, 'semantics.json');
  const existing = JSON.parse(readFileSync(semanticsFile, 'utf8'));
  const decisions = JSON.parse(readFileSync(path.join(project, 'semantic-decisions.json'), 'utf8'));
  const vocabulary = new Set(JSON.parse(readFileSync(path.join(skillRoot, 'references', 'cards-index.json'), 'utf8'))
    .vocab.map(entry => entry.word));
  if (decisions.schema !== 'talkcraft-semantic-decisions-v1' ||
      !Array.isArray(decisions.sentences) || decisions.sentences.length !== existing.sentences.length) {
    throw new Error('Semantic decisions do not match the aligned sentence count');
  }
  const byIndex = new Map(decisions.sentences.map(entry => [entry.i, entry]));
  if (byIndex.size !== existing.sentences.length) throw new Error('Semantic decisions contain duplicate sentence indexes');
  const sentences = existing.sentences.map(sentence => {
    const choice = byIndex.get(sentence.i);
    if (!choice || choice.text !== sentence.text || !Array.isArray(choice.sem) || !choice.sem.length ||
        choice.sem.some(value => !vocabulary.has(value)) ||
        !Array.isArray(choice.need) || choice.need.some(value => !NEEDS.has(value)) ||
        !Array.isArray(choice.entities) || !WEIGHTS.has(choice.weight)) {
      throw new Error(`Sentence ${sentence.i} has an invalid or stale semantic decision`);
    }
    return {...sentence, sem:choice.sem, need:choice.need, entities:choice.entities, weight:choice.weight};
  });
  writeFileSync(semanticsFile, JSON.stringify({...existing, sentences}, null, 2), 'utf8');
  return {sentences:sentences.length, main:sentences.filter(sentence => sentence.weight === 'main').length};
}
