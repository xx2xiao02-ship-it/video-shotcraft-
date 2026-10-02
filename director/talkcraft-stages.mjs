import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareTalkcraftProject, useAlignedTiming} from './talkcraft-project.mjs';
import {readNativeTiming, writeNativeTiming, requireWordTiming} from './talkcraft-native-timing.mjs';
import {applySemanticDecisions} from './talkcraft-semantic-decisions.mjs';
import {scaffoldTalkcraftProject} from './talkcraft-scaffold.mjs';
import {recordPreflightPass, recordPreflightResult, recordSemanticPass, readTalkcraftStatus} from './talkcraft-status.mjs';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {writeTalkcraftQaManifests} from './talkcraft-qa-manifests.mjs';
import {completeVolcengineTiming} from './volcengine-voice.mjs';
import {talkcraftMusicProps} from './background-music.mjs';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {writeTalkcraftTemplateUsage} from './talkcraft-template-usage.mjs';
import {assertTalkcraftCardCallsBound, assertTalkcraftCardCallsQaEvidence,
  talkcraftCardCallsQaEvidence} from './talkcraft-card-calls.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = resolveTalkcraftSkillRoot(ROOT);
const PYTHON = process.env.TALKCRAFT_PYTHON || process.env.B_MODE_PYTHON ||
  (existsSync('C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe')
    ? 'C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe' : 'python');
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function script(name) {
  const file = path.join(SKILL, 'scripts', name);
  if (!existsSync(file)) throw new Error(`TalkCraft skill script is missing: ${file}`);
  return file;
}

function run(command, args, cwd) {
  execFileSync(command, args, {cwd, stdio:'inherit', env:{...process.env, PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1',
    ...(process.env.TALKCRAFT_PYTHONPATH ? {PYTHONPATH:process.env.TALKCRAFT_PYTHONPATH} : {})}});
}

