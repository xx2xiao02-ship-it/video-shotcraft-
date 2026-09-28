// Segmented RunningHub digital-human path.
// It creates one local MP4 per contiguous person unit and never retries a paid task.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RunningHubInfiniteTalkTransport} from './runninghub-infinitetalk.mjs';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';
import {planCombinedDigitalHumanAudio, createCombinedDigitalHumanAudio, splitCombinedDigitalHumanVideo} from './b-mode-digital-human-batch.mjs';
import {renderDigitalHumanComposition} from './b-mode-digital-human-composition.mjs';
import {completeVolcengineTiming} from './volcengine-voice.mjs';
import {runningHubRuntimeConfig} from './api-center.mjs';

const ROOT = process.env.SHOTCRAFT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId || '')) throw new Error('Invalid run ID');

const runDir = path.join(ROOT, 'director', 'b-mode-runs', runId);
const settingsFile = path.join(runDir, 'digital-human-settings.json');
const publicDir = path.join(ROOT, 'template', 'public', 'b-mode', runId);
const inputMp3 = path.join(publicDir, 'digital-human-input.mp3');
const inputWav = path.join(publicDir, 'digital-human-input.wav');
const taskFile = path.join(runDir, 'digital-human-tasks.json');
const reportFile = path.join(runDir, 'digital-human-report.json');
const python = process.env.B_MODE_PYTHON || 'C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe';
const runningHub = runningHubRuntimeConfig();

const run = (command, args, options = {}) => execFileSync(command, args, {cwd: ROOT, stdio: 'inherit', ...options});
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

if (!existsSync(settingsFile)) throw new Error('数字人输入不完整');
const settings = readJson(settingsFile);
const generationMode = settings.generationMode || 'segments';
if (!['segments', 'combined'].includes(generationMode)) throw new Error('数字人生成模式无效');
const text = String(settings.text || '').trim();
if (!text || !Array.isArray(settings.scenes) || !settings.scenes.some(scene => scene.subject === 'person')) {
  throw new Error('数字人生成需要完整文案和至少一个 person 分镜');
}
const avatarFiles = Array.isArray(settings.avatarFiles) && settings.avatarFiles.length ? settings.avatarFiles : ['avatar.png'];
const avatarPaths = avatarFiles.map(file => path.join(runDir, path.basename(String(file))));
if (!avatarPaths.every(existsSync)) throw new Error('数字人角色图数组不完整');

const stableChoice = (seed, size) => {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) % size;
};

mkdirSync(publicDir, {recursive: true});
const report = {runId, mode: 'B', generationMode,
  kind: generationMode === 'combined' ? 'runninghub-digital-human-combined' : 'runninghub-digital-human-segments',
  isDigitalHuman: true, runningHubCalled: false,
  status: 'starting', provider: 'runninghub', appId: runningHub.appId,
  input: {avatars: avatarFiles, audio: generationMode === 'combined' ? 'digital-human-combined.wav' : 'digital-human-input.wav',
    audioNormalization: 'pcm_s16le_48000_stereo'},
  output: null, taskId: null, taskIds: [], outputUrlAvailable: false, units: []};
writeJson(reportFile, report);

console.log('Digital human stage 1: TTS');
const timingFile = path.join(runDir, 'digital-human-timing.json');
if (settings.voiceMode === 'volcengine-clone' || settings.voiceMode === 'volcengine-tts2') {
  const scriptName = settings.voiceMode === 'volcengine-tts2' ? 'volcengine-tts2.mjs' : 'volcengine-voice.mjs';
  run(process.execPath, [path.join(ROOT, 'director', scriptName), 'synthesize',
    path.join(runDir, 'input.txt'), inputMp3, timingFile, settings.speakerId]);
  completeVolcengineTiming({timingFile, audioFile:inputMp3, text});
} else {
  run(python, [path.join(ROOT, 'director', 'b-mode-tts.py'), path.join(runDir, 'input.txt'), inputMp3,
    timingFile, '--voice', String(settings.voice || 'zh-CN-YunxiNeural'),
    '--rate', '0', '--max-chars', '1200', '--preserve-sentences']);
}

console.log('Digital human stage 1b: normalize audio to WAV');
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputMp3, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', inputWav]);
const timing = readJson(timingFile);
const plan = planDigitalHumanUnits(text, settings.scenes, timing);
const combinedSegments = generationMode === 'combined' ? planCombinedDigitalHumanAudio(plan.units) : null;
const combinedAvatarIndex = generationMode === 'combined' ? stableChoice(runId, avatarPaths.length) : null;
report.timingMethod = timing.timingMethod;
report.totalFrames = timing.totalFrames;
if (combinedSegments) report.combined = {segments:combinedSegments,
  totalFrames:combinedSegments.at(-1).fromFrame + combinedSegments.at(-1).durationInFrames,
  avatarIndex:combinedAvatarIndex};
