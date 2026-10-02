import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {scaffoldTalkcraftProject} from './talkcraft-scaffold.mjs';

function fixture(t, aspectRatio) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-b-aspect-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const runId = randomUUID();
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  const remotion = path.join(project, 'remotion');
  const skill = path.join(root, 'skill');
  for (const dir of [remotion, path.join(project, 'audio'), path.join(skill, 'template', 'motion-systems'), path.join(skill, 'runtime')]) {
    fs.mkdirSync(dir, {recursive:true});
  }
  fs.writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30, totalFrames:90,
    ...(aspectRatio ? {aspectRatio, themeSnapshot:{aspectRatio}} : {})}));
  fs.writeFileSync(path.join(remotion, 'shots.json'), JSON.stringify([{id:'s01', start:0, end:3}]));
  fs.writeFileSync(path.join(remotion, 'timing.json'), JSON.stringify({scenes:[{text:'测试', chars:[]}]}));
  fs.writeFileSync(path.join(project, 'audio', 'full.mp3'), 'fixture');
  fs.writeFileSync(path.join(skill, 'runtime', 'package.json'), JSON.stringify({dependencies:{remotion:'4.0.484', react:'19.2.7', 'react-dom':'19.2.7', '@remotion/cli':'4.0.484'}, devDependencies:{typescript:'6.0.3'}}));
  for (const name of ['camera.tsx', 'params.ts', 'timing.ts']) {
    fs.writeFileSync(path.join(skill, 'template', 'motion-systems', name), 'export {};\n');
  }
  fs.writeFileSync(path.join(skill, 'LICENSE'), 'fixture');
  fs.writeFileSync(path.join(skill, 'THIRD_PARTY_NOTICES.md'), 'fixture');
  return {root, runId, skill, project};
}

test('B 模式新竖版任务生成 1080x1920 工程', t => {
  const {root, runId, skill, project} = fixture(t, '9:16');
  scaffoldTalkcraftProject(root, skill, runId);
  const composition = fs.readFileSync(path.join(project, 'remotion', 'src', 'Root.tsx'), 'utf8');
  assert.match(composition, /width=\{1080\} height=\{1920\}/);
});

test('旧 B 模式任务无画幅字段时保持横版', t => {
  const {root, runId, skill, project} = fixture(t);
  scaffoldTalkcraftProject(root, skill, runId);
  const composition = fs.readFileSync(path.join(project, 'remotion', 'src', 'Root.tsx'), 'utf8');
  assert.match(composition, /width=\{1920\} height=\{1080\}/);
});
