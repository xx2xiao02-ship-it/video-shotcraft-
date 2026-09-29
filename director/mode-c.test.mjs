import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {loadModeCConfig, runModeCStage} from './mode-c/mode-c-dispatcher.mjs';
import {planImage2Generation} from './mode-c/adapters/image2-adapter.mjs';
import {planVeoGeneration} from './mode-c/adapters/veo-adapter.mjs';

function tempProject() {
  const project = mkdtempSync(path.join(os.tmpdir(), 'shotcraft-mode-c-'));
  mkdirSync(path.join(project, 'qa'), {recursive:true});
  writeFileSync(path.join(project, 'qa', 'card-candidates.json'), JSON.stringify({
    s01:{missingMaterial:true, assetKind:'image', assetCount:2, cardSlug:'gallery-wall-dolly', text:'展示多个关键证据'},
    s02:{missingMaterial:true, assetKind:'video', cardSlug:'case-show', text:'镜头向前推进'},
    s03:{missingMaterial:true, assetKind:'evidence', cardSlug:'screenshot-card', text:'展示真实网页证据'},
    s04:{media:'文', candidates:{definition:[{slug:'text-hero'}]}},
  }, null, 2), 'utf8');
  return project;
}

test('mode C keeps dry-run default and records external skill sources', () => {
  const config = loadModeCConfig();
  assert.equal(config.mode, 'C');
  assert.equal(config.dryRun, true);
  assert.equal(config.image.model, 'gpt-image-2');
  assert.equal(config.video.model, 'veo-3.1');
  const sources = JSON.parse(readFileSync(path.join('director', 'mode-c', 'mode-c-sources.json'), 'utf8'));
  assert.equal(sources.skills.length, 2);
  assert.match(sources.skills[0].repository, /Veo-Claude-Skills/u);
  assert.match(sources.skills[1].repository, /codex-image2-skill/u);
});

test('main console exposes a selectable C mode without changing A/B defaults', () => {
  const html = readFileSync('console-ui.html', 'utf8');
  assert.match(html, /id="b-mode-c"[^>]*type="button"/u);
  assert.match(html, /visualMode[^\n]+"C"/u);
  assert.match(html, /id="b-mode-a"/u);
  assert.match(html, /id="b-mode-real"/u);
  assert.doesNotMatch(html, /id="b-mode-c"[^>]*cursor:not-allowed/u);
});

test('mode C creates image/video/evidence plans without making paid calls', () => {
  const project = tempProject();
  try {
    const result = runModeCStage('dry-run', project);
    assert.equal(result.status, 'generation_plan_ready');
    assert.equal(result.externalCalls, 0);
    assert.equal(result.paidCalls, 0);
    assert.deepEqual(result.counts, {total:4, image:2, video:1, blocked:1});
    const queue = JSON.parse(readFileSync(result.queueFile, 'utf8'));
    const plan = JSON.parse(readFileSync(result.planFile, 'utf8'));
    assert.equal(queue.jobs.filter(job => job.assetKind === 'image').length, 2);
    assert.equal(plan.externalCalls, 0);
    assert.equal(plan.paidCalls, 0);
    assert.equal(plan.jobs.find(job => job.assetKind === 'video').audioPolicy, 'strip');
    assert.equal(queue.jobs.find(job => job.assetKind === 'evidence').status, 'blocked');
    assert.equal(readFileSync(result.rematchFile, 'utf8').includes('card_match.py'), true);
    const mock = runModeCStage('mock', project);
    assert.equal(mock.externalCalls, 0);
    assert.equal(mock.paidCalls, 0);
    assert.equal(mock.generated + mock.failed, 3);
    assert.ok(mock.generated >= 2);
    assert.equal(mock.blocked, 1);
    const verification = runModeCStage('verify', project);
    assert.ok(['verified', 'pending_generation', 'blocked'].includes(verification.status));
    assert.equal(verification.verified, mock.generated);
  } finally {
    rmSync(project, {recursive:true, force:true});
  }
});

test('mode C adapters only produce plans and never expose credentials', () => {
  const config = loadModeCConfig();
  const modeCRoot = path.resolve('director', 'mode-c');
  const imagePlan = planImage2Generation({modeCRoot, config, job:{assetKind:'image', jobId:'s01-image-01', outputPath:'mode-c/generated/s01.png'}});
  const videoPlan = planVeoGeneration({modeCRoot, config, job:{assetKind:'video', jobId:'s02-video-01', outputPath:'mode-c/generated/s02.mp4', durationSec:8}});
  assert.equal(imagePlan.dryRunOnly, true);
  assert.equal(videoPlan.dryRunOnly, true);
  assert.equal(imagePlan.args.includes('--dry-run'), false);
  assert.equal(videoPlan.audioPolicy, 'strip');
  assert.equal(JSON.stringify({imagePlan, videoPlan}).includes('API_KEY'), false);
});

test('verified local mock assets reach the isolated card-rematch gate', () => {
  const project = mkdtempSync(path.join(os.tmpdir(), 'shotcraft-mode-c-rematch-'));
  try {
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    writeFileSync(path.join(project, 'qa', 'card-candidates.json'), JSON.stringify({
      s01:{missingMaterial:true, assetKind:'image', text:'数据说明'},
    }), 'utf8');
    writeFileSync(path.join(project, 'semantics.json'), JSON.stringify({sentences:[{shot:'S1', weight:'main', sem:['数据信息']}]}), 'utf8');
    writeFileSync(path.join(project, 'SHOTBOOK.md'), '### S1 · 0.00–2.00 · 意图：数据说明\n- 素材：图片（mode-c/generated/s01-image-01.png）\n', 'utf8');
    runModeCStage('dry-run', project);
    const mock = runModeCStage('mock', project);
    assert.equal(mock.generated, 1);
    const verification = runModeCStage('verify', project);
    assert.equal(verification.status, 'verified');
    const rematch = runModeCStage('rematch', project);
    assert.equal(rematch.status, 'card_rematch');
    assert.equal(rematch.dryRunReady, true);
    assert.equal(readFileSync(rematch.rematchFile, 'utf8').includes('card_match.py'), true);
  } finally {
    rmSync(project, {recursive:true, force:true});
  }
});
