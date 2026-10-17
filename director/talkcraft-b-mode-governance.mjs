import fs from 'node:fs';
import path from 'node:path';
import {assertExclusiveBackgrounds} from './talkcraft-background-exclusivity.mjs';
import {assertTalkcraftTemplateGovernance} from './talkcraft-template-governance.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export function assertBModeGoverned(root, runId) {
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  const source = readJson(path.join(project, 'source-run.json'));
  const shotbook = fs.readFileSync(path.join(project, 'SHOTBOOK.md'), 'utf8');
  const cardsFile = path.join(project, 'remotion', 'cards-used.json');
  const cards = fs.existsSync(cardsFile) ? readJson(cardsFile) : null;
  const shotsSource = fs.readFileSync(path.join(project, 'remotion', 'src', 'shots.ts'), 'utf8');
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  const bindingsFile = path.join(project, 'qa', 'formal-bindings.json');
  const shots = fs.existsSync(shotsFile) ? readJson(shotsFile) : [];
  const bindings = fs.existsSync(bindingsFile) ? readJson(bindingsFile) : null;
  const errors = [];
  try { assertExclusiveBackgrounds(project,shots); } catch(error) { errors.push(error.message); }
  try { assertTalkcraftTemplateGovernance(project); } catch(error) { errors.push(error.message); }

  if (/native-scene-/u.test(shotbook)) {
    errors.push('SHOTBOOK 仍使用 native-scene 旧绑定，尚未接入正式 shotCard。');
  }
  if (!cards || !Array.isArray(cards.slugs) || !cards.slugs.length) {
    errors.push('cards-used.json 没有真实模板清单。');
  }
  if (!Array.isArray(shots) || shots.some(shot => !shot?.shotCard || /^native-scene-/u.test(String(shot.shotCard)))) {
    errors.push('shots.json 缺少正式 shotCard，或仍包含 native-scene。');
  }
  if (!bindings || bindings.schema !== 'talkcraft-formal-bindings-v1' ||
      !Array.isArray(bindings.bindings) || bindings.bindings.length !== shots.length) {
    errors.push('formal-bindings.json 不存在或未覆盖全部镜头。');
  }
  if (bindings?.bindings?.some(binding => !shots.some(shot => shot.id === binding.shotId && shot.shotCard === binding.shotCard))) {
    errors.push('正式绑定与 shots.json 不一致。');
  }
  if (source.isDigitalHuman === true) {
    const humanDir = path.join(project, 'remotion', 'public', 'digital-human');
    const humanFiles = fs.existsSync(humanDir) ? fs.readdirSync(humanDir).filter(name => /\.(mp4|webm|mov)$/iu.test(name)) : [];
    if (!humanFiles.length) errors.push('编导脚本声明需要数字人，但 remotion/public/digital-human 没有可渲染视频。');
    if (!/"subject"\s*:\s*"person"/u.test(shotsSource)) errors.push('编导脚本声明需要数字人，但 shots.ts 没有 person 镜头。');
  } else if (/'subject'\s*:\s*'person'|"subject"\s*:\s*"person"/u.test(shotsSource)) {
    errors.push('shots.ts 标记了 person，但 source-run.json 明确关闭数字人。');
  }
  if (errors.length) {
    throw new Error(`B 模式治理阻断：\n${errors.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
  }
  return {runId, project, cards:cards.slugs};
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  assertBModeGoverned(path.resolve(process.argv[2] || '..'), process.argv[3]);
  console.log('B_MODE_GOVERNANCE_PASS');
}
