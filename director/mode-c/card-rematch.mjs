import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

export function planCardRematch({projectRoot, talkcraftSkillRoot, python = 'python'}) {
  const script = path.resolve(talkcraftSkillRoot, 'scripts', 'card_match.py');
  const output = path.join(projectRoot, 'qa', 'card-candidates-after-mode-c.json');
  const markdown = path.join(projectRoot, 'qa', 'card-candidates-after-mode-c.md');
  return {command:python, args:[script, '--project', projectRoot, '--out', markdown, '--json', output], output, markdown,
    status:'pending_card_rematch', reason:'素材验证通过后重新执行现有 card_match.py'};
}

export function writeCardRematchPlan(projectRoot, plan) {
  const directory = path.join(projectRoot, 'mode-c', 'manifests');
  mkdirSync(directory, {recursive:true});
  const file = path.join(directory, 'rematch-plan.json');
  writeFileSync(file, JSON.stringify({...plan, writtenAt:new Date().toISOString()}, null, 2), 'utf8');
  return file;
}

export function executeCardRematch({projectRoot, talkcraftSkillRoot, python = 'python'}) {
  const plan = planCardRematch({projectRoot, talkcraftSkillRoot, python});
  if (!existsSync(path.join(projectRoot, 'semantics.json')) || !existsSync(path.join(projectRoot, 'SHOTBOOK.md'))) {
    throw new Error('模式 C 重新选卡前必须存在 semantics.json 和 SHOTBOOK.md');
  }
  execFileSync(plan.command, plan.args, {cwd:projectRoot, stdio:'inherit', env:{...process.env, PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1'}});
  return {...plan, status:'card_rematch_completed'};
}
