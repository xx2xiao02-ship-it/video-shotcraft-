// 视频外包装 - 媒体层：ffmpeg/ffprobe 定位、视频探测、抽帧。
// 隔离约束：只外调 CLI，不 import 仓库内其他模块。
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';

// director/render.mjs 使用的 winget 安装回退路径；PATH 上已有 ffmpeg 时不会走到
const WINGET_BIN = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin';

function resolveBinary(name) {
  try {
    execFileSync(name, ['-version'], {stdio:'ignore', timeout:10000});
    return name;
  } catch {}
  const fallback = path.join(WINGET_BIN, `${name}.exe`);
  if (existsSync(fallback)) {
    execFileSync(fallback, ['-version'], {stdio:'ignore', timeout:10000});
    return fallback;
  }
  throw new Error(`找不到 ${name}，请确认 ffmpeg 已安装并在 PATH 中`);
}

let ffmpegCache = null;
let ffprobeCache = null;
export function ffmpegPath() {
  ffmpegCache ??= resolveBinary('ffmpeg');
  return ffmpegCache;
}
export function ffprobePath() {
  ffprobeCache ??= resolveBinary('ffprobe');
  return ffprobeCache;
}

export function probeVideo(videoFile) {
  const raw = execFileSync(ffprobePath(), ['-v','error','-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height','-of','json', String(videoFile)],
  {encoding:'utf8', timeout:30000, maxBuffer:8*1024*1024});
  const probe = JSON.parse(raw);
  const streams = probe.streams || [];
  const videoStream = streams.find(stream => stream.codec_type === 'video');
  if (!videoStream) throw new Error('视频缺少画面流');
  return {
    durationSeconds:Number(probe.format?.duration || 0),
    width:Number(videoStream.width || 0),
    height:Number(videoStream.height || 0),
    hasAudio:streams.some(stream => stream.codec_type === 'audio'),
  };
}

export function extractFrame(videoFile, timeSeconds, outFile, {width = 0} = {}) {
  mkdirSync(path.dirname(outFile), {recursive:true});
  const args = ['-y','-hide_banner','-loglevel','error','-ss',String(Math.max(0, Number(timeSeconds) || 0)),
    '-i',String(videoFile),'-frames:v','1'];
  if (width > 0) args.push('-vf', `scale=${Math.round(width)}:-2`);
  args.push(String(outFile));
  execFileSync(ffmpegPath(), args, {timeout:60000});
  if (!existsSync(outFile)) throw new Error(`抽帧失败：${outFile}`);
  return outFile;
}

// 均匀抽取候选帧缩略图（跳过片头片尾各约 6%），返回 run 级元信息
export function extractFrameCandidates(videoFile, {count = 6, outDir, thumbWidth = 480} = {}) {
  const info = probeVideo(videoFile);
  if (!(info.durationSeconds > 0.4)) throw new Error('视频时长过短，无法抽帧');
  mkdirSync(outDir, {recursive:true});
  const total = Math.max(1, count - 1);
  const start = info.durationSeconds * 0.06;
  const span = info.durationSeconds * 0.88;
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const time = start + span * index / total;
    const file = path.join(outDir, `frame-${String(index + 1).padStart(2, '0')}.jpg`);
    extractFrame(videoFile, time, file, {width:thumbWidth});
    frames.push({time:Number(time.toFixed(2)), file});
  }
  return {durationSeconds:info.durationSeconds, width:info.width, height:info.height, frames};
}
