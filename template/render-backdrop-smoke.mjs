import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const runId = 'aeb1c5b9-ff09-46a6-be2d-d0b5790d8495';
const original = JSON.parse(fs.readFileSync(path.join(root, 'director', 'a-mode-runs', runId, 'props.revised.json'), 'utf8'));
const source = original.storyboard.shots.find(shot => shot.material && shot.materialRole === 'background');
if (!source) throw new Error('缺少已核实的视频素材');
const outputDir = path.join(root, 'template', 'out', 'director-qa', 'backdrop');
fs.mkdirSync(outputDir, {recursive:true});
const cards = [
  {id:'typography/scramble', backdrop:true},
  {id:'typography/gradient-word-sweep', backdrop:true},
  {id:'typography/marker-underline-title', backdrop:true},
  {id:'typography/paper-title-card', backdrop:false},
  {id:'typography/cel-flash-stomp', backdrop:false},
  {id:'typography/blur-slide', backdrop:false},
  {id:'ui-entrance/list-reveal', backdrop:false},
  {id:'typography/brace-expand', backdrop:false},
  {id:'typography/outline-word-fill', backdrop:false},
  {id:'typography/word-relay-geometry', backdrop:false},
];
const cli = path.join(import.meta.dirname, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const browser = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
for (const {id, backdrop} of cards) {
  const example = original.storyboard.shots.find(shot => shot.shotCard === id);
  if (!example) throw new Error(`缺少 ${id} 测试镜头`);
  const name = id.split('/')[1];
  const shot = {...example, durationInFrames:120,
    material:backdrop ? source.material : undefined,
    materialRole:backdrop ? 'backdrop' : undefined};
  delete shot.media;
  const storyboard = {...original.storyboard, audio:undefined, subtitleV1:undefined, shots:[shot]};
  const props = path.join(outputDir, `${name}.json`);
  const output = path.join(outputDir, `${name}.png`);
  if (fs.existsSync(output) && fs.statSync(output).size >= 1024) continue;
  fs.writeFileSync(props, JSON.stringify({storyboard, bgm:null, materialApiBaseUrl:'http://127.0.0.1:8769'}));
  const result = spawnSync(process.execPath, [cli, 'still', 'src/index.ts', 'DynamicVideo', output,
    '--props', props, '--frame', '65', '--browser-executable', browser],
  {cwd:import.meta.dirname, stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(output) || fs.statSync(output).size < 1024)
    throw new Error(`${name} 主题样帧渲染失败`);
  console.log(output);
}
