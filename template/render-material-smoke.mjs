import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const storyboard = JSON.parse(fs.readFileSync(path.join(root, 'director', 'storyboard.json'), 'utf8'));
const shot = storyboard.shots.find((item) => item.material);
if (!shot) throw new Error('分镜里没有本地视频素材');

const baseUrl = `http://127.0.0.1:${process.env.PORT || 8765}`;
const response = await fetch(`${baseUrl}/api/library/video?path=${encodeURIComponent(shot.material)}`, {
  headers: {Range: 'bytes=0-1023'},
  signal: AbortSignal.timeout(5000),
});
if (response.status !== 206) throw new Error(`素材接口返回 HTTP ${response.status}`);
await response.body?.cancel();

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-material-smoke-'));
try {
  const propsFile = path.join(tempDir, 'props.json');
  const frameFile = path.join(tempDir, 'frame-0.png');
  fs.writeFileSync(propsFile, JSON.stringify({
    storyboard: {...storyboard, shots: [shot]},
    bgm: null,
    materialApiBaseUrl: baseUrl,
  }));
  const cli = path.join(import.meta.dirname, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  const browser = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
  const result = spawnSync(process.execPath, [
    cli, 'still', 'src/index.ts', 'DynamicVideo', frameFile,
    '--props', propsFile, '--frame', '0', '--browser-executable', browser,
  ], {cwd: import.meta.dirname, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
  else if (fs.statSync(frameFile).size < 1024) throw new Error('首帧文件为空');
  else console.log(`首帧素材检查通过：${baseUrl}`);
} finally {
  fs.rmSync(tempDir, {recursive: true, force: true});
}
