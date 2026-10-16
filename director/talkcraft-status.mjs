import {acceptanceResponsibilities,assertMachineVideo,humanVisualApprovalCurrent} from './talkcraft-acceptance-policy.mjs';
import {readWordAlignment} from './talkcraft-word-alignment.mjs';
import {readScaffoldReady} from './talkcraft-scaffold-state.mjs';
import {readMediaPreflightStatus} from './talkcraft-media-preflight.mjs';
import {readParallelPreparation} from './talkcraft-parallel-preparation.mjs';
import {officialRenderCurrent} from './talkcraft-pipeline-provenance.mjs';
import {nativeSampleCurrent} from './talkcraft-sample-provenance.mjs';
import {isNativePresentation,nativeGovernanceStatus} from './talkcraft-native-governance.mjs';
import {factReviewStatus} from './talkcraft-fact-review.mjs';
import {editorialSubmissionState} from './talkcraft-editorial-submission.mjs';
import {assertTextContrastProof,wordRevealSourceBinding} from './talkcraft-word-reveal.mjs';
import {summarizeWordFailures} from './talkcraft-word-runtime-validation.mjs';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {readNativeTiming, timingHealth} from './talkcraft-native-timing.mjs';
import {assertReviewedSelection} from './talkcraft-reviewed-templates.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';

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
    .filter(entry => !existsSync(path.join(path.dirname(entry.file),'qa/integration-test.json')))
    .sort((a,b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs)[0]?.id || null;
}

function selectionInputNames(project) {
  const names=['semantics.json','SHOTBOOK.md','remotion/shots.json','qa/card-candidates.json',
    'qa/card-candidates.md','qa/reviewed-candidate-binding.json'];
  if(names.some(name=>!existsSync(path.join(project,name))))return null;
  return names;
}

function preflightInputs(project) {
  const selection=selectionInputNames(project);
  if(!selection)return null;
  const names=[...selection,'audio/timestamps.json','sources.md'];
  if (names.some(name => !existsSync(path.join(project, name)))) return null;
  if(isNativePresentation(project))for(const name of ['remotion/native-presentation.json','remotion/word-reveal-plan.json'])if(existsSync(path.join(project,name)))names.push(name);
  return Object.fromEntries(names.map(name => [name, digest(path.join(project, name))]));
}

function storyboardInputs(project) {
  const names=selectionInputNames(project);
  if(!names)return null;
  if(isNativePresentation(project))for(const name of ['remotion/native-presentation.json','remotion/word-reveal-plan.json'])if(existsSync(path.join(project,name)))names.push(name);
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

function semanticAnnotationInputs(project) {
  const inputs=semanticInputs(project);
  if(!inputs)return null;
  const doc=json(path.join(project,'semantics.json'));
  // shot is a downstream binding. Keep text, timing, annotations, exemptions
  // and every other field in the fingerprint, excluding only sentence.shot.
  const annotations={...doc,sentences:doc.sentences.map(({shot,...sentence})=>sentence)};
  return {...inputs,'semantics.json':createHash('sha256').update(JSON.stringify(annotations)).digest('hex')};
}

function firstCardCallFingerprint(project) {
  const file = path.join(project, 'qa', 'card-calls.json');
  if (!existsSync(file)) {
    const shotsFile=path.join(project,'remotion/shots.json'), formalFile=path.join(project,'qa/formal-bindings.json');
    if (!existsSync(shotsFile)||!existsSync(formalFile)||!existsSync(path.join(project,'remotion/src/scenes/s01.tsx'))) return null;
    const shot=json(shotsFile).find(s=>s.id==='s01');
    const binding=json(formalFile).bindings?.find(b=>b.shotId==='s01');
    if (!shot || binding?.shotCard!==shot.shotCard || JSON.stringify(binding.templateParams)!==JSON.stringify(shot.templateParams)) return null;
    return createHash('sha256').update(JSON.stringify({shot,binding,scene:digest(path.join(project,'remotion/src/scenes/s01.tsx'))})).digest('hex');
  }
  const record = json(file);
  const call = record.calls?.find(item => item?.shotId === 's01');
  if (!call) return null;
  const scene = call.evidence?.find(item => item?.kind === 'scene-binding');
  const candidate = call.evidence?.find(item => item?.kind === 'card-candidate');
  return createHash('sha256').update(JSON.stringify({shotId:call.shotId, cardId:call.cardId,
    implementationSha256:call.implementationSha256, props:call.props,
    sceneSha256:scene?.sha256 || null, candidateSetSha256:candidate?.candidateSetSha256 || null})).digest('hex');
}

export function talkcraftSceneCoverage(project, shots, {allowDefault = false} = {}) {
  const sceneDir = path.join(project, 'remotion', 'src', 'scenes');
  const indexFile = path.join(sceneDir, 'index.ts');
  if (allowDefault && existsSync(path.join(project, 'remotion', 'src', 'index.ts')) && Array.isArray(shots) && shots.length) {
    return {implemented:shots.length, missing:[], ready:true, defaultScenes:true};
  }
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
    annotationInputs:semanticAnnotationInputs(project),
    passedAt:new Date().toISOString()}, null, 2), 'utf8');
  return {project, file};
}

