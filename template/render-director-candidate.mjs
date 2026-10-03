import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const storyboard = JSON.parse(fs.readFileSync(path.join(root, 'director', 'storyboard-candidate.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'materials', '_index.json'), 'utf8'));
const city = index.find(item => item.duration_sec >= 3 && (item.tags || []).includes('城市建筑'));
if (!city) throw new Error('缺少可验证的城市建筑素材');
const baseUrl = `http://127.0.0.1:${process.env.PORT || 8768}`;
const response = await fetch(`${baseUrl}/api/library/video?path=${encodeURIComponent(city.path)}`, {
  headers: {Range: 'bytes=0-1023'}, signal: AbortSignal.timeout(5000),
});
if (response.status !== 206) throw new Error(`素材服务 HTTP ${response.status}`);
await response.body?.cancel();

const outputDir = path.join(root, 'template', 'out', 'director-qa');
fs.mkdirSync(outputDir, {recursive: true});
const samples = [
  {name: 'statement', shot: storyboard.shots[0]},
  {name: 'number', shot: storyboard.shots[1]},
  {name: 'risk', shot: storyboard.shots[6]},
  {name: 'compare', shot: storyboard.shots[7]},
  {name: 'steps', shot: {...storyboard.shots[23], shotCard: 'director/steps'}},
  {name: 'media-element', shot: {
    ...storyboard.shots[0], text: '城市高楼林立', shotCard: 'director/context',
    material: city.path, materialRole: 'inline-element',
    pit: {mode: 'A', subject: 'remotion', content: {type: 'video-local', path: city.path}, position: 'element'},
  }},
];
const cli = path.join(import.meta.dirname, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const browser = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
for (const {name, shot} of samples) {
  const props = path.join(outputDir, `${name}-props.json`);
  const output = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(props, JSON.stringify({storyboard: {...storyboard, shots: [shot]}, bgm: null, materialApiBaseUrl: baseUrl}));
  const result = spawnSync(process.execPath, [cli, 'still', 'src/index.ts', 'DynamicVideo', output,
    '--props', props, '--frame', '12', '--browser-executable', browser],
  {cwd: import.meta.dirname, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} 渲染失败：${result.status}`);
  if (fs.statSync(output).size < 1024) throw new Error(`${name} 样张为空`);
  console.log(`${name}: ${output}`);
}
