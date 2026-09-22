// 渲染 DynamicVideo：读取 director/storyboard.json → 作为 props 渲染
// 用法：node director/render.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';

// 读分镜 JSON
const storyboardPath = path.join(ROOT, 'director', 'storyboard.json');
const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));

// 算总帧数
const totalFrames = storyboard.shots.reduce((sum, s) => sum + s.durationInFrames, 0);
console.log(`分镜总时长：${totalFrames} 帧 = ${(totalFrames / 30).toFixed(1)} 秒`);

// 写 props JSON（Remotion 读文件而不是内联参数，避免 Windows shell 转义问题）
const propsPath = path.join(ROOT, 'director', 'props.json');
fs.writeFileSync(propsPath, JSON.stringify({ storyboard }, null, 2), 'utf8');

// 渲染
const outFile = path.join(ROOT, 'template', 'out', 'dynamic.mp4');
// 兼容性：Remotion 输出（yuvj420p 全范围）内置浏览器解码挂起 → 渲染后用 ffmpeg 重编码（libx264/yuv420p 有限范围 + faststart）
// 注意：不要给 Remotion 传 --pixel-format=yuv420p（实测会损坏输出，重编码后仍不可播）
const cmd = `npx remotion render src/index.ts DynamicVideo "${outFile}" --props="${propsPath}" --browser-executable="${CHROME}" --concurrency=1`;
const FFMPEG = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';

console.log('开始渲染...');
try {
  execSync(cmd, { cwd: path.join(ROOT, 'template'), stdio: 'inherit' });
  // 重编码为浏览器兼容格式（有限范围 + faststart）
  const tmpFile = outFile + '.tmp.mp4';
  execSync(`"${FFMPEG}" -y -i "${outFile}" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -c:a aac -b:a 128k -movflags +faststart "${tmpFile}"`);
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
  console.log(`\n✓ 渲染完成：${outFile}`);
} catch (e) {
  console.error('渲染失败:', e.message);
  process.exit(1);
}
