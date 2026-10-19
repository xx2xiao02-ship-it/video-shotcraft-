import {installPresentationCorrections} from './talkcraft-presentation-correction.mjs';
import {syncShotbookMaterials} from './talkcraft-shotbook-materials.mjs';
import {ACCEPTANCE_POLICY,assertMachineTextRules,bindMachineVideo,assertMachineVideo,inspectTechnicalMedia,queueHumanVisualReview,humanVisualApprovalCurrent} from './talkcraft-acceptance-policy.mjs';
import {auditReviewedTemplates,enforceReviewedTemplateStage,prepareReviewedCandidates,recordReviewedCandidates,assertReviewedSelection,recordCandidateComparison} from './talkcraft-reviewed-templates.mjs';
import {alignExistingVoice,recoverExistingAlignment} from './talkcraft-word-alignment.mjs';
import {trackTalkcraftExecution} from './talkcraft-execution.mjs';
import {recordScaffoldResult} from './talkcraft-scaffold-state.mjs';
import {runMediaPreflight} from './talkcraft-media-preflight.mjs';
import {assertTalkcraftDigitalHumanAdmission} from './talkcraft-digital-human-admission.mjs';
import {planTalkcraftDigitalHuman} from './talkcraft-digital-human-plan.mjs';
import {prepareRecordedHost,bindRecordedHostShots} from './talkcraft-host-input.mjs';
import {assertPipelineProvenance,recordOfficialRender,officialRenderCurrent} from './talkcraft-pipeline-provenance.mjs';
import {assertTalkcraftVoiceOutput} from './talkcraft-voice-contract.mjs';
import {preservePreviousSample,recordSampleRender} from './talkcraft-sample-provenance.mjs';
import {recordShotPreviews} from './talkcraft-shot-preview.mjs';
import {installHostContextRuntime} from './talkcraft-host-context-install.mjs';
import {readWordAlignment} from './talkcraft-word-alignment.mjs';
import {planNativeCueLevelRepair} from './talkcraft-cue-level-repair.mjs';
import {alignNativeShotBoundaries,prepareNativeProduction,installNativeCues} from './talkcraft-native-preparation.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {useAlignedTiming} from './talkcraft-project.mjs';
import {readNativeTiming, writeNativeTiming, requireRenderTiming,wordTimingFile} from './talkcraft-native-timing.mjs';
import {applySemanticDecisions} from './talkcraft-semantic-decisions.mjs';
import {runTalkcraftSemanticCheck} from './talkcraft-semantic-check.mjs';
import {auditEditorialMaterialContract} from './talkcraft-editorial-material-contract.mjs';
import {saveCandidateMaterialRepairFeedback,savePlanningEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {scaffoldTalkcraftProject,implementNativeScenes} from './talkcraft-scaffold.mjs';
import {talkcraftProject,recordPreflightPass, recordPreflightResult, recordPlanningResult, recordSemanticPass, readTalkcraftStatus} from './talkcraft-status.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {writeTalkcraftQaManifests} from './talkcraft-qa-manifests.mjs';
import {completeVolcengineTiming} from './volcengine-voice.mjs';
import {talkcraftMusicProps} from './background-music.mjs';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {writeTalkcraftTemplateUsage} from './talkcraft-template-usage.mjs';
import {compileWordReveals,applyWordRevealTiming,installWordRevealRuntime} from './talkcraft-word-reveal.mjs';
import {checkNativeGovernance,isNativePresentation} from './talkcraft-native-governance.mjs';
import {factReviewStatus} from './talkcraft-fact-review.mjs';
import {installBackgroundVisibility} from './talkcraft-background-visibility.mjs';
import {pythonExecutable,pythonEnvironment,requireChineseAlignmentSupport} from './portable-runtime.mjs';
import {cleanupTalkcraftRenderTemp,ensureTalkcraftRenderRuntime,talkcraftRenderEnvironment} from './talkcraft-render-runtime.mjs';
import {recordPlanningWordCheck} from './talkcraft-native-word-window.mjs';
import {assertParallelPreparationJoined,createPreparedTalkcraftResolver} from './talkcraft-parallel-preparation.mjs';
import {renderConcurrency} from './render-runtime.mjs';
import {assertTalkcraftCardCallsBound, assertTalkcraftCardCallsQaEvidence,
  talkcraftCardCallsQaEvidence} from './talkcraft-card-calls.mjs';
import {loadMaterialIndex, matchSceneVideos} from './b-mode-material-match.mjs';
import {auditMaterialResearch} from './talkcraft-material-research.mjs';
import {prepareResearchBindings} from './talkcraft-research-binding.mjs';
import {executeInstitutionSourceRepair} from './talkcraft-institution-source-repair.mjs';
import {assertBModeGoverned} from './talkcraft-b-mode-governance.mjs';
import {normalizeTalkcraftBindings, syncTalkcraftShotSource} from './talkcraft-binding.mjs';
import {allocateTemplateMaterials} from './talkcraft-template-materials.mjs';
import {completeTalkcraftNodeInputs,completeTalkcraftPreflightNode} from './talkcraft-node-completion.mjs';
import {prepareTalkcraftParallel} from './talkcraft-parallel-preparation.mjs';
import {approveDelegatedTalkcraftStoryboard} from './talkcraft-continuation-policy.mjs';

export function preserveStaleFinalArtifacts(project,{isCurrent=officialRenderCurrent,now=Date.now}={}) {
  const finalFile=path.join(project,'remotion','out','final.mp4');
  if(!existsSync(finalFile))return null;
  if(isCurrent(project))throw new Error('Existing final render was preserved');
  const archive=path.join(project,'qa','render-history',String(now()));
  const files=[
    ['remotion/out/final.mp4','final.mp4'],
    ['remotion/out/final-template-usage.json','final-template-usage.json'],
    ['qa/official-render.json','official-render.json'],
    ['qa/passed.json','passed.json'],
    ['review/approval.json','review-approval.json'],
    ['remotion/out/delivery.mp4','delivery.mp4'],
  ];
  mkdirSync(archive,{recursive:true});
  for(const [source,name] of files){
    const file=path.join(project,...source.split('/'));
    if(existsSync(file))renameSync(file,path.join(archive,name));
  }
  writeFileSync(path.join(archive,'archive.json'),JSON.stringify({
    schema:'talkcraft-stale-render-archive-v1',reason:'render_inputs_changed',archivedAt:new Date().toISOString(),
    files:files.map(([,name])=>name).filter(name=>existsSync(path.join(archive,name))),
  },null,2));
  return archive;
}
import {allocateUniqueBackgrounds} from './talkcraft-background-allocation.mjs';
import {assertExclusiveBackgrounds} from './talkcraft-background-exclusivity.mjs';
import {assertTalkcraftTemplateGovernance, governedOriginalDurationSec, isOpeningShot, isOpeningTemplateEligible, OPENING_MAX_TEMPLATE_SEC} from './talkcraft-template-governance.mjs';
import {assertTalkcraftRuntimeFidelity} from './talkcraft-runtime-fidelity.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {assertTalkcraftRenderDiskSpace} from './storage-governance.mjs';
import {prepareSfxSoloProject,preserveStaleSfxSolo,sfxSoloCurrent,assertAudioPassSegments} from './talkcraft-sfx-solo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = resolveTalkcraftSkillRoot(ROOT);
const PYTHON = pythonExecutable();
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const RENDER_STAGES = new Set(['text-binding','sample-qa','render-qa','sample','sample-2m','render-all','render-sfx-solo','qa','word-reveal-qa','text-contrast']);
let renderStageDepth = 0;
let renderStageProject = null;

function talkcraftRenderParallel() {
  return renderConcurrency({
    requested: process.env.SHOTCRAFT_TALKCRAFT_PARALLEL || 'auto',
    maxConcurrency: process.env.SHOTCRAFT_RENDER_MAX_CONCURRENCY || 8,
  });
}

function script(name) {
  const file = path.join(SKILL, 'scripts', name);
  if (!existsSync(file)) throw new Error(`TalkCraft skill script is missing: ${file}`);
  return file;
}

function run(command, args, cwd) {
  execFileSync(command, args, {cwd, stdio:'inherit', env:{...pythonEnvironment(), PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1',
    NODE_PATH:[path.join(SKILL, 'runtime', 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    }});
}

function checkTextBindings(project,runId,{only}={}){
  runTalkcraftStage('word-reveal',runId);
  return assertMachineTextRules(project,{only});
}

function requireFiles(project, names) {
  const missing = names.filter(name => !existsSync(path.join(project, name)));
  if (missing.length) throw new Error(`TalkCraft artifacts are missing: ${missing.join(', ')}`);
}

function filterOpeningShortTemplateCandidates(project, catalog) {
  const candidateFile = path.join(project, 'qa', 'card-candidates.json');
  const shotsFile = path.join(project, 'remotion', 'shots.json');
  if (!existsSync(candidateFile) || !existsSync(shotsFile)) return null;
  const candidates = JSON.parse(readFileSync(candidateFile, 'utf8'));
  const shots = JSON.parse(readFileSync(shotsFile, 'utf8')) || [];
  const report = [];
  const openingShortPool = catalog.cards
    .filter(card => isOpeningTemplateEligible(card.cardId, catalog))
    .map(card => ({slug:card.cardId, originalDurationSec:governedOriginalDurationSec(card.cardId, catalog)}));
  for (const shot of shots) {
    if (!isOpeningShot(shot)) continue;
    const entry = candidates[String(shot.id)] || candidates[String(shot.id).toLowerCase()];
    if (!entry?.candidates || typeof entry.candidates !== 'object') continue;
    for (const [semantic, options] of Object.entries(entry.candidates)) {
      if (!Array.isArray(options)) continue;
      const kept = [];
      for (const option of options) {
        const cardId = option?.slug;
        const durationSec = governedOriginalDurationSec(cardId, catalog);
        if (isOpeningTemplateEligible(cardId, catalog)) kept.push(option);
        else report.push({shotId:shot.id, semantic, slug:cardId, originalDurationSec:durationSec,
          reason:`开场原始完整时长必须不超过 ${OPENING_MAX_TEMPLATE_SEC} 秒`});
      }
      entry.candidates[semantic] = kept;
    }
    // Short duration is an extra eligibility constraint, never a semantic candidate.
    delete entry.candidates['开场短模板'];
  }
  const out = path.join(project, 'qa', 'opening-short-candidate-filter.json');
  writeFileSync(out, JSON.stringify({schema:'talkcraft-opening-short-candidate-filter-v1',policy:{windowSec:8,maxOriginalDurationSec:OPENING_MAX_TEMPLATE_SEC,comparison:'<=',providerCalls:{max:null,scope:'候选生成与重新编导不受调用次数限制',transportRetry:'bounded'}},shortPool:openingShortPool,removed:report}, null, 2), 'utf8');
  writeFileSync(candidateFile, JSON.stringify(candidates, null, 2), 'utf8');
  const markdownFile = path.join(project, 'qa', 'card-candidates.md');
  if (existsSync(markdownFile)) {
    const original = readFileSync(markdownFile, 'utf8').replace(/\n## 开场短模板准入过滤[\s\S]*$/u, '');
    const lines = report.map(item => `- ${item.shotId} / ${item.semantic} / ${item.slug}：原始 ${item.originalDurationSec == null ? '未知' : `${item.originalDurationSec.toFixed(3)} 秒`}，已排除（必须 <= ${OPENING_MAX_TEMPLATE_SEC} 秒）`);
    const shortCards = openingShortPool.map(card => `- ${card.slug}：原始 ${card.originalDurationSec.toFixed(3)} 秒，仅具备短卡资格；不代表语义匹配`);
    writeFileSync(markdownFile, `${original.trimEnd()}\n\n## 开场短模板准入过滤\n\n- 适用窗口：前 8 秒\n- 准入条件：治理目录原始完整时长不超过 ${OPENING_MAX_TEMPLATE_SEC} 秒；不允许截断或加速\n- 火山 API 调用次数不作为候选准入限制；传输失败重试仍保持受控，避免无限循环\n- 独立短模板池：\n${shortCards.join('\n')}\n- 被过滤候选：\n${lines.length ? lines.join('\n') : '- 没有被过滤的候选'}\n`, 'utf8');
  }
  return {file:out, removed:report.length};
}

export function assertTalkcraftPreflightResult(result) {
  if (result?.passed === true) return result;
  const issues = Array.isArray(result?.issues) ? result.issues.filter(Boolean) : [];
  throw new Error(`自动调节尚未通过，不能继续生成或渲染：${issues.length ? issues.join('；') : '缺少明确的预检通过结果'}`);
}

function requirePreflight(runId) {
  // Render stages synchronously re-run the original complete gate. Only the
  // top-level 09 entry owns asynchronous binding completion and join recovery.
  return assertTalkcraftPreflightResult(runTrackedTalkcraftStage('preflight', runId));
}

export function runTalkcraftBeatLint(project, {skillRoot = SKILL, python = PYTHON} = {}) {
  requireFiles(project, ['remotion/beats.json', 'remotion/shots.json', 'audio/timestamps.json']);
  const beats = JSON.parse(readFileSync(path.join(project, 'remotion/beats.json'), 'utf8'));
  const shots = JSON.parse(readFileSync(path.join(project, 'remotion/shots.json'), 'utf8'));
  if (!Array.isArray(beats) || !beats.length) throw new Error('缺少可核验的画面词锚节拍，不能跳过节拍检查');
  if (!Array.isArray(shots) || !shots.length) throw new Error('缺少节拍对应的镜头时间轴');
  for (const beat of beats) {
    if (!Number.isFinite(beat?.t) || typeof beat.anchor !== 'string' || !beat.anchor.trim() ||
        !shots.some(shot => Number(shot.start) <= beat.t && beat.t < Number(shot.end))) {
      throw new Error('节拍必须有真实词锚、以秒为单位的时刻，并落在镜头时间轴内');
    }
  }
  const file = path.join(skillRoot, 'scripts', 'beat_lint.py');
  if (!existsSync(file)) throw new Error(`TalkCraft skill script is missing: ${file}`);
  const evidence = readWordAlignment(project) ? 'audio/word-timestamps.json' : 'audio/timestamps.json';
  const args = [file, 'remotion/beats.json', evidence, '--shots', 'remotion/shots.json'];
  if (existsSync(path.join(project, 'remotion/anchors.json'))) args.push('--anchors', 'remotion/anchors.json');
  run(python, args, project);
  return {project, status:'beat_lint_passed'};
}

function assertRenderableStoryboard(project, status) {
  const scenesFile = path.join(project, 'remotion', 'src', 'scenes', 'index.ts');
  const scenesSource = existsSync(scenesFile) ? readFileSync(scenesFile, 'utf8') : '';
  // 子镜头 ID（如 s02b）必须保持独立；旧表达式只取到 s02，
  // 会把 s02 与 s02b 合并，导致完整工程被误判为少一个场景。
  const implemented = new Set([...scenesSource.matchAll(/(?:['"])?(s\d{2,}[a-z0-9_']*)(?:['"])?\s*:/giu)].map(match => match[1].toLowerCase()));
  const missing = (status.scenesMissing || []).map(id => id.toLowerCase());
  const cardsFile = path.join(project, 'remotion', 'cards-used.json');
  let cards = null;
  try { cards = JSON.parse(readFileSync(cardsFile, 'utf8')); } catch {}
  const emptyCards = cards?.byShot
    ? Object.entries(cards.byShot).filter(([, values]) => !Array.isArray(values) || values.length === 0).map(([id]) => id)
    : [];
  const shotbook = existsSync(path.join(project, 'SHOTBOOK.md')) ? readFileSync(path.join(project, 'SHOTBOOK.md'), 'utf8') : '';
  // 只审查真实镜头段落。顶部状态和“未完成清单”是治理记录，不能在
  // 正式模板与场景已经落地后把历史占位误当成整片渲染阻断。
  const shotSections = shotbook.split(/^##\s+/mu).slice(1)
    .filter(section => /^s\d{2,}[A-Za-z0-9_']*\b/iu.test(section));
  const unresolved = shotSections.some(section => /待候选生成后审核|待精确定位与核验|尚待核验|素材、选卡与节拍尚待核验/giu.test(section));
  if (implemented.size < Number(status.shots || 0) || missing.length || emptyCards.length || unresolved) {
    const details = [
      missing.length ? `未实现镜头：${missing.join(', ')}` : null,
      emptyCards.length ? `未绑定镜头卡：${emptyCards.join(', ')}` : null,
      implemented.size < Number(status.shots || 0) ? `仅实现 ${implemented.size}/${status.shots} 个场景` : null,
      unresolved ? 'SHOTBOOK 仍包含待核验项' : null,
    ].filter(Boolean).join('；');
    throw new Error(`分镜尚未具备可渲染条件，已拦截整片渲染。${details}`);
  }
}

function localBrowserArgs() {
  const configured = process.env.TALKCRAFT_BROWSER;
  const candidates = [configured,
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Bin', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  const browser = candidates.find(file => existsSync(file));
  return browser ? ['--browser', browser] : [];
}

function autoAdjustShotbook(project) {
  const file = path.join(project, 'SHOTBOOK.md');
  if (!existsSync(file)) return [];
  const original = readFileSync(file, 'utf8');
  const lines = original.split(/\r?\n/);
  const adjustments = [];
  let inShot = false;
  let hasMedia = false;
  let hasSkin = false;
  let shotId = '';
  const currentShots = (() => {
    const shotsFile = path.join(project, 'remotion', 'shots.json');
    if (!existsSync(shotsFile)) return [];
    try { return JSON.parse(readFileSync(shotsFile, 'utf8')); } catch { return []; }
  })();
  const nativeSceneReady = existsSync(path.join(project, 'remotion', 'src', 'scenes', 'scene-shared.tsx'));
  const autoMedia = new Map(currentShots.map(shot=>{
    const p=shot.templateParams || {};
    const media=p.materialSrc && existsSync(path.join(project,'remotion/public',p.materialSrc))
      ? (/\.(png|jpe?g|webp)$/iu.test(p.materialSrc)?'图':'V')+'(remotion/public/'+p.materialSrc+')' : '文';
    return [shot.id.toLowerCase(),media];
  }));
  const out = [];
  const flush = () => {
    if (!inShot) return;
    if (!hasMedia) {
      out.push(`- 素材：${autoMedia.get(shotId.toLowerCase()) || '文'}`);
      adjustments.push(`${shotId}：补齐素材类型`);
    }
    if (!hasSkin) {
      out.push('- 蒙皮：待候选生成后自动选择');
      adjustments.push(`${shotId}：补齐蒙皮行`);
    }
  };
  for (const line of lines) {
    if (/^#{2,4}\s+[SsVv]\d+[A-Za-z0-9_']*\b/.test(line)) {
      flush(); inShot = true; hasMedia = false; hasSkin = false;
      shotId = line.match(/^#{2,4}\s+([SsVv]\d+[A-Za-z0-9_']*)\b/)?.[1] || '';
    }
    if (inShot && /^\s*[-*]?\s*\**素材\**\s*[:：]/.test(line)) {
      hasMedia = true;
      if ((!nativeSceneReady && /\bV\s*\(/.test(line) && /\s/.test(line)) || /待采集|待核验|待人工审核|待补|TBD/i.test(line)) {
        out.push(`- 素材：${autoMedia.get(shotId.toLowerCase()) || '文'}`);
        adjustments.push(`${shotId}：将未完成素材占位改为明确素材类型`);
        continue;
      }
    }
    if (inShot && /^\s*[-*]?\s*\**蒙皮(?:行)?\**\s*[:：]/.test(line) && !/待候选生成后自动选择|待实现|待人工审核/.test(line)) hasSkin = true;
    if (inShot && /^#{1,6}\s/.test(line) && !/^#{2,4}\s+[SsVv]\d+/.test(line)) flush(), inShot = false;
    out.push(line);
  }
  flush();
  if (!out.some(line => /^#{2,4}\s+.*未完成/.test(line)) && !out.some(line => /^#{2,4}\s+自动治理记录/.test(line))) {
    out.push('', '## 未完成 / 未采集清单', '', '- 待人工审核自动调节结果、真实素材、语义承载和选卡。');
    adjustments.push('补充未完成 / 未采集清单');
  }
  if (adjustments.length) writeFileSync(file, out.join('\n'), 'utf8');
  return adjustments;
}

export function applyAutomaticCardChoices(project) {
  const file = path.join(project, 'SHOTBOOK.md');
  const candidatesFile = path.join(project, 'qa', 'card-candidates.json');
  if (!existsSync(file) || !existsSync(candidatesFile)) return [];
  let candidates;
  try { candidates = JSON.parse(readFileSync(candidatesFile, 'utf8')); } catch { return []; }
  const shots=JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8'));
  const formal=new Map(shots.map(s=>[String(s.id).toLowerCase(),s.shotCard]));
  const original = readFileSync(file, 'utf8');
  const lines = original.split(/\r?\n/);
  const out = [];
  const adjustments = [];
  let inShot = false;
  let shotId = '';
  let hasSkin = false;
  let hasPick = false;
  const flush = () => {
    if (!inShot || !shotId) return;
    const entry = candidates[shotId] || candidates[shotId.toLowerCase()];
    const groups = entry?.candidates || {};
    const slug=formal.get(shotId.toLowerCase());
    if(!slug)return;
    const picks = [];
    for (const [semantic, options] of Object.entries(groups)) {
      if (semantic!=='开场短模板'&&Array.isArray(options)&&options.some(c=>c.slug===slug))picks.push(`${semantic} → ${slug}`);
    }
    for(const [semantic,reason] of Object.entries(entry?.waived||{})){
      if(entry.semantics?.includes(semantic)&&typeof reason==='string'&&[...reason.replace(/\s/gu,'')].length>=4)
        picks.push(`${semantic} → ${slug}`);
    }
    // Missing evidence stays unresolved. Never silently select options[0].
    if(!picks.length)return;
    if (!hasSkin) out.push(`- 蒙皮行：${slug} → 按原卡公开参数承接，待审核`);
    if (!hasPick && picks.length) out.push(`- 选卡行：${picks.join('、')}`);
    if(!hasSkin||!hasPick)adjustments.push(`${shotId}：补录编导正式选卡 ${slug}，未改变模板选择`);
  };
  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+([SsVv]\d+[A-Za-z0-9_']*)\b/);
    if (heading) {
      flush();
      inShot = true;
      shotId = heading[1];
      hasSkin = false;
      hasPick = false;
    }
    if (inShot && /^\s*[-*]?\s*\**蒙皮(?:行)?\**\s*[:：]/.test(line) && !/待候选生成后自动选择|待实现|待人工审核/.test(line)) hasSkin = true;
    if (inShot && /^\s*[-*]?\s*\**选卡\**\s*[:：]/.test(line) && /待候选生成后审核/iu.test(line)) {
      // 候选阶段留下的占位不能在正式模板已落地后继续阻断整片渲染；
      // flush() 只补录编导的正式选择，不从推荐排名自动选卡。
      continue;
    }
    if (inShot && /^\s*[-*]?\s*\**选卡行\**\s*[:：]/.test(line)) hasPick = true;
    if (inShot && /^#{1,6}\s/.test(line) && !/^#{2,4}\s+[SsVv]\d+/.test(line)) {
      flush(); inShot = false;
    }
    if (inShot && /^\s*[-*]?\s*\**蒙皮(?:行)?\**\s*[:：].*(待候选生成后自动选择|待实现|待人工审核)/.test(line)) continue;
    out.push(line);
  }
  flush();
  writeFileSync(file, out.join('\n'), 'utf8');
  return adjustments;
}

function verifyTalkcraftCardCalls(project, runId, {sample = false, complete = false} = {}) {
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  const cardCallsRequired = source.cardCallsRequired === true &&
    (source.aspectRatio || source.themeSnapshot?.aspectRatio || '16:9') === '16:9';
  return assertTalkcraftCardCallsBound(ROOT, SKILL, runId, {
    requireCardCalls:cardCallsRequired,
    requiredShotIds:cardCallsRequired && sample ? ['s01'] : [],
    requireCompleteCoverage:cardCallsRequired && complete,
  });
}

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

function hasVerifiedPreviewSegments(project) {
  const remotion = path.join(project, 'remotion');
  const shotsFile = path.join(remotion, 'shots.json');
  if (!existsSync(shotsFile)) return false;
  const shots = JSON.parse(readFileSync(shotsFile, 'utf8'));
  if (!Array.isArray(shots) || !shots.length) return false;
  const videoHash = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file,
    '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-'], {encoding:'utf8'}).trim();
  try {
    return shots.every(({id}) => {
      const segment = path.join(remotion, 'out', 'segments', `${id}.mp4`);
      const preview = path.join(remotion, 'out', 'preview', `${id}.mp4`);
      return existsSync(segment) && existsSync(preview) && videoHash(segment) === videoHash(preview);
    });
  } catch {
    return false;
  }
}

// The approved storyboard keeps the authored speech boundaries.  Rendering,
// however, must consume the visual timeline produced by scaffold: a visual
// hold bridges a real pause between two spoken shots.  Keep this normalization
// in the tracked stage runner so every render entry point uses the same data.
export function prepareTalkcraftRenderShots(project, {fps = 30} = {}) {
  const remotion = path.join(project, 'remotion');
  const sourceFile = path.join(remotion, 'shots.json');
  if (!existsSync(sourceFile)) throw new Error('缺少 remotion/shots.json，不能准备渲染时间线');
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
  if (!Array.isArray(source) || !source.length) throw new Error('remotion/shots.json 必须是非空镜头数组');
  const shots = source.map(shot => ({...shot}));
  const bridgesFile = path.join(project, 'qa', 'visual-timeline-bridges.json');
  const applied = [];
  if (existsSync(bridgesFile)) {
    const evidence = JSON.parse(readFileSync(bridgesFile, 'utf8'));
    if (evidence.schema !== 'talkcraft-visual-timeline-bridges-v1' || evidence.source !== 'remotion/shots.json') {
      throw new Error('visual-timeline-bridges.json 的来源契约无效，已阻止渲染');
    }
    const byId = new Map(shots.map(shot => [String(shot.id), shot]));
    const seen = new Set();
    for (const bridge of evidence.bridges || []) {
      const shotId = String(bridge.shotId || '');
      const shot = byId.get(shotId);
      if (!shot || seen.has(shotId)) throw new Error(`视觉停顿桥接镜头无效或重复：${shotId}`);
      const next = shots[shots.indexOf(shot) + 1];
      const from = Number(bridge.fromSec), to = Number(bridge.toSec);
      if (!Number.isFinite(from) || !Number.isFinite(to) ||
          Math.round(Number(shot.end) * fps) !== Math.round(from * fps) ||
          !next || Math.round(Number(next.start) * fps) !== Math.round(to * fps) || to <= from) {
        throw new Error(`视觉停顿桥接证据与原始分镜不一致：${shotId}`);
      }
      shot.end = to;
      shot.visualHoldSec = Number(bridge.durationSec);
      seen.add(shotId);
      applied.push({shotId, fromSec:from, toSec:to});
    }
  }
  for (let index = 0; index < shots.length - 1; index += 1) {
    if (Math.round(Number(shots[index].end) * fps) !== Math.round(Number(shots[index + 1].start) * fps)) {
      throw new Error(`渲染时间线仍有断档：${shots[index].id} → ${shots[index + 1].id}`);
    }
  }
  const output = path.join(project, 'qa', 'render-shots.json');
  mkdirSync(path.dirname(output), {recursive:true});
  writeFileSync(output, JSON.stringify(shots, null, 2), 'utf8');
  if (applied.length) console.log(`渲染时间线已承接 ${applied.length} 处口播停顿：${applied.map(item => `${item.shotId} ${item.fromSec}→${item.toSec} 秒`).join('、')}`);
  return {file:output, argument:path.relative(remotion, output).replaceAll(path.sep, '/'), shots, applied};
}

function runTalkcraftStageInternal(stage, runId) {
  if (!runIdPattern.test(runId)) throw new Error('Invalid B run ID');
  if (!existsSync(path.join(SKILL, 'SKILL.md'))) throw new Error('TalkCraft skill is not installed');
  if (stage === 'prepare') throw new Error('旧 prepare 阶段已移除；请从 /api/talkcraft/create 启动 GitHub TalkCraft 管线');
  const project = talkcraftProject(ROOT,runId);
  if (!existsSync(path.join(project, 'source-run.json'))) throw new Error('Run prepare first');
  if(stage==='reviewed-template-check'){
    const result=auditReviewedTemplates(project,{skillRoot:SKILL});
    mkdirSync(path.join(project,'qa'),{recursive:true});
    writeFileSync(path.join(project,'qa/reviewed-template-admission.json'),JSON.stringify(result,null,2)+'\n');
    if(!result.passed)throw Error(result.checks.filter(c=>!c.passed).map(c=>c.reason+'；治理：'+c.remedy).join('\n'));
    return result;
  }
  // Remaining native scenes are built after sample approval. Before building,
  // verify selection, runtime and every existing scene; require full coverage
  // immediately after implementation, before any segment encoding.
  enforceReviewedTemplateStage(stage==='render-all'?'render-prepare':stage,project,{skillRoot:SKILL});
  if (stage === 'bootstrap') {
    const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
    if(source.workflowPath==='recorded-host')prepareRecordedHost(project);
    else runTalkcraftStage('synthesize', runId);
    runTalkcraftStage('align', runId);
    return runTalkcraftStage('semantic-init', runId);
  }
  if (stage === 'recover-timing') {
    requireFiles(project, ['audio/full.mp3', 'audio/voice-timing.json']);
    if (!readNativeTiming(project)) throw new Error('没有可复用的 TTS 原始时间戳；已保留配音');
    runTalkcraftStage('align', runId);
    return runTalkcraftStage('semantic-init', runId);
  }

  if (stage === 'word-timing') return alignExistingVoice(project,SKILL);
  if(stage==='recover-alignment'){
    const recovered=recoverExistingAlignment(project,SKILL);useAlignedTiming(ROOT,runId);
    if(!existsSync(path.join(project,'semantics.json')))runTalkcraftStage('semantic-init',runId);
    return {project,...recovered};
  }
  if (stage === 'align') {
    if (existsSync(path.join(project, 'audio', 'timestamps.json'))) throw new Error('Existing timestamps were preserved');
    const native = writeNativeTiming(project);
    if (!native) {
      requireChineseAlignmentSupport();
      console.log('TTS 未提供可用原始时间戳，使用本地识别补齐。');
      run(PYTHON, [script('timestamps_cpu.py'), 'audio/full.mp3', 'script.json', 'audio/timestamps.json',
        '--backend', process.env.TALKCRAFT_ASR_BACKEND || 'whisper',
        '--model', process.env.TALKCRAFT_ASR_MODEL || 'small'], project);
    } else console.log(`Using native TTS timing (${native.provider}, ${native.timingGranularity}); ASR skipped.`);
    if (!native || native.timingGranularity === 'word') {
      run(PYTHON, [script('make_timing.py'), 'audio/timestamps.json', 'remotion/timing.json'], project);
    }
    return useAlignedTiming(ROOT, runId);
  }
  if (stage === 'synthesize') {
    if (existsSync(path.join(project, 'audio', 'full.mp3'))) throw new Error('Existing voiceover was preserved');
    const sourceFile = path.join(project, 'source-run.json');
    const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
    if(source.workflowPath==='recorded-host')throw Error('真人视频路径禁止合成配音，请恢复原声处理');
    if (source.voiceMode === 'volcengine-clone' || source.voiceMode === 'volcengine-tts2') {
      if (!source.speakerId) throw new Error('火山语音音色缺少 ID');
      const scriptName = source.voiceMode === 'volcengine-tts2' ? 'volcengine-tts2.mjs' : 'volcengine-voice.mjs';
      run(process.execPath, [path.join(ROOT, 'director', scriptName), 'synthesize',
        'input.txt', 'audio/full.mp3', 'audio/voice-timing.json', source.speakerId, String(source.speechRate ?? 0)], project);
      const timingPath = path.join(project, 'audio', 'voice-timing.json');
      completeVolcengineTiming({timingFile:timingPath, audioFile:path.join(project, 'audio', 'full.mp3'), text:readFileSync(path.join(project, 'input.txt'), 'utf8')});
    } else throw new Error('免费音色已移除，请在操作台选用火山音色创建新任务；原配音已保留');
    const timing = JSON.parse(readFileSync(path.join(project, 'audio', 'voice-timing.json'), 'utf8'));
    const voiceVerification=assertTalkcraftVoiceOutput(project,source);
    mkdirSync(path.join(project,'qa'),{recursive:true});
    writeFileSync(path.join(project,'qa/voice-selection-verification.json'),JSON.stringify({
      schema:'talkcraft-voice-verification-v1',...voiceVerification,checkedAt:new Date().toISOString(),
      limitation:'核验供应商输出元数据与请求的对应关系，不等于声纹或听感验收。'},null,2));
    writeFileSync(sourceFile, JSON.stringify({...source, totalFrames:timing.totalFrames,
      timingMethod:timing.timingMethod, voiceEngine:timing.voiceEngine}, null, 2), 'utf8');
    return {project, audioSeconds:timing.durationSeconds, timingMethod:timing.timingMethod};
  }
  if (stage === 'media-preflight') {
    return runMediaPreflight(project,SKILL,{backgroundRoot:ROOT,python:PYTHON,env:{...pythonEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
  }
  if(stage==='host-preflight')return runMediaPreflight(project,SKILL,{backgroundRoot:ROOT,python:PYTHON,env:{...pythonEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'},scope:'generated'});
  if (stage === 'semantic-init') {
    run(PYTHON, [script('semantic_annotate.py'), '--project', project, '--init',
      '--shots', 'remotion/not-yet-planned.json'], project);
    return {project, artifact:'semantics.json', status:'awaiting_agent_review'};
  }
  if (stage === 'semantic-check') {
    const result=runTalkcraftSemanticCheck(project,SKILL,{python:PYTHON});
    recordSemanticPass(ROOT, runId);
    return result;
  }
  if(stage==='semantic-shot-check')return runTalkcraftSemanticCheck(project,SKILL,{scope:'shots',python:PYTHON});
  if (stage === 'semantic-apply') {
    return applySemanticDecisions(project, SKILL);
  }
  if(stage==='institution-source-repair')return executeInstitutionSourceRepair(project);
  if(stage==='material-research'){
    run(process.execPath,['--use-env-proxy',path.join(ROOT,'director/talkcraft-material-research.mjs'),project,path.join(SKILL,'references/cards-index.json'),'--search'],project);
    return {project,artifact:'qa/material-search-results.json',audit:'qa/material-research-audit.json',status:'awaiting_material_binding',paidCalls:0};
  }
  if (stage === 'candidates') {
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    const state=readTalkcraftStatus(ROOT,runId),adjustments=[];
    adjustments.push(...autoAdjustShotbook(project));
    // Apply an input-bound reviewed plan before checking its source metadata.
    const sourceIndex=JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8'));
    const researchBindings=prepareResearchBindings(project,loadTalkcraftGovernedCatalog(sourceIndex),{index:sourceIndex});
    const backgrounds=allocateUniqueBackgrounds(ROOT,project);
    if(backgrounds.unresolved.length)throw new Error(`待补充独立背景素材：${backgrounds.unresolved.map(s=>s.shotId).join('、')}`);
    assertExclusiveBackgrounds(project,JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8')));
    const researchFile=path.join(project,'material-research-plan.json');
    const materialContract=auditEditorialMaterialContract({
      shots:JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8')),
      sentences:JSON.parse(readFileSync(path.join(project,'semantics.json'),'utf8')).sentences,
      researchPlan:existsSync(researchFile)?JSON.parse(readFileSync(researchFile,'utf8')):null,
      catalog:loadTalkcraftGovernedCatalog(JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8'))),projectRoot:project});
    writeFileSync(path.join(project,'qa/editorial-material-contract.json'),JSON.stringify(materialContract,null,2));
    // Incompatible display plans cannot be fixed by repeating online searches.
    // Valid plans continue through the original acquisition and source checks.
    if(materialContract.passed&&existsSync(researchFile))
      run(process.execPath,['--use-env-proxy',path.join(ROOT,'director/talkcraft-material-research.mjs'),project,path.join(SKILL,'references/cards-index.json'),'--search'],project);
    const materialPlan=allocateTemplateMaterials(project,{deferGeneratedHost:state.digitalHumanGenerationPlanned});
    adjustments.push(...materialPlan.adjustments);
    const materialResearch=auditMaterialResearch(project,JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8')),{localIndex:loadMaterialIndex(ROOT)});
    const materialIssues=[...materialContract.issues,...researchBindings.issues,...materialResearch.issues,...materialPlan.unresolved];
    const readiness={passed:materialIssues.length===0,materialContract,researchBindings,materialIssues,paidCalls:0};
    writeFileSync(path.join(project,'qa/candidate-material-readiness.json'),JSON.stringify(readiness,null,2));
    saveCandidateMaterialRepairFeedback(project,readiness);
    if(materialIssues.length)throw Error('选卡前真实素材规划未完成：'+materialIssues.map(i=>`${i.shotId||'全片'} ${i.code}${i.message?'：'+i.message:''}`).join('；'));
    alignNativeShotBoundaries(project);
    adjustments.push(...syncShotbookMaterials(project).adjustments);
    const generate=()=>{
      const indexFile=prepareReviewedCandidates(project,{skillRoot:SKILL});
      const index=JSON.parse(readFileSync(indexFile,'utf8'));
      const governed=loadTalkcraftGovernedCatalog(JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8')));
      run(PYTHON,[path.join(ROOT,'director','talkcraft-card-match-trace.py'),
        '--upstream-script',script('card_match.py'),'--trace-out',path.join(project,'qa/card-candidate-trace.json'),'--project',project,
        '--index',indexFile,'--top',String(index.cards.length),'--out','qa/card-candidates.md','--json','qa/card-candidates.json'],project);
      return {indexFile,index,governed,openingFilter:filterOpeningShortTemplateCandidates(project,governed)};
    };
    let generated=generate();
    // Keep the original matcher output: outside recommendations are explained
    // in SHOTBOOK, not inserted into the candidate list after selection.
    const cardAdjustments=applyAutomaticCardChoices(project);
    adjustments.push(...cardAdjustments);
    if(cardAdjustments.length){
      generated=generate();
    }
    // Keep retrieval evidence even when a later planning/selection gate fails.
    const comparison=recordCandidateComparison(project,{skillRoot:SKILL});
    const binding=normalizeTalkcraftBindings(project);
    const sourceFile=path.join(project,'remotion','src','shots.ts');
    let sourceSync={deferred:true,shots:0,reason:'渲染源码由第10节点在分镜审核后生成'};
    if(existsSync(sourceFile))try{sourceSync=syncTalkcraftShotSource(project);}
    catch(error){
      // Candidate selection owns planning data only. A changed template makes
      // the previous render source stale; rebuilding it belongs to scaffold.
      if(!/模板已改变/u.test(String(error.message||error)))throw error;
      sourceSync={deferred:true,shots:0,stale:true,reason:String(error.message||error)};
    }
    assertTalkcraftTemplateGovernance(project);
    if(state.wordTimingReady)prepareNativeProduction(project,SKILL);
    recordReviewedCandidates(project,{skillRoot:SKILL});
    try{assertReviewedSelection(project,{skillRoot:SKILL});}
    catch(error){
      // 07 must carry the complete current proposal forward, including a
      // successful partial repair. Never fall back to the installed old draft.
      const native=checkNativeGovernance(project,{catalog:generated.governed,write:true});
      const issues=[...(error.issues||[{code:'REVIEWED_SELECTION_INVALID',message:error.message}]),...native.issues];
      savePlanningEditorialRepairFeedback(project,{passed:false,issues});
      throw Object.assign(Error(issues.map(i=>i.message).join('；')),{issues});
    }
    return {project,artifact:'qa/card-candidates.md',indexFile:generated.indexFile,
      governedCardCount:generated.governed.cards.length,openingFilter:generated.openingFilter,
      adjustments,reconciled:[],comparison,bindings:binding.bindings,sourceSync,status:'candidate_selection_bound'};
  }  if (stage === 'preflight'||stage==='planning-check') {
    const planning=stage==='planning-check';
    const state=readTalkcraftStatus(ROOT,runId);
    const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
    const finalized=state.digitalHumanGenerationPlanned&&!planning;
    if(finalized)assertParallelPreparationJoined(project);
    const recordResult=planning?recordPlanningResult:recordPreflightResult;
    if(finalized&&(!state.planningPassed||!state.storyboardApproved||!state.mediaPreflightPassed))throw Error('先完成分镜规划审核、RunningHub 生成及人物素材体检，再执行原版全量预检');
    const completionIndex=JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8'));
    const completion=completeTalkcraftNodeInputs(project,{node:planning?'storyboard-review':'preflight',
      catalog:loadTalkcraftGovernedCatalog(completionIndex),index:completionIndex,deferGeneratedHost:planning&&state.digitalHumanGenerationPlanned});
    if(!completion.passed)throw Error('当前节点素材补全未通过：'+completion.issues.map(i=>i.message||i.code).join('；'));
    if(source.workflowPath==='recorded-host'){
      if(!state.mediaPreflightPassed)throw Error('先完成真人视频素材体检，再进入原版全量预检');
      bindRecordedHostShots(project);
    }
    const adjustments=[];
    let binding={bindings:[]};
    const bindingFile=path.join(project,'qa/formal-bindings.json');
    if(existsSync(bindingFile))try{binding=JSON.parse(readFileSync(bindingFile,'utf8'));}catch{}    try {assertReviewedSelection(project,{skillRoot:SKILL});}
    catch(error){recordResult(ROOT,runId,{passed:false,issues:String(error.message||error).split('\n'),adjustments});throw error;}
    if(finalized){
      const materialCheck=allocateTemplateMaterials(project);
      if(materialCheck.unresolved.length)throw Error('全量预检素材绑定未通过：'+materialCheck.unresolved.map(x=>x.message).join('；'));
      if(!readTalkcraftStatus(ROOT,runId).storyboardApproved)throw Error('素材绑定改变了分镜，必须重新规划校验和审核');
    }
    if(source.workflowPath==='recorded-host')runMediaPreflight(project,SKILL,{backgroundRoot:ROOT,python:PYTHON,env:{...pythonEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
    runTalkcraftStage('semantic-check',runId);
    runTalkcraftStage('semantic-shot-check',runId);
    if(planning){
      if(state.digitalHumanGenerationPlanned)planTalkcraftDigitalHuman(project);
    }
    const runtimeReport = path.join(project, 'qa', planning?'planning-runtime.json':'preflight-runtime.json');
    let check = {status:0, error:null};
    try {
      if(!planning)
      execFileSync(PYTHON, [path.join(ROOT,'director/talkcraft-code-preflight.py'),script('preflight.py'), '--project', project, '--shotbook', 'SHOTBOOK.md',
        '--shots', 'remotion/shots.json', '--semantics', 'semantics.json',
        '--script', 'script.txt', '--voice', source.workflowPath==='recorded-host'?'audio/full.wav':'audio/full.mp3', '--fps', '30', '--json-out', runtimeReport,
        ...(source.workflowPath==='recorded-host'?['--host','remotion/public/dh/host.mp4']:[])],
        {cwd:project, stdio:'inherit', env:{...pythonEnvironment(), PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1'}});
    } catch (error) {
      check = {status:Number.isInteger(error.status) ? error.status : 1, error};
    }
    let runtime = null;
    if(!planning)try { runtime = JSON.parse(readFileSync(runtimeReport, 'utf8')); } catch {}
    const output = Array.isArray(runtime?.issues) ? runtime.issues.join('\n') : '';
    const issues = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (check.error && !Number.isInteger(check.error.status)) {
      issues.push(`自动调节执行失败：${String(check.error.message || check.error)}`);
    }
    const nativeGovernance=checkNativeGovernance(project,{catalog:loadTalkcraftGovernedCatalog(JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8'))),write:true});
    issues.push(...nativeGovernance.issues.map(i=>`${i.shotId||'全局'}：[${i.code}] ${i.message}`));
    const factReview=factReviewStatus(project);issues.push(...factReview.issues);
    const wordWindows = nativeGovernance.passed
      ? recordPlanningWordCheck(project,{required:nativeGovernance.required}) : {passed:true,issues:[]};
    issues.push(...wordWindows.issues.map(issue=>`[${issue.code}] ${issue.message}`));
    const passed = (runtime ? runtime.passed === true : check.status === 0)&&nativeGovernance.passed&&factReview.passed&&wordWindows.passed;
    savePlanningEditorialRepairFeedback(project,{passed,stage:planning?'planning-check':'preflight',issues:[...nativeGovernance.issues,...wordWindows.issues,
      ...factReview.issues.map(message=>({code:'FACT_REVIEW_REQUIRED',message}))]});
    recordResult(ROOT, runId, {passed, issues, adjustments});
    return {project, status:'automatic_adjustment_complete', passed, issues, adjustments, bindings:binding.bindings};
  }
  if (stage === 'presentation-repair') {
    assertPipelineProvenance(project);
    const correction=installPresentationCorrections(SKILL,path.join(project,'remotion/src'));
    installHostContextRuntime(project);
    const rebuilt=runTalkcraftStage('scaffold',runId);
    return {project,status:'presentation_corrected',correction,rebuilt,externalRequests:0,userAcceptance:false};
  }
  if (stage === 'background-visibility') {
    return {project,status:'background_visibility_prepared',...installBackgroundVisibility(project),
      visualReview:'human',userAcceptance:false};
  }
  if (stage === 'word-reveal') {
    const result=applyWordRevealTiming(project);
    if(!result.enabled)throw Error('WORD_REVEAL_PLAN_REQUIRED：请先填写大字卡字级落点计划');
    installWordRevealRuntime(project);
    return {project,status:'word_reveal_plan_passed',events:result.events.length};
  }
  if (stage === 'text-binding') {
    return {project,status:'text_binding_passed',...checkTextBindings(project,runId),userAcceptance:false};
  }
  if(['sample-qa','render-qa','word-reveal-qa','text-contrast'].includes(stage)){
    const scope=stage==='sample-qa'?['s01']:undefined;
    const rules=checkTextBindings(project,runId,{only:scope});
    const humanReview=queueHumanVisualReview(project,{only:scope});
    return {project,status:'code_rules_passed_visual_pending_human',rules,humanReview,userAcceptance:false};
  }
  if (stage === 'beat-lint') {
    requireRenderTiming(project);
    return runTalkcraftBeatLint(project);
  }
  if (stage === 'workbench-contract') {
    // 原版仅样板镜制作阶段允许占位；整片和两分钟样片不能因画幅豁免。
    run(PYTHON, [script('workbench_contract_lint.py'), project], project);
    return {project, status:'workbench_contract_passed'};
  }
  if (stage === 'scaffold') {
    const gate=readTalkcraftStatus(ROOT,runId);
    if(!gate.preflightPassed||!gate.storyboardApproved)throw Error('原版全量预检及分镜审核通过后才能实现场景');
    requireRenderTiming(project);
    // A prior failure may leave the generated project intact. Resume validation
    // and cue installation without overwriting existing scenes or user work.
    const result = existsSync(path.join(project,'remotion/src/index.ts'))
      ? {project,contract:'preserved-native-scaffold'}
      : scaffoldTalkcraftProject(ROOT, SKILL, runId);
    const sourceSync = syncTalkcraftShotSource(project,{allowReviewedRebuild:true});
    installHostContextRuntime(project);
    // The reviewed storyboard may legitimately replace a previously generated
    // card. Rebuild generated scene parameter contracts at this gate so stale
    // fields cannot leak into the new approved template. Custom scene code is
    // still protected by implementNativeScenes' overwrite guard.
    if(sourceSync.rebuilt?.length)implementNativeScenes(project, SKILL);
    const fidelity = assertTalkcraftRuntimeFidelity(project);
    const cues = installNativeCues(project, SKILL, ['s01'],{resolveAsset:createPreparedTalkcraftResolver(project)});
    // Assemble the deterministic word/audit runtime before sealing scaffold
    // outputs; sample QA can then reinstall it without invalidating stage 10.
    if(isNativePresentation(project)){
      installWordRevealRuntime(project);
      // Upstream still implements/approves the first shot first. Check exactly
      // the implemented scope now; all remaining shots join after approval.
      checkTextBindings(project,runId,{only:['s01']});
    }
    const scaffoldResult=recordScaffoldResult(project,fidelity);
    return {...result, sourceSync, runtimeFidelity:fidelity, cues, scaffoldResult};
  }
  if (stage === 'sfx-dump') {
    run('node', [script('sfx_dump.mjs'), 'remotion/public/sfx'], project);
    return {project, artifact:'remotion/public/sfx'};
  }
  if (stage === 'digital-human') {
    assertTalkcraftDigitalHumanAdmission(ROOT, runId);
    run(process.execPath, [path.join(ROOT, 'director', 'talkcraft-digital-human.mjs'), runId,
      '--reuse-first',...(process.argv.includes('--resume-authorized')?['--resume-authorized']:[])], ROOT);
    return {project, status:'digital_human_generated_awaiting_media_preflight'};
  }
  if (stage === 'sample') {
    if(readTalkcraftStatus(ROOT,runId).digitalHumanGenerationPlanned)
      runMediaPreflight(project,SKILL,{backgroundRoot:ROOT,python:PYTHON,env:{...pythonEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'},scope:'generated'});
    runTalkcraftStage('semantic-check', runId);
    runTalkcraftStage('semantic-shot-check', runId);
    requirePreflight(runId);
    verifyTalkcraftCardCalls(project, runId, {sample:true});
    runTalkcraftStage('beat-lint', runId);
    if(isNativePresentation(project))runTalkcraftStage('sample-qa',runId);
    assertMachineTextRules(project,{only:['s01']});
    const digitalHuman = readTalkcraftDigitalHumanStatus(project);
    if (digitalHuman.required && !digitalHuman.ready) {
      throw new Error('数字人镜头素材未生成，不能渲染样板镜');
    }
    const bgmProps = talkcraftMusicProps(ROOT, path.join(project, 'remotion'), true);
    if (existsSync(path.join(project, 'remotion', 'out', 'preview', 's01.mp4'))) {
      if (existsSync(path.join(project,'remotion/src/scenes/scene-shared.tsx'))) preservePreviousSample(project);
      else throw new Error('Existing first-shot sample was preserved');
    }
    const renderShots = prepareTalkcraftRenderShots(project);
    run('node', [script('render_shots.mjs'), '--entry', 'src/index.ts', '--comp', 'Main',
      '--shots', renderShots.argument, '--only', 's01',
      '--seg-audio', '--preview-dir', 'out/preview', '--props', bgmProps, ...localBrowserArgs()], path.join(project, 'remotion'));
    if (existsSync(path.join(project,'remotion/src/scenes/scene-shared.tsx'))) recordSampleRender(project);
    recordShotPreviews(project,{s01:'remotion/out/preview/s01.mp4'});
    return {project, artifact:'remotion/out/preview/s01.mp4', status:'awaiting_user_sample_approval'};
  }
  if (stage === 'sample-2m') {
    if(readTalkcraftStatus(ROOT,runId).digitalHumanGenerationPlanned)
      runMediaPreflight(project,SKILL,{backgroundRoot:ROOT,python:PYTHON,env:{...pythonEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'},scope:'generated'});
    const output = path.join(project, 'remotion', 'out', 'sample-2m.mp4');
    if (existsSync(output)) throw new Error('Existing 2-minute sample was preserved');
    runTalkcraftStage('semantic-check', runId);
    runTalkcraftStage('semantic-shot-check', runId);
    requirePreflight(runId);
    verifyTalkcraftCardCalls(project, runId, {complete:true});
    runTalkcraftStage('beat-lint', runId);
    runTalkcraftStage('workbench-contract', runId);
    if(isNativePresentation(project))runTalkcraftStage('render-qa',runId);
    assertMachineTextRules(project);
    const digitalHuman = readTalkcraftDigitalHumanStatus(project);
    if (digitalHuman.required && !digitalHuman.ready) throw new Error('数字人镜头素材未生成，不能渲染 2 分钟样片');
    const remotion = path.join(project, 'remotion');
    const assembled = path.join(remotion, 'out', 'assembled-sample-2m.mp4');
    const bgmProps = talkcraftMusicProps(ROOT, remotion, true);
    const concurrency = talkcraftRenderParallel();
    const renderShots = prepareTalkcraftRenderShots(project);
    console.log(`TalkCraft 分段渲染并发：${concurrency.effective} 路（可用/总内存 ${(concurrency.freeBytes / 2**30).toFixed(1)}/${(concurrency.totalBytes / 2**30).toFixed(1)} GiB）`);
    run('node', [script('render_shots.mjs'), '--entry', 'src/index.ts', '--comp', 'Main',
      '--shots', renderShots.argument, '--all', '--seg-dir', 'out/segments-sample-2m',
      '--parallel', String(concurrency.effective), '--concat', 'out/assembled-sample-2m.mp4',
      '--audio', 'out/full-mix.wav', '--props', bgmProps, ...localBrowserArgs()], remotion);
    // render_shots 已生成整条音轨；截取样片时必须同时复用画面并封装配音。
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', assembled, '-i', 'out/full-mix.wav',
      '-map', '0:v:0', '-map', '1:a:0', '-t', '120', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', output], {cwd:remotion, stdio:'inherit'});
    return {project, artifact:'remotion/out/sample-2m.mp4', status:'awaiting_user_sample_approval', durationSeconds:120};
  }
  if (stage === 'render-all') {
    if(readTalkcraftStatus(ROOT,runId).digitalHumanGenerationPlanned)
      runMediaPreflight(project,SKILL,{backgroundRoot:ROOT,python:PYTHON,env:{...pythonEnvironment(),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'},scope:'generated'});
    assertPipelineProvenance(project);
    preserveStaleFinalArtifacts(project);
    const renderStatus = readTalkcraftStatus(ROOT, runId);
    if (!renderStatus.sampleApproved) {
      throw new Error('The first-shot sample must be approved before full rendering');
    }
    if (existsSync(path.join(project,'remotion/src/scenes/scene-shared.tsx'))) {
      implementNativeScenes(project, SKILL);
      installNativeCues(project, SKILL, JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8')).map(s=>s.id),{resolveAsset:createPreparedTalkcraftResolver(project)});
      // All scenes now exist. Check text/code bindings before any
      // expensive segment encoding; a first-shot proof cannot satisfy this.
      runTalkcraftStage('text-binding',runId);
    }
    enforceReviewedTemplateStage('render-all',project,{skillRoot:SKILL});
    const status = readTalkcraftStatus(ROOT, runId);
    if (!status.scenesReady) {
      throw new Error(`Remaining shots are not implemented: ${status.scenesMissing.join(', ')}`);
    }
    assertRenderableStoryboard(project, status);
    runTalkcraftStage('semantic-check', runId);
    runTalkcraftStage('semantic-shot-check', runId);
    requirePreflight(runId);
    const governedStatus = readTalkcraftStatus(ROOT, runId);
    assertRenderableStoryboard(project, governedStatus);
    writeTalkcraftQaManifests(ROOT, runId);
    assertBModeGoverned(ROOT, runId);
    verifyTalkcraftCardCalls(project, runId, {complete:true});
    runTalkcraftStage('beat-lint', runId);
    runTalkcraftStage('workbench-contract', runId);
    if(isNativePresentation(project))runTalkcraftStage('render-qa',runId);
    assertMachineTextRules(project);
    const digitalHuman = readTalkcraftDigitalHumanStatus(project);
    if (digitalHuman.required && !digitalHuman.ready) {
      throw new Error('数字人镜头素材未生成，不能渲染整片');
    }
    const bgmProps = talkcraftMusicProps(ROOT, path.join(project, 'remotion'), false);
    const renderShots = prepareTalkcraftRenderShots(project);
    const verifiedSegments = hasVerifiedPreviewSegments(project);
    const concurrency = talkcraftRenderParallel();
    console.log(`TalkCraft 分段渲染并发：${concurrency.effective} 路（可用/总内存 ${(concurrency.freeBytes / 2**30).toFixed(1)}/${(concurrency.totalBytes / 2**30).toFixed(1)} GiB）`);
    run('node', [script('render_shots.mjs'), '--entry', 'src/index.ts', '--comp', 'Main',
      '--shots', renderShots.argument, ...(verifiedSegments
        ? ['--all', '--seg-dir', 'out/segments']
        : ['--all', '--seg-dir', 'out/segments-final-v1']),
      '--parallel', String(concurrency.effective), '--concat', 'out/assembled.mp4',
      '--props', bgmProps, ...localBrowserArgs()], path.join(project, 'remotion'));
    // render_shots sends audioOnly=true, but preserved legacy Main files may
    // ignore it. Reuse the existing AST-based audio isolation: identical Audio
    // expressions/props, no visual or muted avatar decoders, no Main rewrite.
    const audioProject=prepareSfxSoloProject(project,SKILL,{purpose:'full-audio'});
    const remotion=path.join(project,'remotion');
    const segmentDirectory=path.join(remotion,'out',verifiedSegments?'segments':'segments-final-v1');
    assertAudioPassSegments(segmentDirectory,JSON.parse(readFileSync(path.resolve(remotion,renderShots.argument),'utf8')));
    run('node',[script('render_shots.mjs'),'--entry','src/index.ts','--comp','Main',
      '--shots',path.resolve(remotion,renderShots.argument),
      '--seg-dir',segmentDirectory,
      '--concat',path.join(remotion,'out/assembled.mp4'),
      '--audio',path.join(remotion,'out/full-mix.wav'),'--mux',path.join(remotion,'out/final.mp4'),
      '--props',bgmProps,...localBrowserArgs()],audioProject.staging);
    bindMachineVideo(project,path.join(project,'remotion/out/final.mp4'));
    writeTalkcraftTemplateUsage(project, SKILL, path.join(project, 'remotion', 'out', 'final.mp4'));
    recordOfficialRender(project,SKILL);
    const previewShots=JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8'));
    recordShotPreviews(project,Object.fromEntries(previewShots.map(s=>[s.id,`remotion/out/${verifiedSegments?'segments':'segments-final-v1'}/${s.id}.mp4`])));
    return {project, artifact:'remotion/out/final.mp4', status:'awaiting_code_rule_qa'};
  }
  if (stage === 'render-sfx-solo') {
    requireFiles(project, ['remotion/cues.json', 'remotion/out/final.mp4']);
    preserveStaleSfxSolo(project);
    if (sfxSoloCurrent(project)) {
      throw new Error('Existing SFX-only track was preserved');
    }
    const isolated = prepareSfxSoloProject(project, SKILL);
    const temporary = path.join(isolated.staging, 'sfx-solo.wav');
    const browser = localBrowserArgs()[1];
    run('node', [path.join(ROOT,'director/talkcraft-wav-render.mjs'),
      isolated.staging,SKILL,temporary,browser || ''], isolated.staging);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',temporary],{encoding:'utf8'}));
    const expected = JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8')).totalFrames / 30;
    if (!probe.streams.some(s=>s.codec_type==='audio') || probe.streams.some(s=>s.codec_type==='video') ||
      !Number.isFinite(expected) || Math.abs(Number(probe.format.duration)-expected)>1/30)
      throw Error('音效轨缺失或时长与正式合成不一致，已保留临时结果');
    execFileSync('ffmpeg',['-v','error','-xerror','-i',temporary,'-f','null','-'],{stdio:'inherit'});
    const output = path.join(project,'remotion/out/sfx-solo.wav');
    // COPYFILE_EXCL keeps a concurrent/prior result from being overwritten.
    copyFileSync(temporary,output,constants.COPYFILE_EXCL);
    writeFileSync(path.join(project,'qa/sfx-solo-render.json'),JSON.stringify({schema:'talkcraft-sfx-solo-render-v1',
      ...isolated,staging:undefined,outputSha256:sha256(output),durationSec:Number(probe.format.duration),
      completedAt:new Date().toISOString()},null,2));
    return {project, artifact:'remotion/out/sfx-solo.wav'};
  }
  if (stage === 'qa') {
    assertPipelineProvenance(project);
    if (!officialRenderCurrent(project)) throw new Error('缺少与当前输入一致的正式渲染记录，不能把候选文件作为成片验收');
    const levelRepair=planNativeCueLevelRepair(project);
    if(levelRepair.changed){
      // Repair mixing inside node 13, using only the current verified picture.
      // Stage the candidate first: failures leave the official film untouched.
      const isolated=prepareSfxSoloProject(project,SKILL,{purpose:'full-audio'});
      writeFileSync(path.join(isolated.staging,'src/sfx.ts'),levelRepair.source);
      writeFileSync(path.join(isolated.staging,'cues.json'),JSON.stringify(levelRepair.runtime,null,2));
      const renderShots=prepareTalkcraftRenderShots(project),remotion=path.join(project,'remotion');
      const segments=path.join(remotion,'out',hasVerifiedPreviewSegments(project)?'segments':'segments-final-v1');
      assertAudioPassSegments(segments,renderShots.shots);
      const mix=path.join(isolated.staging,'corrected-mix.wav'),final=path.join(isolated.staging,'corrected-final.mp4');
      run('node',[script('render_shots.mjs'),'--entry','src/index.ts','--comp','Main','--shots',renderShots.file,
        '--seg-dir',segments,'--concat',path.join(isolated.staging,'assembled.mp4'),'--audio',mix,'--mux',final,
        '--props',talkcraftMusicProps(ROOT,remotion,false),...localBrowserArgs()],isolated.staging);
      const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
      inspectTechnicalMedia(final,{fps:source.fps||30,totalFrames:source.totalFrames});
      run(PYTHON,[script('sfx_check.py'),'--mix',final,path.join(project,'audio/full.mp3'),path.join(isolated.staging,'cues.json'),
        '--timestamps',wordTimingFile(project)],project);
      const archive=preserveStaleFinalArtifacts(project,{isCurrent:()=>false});
      copyFileSync(path.join(remotion,'src/sfx.ts'),path.join(archive,'sfx.ts'));
      copyFileSync(path.join(remotion,'cues.json'),path.join(archive,'cues.json'));
      writeFileSync(path.join(remotion,'src/sfx.ts'),levelRepair.source);
      writeFileSync(path.join(remotion,'cues.json'),JSON.stringify(levelRepair.runtime,null,2));
      copyFileSync(final,path.join(remotion,'out/final.mp4'),constants.COPYFILE_EXCL);
      copyFileSync(mix,path.join(remotion,'out/full-mix.wav'));
      bindMachineVideo(project,path.join(remotion,'out/final.mp4'));
      writeTalkcraftQaManifests(ROOT,runId);
      writeTalkcraftTemplateUsage(project,SKILL,path.join(remotion,'out/final.mp4'));
      recordOfficialRender(project,SKILL);
      writeFileSync(path.join(project,'qa/audio-level-repair.json'),JSON.stringify({schema:'talkcraft-audio-level-repair-v1',
        changes:levelRepair.changes,archive,videoReencoded:false,paidCalls:0,finalSha256:sha256(path.join(remotion,'out/final.mp4'))},null,2));
    }
    writeTalkcraftQaManifests(ROOT, runId);
    requireFiles(project, ['remotion/out/final.mp4', 'remotion/cues.json', 'remotion/cards-used.json', 'remotion/anchors.json']);
    const remotion = path.join(project, 'remotion');
    const sourceRun = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
    const cardCallsRequired = sourceRun.cardCallsRequired === true &&
      (sourceRun.aspectRatio || sourceRun.themeSnapshot?.aspectRatio || '16:9') === '16:9';
    const cards = JSON.parse(readFileSync(path.join(remotion, 'cards-used.json'), 'utf8'));
    if (!Array.isArray(cards.slugs) || (!cards.slugs.length && cardCallsRequired)) throw new Error('Used-card manifest is empty');
    const cues = JSON.parse(readFileSync(path.join(remotion, 'cues.json'), 'utf8'));
    if (!Array.isArray(cues) || (!cues.length && cardCallsRequired)) throw new Error('Selected cards have no SFX cues');
    if (cues.length && !sfxSoloCurrent(project)) runTalkcraftStage('render-sfx-solo', runId);
    const mediaIntegrity=inspectTechnicalMedia(path.join(remotion,'out/final.mp4'),{
      fps:sourceRun.fps||30,totalFrames:sourceRun.totalFrames});
    if (cues.length) {
      run(PYTHON, [script('sfx_check.py'), 'out/sfx-solo.wav', 'cues.json'], remotion);
      run(PYTHON, [script('sfx_check.py'), '--mix', 'out/final.mp4', '../audio/full.mp3',
        'cues.json', '--timestamps', readWordAlignment(project) ? '../audio/word-timestamps.json' : '../audio/timestamps.json'], remotion);
    }
    if (cards.slugs.length && !existsSync(path.join(project, 'qa', 'formal-bindings.json'))) {
      run(PYTHON, [script('card_lint.py'), 'src', cards.slugs.join(',')], remotion);
    }
    runTalkcraftStage('beat-lint', runId);
    runTalkcraftStage('workbench-contract', runId);
    assertMachineTextRules(project);
    bindMachineVideo(project,path.join(remotion,'out/final.mp4'));
    queueHumanVisualReview(project);
    const finalHash = sha256(path.join(remotion, 'out', 'final.mp4'));
    const cardCallsEvidence = talkcraftCardCallsQaEvidence(ROOT, SKILL, runId);
    writeFileSync(path.join(project, 'qa', 'passed.json'), JSON.stringify({schema:'talkcraft-qa-pass-v1',
      finalSha256:finalHash, cards:cards.slugs.length, cardCallsEvidence,
      policy:ACCEPTANCE_POLICY,mediaIntegrity,visualVerified:false,requiresHumanVisualReview:true,
      checkedAt:new Date().toISOString()}, null, 2), 'utf8');
    return {project, status:'awaiting_human_visual_review', finalSha256:finalHash};
  }
  if (stage === 'deliver') {
    assertPipelineProvenance(project,{requireVoice:true});
    if (!officialRenderCurrent(project)) throw new Error('正式渲染记录缺失或过期，不能生成交付版');
    const status = readTalkcraftStatus(ROOT, runId);
    if (!status.final || !status.qaPassed) throw new Error('机器质检尚未通过，不能生成交付版');
    const finalRel = status.finalArtifact || 'remotion/out/final.mp4';
    const finalFile = path.join(project, finalRel);
    const governed = /^remotion\/out\/final-governed-v(\d+)\.mp4$/u.exec(finalRel);
    const qaRel = governed ? `qa/governed-v${governed[1]}-qa.json` : 'qa/passed.json';
    requireFiles(project, [finalRel, qaRel, 'review/REVIEW.md', 'review/approval.json']);
    const outputFile = path.join(project, 'remotion', 'out', 'delivery.mp4');
    if (existsSync(outputFile)) throw new Error('Existing delivery was preserved');
    assertMachineVideo(project,finalFile);
    const finalSha256 = sha256(finalFile);
    const qa = JSON.parse(readFileSync(path.join(project, qaRel), 'utf8'));
    const approval = JSON.parse(readFileSync(path.join(project, 'review', 'approval.json'), 'utf8'));
    const review = readFileSync(path.join(project, 'review', 'REVIEW.md'), 'utf8');
    const shots = JSON.parse(readFileSync(path.join(project, 'remotion', 'shots.json'), 'utf8'));
    if (qa.cardCallsEvidence) assertTalkcraftCardCallsQaEvidence(ROOT, SKILL, runId, qa.cardCallsEvidence);
    if (qa.finalSha256 !== finalSha256 || approval.finalSha256 !== finalSha256 ||
        !humanVisualApprovalCurrent(approval,finalSha256,shots.length) ||
        !review.includes(`## 评审完成 · 已看 ${shots.length}/${shots.length} 镜`)) {
      throw new Error('机器规则检查或人工视觉审核缺失、过期或仍有未关闭问题');
    }
    const target = 'loudnorm=I=-15:TP=-1.5:LRA=11';
    const measureCommand = `ffmpeg -hide_banner -i ${finalFile} -af ${target}:print_format=json -f null NUL 2>&1`;
    let measurement;
    try {
      measurement = execFileSync('cmd.exe', ['/d', '/c', measureCommand], {encoding:'utf8'});
    } catch (error) {
      throw new Error(error.stdout || error.stderr || 'Loudness measurement failed');
    }
    const match = measurement.match(/\{\s*"input_i"[\s\S]*?\}/u);
    if (!match) throw new Error('Loudness measurement was not returned');
    const m = JSON.parse(match[0]);
    const measured = `${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
      `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}` +
      `:offset=${m.target_offset}:linear=true`;
    run('ffmpeg', ['-hide_banner', '-i', finalFile, '-c:v', 'copy', '-af', measured,
      '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', outputFile], project);
    writeTalkcraftTemplateUsage(project, SKILL, outputFile);
    return {project, artifact:'remotion/out/delivery.mp4', status:'pending_user_listening_acceptance'};
  }
  throw new Error(`Unknown TalkCraft stage: ${stage}`);
}

// 每个顶层渲染阶段结束后回收可重建的 Chromium/Remotion 临时文件。
// 嵌套阶段共享外层临时目录，避免阶段之间互相删除正在使用的文件。
export function runTalkcraftStage(stage, runId) {
  if (!runIdPattern.test(runId)) throw new Error('Invalid B run ID');
  const project=talkcraftProject(ROOT,runId);
  return trackTalkcraftExecution(project,stage,()=>{
    if(stage==='preflight')
      return completeTalkcraftPreflightNode({project,runId,
        read:()=>readTalkcraftStatus(ROOT,runId),stage:local=>runTrackedTalkcraftStage(local,runId),
        approve:()=>approveDelegatedTalkcraftStoryboard(ROOT,runId),prepare:()=>prepareTalkcraftParallel(ROOT,runId),
        complete:()=>{
        const sourceIndex=JSON.parse(readFileSync(path.join(SKILL,'references/cards-index.json'),'utf8'));
        return completeTalkcraftNodeInputs(project,{node:'preflight',catalog:loadTalkcraftGovernedCatalog(sourceIndex),index:sourceIndex});
      }});
    return runTrackedTalkcraftStage(stage,runId);
  });
}
function runTrackedTalkcraftStage(stage, runId) {
  const managed = RENDER_STAGES.has(stage);
  const project = runIdPattern.test(runId)
    ? talkcraftProject(ROOT,runId)
    : null;
  const outer = managed && renderStageDepth === 0;
  if (managed && outer) {
    if (!project) throw new Error('Invalid B run ID');
    assertPipelineProvenance(project,{requireVoice:true});
    assertTalkcraftRenderDiskSpace(ROOT);
    if (process.env.SHOTCRAFT_KEEP_RENDER_TEMP !== '1') cleanupTalkcraftRenderTemp(project);
    try {
      const environment = talkcraftRenderEnvironment(project);
      for (const key of ['TEMP', 'TMP', 'TMPDIR']) process.env[key] = environment[key];
      ensureTalkcraftRenderRuntime(project, SKILL);
      renderStageProject = project;
    } catch (error) {
      if (process.env.SHOTCRAFT_KEEP_RENDER_TEMP !== '1') cleanupTalkcraftRenderTemp(project);
      throw error;
    }
  } else if (managed && renderStageProject && project !== renderStageProject) {
    throw new Error('嵌套渲染阶段不能切换运行目录');
  }
  if (managed) renderStageDepth += 1;
  try {
    return runTalkcraftStageInternal(stage, runId);
  } finally {
    if (managed) {
      renderStageDepth -= 1;
      if (outer) {
        renderStageProject = null;
        if (process.env.SHOTCRAFT_KEEP_RENDER_TEMP !== '1') {
          try { cleanupTalkcraftRenderTemp(project); }
          catch (error) { console.warn(`渲染临时目录清理失败，已保留现场：${error.message}`); }
        }
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result=await runTalkcraftStage(process.argv[2] || '', process.argv[3] || '');
  console.log(JSON.stringify(result,null,2));
  if (result?.passed === false) process.exitCode=1;
}
