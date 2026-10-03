// Isolated static-avatar preview for the confirmed B storyboard. No RunningHub call.
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {countPersonUnits, mapPlaceholderScenes} from './b-mode-placeholder-plan.mjs';
import {resolveLibraryVideo} from './b-mode-library-video.mjs';
import {loadMaterialIndex, matchSceneVideos} from './b-mode-material-match.mjs';
import {loadAcceptanceFixture} from './b-mode-acceptance.mjs';
import {completeVolcengineTiming} from './volcengine-voice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId || '')) throw new Error('Invalid run ID');
const reuseFrom = process.argv.find(arg => arg.startsWith('--reuse-from='))?.split('=')[1] || null;
const useAcceptancePresentation = process.argv.includes('--acceptance-presentation');
const rematchMaterials = process.argv.includes('--rematch-materials');
if (process.argv.includes('--talkcraft')) throw new Error('旧 --talkcraft 规则编导已退役，请使用正式 TalkCraft 入口 /api/talkcraft/create');

const runDir = path.join(ROOT, 'director', 'b-mode-runs', runId);
const inputFile = path.join(runDir, 'input.txt');
const settingsFile = path.join(runDir, 'placeholder-settings.json');
const avatarInput = path.join(runDir, 'avatar.png');
const timingFile = path.join(runDir, 'placeholder-timing.json');
const publicDir = path.join(ROOT, 'template', 'public', 'b-mode', runId);
const audioRel = `b-mode/${runId}/placeholder-voice.mp3`;
const avatarRel = `b-mode/${runId}/placeholder-avatar.png`;
const audioFile = path.join(publicDir, 'placeholder-voice.mp3');
const baselinePropsFile = path.join(runDir, 'placeholder-props.json');
const outDir = path.join(ROOT, 'template', 'out', 'b-mode');
const rawFile = path.join(outDir, `${runId}.placeholder.raw.mp4`);
const finalFile = path.join(outDir, `${runId}.placeholder.mp4`);
const reuseDir = reuseFrom ? path.join(ROOT, 'director', 'b-mode-runs', reuseFrom) : null;
const reuseAudio = reuseDir ? path.join(ROOT, 'template', 'public', 'b-mode', reuseFrom, 'placeholder-voice.mp3') : null;
const reuseTiming = reuseDir ? path.join(reuseDir, 'placeholder-timing.json') : null;
const python = process.env.B_MODE_PYTHON || 'C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe';
const chrome = process.env.REMOTION_BROWSER_EXECUTABLE || 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const cli = path.join(ROOT, 'template', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const run = (cmd, args, cwd=ROOT) => execFileSync(cmd, args, {cwd, stdio:'inherit'});

if (![inputFile, settingsFile, avatarInput].every(existsSync)) throw new Error('占位测试输入不完整');
const text = readFileSync(inputFile, 'utf8').trim();
const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
if (useAcceptancePresentation) {
  const fixture = loadAcceptanceFixture();
  if (text !== fixture.script || settings.scenes.length !== fixture.scenes.length ||
      settings.scenes.some((scene, index) => scene.text !== fixture.scenes[index].text)) {
    throw new Error('验收画面文案与当前文案/分镜不一致，拒绝套用展示方案');
  }
  settings.scenes = settings.scenes.map((scene, index) => ({...scene,
    subtitle:fixture.scenes[index].subtitle,
    visualText:fixture.scenes[index].visualText || '',
  }));
}
if (rematchMaterials) {
  const matches = matchSceneVideos(settings.scenes, loadMaterialIndex(ROOT));
  settings.scenes = settings.scenes.map((scene, index) => ({...scene,
    videoPath:matches[index]?.path || null,
    videoSource:matches[index]?.status || 'unmatched',
    videoReason:matches[index]?.reason || '相邻镜头不能复用同一素材，等待人工选择',
  }));
}
mkdirSync(publicDir, {recursive:true});
mkdirSync(outDir, {recursive:true});
copyFileSync(avatarInput, path.join(publicDir, 'placeholder-avatar.png'));

if (reuseFrom) {
  if (!existsSync(reuseAudio) || !existsSync(reuseTiming)) throw new Error(`复用资产不存在: ${reuseFrom}`);
  copyFileSync(reuseAudio, audioFile);
  copyFileSync(reuseTiming, timingFile);
  console.log('Placeholder stage 1: reuse local TTS and timing', {runId, reuseFrom});
} else {
  console.log('Placeholder stage 1: TTS and timing', {runId});
  if (settings.voiceMode === 'volcengine-clone' || settings.voiceMode === 'volcengine-tts2') {
    const scriptName = settings.voiceMode === 'volcengine-tts2' ? 'volcengine-tts2.mjs' : 'volcengine-voice.mjs';
    run(process.execPath, [path.join(ROOT, 'director', scriptName), 'synthesize',
      inputFile, audioFile, timingFile, settings.speakerId, String(settings.speechRate ?? 0)]);
    completeVolcengineTiming({timingFile, audioFile, text});
  } else {
    run(python, [path.join(ROOT, 'director', 'b-mode-tts.py'), inputFile, audioFile, timingFile,
      '--voice', settings.voice, '--rate', String(settings.speechRate ?? 0), '--max-chars', '1200', '--preserve-sentences']);
  }
}
const timing = JSON.parse(readFileSync(timingFile, 'utf8'));
const scenes = mapPlaceholderScenes(text, settings.scenes, timing);
const selectedBackground = settings.backgroundVideoPath ? resolveLibraryVideo(ROOT, settings.backgroundVideoPath) : null;
if (settings.backgroundVideoPath && !selectedBackground) throw new Error('背景视频在素材库中已不可用');
const sources = new Map();
for (const scene of scenes) {
  const source = scene.videoPath ? resolveLibraryVideo(ROOT, scene.videoPath) :
    scene.subject === 'person' ? selectedBackground : null;
  if (scene.videoPath && !source) throw new Error('分镜视频在素材库中已不可用');
  if (source) sources.set(source.path, source);
  scene.videoSource = source?.path || null;
}
let proxyIndex = 0;
const proxies = new Map();
for (const source of sources.values()) {
  console.log('Placeholder stage 1b: preparing library video', source.path);
  const proxyName = `scene-video-${proxyIndex++}.mp4`;
  const proxyFile = path.join(publicDir, proxyName);
  run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i',source.file,
    '-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30',
    '-an','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-preset','veryfast','-crf','24',
    '-movflags','+faststart',proxyFile]);
  const proxy = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','json',proxyFile], {encoding:'utf8'}));
  proxies.set(source.path, {video:`b-mode/${runId}/${proxyName}`,
    durationFrames:Math.max(1, Math.round(Number(proxy.format.duration) * 30))});
}
for (const scene of scenes) {
  const proxy = proxies.get(scene.videoSource);
  scene.video = proxy?.video || null;
  scene.videoDurationFrames = proxy?.durationFrames || 0;
}
const scenePlan = {runId, kind:'baseline-b-mode-preview', timingMethod:timing.timingMethod,
  totalFrames:timing.totalFrames, personUnits:countPersonUnits(scenes),
  backgroundVideoSource:selectedBackground?.path || null, scenes};
