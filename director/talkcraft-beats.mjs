import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {talkcraftProject} from './talkcraft-status.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function writeTalkcraftBeats(root, runId) {
  const project = talkcraftProject(root, runId);
  const file = path.join(project, 'remotion', 'beats.json');
  if (existsSync(file)) throw new Error('Existing word beats were preserved');
  const timestamps = JSON.parse(readFileSync(path.join(project, 'audio', 'timestamps.json'), 'utf8'));
  const semantics = JSON.parse(readFileSync(path.join(project, 'semantics.json'), 'utf8'));
  if (timestamps.sentences.length !== semantics.sentences.length) throw new Error('Semantic and timing sentence counts differ');
  const extras = [{sentence:0, anchor:'干货', what:'开场强调词'},
    {sentence:0, anchor:'为什么', what:'问题副题'},
    {sentence:1, anchor:'虚假的进步感', what:'问题降格后的结论'}];
  const specs = timestamps.sentences.map((sentence, index) => ({sentence:index,
    anchor:sentence.words.find(word => word.text.trim())?.text,
    what:semantics.sentences[index]?.sem?.[0] || '口播句起'})).concat(extras);
  const beats = specs.map((spec, index) => {
    const words = timestamps.sentences[spec.sentence].words;
    const chars = words.flatMap(word => [...word.text].map(ch => ({ch, t:word.start})));
    const text = chars.map(char => char.ch).join('');
    const start = text.indexOf(spec.anchor);
    if (!spec.anchor || start < 0) throw new Error(`Word anchor missing: ${spec.sentence} ${spec.anchor}`);
    return {t:chars[start].t, anchor:spec.anchor, sentence:spec.sentence,
      what:spec.what, label:`beat-${String(index + 1).padStart(2, '0')}`};
  }).sort((a,b) => a.t - b.t);
  writeFileSync(file, JSON.stringify(beats, null, 2) + '\n', 'utf8');
  return {file, count:beats.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(writeTalkcraftBeats(ROOT, process.argv[2] || ''), null, 2));
}