report.units = plan.units.map((unit, index) => ({
  index,
  sceneIndexes: unit.sceneIndexes,
  fromFrame: unit.fromFrame,
  durationInFrames: unit.durationInFrames,
  durationSeconds: unit.durationInFrames / 30,
  avatarIndex: combinedSegments ? combinedAvatarIndex : stableChoice(`${runId}:${index}`, avatarPaths.length),
  avatar: path.basename(avatarPaths[combinedSegments ? combinedAvatarIndex : stableChoice(`${runId}:${index}`, avatarPaths.length)]),
  status: 'pending',
  output: path.join(runDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.mp4`),
}));
writeJson(reportFile, report);
const transport = new RunningHubInfiniteTalkTransport({
  apiKey: runningHub.apiKey,
  appId: runningHub.appId,
  baseUrl: runningHub.baseUrl,
  maxWaitMs: runningHub.maxWaitMs,
  pollIntervalMs: runningHub.pollIntervalMs,
});

const temporaryParts = new Set();
try {
  const taskRecords = [];
  const combinedAudioFile = path.join(publicDir, 'digital-human-combined.wav');
  if (combinedSegments) createCombinedDigitalHumanAudio(inputWav, combinedAudioFile, combinedSegments);
  if (combinedSegments) {
    for (const [index, unit] of plan.units.entries()) {
      run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-ss',String(unit.fromFrame / 30),'-i',inputWav,
        '-t',String(unit.durationInFrames / 30),'-ar','48000','-ac','2','-c:a','pcm_s16le',
        path.join(publicDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.wav`)]);
    }
  }
  for (const [index, unit] of plan.units.entries()) {
    const unitReport = report.units[index];
    const audioFile = path.join(publicDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.wav`);
    const startSeconds = unit.fromFrame / 30;
    const durationSeconds = unit.durationInFrames / 30;
    if (!combinedSegments) run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(startSeconds), '-i', inputWav,
      '-t', String(durationSeconds), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', audioFile]);
    const audioBytes = readFileSync(combinedSegments ? combinedAudioFile : audioFile);
    const imageBytes = readFileSync(avatarPaths[unitReport.avatarIndex]);
    const created = await transport.create({
      imageBytes, audioBytes, imageName: 'image.png', audioName: combinedSegments ? 'audio-combined.wav' : `audio-person-${String(index + 1).padStart(2, '0')}.wav`,
      imageMime: 'image/png', audioMime: 'audio/wav',
      maxSide: settings.maxSide || '1080', prompt: settings.prompt || '人物自然说话，身体保持稳定，配合轻微自然手势',
      intensity: settings.intensity || '0', scale: settings.scale || '1.05', instanceType: settings.instanceType || 'plus',
    });
    report.runningHubCalled = true;
    report.status = created.status || 'QUEUED';
    report.taskId ||= created.taskId;
    report.taskIds.push(created.taskId);
    unitReport.taskId = created.taskId;
    unitReport.status = created.status || 'QUEUED';
    if (combinedSegments) report.units.forEach(item => { item.taskId = created.taskId; item.status = unitReport.status; });
    taskRecords.push({index, taskId: created.taskId, createdAt: new Date().toISOString(), appId: report.appId});
    writeJson(taskFile, taskRecords);
    writeJson(reportFile, report);
    console.log(`Digital human stage 2: submitted person unit ${index + 1}/${plan.units.length} ${created.taskId}`);
    const result = await transport.waitForResult(created.taskId, {onUpdate: update => {
      report.status = update.status;
      unitReport.status = update.status;
      if (combinedSegments) report.units.forEach(item => { item.status = update.status; });
      writeJson(reportFile, report);
      console.log(`Digital human stage 3: person unit ${index + 1}/${plan.units.length} ${update.status}`);
    }});
    const bytes = await transport.download(result.outputUrl);
    const combinedOutput = path.join(runDir, 'digital-human-combined.mp4');
    const outputPart = `${combinedSegments ? combinedOutput : unitReport.output}.part`;
    temporaryParts.add(outputPart);
    writeFileSync(outputPart, bytes);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', outputPart], {encoding: 'utf8'}));
    if (!probe.streams?.some(stream => stream.codec_type === 'video')) throw new Error(`RunningHub 第 ${index + 1} 个片段没有视频轨`);
    renameSync(outputPart, combinedSegments ? combinedOutput : unitReport.output);
    temporaryParts.delete(outputPart);
    if (combinedSegments) {
      const split = splitCombinedDigitalHumanVideo(combinedOutput, report.units.map(item => item.output), combinedSegments);
      report.units.forEach((item, unitIndex) => {
        item.status = 'SUCCESS';
        item.durationSeconds = split[unitIndex].durationSeconds;
        item.streams = [{type:'video', codec:'h264'}];
        item.usage = result.usage || {};
      });
      report.combined.output = combinedOutput;
      report.combined.durationSeconds = Number(probe.format?.duration || 0);
      report.combined.taskId = created.taskId;
      report.usage = result.usage || {};
      writeJson(reportFile, report);
      break;
    }
    unitReport.status = 'SUCCESS';
    unitReport.durationSeconds = Number(probe.format?.duration || 0);
    unitReport.streams = probe.streams.map(stream => ({type: stream.codec_type, codec: stream.codec_name}));
    unitReport.usage = result.usage || {};
    report.usage = {...(report.usage || {}), ...(result.usage || {})};
    writeJson(reportFile, report);
    console.log(`Digital human complete: ${unitReport.output}`);
  }
  report.status = 'COMPOSING';
  writeJson(reportFile, report);
  const composition = renderDigitalHumanComposition({root:ROOT, runId, timing, plan,
    units:report.units, avatarPaths});
  report.status = 'SUCCESS';
  report.output = composition.output;
  report.composition = composition;
  report.outputUrlAvailable = report.units.every(unit => unit.status === 'SUCCESS');
  report.outputUrlExpires = '24h';
  report.durationSeconds = Number(timing.durationSeconds || timing.totalFrames / 30 || 0);
  writeJson(reportFile, report);
  console.log(`Digital human segments complete: ${report.units.length}`);
} catch (error) {
  report.status = 'FAILED';
  report.error = String(error?.message || error).slice(0, 500);
  writeJson(reportFile, report);
  throw error;
} finally {
  for (const outputPart of temporaryParts) {
    try { if (existsSync(outputPart)) run('cmd.exe', ['/d', '/c', 'del', '/q', outputPart], {stdio: 'ignore'}); } catch {}
  }
}