writeFileSync(path.join(runDir, 'placeholder-scene-plan.json'), JSON.stringify(scenePlan, null, 2), 'utf8');
writeFileSync(baselinePropsFile, JSON.stringify({avatar:avatarRel, audio:audioRel, totalFrames:timing.totalFrames, scenes}, null, 2), 'utf8');

const composition = 'BModeBaseline';
const renderPropsFile = baselinePropsFile;
console.log(`Baseline stage 2: Remotion render`, timing.totalFrames, 'frames');
run(process.execPath, [cli, 'render', 'src/index.ts', composition, rawFile,
  `--props=${renderPropsFile}`, `--browser-executable=${chrome}`, `--concurrency=1`, '--overwrite'], path.join(ROOT, 'template'));
console.log(`Baseline stage 3: browser-compatible MP4`);
run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i',rawFile,
  '-vf','scale=in_range=full:out_range=limited,format=yuv420p',
  '-c:v','libx264','-profile:v','baseline','-level:v','3.1','-bf','0','-crf','21',
  '-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  '-c:a','aac','-b:a','128k','-movflags','+faststart',finalFile]);
const posterFile = path.join(runDir, 'placeholder-poster.jpg');
run('ffmpeg', ['-y','-hide_banner','-loglevel','error','-ss',String(Math.min(1, timing.durationSeconds / 2)),'-i',finalFile,'-frames:v','1',posterFile]);
const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries',
  'format=duration:stream=codec_type,codec_name','-of','json',finalFile], {encoding:'utf8'}));
if (!probe.streams?.some(stream => stream.codec_type === 'video') || !probe.streams?.some(stream => stream.codec_type === 'audio')) {
  throw new Error('占位视频缺少画面或配音');
}
const report = {
  runId, mode:'B', kind:'baseline-b-mode-preview', renderer:'BModeBaseline', cardDriven:false, isDigitalHuman:false, runningHubCalled:false,
  avatarSource:'user-provided-still-image', voiceEngine:timing.voiceEngine, voice:timing.voice,
  timingMethod:timing.timingMethod, audioSeconds:timing.durationSeconds, fps:timing.fps,
  totalFrames:timing.totalFrames, renderedSeconds:Number(probe.format.duration),
  personScenes:scenes.filter(scene => scene.subject === 'person').length,
  personUnits:countPersonUnits(scenes), backgroundPreference:settings.background,
  backgroundApplied:false, backgroundVideoSource:selectedBackground?.path || null,
  backgroundVideoApplied:scenes.some(scene => scene.subject === 'person' && !!scene.video),
  matchedVideoScenes:scenes.filter(scene => !!scene.video).length,
  missingVideoScenes:scenes.filter(scene => !scene.video).length, backgroundKeyApplied:false,
  output:finalFile, poster:posterFile,
  streams:probe.streams.map(stream => ({type:stream.codec_type, codec:stream.codec_name})),
};
writeFileSync(path.join(runDir, 'placeholder-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('Placeholder complete:', finalFile);
