import {execFileSync, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const FPS = 30;

export function silentTailPadFrames(plannedFrames, actualSeconds, trailingPeakDb) {
  const missing = plannedFrames - Math.round(actualSeconds * FPS);
  if (missing <= 0) return 0;
  if (missing > 9 || !Number.isFinite(trailingPeakDb) || trailingPeakDb > -35) {
    throw new Error('数字人素材时长不足，且缺口超过 0.3 秒或主配音尾部仍有声音');
  }
  return missing;
}

function videoDurationSeconds(file) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
    '-show_entries','stream=duration','-of','json',file], {encoding:'utf8'}));
  const duration = Number(probe.streams?.[0]?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('数字人素材缺少有效视频时长');
  return duration;
}

function trailingAudioPeakDb(file, fromSeconds, durationSeconds) {
  const check = spawnSync('ffmpeg', ['-hide_banner','-ss',String(fromSeconds),'-i',file,
    '-t',String(durationSeconds),'-af','volumedetect','-f','null','-'], {encoding:'utf8'});
  const peak = /max_volume:\s*(-?[\d.]+) dB/.exec(check.stderr || '');
  if (check.status !== 0 || !peak) throw new Error('无法检验数字人缺帧对应的主配音静音尾部');
  return Number(peak[1]);
}

export function buildDigitalHumanComposition({runId, timing, plan, units, avatarFiles}) {
  if (!Number.isInteger(timing?.totalFrames) || timing.totalFrames <= 0) throw new Error('主 TTS 总帧数无效');
  if (!Array.isArray(avatarFiles) || !avatarFiles.length) throw new Error('缺少数字人形象数组');
  if (!Array.isArray(units) || units.length !== plan.units.length || units.some(unit => unit.status !== 'SUCCESS')) {
    throw new Error('数字人镜头组尚未全部生成');
  }
  const sceneToUnit = new Map();
  for (const [index, planned] of plan.units.entries()) {
    const unit = units[index];
    if (unit.fromFrame !== planned.fromFrame || unit.durationInFrames !== planned.durationInFrames ||
        !Array.isArray(unit.sceneIndexes) || unit.sceneIndexes.join(',') !== planned.sceneIndexes.join(',')) {
      throw new Error(`第 ${index + 1} 个数字人素材与镜头时间表不一致`);
    }
    const actualFrames = Math.round(Number(unit.durationSeconds) * FPS);
    if (!Number.isFinite(actualFrames) || actualFrames < planned.durationInFrames) {
      throw new Error(`第 ${index + 1} 个数字人素材时长不足`);
    }
    for (const sceneIndex of planned.sceneIndexes) sceneToUnit.set(sceneIndex, index);
  }
  let endFrame = 0;
  const scenes = plan.mappedScenes.map(scene => {
    if (scene.fromFrame !== endFrame || scene.durationInFrames <= 0) throw new Error('镜头时间线未连续闭合');
    endFrame += scene.durationInFrames;
    const unitIndex = sceneToUnit.get(scene.sceneIndex);
    if (scene.subject === 'person' && unitIndex === undefined) throw new Error('人物镜头缺少数字人视频');
    if (scene.subject !== 'person' && unitIndex !== undefined) throw new Error('非人物镜头错误绑定了数字人视频');
    return {
      ...scene,
      ...(unitIndex === undefined ? {} : {
        digitalHumanVideo:`b-mode/${runId}/digital-human-person-${String(unitIndex + 1).padStart(2, '0')}.mp4`,
        digitalHumanStartFrame:scene.fromFrame - plan.units[unitIndex].fromFrame,
      }),
    };
  });
  if (endFrame !== timing.totalFrames) throw new Error('镜头时间线与主 TTS 总帧数不一致');
  const manifest = {schema:'b-mode-digital-human-composition-v1', runId, fps:FPS, totalFrames:timing.totalFrames,
    audio:`b-mode/${runId}/digital-human-input.wav`, scenes,
    units:units.map((unit, index) => ({index, sceneIndexes:unit.sceneIndexes, fromFrame:unit.fromFrame,
      durationInFrames:unit.durationInFrames, avatarIndex:unit.avatarIndex,
      video:`b-mode/${runId}/digital-human-person-${String(index + 1).padStart(2, '0')}.mp4`}))};
  return {manifest, props:{avatar:`b-mode/${runId}/digital-human-avatar.png`,
    audio:manifest.audio, totalFrames:timing.totalFrames, scenes}};
}

