import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {applyVideoPlayback, assertNoAdjacentVideoReuse} from '../director/video-material-policy.mjs';
import {probeVideo, extractFrame, ffmpegPath} from '../director/packaging-media.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'tmp', 'video-material-qa');
fs.mkdirSync(outputDir, {recursive:true});
const index = JSON.parse(fs.readFileSync(path.join(root, 'materials', '_index.json'), 'utf8'));
const candidates = index.filter(item => item.duration_sec >= 1 && item.duration_sec <= 2 &&
  fs.existsSync(path.join(root, 'materials', '_scenes', item.path)));
const first = candidates[0];
const second = candidates.find(item => item.path.replace(/-Scene-\d+\.mp4$/i, '') !== first?.path.replace(/-Scene-\d+\.mp4$/i, ''));
if (!first || !second) throw new Error('素材库中需要两条不同来源的真实短视频');
const materials = [first,second].map(item => ({path:item.path,
  duration_sec:probeVideo(path.join(root, 'materials', '_scenes', item.path)).durationSeconds}));
const shots = applyVideoPlayback([
  {type:'proof',text:'背景短素材减速覆盖整镜',material:first.path,materialRole:'background',durationInFrames:120,shotCard:null},
  {type:'example',text:'元素短素材减速覆盖整镜',material:second.path,media:second.path,
    materialRole:'backdrop',durationInFrames:120,shotCard:'ui-entrance/clipcard-looping'},
], materials);
assertNoAdjacentVideoReuse(shots);
const storyboard = {fps:30,mode:'A',aspectRatio:'9:16',shots,
  style:{bg:'#101216',text:'#ffffff',accent:'#4da3ff',sub:'#b5b9c1',materialOpacity:1,overlayAlpha:0.1,
    fontFamily:"'Microsoft YaHei',sans-serif"}};
const propsFile = path.join(outputDir, 'props.json');
fs.writeFileSync(propsFile, JSON.stringify({storyboard,materialApiBaseUrl:'http://127.0.0.1:8769'},null,2));
for (const item of materials) {
  const response = await fetch(`http://127.0.0.1:8769/api/library/video?path=${encodeURIComponent(item.path)}`,
    {headers:{Range:'bytes=0-1'},signal:AbortSignal.timeout(5000)});
  if (response.status !== 206) throw new Error(`真实素材接口异常：${response.status}`);
  await response.body?.cancel();
}
const cli = path.join(import.meta.dirname, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const browser = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const outFile = path.join(outputDir, 'dynamic.mp4');
const result = spawnSync(process.execPath,[cli,'render','src/index.ts','DynamicVideo',outFile,
  '--props',propsFile,'--browser-executable',browser,'--concurrency','2'],
{cwd:import.meta.dirname,stdio:'inherit',windowsHide:true});
if (result.error || result.status !== 0) throw result.error || new Error(`样片渲染失败：${result.status}`);
const output = probeVideo(outFile);
if (output.width !== 1080 || output.height !== 1920 || Math.abs(output.durationSeconds - 8) > 0.1)
  throw new Error(`样片画幅或时长错误：${JSON.stringify(output)}`);
for (const [name,start,crop] of [['background',0,'crop=500:500:290:500'],['element',4,'crop=500:500:290:650']]) {
  const sample = seconds => {
    const r = spawnSync(ffmpegPath(),['-v','error','-ss',String(start+seconds),'-i',outFile,
      '-frames:v','1','-vf',`${crop},scale=16:16`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true});
    if (r.status !== 0 || r.stdout.length !== 768) throw new Error('无法检测样片像素');
    return r.stdout;
  };
  const a = sample(2.5), b = sample(3.8);
  const delta = a.reduce((sum,value,i)=>sum + Math.abs(value-b[i]),0)/a.length;
  if (delta < 1) throw new Error(`${name} 镜头尾部画面疑似冻结：${delta}`);
  extractFrame(outFile,start+3.8,path.join(outputDir,`${name}-tail.png`));
  console.log(`${name} 尾部像素变化：${delta.toFixed(2)}`);
}
fs.writeFileSync(path.join(outputDir,'evidence.json'),JSON.stringify({output,shots,outFile},null,2));
console.log(`真实素材变速样片验收通过：${outFile}`);
