// 渲染 DynamicVideo：读取 director/storyboard.json → 作为 props 渲染
// 用法：node director/render.mjs
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createSubtitleSnapshot, readSubtitleSettings, subtitleSettingsPath} from './subtitle-v1.mjs';
import {stageBackgroundMusic} from './background-music.mjs';
import {createTemplateUsage, writeTemplateUsage} from './template-usage.mjs';
import {preflightAModeRender} from './a-mode-render-preflight.mjs';
import {renderConcurrency, runRenderCommand, writeRenderProgress} from './render-runtime.mjs';
import {applyVideoPlayback} from './video-material-policy.mjs';
import {probeVideo} from './packaging-media.mjs';
import {assertProductionOutputDirectory} from './governance-output-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const outputConfigPath = path.join(ROOT, '.shotcraft-output.json');
const resolveFromRoot = value => path.resolve(ROOT, value);
let outputDir = resolveFromRoot(process.env.SHOTCRAFT_OUTPUT_DIR || path.join('template', 'out'));
try {
  if (!process.env.SHOTCRAFT_OUTPUT_DIR) {
    const config = JSON.parse(fs.readFileSync(outputConfigPath, 'utf8'));
    if (typeof config.path === 'string' && config.path.trim()) outputDir = resolveFromRoot(config.path.trim());
  }
} catch {}
outputDir = assertProductionOutputDirectory(ROOT, outputDir);
fs.mkdirSync(outputDir, { recursive: true });

// 读分镜 JSON
const storyboardPath = resolveFromRoot(process.env.SHOTCRAFT_STORYBOARD_PATH || path.join('director', 'storyboard.json'));
const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
if (storyboard.mode === 'A' || storyboard.backgroundPolicy === 'video-default-v1') {
  preflightAModeRender(ROOT, {runDir:path.dirname(storyboardPath)});
}
const totalFrames = storyboard.shots.reduce((sum, s) => sum + s.durationInFrames, 0);
console.log(`分镜总时长：${totalFrames} 帧 = ${(totalFrames / 30).toFixed(1)} 秒`);
// 每次成片都落一份可追溯的模板调用统计，和 dynamic.mp4 放在同一输出目录。
const templateUsageReport = createTemplateUsage(storyboard);
console.log(`模板调用统计：${templateUsageReport.templates.length} 类 / ${templateUsageReport.totalShots} 镜，背景视频 ${templateUsageReport.backgroundVideoShots} 镜`);
const publicDir = path.resolve(ROOT, 'template', 'public');
const audioFile = path.resolve(publicDir, String(storyboard.audio || ''));
if (!audioFile.startsWith(publicDir + path.sep) || !fs.existsSync(audioFile)) {
  throw new Error('已有分镜的原配音文件缺失，已阻止渲染');
}
const videoSeconds = totalFrames / (storyboard.fps || 30);
let audioSeconds = null;
try {
  audioSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', audioFile], {encoding:'utf8', timeout:5000}).trim());
} catch {}
if (Number.isFinite(audioSeconds) && audioSeconds + 2 < videoSeconds) {
  throw new Error(`已有分镜与配音时长不匹配（画面 ${videoSeconds.toFixed(1)} 秒，配音 ${audioSeconds.toFixed(1)} 秒），已阻止渲染`);
}
if (!Number.isFinite(audioSeconds) && fs.statSync(audioFile).size < videoSeconds * 1000) {
  throw new Error('已有分镜的配音文件明显短于画面，已阻止渲染；请恢复原配音后再试');
}
if (fs.existsSync(subtitleSettingsPath(ROOT))) {
  const settings = readSubtitleSettings(ROOT);
  const timingPath = resolveFromRoot(process.env.SHOTCRAFT_TIMING_PATH || path.join('director', 'timing.json'));
  const selectedSubtitle = storyboard.aspectRatio === '9:16' ? settings.vertical : settings.horizontal;
  if (selectedSubtitle.enabled && !fs.existsSync(timingPath)) throw new Error('缺少字幕时间数据 timing.json');
  const timing = selectedSubtitle.enabled ? JSON.parse(fs.readFileSync(timingPath, 'utf8')) : null;
  storyboard.subtitleV1 = createSubtitleSnapshot(settings, timing, storyboard);
}