export function renderDigitalHumanComposition({root, runId, timing, plan, units, avatarPaths, outputTag = ''}) {
  if (outputTag && !/^[a-z0-9-]+$/.test(outputTag)) throw new Error('成片版本标记无效');
  const runDir = path.join(root, 'director', 'b-mode-runs', runId);
  const publicDir = path.join(root, 'template', 'public', 'b-mode', runId);
  const outDir = path.join(root, 'template', 'out', 'b-mode');
  const finalFile = path.join(outDir, `${runId}.digital-human-final${outputTag ? '-' + outputTag : ''}.mp4`);
  const attempt = randomUUID().slice(0, 8);
  const rawFile = path.join(outDir, `${runId}.digital-human-raw-${attempt}.mp4`);
  const finalPart = path.join(outDir, `${runId}.digital-human-final-${attempt}.part.mp4`);
  if (existsSync(finalFile)) throw new Error('已有最终成片，保留原文件，拒绝覆盖');
  if (!existsSync(path.join(publicDir, 'digital-human-input.wav'))) throw new Error('最终版主 TTS WAV 不存在');
  if (!avatarPaths.every(existsSync) || !units.every(unit => existsSync(unit.output))) throw new Error('数字人形象或片段文件缺失');
  mkdirSync(outDir, {recursive:true});
  const tailPaddedUnits = [];
  const preparedUnits = units.map((unit, index) => {
    const actualSeconds = videoDurationSeconds(unit.output);
    const plannedFrames = plan.units[index]?.durationInFrames;
    if (!Number.isInteger(plannedFrames)) throw new Error('数字人镜头组与素材数量不一致');
    const missing = plannedFrames - Math.round(actualSeconds * FPS);
    if (missing <= 0) return {...unit, durationSeconds:actualSeconds};
    if (missing > 9) throw new Error(`第 ${index + 1} 个数字人素材时长不足，超过静音补帧上限`);
    const audioFile = path.join(publicDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.wav`);
    if (!existsSync(audioFile)) throw new Error('数字人裁切音频缺失，无法判断静音尾部');
    const fromSeconds = Math.max(0, actualSeconds - 0.1);
    const peak = trailingAudioPeakDb(audioFile, fromSeconds, plannedFrames / FPS - fromSeconds);
    silentTailPadFrames(plannedFrames, actualSeconds, peak);
    const paddedFile = path.join(runDir, `digital-human-person-${String(index + 1).padStart(2, '0')}-tail-padded${outputTag ? '-' + outputTag : ''}.mp4`);
    if (existsSync(paddedFile)) throw new Error('已有补帧素材，保留原文件，拒绝覆盖');
    execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i',unit.output,
      '-vf','tpad=stop_mode=clone:stop_duration=0.4,fps=30','-frames:v',String(plannedFrames),
      '-an','-c:v','libx264','-pix_fmt','yuv420p',paddedFile], {stdio:'inherit'});
    const paddedSeconds = videoDurationSeconds(paddedFile);
    if (Math.round(paddedSeconds * FPS) < plannedFrames) throw new Error('数字人尾部补帧失败');
    tailPaddedUnits.push({index, frames:missing, trailingPeakDb:peak});
    return {...unit, output:paddedFile, durationSeconds:paddedSeconds};
  });
  const {manifest, props} = buildDigitalHumanComposition({runId, timing, plan,
    units:preparedUnits, avatarFiles:avatarPaths});
  copyFileSync(avatarPaths[0], path.join(publicDir, 'digital-human-avatar.png'));
  preparedUnits.forEach((unit, index) => copyFileSync(unit.output,
    path.join(publicDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.mp4`)));
  const propsFile = path.join(runDir, 'digital-human-composition-props.json');
  writeFileSync(propsFile, JSON.stringify(props, null, 2), 'utf8');
  writeFileSync(path.join(runDir, 'digital-human-composition-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  const cli = path.join(root, 'template', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  const browser = process.env.REMOTION_BROWSER_EXECUTABLE || 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
  execFileSync(process.execPath, [cli, 'render', 'src/index.ts', 'BModeBaseline', rawFile,
    `--props=${propsFile}`, `--browser-executable=${browser}`, '--concurrency=1'],
  {cwd:path.join(root, 'template'), stdio:'inherit'});
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', rawFile,
    '-vf', 'scale=in_range=full:out_range=limited,format=yuv420p', '-c:v', 'libx264',
    '-profile:v', 'baseline', '-level:v', '3.1', '-bf', '0', '-crf', '21',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', finalPart], {stdio:'inherit'});
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries',
    'format=duration:stream=codec_type,codec_name','-of','json',finalPart], {encoding:'utf8'}));
  if (!probe.streams?.some(stream => stream.codec_type === 'video') ||
      !probe.streams?.some(stream => stream.codec_type === 'audio') ||
      Math.abs(Number(probe.format?.duration) - timing.totalFrames / FPS) > 0.2) {
    throw new Error('最终成片视频轨、主音轨或时长校验失败');
  }
  renameSync(finalPart, finalFile);
  return {output:finalFile, durationSeconds:Number(probe.format.duration), totalFrames:timing.totalFrames,
    tailPaddedUnits,
    streams:probe.streams.map(stream => ({type:stream.codec_type, codec:stream.codec_name}))};
}
