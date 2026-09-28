import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

export function resolveTalkcraftSkillRoot(root, env=process.env, home=homedir()) {
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  const candidates = [
    env.TALKCRAFT_SKILL_ROOT,
    path.join(root, '_audit', 'video-talkcraft'),
    path.join(codexHome, 'skills', 'video-talkcraft'),
    path.join(codexHome, 'skills', 'video-shotcraft', '_audit', 'video-talkcraft'),
  ].filter(Boolean);
  const found = candidates.find(candidate =>
    existsSync(path.join(candidate, 'SKILL.md')) &&
    existsSync(path.join(candidate, 'scripts', 'preflight.py')) &&
    existsSync(path.join(candidate, 'template', 'cards')));
  if (!found) throw new Error('video-talkcraft Skill 未安装；请设置 TALKCRAFT_SKILL_ROOT 指向含 SKILL.md 的目录');
  return path.resolve(found);
}