// 写 props JSON（Remotion 读文件而不是内联参数，避免 Windows shell 转义问题）
const propsPath = resolveFromRoot(process.env.SHOTCRAFT_PROPS_PATH || path.join('director', 'props.json'));
const materialApiBaseUrl = `http://127.0.0.1:${process.env.PORT || 8765}`;
const materials = [...new Set(storyboard.shots.flatMap(shot => [shot.material, shot.media]).filter(Boolean))];
if (materials.length) {
  try {
    const response = await fetch(`${materialApiBaseUrl}/api/state`, {signal: AbortSignal.timeout(3000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`素材服务不可用：${materialApiBaseUrl}。请确认操作台正在运行。原因：${error.message}`);
  }
  for (const material of materials) {
    try {
      const response = await fetch(`${materialApiBaseUrl}/api/library/video?path=${encodeURIComponent(material)}`, {
        headers: {Range: 'bytes=0-1'},
        signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 206) throw new Error(`HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      throw new Error(`视频素材不可读取：${material}。原因：${error.message}`);
    }
  }
  const scenesDir = path.resolve(ROOT, 'materials', '_scenes');
  const verified = materials.map(material => {
    const file = path.resolve(scenesDir, material);
    if (!file.startsWith(scenesDir + path.sep)) throw new Error('视频素材路径超出素材库');
    return {path:material, duration_sec:probeVideo(file).durationSeconds};
  });
  storyboard.shots = applyVideoPlayback(storyboard.shots, verified, storyboard.fps || 30);
}
const bgmSelection = process.env.SHOTCRAFT_BGM_SELECTION_JSON
  ? JSON.parse(process.env.SHOTCRAFT_BGM_SELECTION_JSON) : undefined;
const bgm = stageBackgroundMusic(ROOT, 'A', path.join(ROOT, 'template', 'public'), bgmSelection);
fs.writeFileSync(propsPath, JSON.stringify({ storyboard, bgm, materialApiBaseUrl }, null, 2), 'utf8');
if (process.env.SHOTCRAFT_PREPARE_ONLY === '1') {
  console.log(`预检通过，预览参数已生成：${propsPath}`);
} else {
// 渲染
const outFile = path.join(outputDir, 'dynamic.mp4');
// 兼容性：Remotion 输出（yuvj420p 全范围）内置浏览器解码挂起 → 渲染后用 ffmpeg 重编码（libx264/yuv420p 有限范围 + faststart）
// 注意：不要给 Remotion 传 --pixel-format=yuv420p（实测会损坏输出，重编码后仍不可播）
const concurrency = renderConcurrency({requested:process.env.SHOTCRAFT_RENDER_CONCURRENCY || 5});
const progressDir = path.dirname(propsPath);
const startedAt = Date.now();
const publishProgress = progress => writeRenderProgress(progressDir,{startedAt, concurrency, ...progress});
const cmd = `npx remotion render src/index.ts DynamicVideo "${outFile}" --props="${propsPath}" --browser-executable="${CHROME}" --concurrency=${concurrency.effective}`;
const FFMPEG = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';

console.log('开始渲染...');
console.log(`渲染并发：目标 ${concurrency.requested} 路，实际 ${concurrency.effective} 路；可用内存 ${(concurrency.freeBytes / 2**30).toFixed(1)} GiB`);
try {
  publishProgress({stage:'preparing'});
  await runRenderCommand(cmd,{cwd:path.join(ROOT,'template'), onProgress:publishProgress});
  publishProgress({stage:'compatibility'});
  // 重编码为浏览器兼容格式（有限范围 + faststart）
  const tmpFile = outFile + '.tmp.mp4';
  execSync(`"${FFMPEG}" -y -i "${outFile}" -vf scale=in_range=auto:out_range=tv -color_range tv -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -c:a aac -b:a 128k -movflags +faststart "${tmpFile}"`);
  // Windows 文件锁（预览播放/服务端视频流可能占用旧文件）：先删目标再 rename，重试最多 30 次（每次 1s）
  // 根因 2026-09-22：渲染完成→预览卡自动播放新片→占用句柄→rename 覆盖 EPERM 6 次失败→任务误报"出错"
  let renamed = false;
  for (let i = 0; i < 30; i++) {
    try {
      // Windows 下 rename 覆盖被占用文件会 EPERM；目标未被占用时先删再换最稳
      try { fs.rmSync(outFile, { force: true }); } catch {}
      fs.renameSync(tmpFile, outFile);
      renamed = true; break;
    } catch (e) {
      if (i === 29) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  if (!renamed) throw new Error('rename dynamic.mp4 failed after 30 retries');
  writeTemplateUsage(path.join(outputDir, 'template-usage.json'), storyboard, outFile);
  publishProgress({stage:'done'});
  console.log(`\n✓ 渲染完成：${outFile}`);
} catch (e) {
  publishProgress({stage:'error',error:e.message});
  console.error('渲染失败:', e.message);
  process.exit(1);
}
}
