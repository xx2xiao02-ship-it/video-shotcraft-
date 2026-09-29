import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {image2DryRun} from './adapters/image2-adapter.mjs';
import {veoDryRun} from './adapters/veo-adapter.mjs';
import {createMockAsset, verifyAsset} from './asset-verifier.mjs';
import {buildGenerationQueue, writeGenerationQueue} from './generation-queue.mjs';
import {executeCardRematch, planCardRematch, writeCardRematchPlan} from './card-rematch.mjs';
import {MODE_C_STATES, assertModeCState} from './state.mjs';

const MODE_C_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadModeCConfig(root = MODE_C_ROOT) {
  const config = readJson(path.join(root, 'mode-c-config.json'));
  if (config.mode !== 'C' || config.schema !== 'mode-c-config-v1') throw new Error('模式 C 配置版本无效');
  if (config.fps !== 30 || config.aspectRatio !== '16:9') throw new Error('模式 C 当前只允许 30fps、16:9 基线');
  return config;
}

function writeManifest(projectRoot, name, value) {
  const directory = path.join(projectRoot, 'mode-c', 'manifests');
  mkdirSync(directory, {recursive:true});
  const file = path.join(directory, name);
  writeFileSync(file, JSON.stringify({...value, writtenAt:new Date().toISOString()}, null, 2), 'utf8');
  return file;
}

function modeCRootFromProject(projectRoot) {
  const root = path.resolve(projectRoot);
  if (!existsSync(root)) throw new Error(`TalkCraft 项目不存在：${root}`);
  return MODE_C_ROOT;
}

