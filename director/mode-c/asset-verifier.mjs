import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv']);
const MOCK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function inside(root, candidate) {
  const rootPath = path.resolve(root);
  const candidatePath = path.resolve(candidate);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`);
}

function imageSignature(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function probeVideo(file) {
  try {
    const output = execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {
      encoding: 'utf8', timeout: 15000,
    });
    return JSON.parse(output);
  } catch (error) {
    return {error: String(error.message || error)};
  }
}

function streamFps(stream) {
  const value = String(stream?.avg_frame_rate || stream?.r_frame_rate || '');
  const [numerator, denominator] = value.split('/').map(Number);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) return numerator / denominator;
  return null;
}

export function normalizeVideoPlan({input, output, fps = 30, width = 1920, height = 1080, stripAudio = true}) {
  const filters = `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  return {
    command: 'ffmpeg',
    args: ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-vf', filters,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(stripAudio ? ['-an'] : ['-c:a', 'aac']), output],
  };
}

export function createMockAsset({root, file, kind, durationSec = 8, fps = 30}) {
  const absoluteFile = path.resolve(root, file);
  if (!inside(root, absoluteFile)) throw new Error('Mock 素材路径超出当前项目目录');
  mkdirSync(path.dirname(absoluteFile), {recursive:true});
  if (kind === 'image') {
    writeFileSync(absoluteFile, MOCK_PNG);
    return {file:absoluteFile, kind, state:'generated', mock:true};
  }
  if (kind !== 'video') throw new Error(`不支持生成 Mock 素材：${kind}`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', `color=c=black:s=16x16:r=${fps}:d=${Number(durationSec) || 8}`, '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', absoluteFile], {timeout:30000});
  return {file:absoluteFile, kind, state:'generated', mock:true};
}

export function verifyAsset({root, file, kind, expectedDurationSec = null, fps = 30, stripAudio = false}) {
  const absoluteFile = path.resolve(root, file);
  const result = {ok: false, status: 'blocked', file: absoluteFile, kind, errors: []};
  if (!inside(root, absoluteFile)) {
    result.errors.push('素材路径超出当前项目目录');
    return result;
  }
  if (!existsSync(absoluteFile) || !statSync(absoluteFile).isFile() || statSync(absoluteFile).size === 0) {
    result.status = 'pending_generation';
    result.errors.push('素材文件不存在或为空');
    return result;
  }
  const extension = path.extname(absoluteFile).toLowerCase();
  if (kind === 'image') {
    if (!IMAGE_EXTENSIONS.has(extension)) result.errors.push('图片扩展名不受支持');
    if (!imageSignature(absoluteFile)) result.errors.push('图片文件头与扩展名不匹配');
    result.status = result.errors.length ? 'blocked' : 'verified';
    result.ok = !result.errors.length;
    return result;
  }
  if (kind !== 'video' || !VIDEO_EXTENSIONS.has(extension)) {
    result.errors.push('视频扩展名不受支持');
    return result;
  }
  const probe = probeVideo(absoluteFile);
  if (probe.error) {
    result.errors.push(`ffprobe 不可用或读取失败：${probe.error}`);
    return result;
  }
  const videoStream = (probe.streams || []).find(stream => stream.codec_type === 'video');
  if (!videoStream) result.errors.push('没有视频流');
  const duration = Number(probe.format?.duration || videoStream?.duration);
  if (!Number.isFinite(duration) || duration <= 0) result.errors.push('视频时长无效');
  if (expectedDurationSec !== null && Number.isFinite(duration) && Math.abs(duration - expectedDurationSec) > 0.2) {
    result.errors.push(`视频时长 ${duration.toFixed(3)} 秒与镜头 ${expectedDurationSec.toFixed(3)} 秒不一致`);
  }
  const actualFps = streamFps(videoStream);
  if (!Number.isFinite(actualFps) || Math.abs(actualFps - fps) > 0.1) result.errors.push(`帧率不是 ${fps}fps`);
  if (stripAudio && (probe.streams || []).some(stream => stream.codec_type === 'audio')) result.errors.push('B-roll 仍包含音频流');
  result.status = result.errors.length ? 'blocked' : 'verified';
  result.ok = !result.errors.length;
  return result;
}
