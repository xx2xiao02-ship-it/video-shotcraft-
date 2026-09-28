import {execFileSync} from 'node:child_process';
import {existsSync, renameSync} from 'node:fs';

const FPS = 30;
const SAMPLE_RATE = 48000;
const SAMPLES_PER_FRAME = SAMPLE_RATE / FPS;

export function planCombinedDigitalHumanAudio(units) {
  if (!Array.isArray(units) || !units.length) throw new Error('合并音频缺少数字人镜头组');
  let nextFrame = 0;
  return units.map((unit, index) => {
    if (!Number.isInteger(unit.fromFrame) || !Number.isInteger(unit.durationInFrames) ||
        unit.fromFrame < 0 || unit.durationInFrames <= 0 ||
        (index > 0 && unit.fromFrame < units[index - 1].fromFrame + units[index - 1].durationInFrames)) {
      throw new Error(`第 ${index + 1} 个数字人镜头组时间范围无效`);
    }
    const segment = {index, sourceFromFrame:unit.fromFrame, fromFrame:nextFrame,
      durationInFrames:unit.durationInFrames, sceneIndexes:unit.sceneIndexes};
    nextFrame += unit.durationInFrames;
    return segment;
  });
}

export function createCombinedDigitalHumanAudio(inputWav, outputWav, segments) {
  if (existsSync(outputWav)) throw new Error('合并数字人音频已存在，拒绝覆盖');
  const filters = segments.map((segment, index) => {
    const start = segment.sourceFromFrame * SAMPLES_PER_FRAME;
    const end = start + segment.durationInFrames * SAMPLES_PER_FRAME;
    return `[0:a]atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS[a${index}]`;
  });
  filters.push(`${segments.map((_, index) => `[a${index}]`).join('')}concat=n=${segments.length}:v=0:a=1[out]`);
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',inputWav,
    '-filter_complex',filters.join(';'),'-map','[out]','-ar',String(SAMPLE_RATE),
    '-ac','2','-c:a','pcm_s16le',outputWav], {stdio:'inherit'});
}

export function splitCombinedDigitalHumanVideo(sourceVideo, outputFiles, segments) {
  if (outputFiles.length !== segments.length) throw new Error('数字人片段数量与合并时间表不一致');
  return segments.map((segment, index) => {
    const output = outputFiles[index];
    if (existsSync(output)) throw new Error(`第 ${index + 1} 个数字人片段已存在，拒绝覆盖`);
    const part = `${output}.part.mp4`;
    if (existsSync(part)) throw new Error(`第 ${index + 1} 个数字人临时片段已存在，拒绝覆盖`);
    execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',sourceVideo,
      '-vf',`fps=${FPS},trim=start_frame=${segment.fromFrame}:end_frame=${segment.fromFrame + segment.durationInFrames},setpts=PTS-STARTPTS`,
      '-an','-c:v','libx264','-pix_fmt','yuv420p',part], {stdio:'inherit'});
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
      '-show_entries','stream=nb_frames,duration','-of','json',part], {encoding:'utf8'}));
    const frames = Number(probe.streams?.[0]?.nb_frames);
    if (!Number.isInteger(frames) || frames <= 0 ||
        (index < segments.length - 1 && frames !== segment.durationInFrames) ||
        frames > segment.durationInFrames) {
      throw new Error(`第 ${index + 1} 个数字人片段切分后帧数不符`);
    }
    renameSync(part, output);
    return {frames, durationSeconds:frames / FPS};
  });
}