export function recordPreflightPass(root, runId) {
  const project = talkcraftProject(root, runId);
  assertReviewedSelection(project,{skillRoot:resolveTalkcraftSkillRoot(root)});
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

export function recordPlanningResult(root,runId,{passed,issues=[],adjustments=[]}={}) {
  const project=talkcraftProject(root,runId);
  assertReviewedSelection(project,{skillRoot:resolveTalkcraftSkillRoot(root)});
  const inputs=preflightInputs(project);
  if(!inputs)throw Error('分镜规划输入不完整');
  mkdirSync(path.join(project,'qa'),{recursive:true});
  writeFileSync(path.join(project,'qa/planning-result.json'),JSON.stringify({schema:'talkcraft-planning-result-v1',
    inputs,passed:passed===true,issues,adjustments,checkedAt:new Date().toISOString()},null,2));
  return {passed:passed===true,issues,adjustments};
}

export function readTalkcraftStatus(root, runId) {
  const project = talkcraftProject(root, runId);
  const has = name => existsSync(path.join(project, name));
  const source = json(path.join(project, 'source-run.json'));
  const digitalHuman = readTalkcraftDigitalHumanStatus(project);
  const themeSnapshot = has('theme.json') ? json(path.join(project, 'theme.json')) : null;
  const timing = has('audio/timestamps.json') ? json(path.join(project, 'audio', 'timestamps.json')) : null;
  const canRecoverAlignment=timing?.timingSource!=='tts-native'&&has('audio/full.mp3')&&Array.isArray(timing?.sentences)&&timing.sentences.length>0&&timing.sentences.every(s=>s.words?.length)&&timing.sentences.some(s=>s.ok!==true||s.match<.9);
  let canRecoverTiming = false;
  if (!timingHealth(timing).sentenceTimingReady) {
    try { canRecoverTiming = !!readNativeTiming(project); } catch {}
  }
  const shots = has('remotion/shots.json') ? json(path.join(project, 'remotion', 'shots.json')) : null;
  const cardCallsRequired = source.cardCallsRequired === true &&
    (source.aspectRatio || source.themeSnapshot?.aspectRatio || '16:9') === '16:9';
  // 正式成片必须有逐镜场景实现；不能因为竖屏或未启用卡调用就把默认占位场景算作已完成。
  const sceneCoverage = talkcraftSceneCoverage(project, shots, {allowDefault:false});
  const semantics = has('semantics.json') ? json(path.join(project, 'semantics.json')) : null;
  const semanticHashes = semanticInputs(project);
  const semanticGate = has('qa/semantic-passed.json') ? json(path.join(project, 'qa', 'semantic-passed.json')) : null;
  const annotationHashes=semanticGate?.annotationInputs?semanticAnnotationInputs(project):null;
  const currentSemanticHashes=annotationHashes||semanticHashes;
  const passedSemanticHashes=annotationHashes?semanticGate.annotationInputs:semanticGate?.inputs;
  const semanticPassed = !!currentSemanticHashes && semanticGate?.schema === 'talkcraft-semantic-pass-v1' &&
    Object.keys(currentSemanticHashes).every(name => passedSemanticHashes?.[name] === currentSemanticHashes[name]);
  const inputs = preflightInputs(project);
  const gate = has('qa/preflight-passed.json') ? json(path.join(project, 'qa', 'preflight-passed.json')) : null;
  const priorPreflight = !!inputs && gate?.schema === 'talkcraft-preflight-pass-v1' &&
    Object.keys(inputs).every(name => gate.inputs?.[name] === inputs[name]);
  const preflightResult = has('qa/preflight-result.json') ? json(path.join(project, 'qa', 'preflight-result.json')) : null;
  const preflightCompleted = !!inputs && preflightResult?.schema === 'talkcraft-preflight-result-v1' &&
    Object.keys(inputs).every(name => preflightResult.inputs?.[name] === inputs[name]);
  // 同一组输入后来检查失败时，旧通过文件不能覆盖最新失败结果。
  const preflight = priorPreflight && !(preflightCompleted && preflightResult.passed !== true);
  const nativeGovernance=nativeGovernanceStatus(project);
  const factReview=factReviewStatus(project);
  const mediaStatus=readMediaPreflightStatus(project);
  const planningResult=has('qa/planning-result.json')?json(path.join(project,'qa/planning-result.json')):null;
  const planningCompleted=!!inputs&&planningResult?.schema==='talkcraft-planning-result-v1'&&Object.keys(inputs).every(name=>planningResult.inputs?.[name]===inputs[name]);
  const planningPassed=planningCompleted&&planningResult.passed===true&&nativeGovernance.passed&&factReview.passed;
  const preflightPassed = (preflightCompleted ? preflightResult.passed === true : preflight)&&nativeGovernance.passed&&factReview.passed&&
    (!(mediaStatus.digitalHumanGenerationPlanned||source.workflowPath==='recorded-host')||mediaStatus.mediaPreflightPassed);
  const storyboardGate = has('qa/storyboard-approved.json') ? json(path.join(project, 'qa/storyboard-approved.json')) : null;
  const storyboardAdjustment = has('qa/storyboard-adjustment-request.json') ? json(path.join(project, 'qa/storyboard-adjustment-request.json')) : null;
  const storyboardApprovalInputs = storyboardInputs(project);
  const storyboardApproved = !!storyboardApprovalInputs && storyboardGate?.schema === 'talkcraft-storyboard-approval-v1' &&
    Object.keys(storyboardApprovalInputs).every(name => storyboardGate.inputs?.[name] === storyboardApprovalInputs[name]);
  const sampleFile = path.join(project, 'remotion', 'out', 'preview', 's01.mp4');
  const sample = existsSync(sampleFile) && statSync(sampleFile).size > 0 && nativeSampleCurrent(project);
  const approval = has('sample-approved.json') ? json(path.join(project, 'sample-approved.json')) : null;
  const firstCardCallSha256 = cardCallsRequired ? firstCardCallFingerprint(project) : null;
  const sampleApproved = sample && preflightPassed && preflightCompleted && storyboardApproved && approval?.schema === 'talkcraft-sample-approval-v1' &&
    approval.sampleSha256 === digest(sampleFile) && approval.shotbookSha256 === inputs['SHOTBOOK.md'] &&
    (!cardCallsRequired || (!!firstCardCallSha256 && approval.firstCardCallSha256 === firstCardCallSha256));
  const finalFile = path.join(project, 'remotion', 'out', 'final.mp4');
  const governedFiles = has('remotion/out') ? readdirSync(path.join(project, 'remotion', 'out'))
    .filter(name => /^final-governed-v\d+\.mp4$/u.test(name))
    .sort((a, b) => Number(b.match(/v(\d+)\.mp4$/u)?.[1] || 0) - Number(a.match(/v(\d+)\.mp4$/u)?.[1] || 0)) : [];
  const governedFile = governedFiles[0] ? path.join(project, 'remotion', 'out', governedFiles[0]) : null;
  const governedVersion=governedFiles[0]?.match(/v(\d+)\.mp4$/u)?.[1];
  const governedQa = governedVersion&&has(`qa/governed-v${governedVersion}-qa.json`) ? json(path.join(project, 'qa', `governed-v${governedVersion}-qa.json`)) : null;
  const activeFinalFile = governedFile && statSync(governedFile).size > 0 ? governedFile : finalFile;
  const final = existsSync(activeFinalFile) && statSync(activeFinalFile).size > 0 &&
    (source.mode !== 'B' || (activeFinalFile === finalFile && officialRenderCurrent(project)));
  const qa = final && has('qa/passed.json') ? json(path.join(project, 'qa', 'passed.json')) : null;
  const legacyQaPassed = !!qa && activeFinalFile === finalFile && qa.finalSha256 === digest(finalFile);
  const governedQaPassed = !!governedQa && governedQa.schema === 'talkcraft-governed-qa-v1' &&
    governedQa.finalSha256 === digest(activeFinalFile) && governedQa.checks?.fullDecode === true &&
    governedQa.checks?.segmentFrameAssertions === true;
  let nativeRuntimePassed=false;
  if((!nativeGovernance.required||nativeGovernance.passed)&&final)try{assertMachineVideo(project,activeFinalFile);nativeRuntimePassed=true;}catch{}
  const qaPassed = (legacyQaPassed || governedQaPassed)&&factReview.passed&&nativeRuntimePassed;
  const review = qaPassed && has('review/approval.json') ? json(path.join(project, 'review', 'approval.json')) : null;
  const reviewPassed = !!review && humanVisualApprovalCurrent(review,digest(activeFinalFile),shots?.length);
  const deliveryFile = path.join(project, 'remotion', 'out', 'delivery.mp4');
  const delivery = reviewPassed && existsSync(deliveryFile) && statSync(deliveryFile).size > 0;
  const candidatesFile = path.join(project, 'qa', 'card-candidates.json');
  const candidatesReport = path.join(project, 'qa', 'card-candidates.md');
  const candidatesBinding = path.join(project, 'qa', 'reviewed-candidate-binding.json');
  const candidatesCompleted = [candidatesFile,candidatesReport,candidatesBinding].every(file=>existsSync(file)&&statSync(file).size>0);
  let candidatesReady=false,candidateIssues=[];
  if(candidatesCompleted)try {
    assertReviewedSelection(project,{skillRoot:resolveTalkcraftSkillRoot(root)});
    candidatesReady=true;
  } catch(error) {candidateIssues=String(error.message||error).split(/\r?\n/u).filter(Boolean);}  const wordRuntimeFile=path.join(project,'qa/word-reveal-runtime.json');
  let wordRuntimeAudit=null;
  try{if(existsSync(wordRuntimeFile)){
    const r=json(wordRuntimeFile);
    if(r.schema==='talkcraft-word-runtime-v2'&&r.native===true&&r.scope==null&&Array.isArray(r.failures)){
      const currentSource=JSON.stringify(r.binding)===JSON.stringify(wordRevealSourceBinding(project));
      wordRuntimeAudit={recorded:currentSource,currentSource,passed:currentSource&&r.passed===true,failures:r.failures.length,
        failedChecks:summarizeWordFailures(r.failures,r.rows),
        scope:'historical-visual-diagnostic',blocking:false,requiresRecheck:!currentSource||r.passed!==true};
    }
  }}catch{}
  let textContrastAudit=null;
  try {
    const proof=assertTextContrastProof(project);
    textContrastAudit={passed:true,currentSource:true,blocking:false,scope:'full',completedAt:statSync(path.join(project,'qa/text-contrast-runtime.json')).mtimeMs};
  } catch {} // Partial, failed or stale evidence never resolves a full-film failure.
  return {runId, sourceRunId:source.sourceRunId || null, voice:source.voice || null,voiceMode:source.voiceMode||'standard',voiceEngine:source.voiceEngine||null,canRecoverAlignment,digitalHuman,
    ...timingHealth(timing), wordTimingReady:timingHealth(timing).wordTimingReady || (()=>{try{return !!readWordAlignment(project);}catch{return false;}})(), canRecoverTiming,
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
    semanticPassed, ...mediaStatus, parallelPreparation:readParallelPreparation(project), workflowPath:source.workflowPath||(mediaStatus.digitalHumanGenerationPlanned?'planned-runninghub':'legacy'),
    planningPassed,planningCompleted,planningIssues:planningCompleted?planningResult.issues:[],
    editorialResponseSaved:has('qa/ark-editorial-response.json'),
    shotbook:has('SHOTBOOK.md'), preflight:preflightPassed, preflightPassed, preflightCompleted,
    nativeGovernance,factReview,wordRuntimeAudit,textContrastAudit,acceptance:acceptanceResponsibilities,editorialSubmission:editorialSubmissionState(project),
    preflightIssues:[...(preflightCompleted&&Array.isArray(preflightResult.issues)?preflightResult.issues:[]),...nativeGovernance.issues.map(i=>`${i.shotId||'全局'}：[${i.code}] ${i.message}`),...factReview.issues],
    preflightAdjustments:preflightCompleted && Array.isArray(preflightResult.adjustments) ? preflightResult.adjustments : [],
    storyboardApproved, storyboardAdjustmentPending:!!storyboardAdjustment?.request &&
      !(storyboardApproved && storyboardGate.resolvedAdjustmentSha256 === digest(path.join(project,'qa/storyboard-adjustment-request.json'))),
    workbenchReady:has('remotion/src/index.ts'),
    scaffoldReady:readScaffoldReady(project,{legacyReady:sceneCoverage.ready&&has('remotion/src/index.ts')}),
    cardCallsRequired, configuredCardCallsRequired:source.cardCallsRequired === true,
    cardCallsPresent:has('qa/card-calls.json'),
    candidatesCompleted,candidatesReady,candidateIssues, sample, sampleApproved, scenesImplemented:sceneCoverage.implemented,
    scenesMissing:sceneCoverage.missing, scenesReady:sceneCoverage.ready,
    final, finalArtifact:final ? path.relative(project, activeFinalFile).replaceAll('\\', '/') : null,
    qaPassed, governedQaPassed, reviewPassed,finalSha256:final?digest(activeFinalFile):null,
    delivery};
}

export function approveTalkcraftSample(root, runId, {method,policy} = {}) {
  const status = readTalkcraftStatus(root, runId);
  if (!status.preflightPassed || !status.storyboardApproved || !status.sample) throw new Error('需先完成自动调节和分镜审核');
  const project = talkcraftProject(root, runId);
  const file = path.join(project, 'sample-approved.json');
  if (existsSync(file)) {
    if (status.sampleApproved) return {runId, approved:true};
    const versions=path.join(project,'qa/sample-approval-versions');
    mkdirSync(versions,{recursive:true});
    copyFileSync(file,path.join(versions,`sample-approved-${Date.now()}.json`));
  }
  writeFileSync(file, JSON.stringify({schema:'talkcraft-sample-approval-v1',
    sampleSha256:digest(path.join(project, 'remotion', 'out', 'preview', 's01.mp4')),
    shotbookSha256:digest(path.join(project, 'SHOTBOOK.md')),
    ...(status.cardCallsRequired ? {firstCardCallSha256:firstCardCallFingerprint(project)} : {}),
    approvedAt:new Date().toISOString(),...(method?{method}:{}),...(policy?{policy}:{})}, null, 2), 'utf8');
  return {runId, approved:true};
}

export function approveTalkcraftFinal(root,runId,{finalSha256}={}) {
  const status=readTalkcraftStatus(root,runId);
  if(!status.final||!status.qaPassed)throw Error('请先完成当前成片的机器规则检查');
  if(!finalSha256||finalSha256!==status.finalSha256)throw Error('成片版本已变化，请重新查看后确认');
  const project=talkcraftProject(root,runId),dir=path.join(project,'review');
  mkdirSync(dir,{recursive:true});
  const approval={schema:'talkcraft-human-approval-v1',reviewerType:'human',approved:true,
    method:'explicit-user-confirmation',finalSha256,reviewedShots:json(path.join(project,'remotion/shots.json')).length,
    openP0:0,openP1:0,approvedAt:new Date().toISOString()};
  for(const name of ['approval.json','REVIEW.md'])if(existsSync(path.join(dir,name))){
    const history=path.join(dir,'history');mkdirSync(history,{recursive:true});
    copyFileSync(path.join(dir,name),path.join(history,Date.now()+'-'+name));
  }
  writeFileSync(path.join(dir,'REVIEW.md'),`# 人工视觉审核\n\n## 评审完成 · 已看 ${approval.reviewedShots}/${approval.reviewedShots} 镜\n\n用户明确确认当前版本；机器未判定画面视觉效果。\n\nSHA-256: ${finalSha256}\n`);
  writeFileSync(path.join(dir,'approval.json'),JSON.stringify(approval,null,2));
  return {runId,approved:true,finalSha256};
}

export function approveTalkcraftStoryboard(root, runId, note = '') {
  const project = talkcraftProject(root, runId);
  const inputs = storyboardInputs(project);
  if (!inputs) throw new Error('分镜脚本、语义或镜头数据不完整，暂不能审核');
  const file = path.join(project, 'qa', 'storyboard-approved.json');
  const current = existsSync(file) ? json(file) : null;
  const adjustmentFile=path.join(project,'qa/storyboard-adjustment-request.json');
  const adjustmentHash=existsSync(adjustmentFile)?digest(adjustmentFile):null;
  if (current?.schema === 'talkcraft-storyboard-approval-v1' &&
      Object.keys(inputs).every(name => current.inputs?.[name] === inputs[name]) &&
      (current.resolvedAdjustmentSha256 || null) === adjustmentHash) return {runId, approved:true};
  mkdirSync(path.dirname(file), {recursive:true});
  const status = readTalkcraftStatus(root, runId);
  if (!(status.digitalHumanGenerationPlanned?status.planningPassed:status.preflightPassed)) throw new Error('分镜规划校验或原版预检尚未通过，不能用审核绕过制作门禁');
  writeFileSync(file, JSON.stringify({schema:'talkcraft-storyboard-approval-v1', runId, inputs,
    governanceNote:String(note || '').trim(), preflightPassed:status.preflightPassed,
    approvalScope:status.digitalHumanGenerationPlanned?'storyboard-planning':'upstream-preflight',planningPassed:status.planningPassed,
    ...(adjustmentHash?{resolvedAdjustmentSha256:adjustmentHash}:{}),
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
    'qa/ark-editorial-response-before-repairs.json', 'qa/ark-design-repairs.json',
    'qa/ark-proposal-audit.json', 'qa/ark-template-design-validation.json',
    'qa/native-editorial-plan.json', 'remotion/native-presentation.json',
    'remotion/word-reveal-plan.json',
    'qa/preflight-passed.json', 'qa/semantic-passed.json', 'qa/card-candidates.json',
    'qa/card-candidates.md', 'qa/storyboard-approved.json', 'qa/storyboard-adjustment-request.json',
    'sample-approved.json', 'remotion/out/preview/s01.mp4', 'remotion/out/sample-2m.mp4'];
  for (const name of files) {
    const source = path.join(project, name);
    if (!existsSync(source)) continue;
    const target = path.join(revision, name);
    mkdirSync(path.dirname(target), {recursive:true});
    copyFileSync(source, target);
    // The next editorial call reads this exact request from the active run.
    // Archive its evidence without dropping the instructions before that call.
    if (name !== 'qa/storyboard-adjustment-request.json') unlinkSync(source);
  }
  copyFileSync(backupSemantics, path.join(project, 'semantics.json'));
  return {runId, revision};
}
