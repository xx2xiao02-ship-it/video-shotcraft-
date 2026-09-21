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
const cmd = `npx remotion render src/index.ts DynamicVideo "${outFile}" --props="${propsPath}" --browser-executable="${CHROME}" --concurrency=1`;

console.log('开始渲染...');
try {
  execSync(cmd, { cwd: path.join(ROOT, 'template'), stdio: 'inherit' });
  console.log(`\n✓ 渲染完成：${outFile}`);
} catch (e) {
  console.error('渲染失败:', e.message);
  process.exit(1);
}