export function runModeCStage(stage, projectRoot, options = {}) {
  const project = path.resolve(projectRoot);
  const modeCRoot = modeCRootFromProject(project);
  const config = loadModeCConfig(modeCRoot);
  if (!config.enabled) throw new Error('模式 C 已禁用');
  if (!['dry-run', 'mock', 'verify', 'rematch-plan', 'rematch', 'inspect'].includes(stage)) throw new Error(`未知模式 C 阶段：${stage}`);

  if (stage === 'inspect') {
    return {mode:'C', config, root:modeCRoot, project, dryRun:config.dryRun === true};
  }

  if (stage === 'dry-run') {
    const candidatesFile = path.join(project, 'qa', 'card-candidates.json');
    const queue = buildGenerationQueue({projectRoot:project, config, candidatesFile});
    const queueFile = writeGenerationQueue(project, queue);
    const plans = queue.jobs.map(job => {
      if (job.status === 'blocked') return {...job, planStatus:'blocked'};
      return job.assetKind === 'image'
        ? {...job, ...image2DryRun(job, modeCRoot, config, project)}
        : {...job, ...veoDryRun(job, modeCRoot, config, project)};
    });
    const planFile = writeManifest(project, 'generation-plan.json', {schema:'mode-c-generation-plan-v1', mode:'C',
      dryRun:true, jobs:plans, externalCalls:0, paidCalls:0});
    const rematch = planCardRematch({projectRoot:project, talkcraftSkillRoot:options.talkcraftSkillRoot || path.resolve(modeCRoot, '..', '..', '_audit', 'video-talkcraft'),
      python:options.python || 'python'});
    const rematchFile = writeCardRematchPlan(project, rematch);
    const status = existsSync(candidatesFile) ? 'generation_plan_ready' : 'awaiting_card_candidates';
    const stateFile = writeManifest(project, 'state.json', {schema:'mode-c-state-v1', mode:'C', stage:'dry-run', status,
      state:'pending_generation', supportedStates:MODE_C_STATES, queueFile, planFile, rematchFile, externalCalls:0, paidCalls:0});
    return {project, status, queueFile, planFile, rematchFile, stateFile, counts:queue.counts, externalCalls:0, paidCalls:0};
  }

  const queueFile = path.join(project, 'mode-c', 'manifests', 'generation-queue.json');
  if (!existsSync(queueFile)) throw new Error('尚未生成模式 C 素材队列，请先执行 dry-run');
  const queue = readJson(queueFile);
  if (stage === 'mock') {
    const generated = [];
    const failed = [];
    for (const job of queue.jobs) {
      if (job.state === 'blocked' || job.status === 'blocked') continue;
      try {
        generated.push({...job, ...createMockAsset({root:project, file:job.outputPath, kind:job.assetKind,
          durationSec:job.durationSec || config.video.durationSeconds, fps:config.fps})});
      } catch (error) {
        failed.push({...job, state:'generation_failed', status:'generation_failed', error:String(error.message || error)});
      }
    }
    const nextQueue = {...queue, jobs:queue.jobs.map(job => generated.find(item => item.jobId === job.jobId) || failed.find(item => item.jobId === job.jobId) || job)};
    const nextQueueFile = writeGenerationQueue(project, nextQueue);
    const state = failed.length ? 'generation_failed' : 'generated';
    assertModeCState(state);
    const mockFile = writeManifest(project, 'mock-generation.json', {schema:'mode-c-mock-generation-v1', mode:'C',
      state, mock:true, generated, failed, externalCalls:0, paidCalls:0});
    return {project, status:state, state, queueFile:nextQueueFile, mockFile, generated:generated.length, failed:failed.length,
      blocked:queue.jobs.filter(job => job.state === 'blocked' || job.status === 'blocked').length, externalCalls:0, paidCalls:0};
  }
  if (stage === 'verify') {
    const results = queue.jobs.map(job => job.status === 'blocked'
      ? {...job, ok:false, state:'blocked', status:'blocked', errors:[job.reason]}
      : {...verifyAsset({root:project, file:job.outputPath, kind:job.assetKind, expectedDurationSec:job.durationSec,
        fps:config.fps, stripAudio:job.assetKind === 'video' && config.video.audioPolicy === 'strip'}), state:'verifying'});
    const passed = results.length > 0 && results.every(result => result.ok);
    const finalState = passed ? 'verified' : results.some(result => result.status === 'pending_generation') ? 'pending_generation' :
      results.some(result => result.status === 'blocked') ? 'blocked' : 'generation_failed';
    assertModeCState(finalState);
    const finalResults = results.map(result => ({...result, state:result.ok ? 'verified' : finalState === 'generation_failed' ? 'generation_failed' : result.state}));
    const file = writeManifest(project, 'verification.json', {schema:'mode-c-verification-v1', mode:'C', state:finalState,
      status:finalState, results:finalResults});
    return {project, status:finalState, state:finalState, verificationFile:file, verified:finalResults.filter(result => result.ok).length, total:finalResults.length};
  }

  if (stage === 'rematch') {
    const verificationFile = path.join(project, 'mode-c', 'manifests', 'verification.json');
    if (!existsSync(verificationFile)) throw new Error('素材验证报告不存在，请先执行 verify');
    const verification = readJson(verificationFile);
    if (verification.status !== 'verified') return {project, status:'pending_generation', verificationFile};
    if (config.dryRun) return {project, status:'card_rematch', state:'card_rematch', dryRunReady:true, verificationFile,
      rematchFile:writeCardRematchPlan(project, planCardRematch({projectRoot:project,
        talkcraftSkillRoot:options.talkcraftSkillRoot || path.resolve(modeCRoot, '..', '..', '_audit', 'video-talkcraft'),
        python:options.python || 'python'}))};
    return {project, state:'card_rematch', ...executeCardRematch({projectRoot:project,
      talkcraftSkillRoot:options.talkcraftSkillRoot || path.resolve(modeCRoot, '..', '..', '_audit', 'video-talkcraft'),
      python:options.python || 'python'})};
  }

  const plan = planCardRematch({projectRoot:project, talkcraftSkillRoot:options.talkcraftSkillRoot || path.resolve(modeCRoot, '..', '..', '_audit', 'video-talkcraft'),
    python:options.python || 'python'});
  const file = writeCardRematchPlan(project, plan);
  return {project, status:'card_rematch', state:'card_rematch', rematchFile:file, command:plan};
}

export function assertModeCRun(root, runId) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid mode C run ID');
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  if (!existsSync(path.join(project, 'source-run.json'))) throw new Error('TalkCraft run does not exist');
  const source = readJson(path.join(project, 'source-run.json'));
  if (source.visualMode !== 'C') throw new Error('该运行不是模式 C');
  return project;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stage = process.argv[2] || 'inspect';
  const project = process.argv[3] || MODE_C_ROOT;
  console.log(JSON.stringify(runModeCStage(stage, project), null, 2));
}
