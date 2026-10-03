import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {readNativeTiming, timingHealth} from './talkcraft-native-timing.mjs';

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));

export function talkcraftProject(root, runId) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid TalkCraft run ID');
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  if (!existsSync(path.join(project, 'source-run.json'))) throw new Error('TalkCraft run was not found');
  return project;
}

export function latestTalkcraftRun(root) {
  const runs = path.join(root, 'director', 'b-mode-runs');
  if (!existsSync(runs)) return null;
  return readdirSync(runs, {withFileTypes:true})
    .filter(entry => entry.isDirectory() && RUN_ID.test(entry.name))
    .map(entry => ({id:entry.name, file:path.join(runs, entry.name, 'talkcraft', 'source-run.json')}))
    .filter(entry => existsSync(entry.file))
    .sort((a,b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs)[0]?.id || null;
}

function preflightInputs(project) {
  const names = ['semantics.json', 'SHOTBOOK.md', 'remotion/shots.json', 'audio/timestamps.json', 'sources.md'];
  if (names.some(name => !existsSync(path.join(project, name)))) return null;
  return Object.fromEntries(names.map(name => [name, digest(path.join(project, name))]));
}

function storyboardInputs(project) {
  const names = ['semantics.json', 'SHOTBOOK.md', 'remotion/shots.json'];
  if (names.some(name => !existsSync(path.join(project, name)))) return null;
  return Object.fromEntries(names.map(name => [name, digest(path.join(project, name))]));
}

function latestPreflightIssues(project) {
  const directory = path.join(project, 'qa', 'failures');
  if (!existsSync(directory)) return [];
  const files = readdirSync(directory).filter(name => name.endsWith('.json'))
    .sort((a,b) => statSync(path.join(directory,b)).mtimeMs - statSync(path.join(directory,a)).mtimeMs);
  for (const name of files) {
    try {
      const report = json(path.join(directory, name));
      if (Array.isArray(report.failedChecks) && report.failedChecks.length) return report.failedChecks;
    } catch {}
  }
  return [];
}

function semanticInputs(project) {
  const names = ['semantics.json', 'audio/timestamps.json'];
  if (names.some(name => !existsSync(path.join(project, name)))) return null;
  return Object.fromEntries(names.map(name => [name, digest(path.join(project, name))]));
}

function firstCardCallFingerprint(project) {
  const file = path.join(project, 'qa', 'card-calls.json');
  if (!existsSync(file)) return null;
  const record = json(file);
  const call = record.calls?.find(item => item?.shotId === 's01');
  if (!call) return null;
  const scene = call.evidence?.find(item => item?.kind === 'scene-binding');
  const candidate = call.evidence?.find(item => item?.kind === 'card-candidate');
  return createHash('sha256').update(JSON.stringify({shotId:call.shotId, cardId:call.cardId,
    implementationSha256:call.implementationSha256, props:call.props,
    sceneSha256:scene?.sha256 || null, candidateSetSha256:candidate?.candidateSetSha256 || null})).digest('hex');
}

export function talkcraftSceneCoverage(project, shots) {
  const sceneDir = path.join(project, 'remotion', 'src', 'scenes');
  const indexFile = path.join(sceneDir, 'index.ts');
  const registry = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : '';
  const missing = (shots || []).map(shot => shot.id).filter(id =>
    !/^[a-z][a-z0-9]*$/i.test(id) ||
    !existsSync(path.join(sceneDir, `${id}.tsx`)) ||
    !new RegExp(`\\b${id}\\s*:`).test(registry));
  return {implemented: (shots || []).length - missing.length, missing,
    ready: !!shots?.length && missing.length === 0};
}

export function recordSemanticPass(root, runId) {
  const project = talkcraftProject(root, runId);
  const inputs = semanticInputs(project);
  if (!inputs) throw new Error('Semantic inputs are incomplete');
  const file = path.join(project, 'qa', 'semantic-passed.json');
  mkdirSync(path.dirname(file), {recursive:true});
  writeFileSync(file, JSON.stringify({schema:'talkcraft-semantic-pass-v1', inputs,
    passedAt:new Date().toISOString()}, null, 2), 'utf8');
  return {project, file};
}

export function recordPreflightPass(root, runId) {
  const project = talkcraftProject(root, runId);
  const inputs = preflightInputs(project);
  if (!inputs) throw new Error('Preflight inputs are incomplete');
  const file = path.join(project, 'qa', 'preflight-passed.json');
  mkdirSync(path.dirname(file), {recursive:true});
  writeFileSync(file, JSON.stringify({schema:'talkcraft-preflight-pass-v1', inputs,
    passedAt:new Date().toISOString()}, null, 2), 'utf8');
  return {project, file};
}

export function recordPreflightResult(root, runId, {passed, issues = [], adjustments = []} = {}) {
  const project = talkcraftProject(root, runId);
  const inputs = preflightInputs(project);
  if (!inputs) throw new Error('Preflight inputs are incomplete');
  const file = path.join(project, 'qa', 'preflight-result.json');
  mkdirSync(path.dirname(file), {recursive:true});
  writeFileSync(file, JSON.stringify({schema:'talkcraft-preflight-result-v1', inputs,
    passed:passed === true, issues, adjustments, completedAt:new Date().toISOString()}, null, 2), 'utf8');
  if (passed === true) recordPreflightPass(root, runId);
  return {project, file, passed:passed === true};
}

export function readTalkcraftStatus(root, runId) {
  const project = talkcraftProject(root, runId);
  const has = name => existsSync(path.join(project, name));
  const source = json(path.join(project, 'source-run.json'));
  const digitalHuman = readTalkcraftDigitalHumanStatus(project);
  const themeSnapshot = has('theme.json') ? json(path.join(project, 'theme.json')) : null;
  const timing = has('audio/timestamps.json') ? json(path.join(project, 'audio', 'timestamps.json')) : null;
  let canRecoverTiming = false;
  if (!timingHealth(timing).sentenceTimingReady) {
    try { canRecoverTiming = !!readNativeTiming(project); } catch {}
  }
  const shots = has('remotion/shots.json') ? json(path.join(project, 'remotion', 'shots.json')) : null;
  const sceneCoverage = talkcraftSceneCoverage(project, shots);
  const semantics = has('semantics.json') ? json(path.join(project, 'semantics.json')) : null;
  const semanticHashes = semanticInputs(project);
  const semanticGate = has('qa/semantic-passed.json') ? json(path.join(project, 'qa', 'semantic-passed.json')) : null;
  const semanticPassed = !!semanticHashes && semanticGate?.schema === 'talkcraft-semantic-pass-v1' &&
    Object.keys(semanticHashes).every(name => semanticGate.inputs?.[name] === semanticHashes[name]);
  const inputs = preflightInputs(project);
  const gate = has('qa/preflight-passed.json') ? json(path.join(project, 'qa', 'preflight-passed.json')) : null;
  const preflight = !!inputs && gate?.schema === 'talkcraft-preflight-pass-v1' &&
    Object.keys(inputs).every(name => gate.inputs?.[name] === inputs[name]);
  const preflightResult = has('qa/preflight-result.json') ? json(path.join(project, 'qa', 'preflight-result.json')) : null;
  const preflightCompleted = !!inputs && preflightResult?.schema === 'talkcraft-preflight-result-v1' &&
    Object.keys(inputs).every(name => preflightResult.inputs?.[name] === inputs[name]);
  const preflightPassed = preflight || (preflightCompleted && preflightResult.passed === true);
  const storyboardGate = has('qa/storyboard-approved.json') ? json(path.join(project, 'qa/storyboard-approved.json')) : null;
  const storyboardAdjustment = has('qa/storyboard-adjustment-request.json') ? json(path.join(project, 'qa/storyboard-adjustment-request.json')) : null;
  const storyboardApprovalInputs = storyboardInputs(project);
  const storyboardApproved = !!storyboardApprovalInputs && storyboardGate?.schema === 'talkcraft-storyboard-approval-v1' &&
    Object.keys(storyboardApprovalInputs).every(name => storyboardGate.inputs?.[name] === storyboardApprovalInputs[name]);
  const sampleFile = path.join(project, 'remotion', 'out', 'preview', 's01.mp4');
  const sample = existsSync(sampleFile) && statSync(sampleFile).size > 0;
  const approval = has('sample-approved.json') ? json(path.join(project, 'sample-approved.json')) : null;
  const firstCardCallSha256 = source.cardCallsRequired === true ? firstCardCallFingerprint(project) : null;
  const sampleApproved = sample && preflightCompleted && storyboardApproved && approval?.schema === 'talkcraft-sample-approval-v1' &&
    approval.sampleSha256 === digest(sampleFile) && approval.shotbookSha256 === inputs['SHOTBOOK.md'] &&
    (source.cardCallsRequired !== true || (!!firstCardCallSha256 && approval.firstCardCallSha256 === firstCardCallSha256));
  const finalFile = path.join(project, 'remotion', 'out', 'final.mp4');
  const final = existsSync(finalFile) && statSync(finalFile).size > 0;
  const qa = final && has('qa/passed.json') ? json(path.join(project, 'qa', 'passed.json')) : null;
  const qaPassed = !!qa && qa.finalSha256 === digest(finalFile);
  const review = qaPassed && has('review/approval.json') ? json(path.join(project, 'review', 'approval.json')) : null;
  const reviewPassed = !!review && review.finalSha256 === qa.finalSha256 &&
    review.reviewedShots === shots?.length && review.openP0 === 0 && review.openP1 === 0;
  const deliveryFile = path.join(project, 'remotion', 'out', 'delivery.mp4');
  const delivery = reviewPassed && existsSync(deliveryFile) && statSync(deliveryFile).size > 0;
  const candidatesFile = path.join(project, 'qa', 'card-candidates.json');
  const candidatesReport = path.join(project, 'qa', 'card-candidates.md');
  const candidatesReady = existsSync(candidatesFile) && statSync(candidatesFile).size > 0 &&
    existsSync(candidatesReport) && statSync(candidatesReport).size > 0;
  return {runId, sourceRunId:source.sourceRunId || null, voice:source.voice || null, digitalHuman,
    ...timingHealth(timing), canRecoverTiming,
    inputReady:timingHealth(timing).sentenceTimingReady && has('aligned-sentences.json') && !!semantics?.sentences?.length,
    aspectRatio:source.aspectRatio || source.themeSnapshot?.aspectRatio || '16:9',
    themeSchema:themeSnapshot?.source?.schema || source.themeSchema || null,
    themeId:themeSnapshot?.themeId || source.themeId || null,
    themeHash:themeSnapshot?.themeHash || source.themeHash || null,
    visualTextLocale:source.visualTextLocale || 'zh-CN',
    audioSeconds:source.totalFrames ? source.totalFrames / source.fps : null,
    sentences:timing?.sentences?.length || 0,
    minMatch:timing?.timingSource !== 'tts-native' && timing?.sentences?.length ? Math.min(...timing.sentences.map(sentence => sentence.match)) : null,
    shots:shots?.length || 0,
    semanticReady:!!semantics?.sentences?.length && semantics.sentences.every(sentence =>
      sentence.shot && sentence.weight && Array.isArray(sentence.sem) && sentence.sem.length),
    semanticPassed, shotbook:has('SHOTBOOK.md'), preflight, preflightPassed, preflightCompleted,
    preflightIssues:preflightCompleted && Array.isArray(preflightResult.issues) && preflightResult.issues.length
      ? preflightResult.issues : (!preflightResult?.passed ? latestPreflightIssues(project) : []),
    preflightAdjustments:preflightCompleted && Array.isArray(preflightResult.adjustments) ? preflightResult.adjustments : [],
    storyboardApproved, storyboardAdjustmentPending:!!storyboardAdjustment?.request,
    workbenchReady:has('remotion/src/index.ts'),
    cardCallsRequired:source.cardCallsRequired === true, cardCallsPresent:has('qa/card-calls.json'),
    candidatesReady, sample, sampleApproved, scenesImplemented:sceneCoverage.implemented,
    scenesMissing:sceneCoverage.missing, scenesReady:sceneCoverage.ready,
    final, qaPassed, reviewPassed,
    delivery};
}

export function approveTalkcraftSample(root, runId) {
  const status = readTalkcraftStatus(root, runId);
  if (!status.preflightCompleted || !status.storyboardApproved || !status.sample) throw new Error('需先完成自动调节和分镜审核');
  const project = talkcraftProject(root, runId);
  const file = path.join(project, 'sample-approved.json');
  if (existsSync(file)) {
    if (status.sampleApproved) return {runId, approved:true};
    throw new Error('Existing sample approval is stale and was preserved');
  }
  writeFileSync(file, JSON.stringify({schema:'talkcraft-sample-approval-v1',
    sampleSha256:digest(path.join(project, 'remotion', 'out', 'preview', 's01.mp4')),
    shotbookSha256:digest(path.join(project, 'SHOTBOOK.md')),
    ...(status.cardCallsRequired ? {firstCardCallSha256:firstCardCallFingerprint(project)} : {}),
    approvedAt:new Date().toISOString()}, null, 2), 'utf8');
  return {runId, approved:true};
}

export function approveTalkcraftStoryboard(root, runId, note = '') {
  const project = talkcraftProject(root, runId);
  const inputs = storyboardInputs(project);
  if (!inputs) throw new Error('分镜脚本、语义或镜头数据不完整，暂不能审核');
  const file = path.join(project, 'qa', 'storyboard-approved.json');
  const current = existsSync(file) ? json(file) : null;
  if (current?.schema === 'talkcraft-storyboard-approval-v1' &&
      Object.keys(inputs).every(name => current.inputs?.[name] === inputs[name])) return {runId, approved:true};
  mkdirSync(path.dirname(file), {recursive:true});
  const status = readTalkcraftStatus(root, runId);
  writeFileSync(file, JSON.stringify({schema:'talkcraft-storyboard-approval-v1', runId, inputs,
    governanceNote:String(note || '').trim(), preflightPassed:status.preflightPassed,
    preflightIssues:status.preflightIssues, adjustments:status.preflightAdjustments,
    approvedAt:new Date().toISOString()}, null, 2), 'utf8');
  return {runId, approved:true};
}

export function requestTalkcraftStoryboardAdjustment(root, runId, request) {
  const project = talkcraftProject(root, runId);
  const text = String(request || '').trim();
  if (!text) throw new Error('请填写需要调整的镜头和内容');
  const inputs = storyboardInputs(project);
  if (!inputs) throw new Error('分镜脚本、语义或镜头数据不完整，暂不能提交调整');
  const file = path.join(project, 'qa', 'storyboard-adjustment-request.json');
  mkdirSync(path.dirname(file), {recursive:true});
  const approvalFile = path.join(project, 'qa', 'storyboard-approved.json');
  let invalidatedApproval = null;
  if (existsSync(approvalFile)) {
    try { invalidatedApproval = json(approvalFile); } catch {}
    unlinkSync(approvalFile);
  }
  writeFileSync(file, JSON.stringify({schema:'talkcraft-storyboard-adjustment-v1', runId,
    request:text, inputs, invalidatedApproval:invalidatedApproval ? {
      approvedAt:invalidatedApproval.approvedAt || null,
      governanceNote:invalidatedApproval.governanceNote || ''
    } : null, createdAt:new Date().toISOString()}, null, 2), 'utf8');
  return {runId, submitted:true, file};
}

export function prepareTalkcraftStoryboardRevision(root, runId) {
  const project = talkcraftProject(root, runId);
  const requestFile = path.join(project, 'qa', 'storyboard-adjustment-request.json');
  if (!existsSync(requestFile)) throw new Error('请先提交分镜调整要求');
  const backupSemantics = path.join(project, 'qa', 'semantics-before-ark.json');
  if (!existsSync(backupSemantics)) throw new Error('缺少原始语义备份，无法安全重新生成分镜');
  const revision = path.join(project, 'qa', 'storyboard-revisions', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(revision, {recursive:true});
  const files = ['SHOTBOOK.md', 'remotion/shots.json', 'semantic-decisions.json',
    'semantics.json', 'qa/ark-editorial-response.json', 'qa/preflight-result.json',
    'qa/preflight-passed.json', 'qa/semantic-passed.json', 'qa/card-candidates.json',
    'qa/card-candidates.md', 'qa/storyboard-approved.json', 'qa/storyboard-adjustment-request.json'];
  for (const name of files) {
    const source = path.join(project, name);
    if (!existsSync(source)) continue;
    const target = path.join(revision, name);
    mkdirSync(path.dirname(target), {recursive:true});
    copyFileSync(source, target);
    unlinkSync(source);
  }
  copyFileSync(backupSemantics, path.join(project, 'semantics.json'));
  return {runId, revision};
}
