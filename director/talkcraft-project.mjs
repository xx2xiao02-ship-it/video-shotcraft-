import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readCurrentTheme, themeAdapter} from './theme-contract.mjs';
import {validateNativeTiming, timingHealth} from './talkcraft-native-timing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export function prepareTalkcraftProject(root, runId) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid B run ID');
  const runDir = path.join(root, 'director', 'b-mode-runs', runId);
  const projectDir = path.join(runDir, 'talkcraft');
  if (existsSync(projectDir)) throw new Error('TalkCraft project already exists; existing work was preserved');

  const reportFile = path.join(runDir, 'placeholder-report.json');
  const planFile = path.join(runDir, 'placeholder-scene-plan.json');
  const audioFile = path.join(root, 'template', 'public', 'b-mode', runId, 'placeholder-voice.mp3');
  const avatarFile = path.join(runDir, 'avatar.png');
  if (![reportFile, planFile, audioFile, avatarFile].every(existsSync)) throw new Error('Completed B run assets are missing');
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  if (report.runId !== runId || plan.runId !== runId || report.isDigitalHuman !== false || report.totalFrames !== plan.totalFrames) {
    throw new Error('B run report and scene plan disagree');
  }
  if (!Array.isArray(plan.scenes) || !plan.scenes.length || plan.totalFrames <= 0 || report.fps !== 30) {
    throw new Error('B run has no valid 30 fps scene plan');
  }

  const publicRoot = path.join(root, 'template', 'public');
  let nextFrame = 0;
  const scenes = plan.scenes.map((scene, index) => {
    if (!scene.text?.trim() || scene.fromFrame !== nextFrame || !Number.isInteger(scene.durationInFrames) || scene.durationInFrames <= 0) {
      throw new Error(`Scene ${index + 1} is empty or does not close on the frame timeline`);
    }
    nextFrame += scene.durationInFrames;
    let source = null;
    if (scene.video) {
      source = path.resolve(publicRoot, scene.video);
      if (!source.startsWith(publicRoot + path.sep) || !existsSync(source)) {
        throw new Error(`Scene ${index + 1} video is missing from this B run`);
      }
    }
    return {id:`s${String(index + 1).padStart(2, '0')}`, text:scene.text.trim(),
      start:scene.fromFrame / 30, end:nextFrame / 30, source, sourcePath:scene.videoSource || null};
  });
  if (nextFrame !== plan.totalFrames) throw new Error('B scene plan does not cover the full audio timeline');

  mkdirSync(path.join(projectDir, 'audio'), {recursive:true});
  mkdirSync(path.join(projectDir, 'assets'), {recursive:true});
  mkdirSync(path.join(projectDir, 'remotion', 'public', 'broll'), {recursive:true});
  copyFileSync(audioFile, path.join(projectDir, 'audio', 'full.mp3'));
  copyFileSync(avatarFile, path.join(projectDir, 'assets', 'avatar.png'));
  const sources = scenes.map(scene => {
    if (!scene.source) return {scene:scene.id, status:'missing'};
    const target = `remotion/public/broll/${scene.id}.mp4`;
    copyFileSync(scene.source, path.join(projectDir, ...target.split('/')));
    return {scene:scene.id, file:target, libraryPath:scene.sourcePath};
  });
  writeFileSync(path.join(projectDir, 'script.txt'), scenes.map(scene => scene.text).join('\n') + '\n', 'utf8');
  writeFileSync(path.join(projectDir, 'script.json'), JSON.stringify({sentences:scenes.map(scene => scene.text)}, null, 2), 'utf8');
  writeFileSync(path.join(projectDir, 'source-shots.json'), JSON.stringify(scenes.map(({id, start, end}) => ({id, start, end})), null, 2), 'utf8');
  writeFileSync(path.join(projectDir, 'sources.md'), '# 素材来源\n\n' + sources.map(source =>
    `- ${source.scene}: ${source.file || '未选素材'}${source.libraryPath ? `，本地素材库路径：${source.libraryPath}` : ''}`
  ).join('\n') + '\n\n素材授权状态仍需逐条确认。\n', 'utf8');
  const theme = readCurrentTheme(root);
  const bTheme = themeAdapter(theme, 'B');
  writeFileSync(path.join(projectDir, 'theme.json'), JSON.stringify({
    schema: 'talkcraft-theme-snapshot-v1', mode: 'B', runId,
    themeId: theme.id, themeHash: theme.themeHash, source: theme,
    adapter: bTheme,
  }, null, 2), 'utf8');
  writeFileSync(path.join(projectDir, 'source-run.json'), JSON.stringify({schema:'talkcraft-source-run-v1', runId,
    fps:30, totalFrames:plan.totalFrames, timingMethod:report.timingMethod,
    visualTextLocale:'zh-CN',
    isDigitalHuman:false, sources,
    themeSchema: theme.schema, themeId: theme.id, themeHash: theme.themeHash,
    themeSnapshot: theme,
  }, null, 2), 'utf8');
  return {projectDir, scenes:scenes.length, withVideo:sources.filter(source => source.file).length,
    timingMethod:report.timingMethod};
}

export function useAlignedTiming(root, runId) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid B run ID');
  const projectDir = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  const source = JSON.parse(readFileSync(path.join(projectDir, 'source-run.json'), 'utf8'));
  const script = JSON.parse(readFileSync(path.join(projectDir, 'script.json'), 'utf8'));
  const timing = JSON.parse(readFileSync(path.join(projectDir, 'audio', 'timestamps.json'), 'utf8'));
  validateNativeTiming(projectDir, timing);
  const native = timing.timingSource === 'tts-native';
  if (source.runId !== runId || !Array.isArray(timing.sentences) || timing.sentences.length !== script.sentences.length) {
    throw new Error('Aligned timestamps do not match the source run');
  }
  const sourceSeconds = source.totalFrames / source.fps;
  if (timing.total > sourceSeconds + 0.1 || sourceSeconds - timing.total > 1.5) {
    throw new Error('Aligned speech duration differs from the source audio');
  }
  const alignedSentences = timing.sentences.map((sentence, index) => {
    const next = timing.sentences[index + 1];
    const start = index === 0 ? 0 : sentence.start;
    const end = next ? next.start : sourceSeconds;
    if (sentence.text.replace(/\s+/gu, '') !== script.sentences[index].replace(/\s+/gu, '') ||
        (native ? !sentence.textMatched : !Number.isFinite(sentence.match) || sentence.match < 0.9 || !Array.isArray(sentence.words) || !sentence.words.length) ||
        !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Aligned sentence ${index + 1} failed the script, word, or timing contract`);
    }
    return {sentence:index, start, end, text:sentence.text};
  });
  writeFileSync(path.join(projectDir, 'aligned-sentences.json'), JSON.stringify(alignedSentences, null, 2), 'utf8');
  return {projectDir, sentences:alignedSentences.length, minMatch:native ? null : Math.min(...timing.sentences.map(sentence => sentence.match)),
    ...timingHealth(timing),
    sourceTiming:source.timingMethod, alignedSeconds:timing.total, audioSeconds:sourceSeconds};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv[2] === 'align'
    ? useAlignedTiming(ROOT, process.argv[3] || '')
    : prepareTalkcraftProject(ROOT, process.argv[2] || '');
  console.log(JSON.stringify(result, null, 2));
}
