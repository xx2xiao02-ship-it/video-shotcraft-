import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SUBJECTS = new Set(['person', 'graphics', 'material']);

export function loadAcceptanceFixture() {
  const plan = JSON.parse(readFileSync(path.join(ROOT, 'b-mode-acceptance-plan.json'), 'utf8'));
  const script = readFileSync(path.join(ROOT, plan.scriptFile), 'utf8').trim();
  const sentences = (script.replace(/\r/g, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || []).map(text => text.trim()).filter(Boolean);
  if (sentences.length !== plan.subjects.length || sentences.length !== plan.subtitles?.length || sentences.some(text => text.length > 80) ||
      plan.subjects.some(subject => !SUBJECTS.has(subject))) {
    throw new Error('B 模式验收文案与固定分镜不匹配');
  }
  return {version:plan.version, script, scenes:sentences.map((text,index) => ({
    id:`s-${index + 1}`, text, subject:plan.subjects[index], subtitle:plan.subtitles[index],
    ...(plan.visualTextOverrides?.[String(index + 1)] ? {visualText:plan.visualTextOverrides[String(index + 1)]} : {}),
  }))};
}