function requireFiles(project, names) {
  const missing = names.filter(name => !existsSync(path.join(project, name)));
  if (missing.length) throw new Error(`TalkCraft artifacts are missing: ${missing.join(', ')}`);
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
  const out = [];
  const flush = () => {
    if (!inShot) return;
    if (!hasMedia) { out.push('- 素材：待人工审核'); adjustments.push('为缺少素材行的镜头补充“待人工审核”占位'); }
    if (!hasSkin) { out.push('- 蒙皮：待人工审核'); adjustments.push('为缺少蒙皮行的镜头补充“待人工审核”占位'); }
  };
  for (const line of lines) {
    if (/^#{2,4}\s+[SsVv]\d+[A-Za-z0-9_']*\b/.test(line)) {
      flush(); inShot = true; hasMedia = false; hasSkin = false;
    }
    if (inShot && /^\s*[-*]?\s*\**素材\**\s*[:：]/.test(line)) hasMedia = true;
    if (inShot && /^\s*[-*]?\s*\**蒙皮\**\s*[:：]/.test(line)) hasSkin = true;
    if (inShot && /^#{1,6}\s/.test(line) && !/^#{2,4}\s+[SsVv]\d+/.test(line)) flush(), inShot = false;
    out.push(line);
  }
  flush();
  if (!out.some(line => /^#{2,4}\s+.*未完成/.test(line))) {
    out.push('', '## 未完成 / 未采集清单', '', '- 待人工审核自动调节结果、真实素材、语义承载和选卡。');
    adjustments.push('补充未完成 / 未采集清单');
  }
  if (adjustments.length) writeFileSync(file, out.join('\n'), 'utf8');
  return adjustments;
}

function verifyTalkcraftCardCalls(project, runId, {sample = false, complete = false} = {}) {
  const source = JSON.parse(readFileSync(path.join(project, 'source-run.json'), 'utf8'));
  return assertTalkcraftCardCallsBound(ROOT, SKILL, runId, {
    requireCardCalls:source.cardCallsRequired === true,
    requiredShotIds:source.cardCallsRequired === true && sample ? ['s01'] : [],
    requireCompleteCoverage:source.cardCallsRequired === true && complete,
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

export function runTalkcraftStage(stage, runId) {
  if (!runIdPattern.test(runId)) throw new Error('Invalid B run ID');
  if (!existsSync(path.join(SKILL, 'SKILL.md'))) throw new Error('TalkCraft skill is not installed');
  if (stage === 'prepare') return prepareTalkcraftProject(ROOT, runId);
  const project = path.join(ROOT, 'director', 'b-mode-runs', runId, 'talkcraft');
  if (!existsSync(path.join(project, 'source-run.json'))) throw new Error('Run prepare first');

  if (stage === 'bootstrap') {
    runTalkcraftStage('synthesize', runId);
    runTalkcraftStage('align', runId);
    return runTalkcraftStage('semantic-init', runId);
  }
  if (stage === 'recover-timing') {
    requireFiles(project, ['audio/full.mp3', 'audio/voice-timing.json']);
    if (!readNativeTiming(project)) throw new Error('没有可复用的 TTS 原始时间戳；已保留配音');
    runTalkcraftStage('align', runId);
    return runTalkcraftStage('semantic-init', runId);
  }

  if (stage === 'align') {
    if (existsSync(path.join(project, 'audio', 'timestamps.json'))) throw new Error('Existing timestamps were preserved');
    const native = writeNativeTiming(project);
    if (!native) {
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
    if (source.voiceMode === 'volcengine-clone' || source.voiceMode === 'volcengine-tts2') {
      if (!source.speakerId) throw new Error('火山语音音色缺少 ID');
      const scriptName = source.voiceMode === 'volcengine-tts2' ? 'volcengine-tts2.mjs' : 'volcengine-voice.mjs';
      run(process.execPath, [path.join(ROOT, 'director', scriptName), 'synthesize',
        'input.txt', 'audio/full.mp3', 'audio/voice-timing.json', source.speakerId, String(source.speechRate ?? 0)], project);
      const timingPath = path.join(project, 'audio', 'voice-timing.json');
      completeVolcengineTiming({timingFile:timingPath, audioFile:path.join(project, 'audio', 'full.mp3'), text:readFileSync(path.join(project, 'input.txt'), 'utf8')});
    } else {
      run(PYTHON, [path.join(ROOT, 'director', 'b-mode-tts.py'), 'input.txt',
        'audio/full.mp3', 'audio/voice-timing.json', '--voice', source.voice || 'zh-CN-YunxiNeural',
        '--rate', String(source.speechRate ?? 0), '--max-chars', '1200', '--preserve-sentences'], project);
    }
    const timing = JSON.parse(readFileSync(path.join(project, 'audio', 'voice-timing.json'), 'utf8'));
    writeFileSync(sourceFile, JSON.stringify({...source, totalFrames:timing.totalFrames,
      timingMethod:timing.timingMethod, voiceEngine:timing.voiceEngine}, null, 2), 'utf8');
    return {project, audioSeconds:timing.durationSeconds, timingMethod:timing.timingMethod};
  }
  if (stage === 'semantic-init') {
    run(PYTHON, [script('semantic_annotate.py'), '--project', project, '--init',
      '--shots', 'remotion/not-yet-planned.json'], project);
    return {project, artifact:'semantics.json', status:'awaiting_agent_review'};
  }
  if (stage === 'semantic-check') {
    run(PYTHON, [script('semantic_annotate.py'), '--project', project, '--stats'], project);
    recordSemanticPass(ROOT, runId);
    return {project, status:'semantic_check_passed'};
  }
  if (stage === 'semantic-apply') {
    return applySemanticDecisions(project, SKILL);
  }
  if (stage === 'candidates') {
    mkdirSync(path.join(project, 'qa'), {recursive:true});
    run(PYTHON, [script('card_match.py'), '--project', project,
      '--out', 'qa/card-candidates.md', '--json', 'qa/card-candidates.json'], project);
    return {project, artifact:'qa/card-candidates.md'};
  }
  if (stage === 'preflight') {
    runTalkcraftStage('candidates', runId);
    const adjustments = autoAdjustShotbook(project);
    const check = spawnSync(PYTHON, [script('preflight.py'), '--project', project, '--shotbook', 'SHOTBOOK.md',
      '--shots', 'remotion/shots.json', '--semantics', 'semantics.json',
      '--script', 'script.txt', '--voice', 'audio/full.mp3', '--fps', '30'],
      {cwd:project, encoding:'utf8', env:{...process.env, PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1'}});
    const output = `${check.stdout || ''}${check.stderr || ''}`;
    if (output) process.stdout.write(output);
    const issues = output.split(/\r?\n/).map(line => line.trim()).filter(line => /^\[[^\]]+\]\s+FAIL:/.test(line));
    if (check.error) issues.push(`自动调节执行失败：${String(check.error.message || check.error)}`);
    recordPreflightResult(ROOT, runId, {passed:check.status === 0, issues, adjustments});
    return {project, status:'automatic_adjustment_complete', passed:check.status === 0, issues, adjustments};
  }
  if (stage === 'beat-lint') {
    requireWordTiming(project);
    run(PYTHON, [script('beat_lint.py'), 'remotion/beats.json', 'audio/timestamps.json',
      '--shots', 'remotion/shots.json'], project);
    return {project, status:'beat_lint_passed'};
  }
  if (stage === 'workbench-contract') {
    run(PYTHON, [script('workbench_contract_lint.py'), project], project);
    return {project, status:'workbench_contract_passed'};
  }
  if (stage === 'scaffold') {
    requireWordTiming(project);
    return scaffoldTalkcraftProject(ROOT, SKILL, runId);
  }
  if (stage === 'sfx-dump') {
    run('node', [script('sfx_dump.mjs'), 'remotion/public/sfx'], project);
    return {project, artifact:'remotion/public/sfx'};
  }
  if (stage === 'digital-human') {
    runTalkcraftStage('preflight', runId);
    run(process.execPath, [path.join(ROOT, 'director', 'talkcraft-digital-human.mjs'), runId], ROOT);
    return {project, status:'digital_human_assets_ready'};
  }
  if (stage === 'sample') {
    if (existsSync(path.join(project, 'remotion', 'out', 'preview', 's01.mp4'))) {
      throw new Error('Existing first-shot sample was preserved');
    }
    runTalkcraftStage('semantic-check', runId);
    runTalkcraftStage('preflight', runId);
    verifyTalkcraftCardCalls(project, runId, {sample:true});
    runTalkcraftStage('beat-lint', runId);
    const digitalHuman = readTalkcraftDigitalHumanStatus(project);
    if (digitalHuman.required && !digitalHuman.ready) {
      throw new Error('数字人镜头素材未生成，不能渲染样板镜');
    }
    const bgmProps = talkcraftMusicProps(ROOT, path.join(project, 'remotion'), true);
    run('node', [script('render_shots.mjs'), '--entry', 'src/index.ts', '--comp', 'Main',
      '--shots', 'shots.json', '--only', 's01',
      '--seg-audio', '--preview-dir', 'out/preview', '--props', bgmProps], path.join(project, 'remotion'));
    return {project, artifact:'remotion/out/preview/s01.mp4', status:'awaiting_user_sample_approval'};
  }
  if (stage === 'render-all') {
    if (existsSync(path.join(project, 'remotion', 'out', 'final.mp4'))) {
      throw new Error('Existing final render was preserved');
    }
    if (!readTalkcraftStatus(ROOT, runId).sampleApproved) {
      throw new Error('The first-shot sample must be approved before full rendering');
    }
    const status = readTalkcraftStatus(ROOT, runId);
    if (!status.scenesReady) {
      throw new Error(`Remaining shots are not implemented: ${status.scenesMissing.join(', ')}`);
    }
    runTalkcraftStage('semantic-check', runId);
    runTalkcraftStage('preflight', runId);
    verifyTalkcraftCardCalls(project, runId, {complete:true});
    runTalkcraftStage('beat-lint', runId);
    runTalkcraftStage('workbench-contract', runId);
    const digitalHuman = readTalkcraftDigitalHumanStatus(project);
    if (digitalHuman.required && !digitalHuman.ready) {
      throw new Error('数字人镜头素材未生成，不能渲染整片');
    }
    const bgmProps = talkcraftMusicProps(ROOT, path.join(project, 'remotion'), false);
    const verifiedSegments = hasVerifiedPreviewSegments(project);
    run('node', [script('render_shots.mjs'), '--entry', 'src/index.ts', '--comp', 'Main',
      '--shots', 'shots.json', ...(verifiedSegments
        ? ['--seg-dir', 'out/segments']
        : ['--all', '--seg-dir', 'out/segments-final-v1']),
      '--parallel', '1', '--concat', 'out/assembled.mp4',
      '--audio', 'out/full-mix.wav', '--mux', 'out/final.mp4', '--props', bgmProps], path.join(project, 'remotion'));
    writeTalkcraftTemplateUsage(project, SKILL, path.join(project, 'remotion', 'out', 'final.mp4'));
    return {project, artifact:'remotion/out/final.mp4', status:'awaiting_three_gate_qa'};
  }
  if (stage === 'render-sfx-solo') {
    requireFiles(project, ['remotion/cues.json', 'remotion/out/final.mp4']);
    if (existsSync(path.join(project, 'remotion', 'out', 'sfx-solo.wav'))) {
      throw new Error('Existing SFX-only track was preserved');
    }
    const cli = path.join(SKILL, 'runtime', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
    if (!existsSync(cli)) throw new Error('TalkCraft runtime is not installed');
    run('node', [cli, 'render', 'src/index.ts', 'Main', 'out/sfx-solo.wav',
      '--codec=wav', '--props={"sfxSolo":true,"audioOnly":true}'], path.join(project, 'remotion'));
    return {project, artifact:'remotion/out/sfx-solo.wav'};
  }
  if (stage === 'qa') {
    writeTalkcraftQaManifests(ROOT, runId);
    requireFiles(project, ['remotion/out/final.mp4',
      'remotion/beats.json', 'remotion/cues.json', 'remotion/cards-used.json', 'remotion/anchors.json']);
    const remotion = path.join(project, 'remotion');
    const cards = JSON.parse(readFileSync(path.join(remotion, 'cards-used.json'), 'utf8'));
    if (!Array.isArray(cards.slugs) || !cards.slugs.length) throw new Error('Used-card manifest is empty');
    const cues = JSON.parse(readFileSync(path.join(remotion, 'cues.json'), 'utf8'));
    if (!Array.isArray(cues) || !cues.length) throw new Error('Selected cards have no SFX cues');
    if (!existsSync(path.join(remotion, 'out', 'sfx-solo.wav'))) runTalkcraftStage('render-sfx-solo', runId);
    run(PYTHON, [script('motion_check.py'), 'out/final.mp4', '--anchors', 'anchors.json'], remotion);
    run(PYTHON, [script('sfx_check.py'), 'out/sfx-solo.wav', 'cues.json'], remotion);
    run(PYTHON, [script('sfx_check.py'), '--mix', 'out/final.mp4', '../audio/full.mp3',
      'cues.json', '--timestamps', '../audio/timestamps.json'], remotion);
    run(PYTHON, [script('card_lint.py'), 'src', cards.slugs.join(',')], remotion);
    runTalkcraftStage('beat-lint', runId);
    runTalkcraftStage('workbench-contract', runId);
    mkdirSync(path.join(project, 'qa', 'frames'), {recursive:true});
    run(PYTHON, [script('qa_extract.py'), 'remotion/out/final.mp4', 'audio/timestamps.json',
      'qa/frames', '540', 'remotion/anchors.json'], project);
    run(PYTHON, [script('contact_sheet.py'), 'qa/frames', 'qa/contact-sheets'], project);
    const finalHash = sha256(path.join(remotion, 'out', 'final.mp4'));
    const cardCallsEvidence = talkcraftCardCallsQaEvidence(ROOT, SKILL, runId);
    writeFileSync(path.join(project, 'qa', 'passed.json'), JSON.stringify({schema:'talkcraft-qa-pass-v1',
      finalSha256:finalHash, cards:cards.slugs.length, cardCallsEvidence,
      checkedAt:new Date().toISOString()}, null, 2), 'utf8');
    return {project, status:'awaiting_independent_review', finalSha256:finalHash};
  }
  if (stage === 'deliver') {
    requireFiles(project, ['remotion/out/final.mp4', 'qa/passed.json',
      'review/REVIEW.md', 'review/approval.json']);
    const finalFile = path.join(project, 'remotion', 'out', 'final.mp4');
    const outputFile = path.join(project, 'remotion', 'out', 'delivery.mp4');
    if (existsSync(outputFile)) throw new Error('Existing delivery was preserved');
    const finalSha256 = sha256(finalFile);
    const qa = JSON.parse(readFileSync(path.join(project, 'qa', 'passed.json'), 'utf8'));
    const approval = JSON.parse(readFileSync(path.join(project, 'review', 'approval.json'), 'utf8'));
    const review = readFileSync(path.join(project, 'review', 'REVIEW.md'), 'utf8');
    const shots = JSON.parse(readFileSync(path.join(project, 'remotion', 'shots.json'), 'utf8'));
    assertTalkcraftCardCallsQaEvidence(ROOT, SKILL, runId, qa.cardCallsEvidence);
    if (qa.finalSha256 !== finalSha256 || approval.finalSha256 !== finalSha256 ||
        approval.reviewedShots !== shots.length || approval.openP0 !== 0 || approval.openP1 !== 0 ||
        !review.includes(`## 评审完成 · 已看 ${shots.length}/${shots.length} 镜`)) {
      throw new Error('Machine QA or independent review is missing, stale, or has open P0/P1 issues');
    }
    const target = 'loudnorm=I=-15:TP=-1.5:LRA=11';
    const first = spawnSync('ffmpeg', ['-hide_banner', '-i', finalFile,
      '-af', `${target}:print_format=json`, '-f', 'null', 'NUL'], {encoding:'utf8'});
    if (first.status !== 0) throw new Error(first.stderr || 'Loudness measurement failed');
    const match = first.stderr.match(/\{\s*"input_i"[\s\S]*?\}/u);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(runTalkcraftStage(process.argv[2] || '', process.argv[3] || ''), null, 2));
}
