import {loadReviewedTemplates,recordReviewedCandidates} from './talkcraft-reviewed-templates.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {scaffoldTalkcraftProject as scaffoldProject} from './talkcraft-scaffold.mjs';


// These tests exercise scaffold dimensions/container handling, not semantic
// selection or film acceptance. Give their controlled inputs version-bound
// candidate fixtures; production still uses the upstream matcher.
function scaffoldTalkcraftProject(root, skill, runId) {
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  const {registry}=loadReviewedTemplates();
  const installed=resolveTalkcraftSkillRoot(path.resolve());
  for(const relative of Object.keys(registry.sources)) {
    const destination=path.join(skill,relative);
    if(!fs.existsSync(destination)) {
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.copyFileSync(path.join(installed,relative),destination);
    }
  }
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  const shots=JSON.parse(fs.readFileSync(path.join(project,'remotion/shots.json'),'utf8'));
  for(const [name,value] of [['semantics.json','{"sentences":[]}'],['SHOTBOOK.md','# Unit fixture']])
    if(!fs.existsSync(path.join(project,name)))fs.writeFileSync(path.join(project,name),value);
  fs.writeFileSync(path.join(project,'qa/card-candidates.json'),JSON.stringify(Object.fromEntries(
    shots.map(shot=>[shot.id,{candidates:{fixture:[{slug:shot.shotCard}]}}]))));
  recordReviewedCandidates(project,{skillRoot:skill});
  return scaffoldProject(root,skill,runId);
}

function fixture(t, aspectRatio) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-b-aspect-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const runId = randomUUID();
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  const remotion = path.join(project, 'remotion');
  // Real read-only B library: scaffolding now emits the authoritative contract.
  // Never write synthetic files into the shared skill/runtime tree.
  const skill = path.resolve('_audit/video-talkcraft');
  for (const dir of [remotion, path.join(project, 'audio')]) {
    fs.mkdirSync(dir, {recursive:true});
  }
  fs.writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30, totalFrames:90,
    ...(aspectRatio ? {aspectRatio, themeSnapshot:{aspectRatio}} : {})}));
  fs.writeFileSync(path.join(remotion, 'shots.json'), JSON.stringify([{id:'s01', start:0, end:3,shotCard:'impact-open-title',
    templateParams:{cardProps:{lineStart:'当前业务参数',lastWord:'现金',sub:'核验副标题'}}}]));
  fs.writeFileSync(path.join(remotion, 'timing.json'), JSON.stringify({scenes:[{text:'测试', chars:[]}]}));
  fs.writeFileSync(path.join(project, 'audio', 'full.mp3'), 'fixture');
  return {root, runId, skill, project};
}

test('B 模式新竖版任务生成 1080x1920 工程', t => {
  const {root, runId, skill, project} = fixture(t, '9:16');
  scaffoldTalkcraftProject(root, skill, runId);
  const composition = fs.readFileSync(path.join(project, 'remotion', 'src', 'Root.tsx'), 'utf8');
  assert.match(composition, /width=\{1080\} height=\{1920\}/);
  assert.match(fs.readFileSync(path.join(project,'remotion/src/card-contracts.ts'),'utf8'), /impact-open-title/);
  assert.match(fs.readFileSync(path.join(project,'remotion/src/talkcraft-template-adapter.tsx'),'utf8'), /CARD_CONTRACTS/);
  const scene = fs.readFileSync(path.join(project,'remotion/src/scenes/s01.tsx'),'utf8');
  assert.match(fs.readFileSync(path.join(project,'remotion/src/Main.tsx'),'utf8'),/BundledFonts fontFamily=\{THEME.fontFamily\}/);
  assert.match(fs.readFileSync(path.join(project,'remotion/src/parameterized-cards/shared.tsx'),'utf8'),/var\(--sc-font-family/);
  assert.ok(fs.existsSync(path.join(project,'remotion/public/fonts/manifest.json')));
  assert.match(scene,/当前业务参数/);assert.match(scene,/useParams\(shot.id, fields\)/);
  assert.doesNotMatch(scene,/key:"(?:lead|startDelay)"/);
  const report = execFileSync(process.env.TALKCRAFT_PYTHON || 'python',
    [path.resolve('docs/audits/b-pipeline-reconciliation-20261006/upstream/scripts/workbench_contract_lint.py'),project],
    {encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
  assert.match(report,/契约 PASS/);
});

test('旧 B 模式任务无画幅字段时保持横版', t => {
  const {root, runId, skill, project} = fixture(t);
  scaffoldTalkcraftProject(root, skill, runId);
  const composition = fs.readFileSync(path.join(project, 'remotion', 'src', 'Root.tsx'), 'utf8');
  assert.match(composition, /width=\{1920\} height=\{1080\}/);
  assert.match(fs.readFileSync(path.join(project,'remotion/remotion.config.js'),'utf8'),/setVideoImageFormat\('png'\)/);
  assert.match(fs.readFileSync(path.join(project,'remotion/remotion.config.js'),'utf8'),/setCrf\(10\)/);
});

for (const workflowPath of ['generated-avatar', 'recorded-host']) {
  test(`${workflowPath} 人物视频使用正确的容器与透明解码方式`, t => {
    const {root, runId, skill, project} = fixture(t);
    const sourcePath = path.join(project, 'source-run.json');
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    fs.writeFileSync(sourcePath, JSON.stringify({...source, workflowPath}));
    scaffoldTalkcraftProject(root, skill, runId);
    const main = fs.readFileSync(path.join(project, 'remotion/src/Main.tsx'), 'utf8');
    const hostVideo = main.split('\n').find(line => line.includes("staticFile('digital-human/"));
    assert.ok(hostVideo);
    if (workflowPath === 'recorded-host') {
      assert.match(hostVideo, /"\.mp4"/);
      assert.match(hostVideo, /transparent=\{false\}/);
    } else {
      assert.match(hostVideo, /"-transparent\.webm"/);
      assert.match(hostVideo, /transparent=\{true\}/);
    }
  });
}

test('口播句间停顿由上一镜头最后一帧承接，不阻断搭建', t => {
  const {root, runId, skill, project} = fixture(t);
  fs.writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify([
    {id:'s01', start:0, end:1, shotCard:'impact-open-title', templateParams:{cardProps:{lineStart:'第一句'}}},
    {id:'s02', start:1.5, end:3, shotCard:'per-character-rise', templateParams:{cardProps:{text:'第二句'}}},
  ]));
  fs.writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30, totalFrames:90}));
  scaffoldTalkcraftProject(root, skill, runId);
  const source = fs.readFileSync(path.join(project, 'remotion', 'src', 'shots.ts'), 'utf8');
  assert.match(source, /"durationSec": 1\.5/);
  const bridges = JSON.parse(fs.readFileSync(path.join(project, 'qa', 'visual-timeline-bridges.json'), 'utf8'));
  assert.deepEqual(bridges.bridges, [{shotId:'s01', fromSec:1, toSec:1.5, durationSec:0.5}]);
});
