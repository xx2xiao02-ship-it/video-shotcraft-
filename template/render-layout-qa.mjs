import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderStill, renderMedia} from '@remotion/renderer';
import {writeTemplateUsage} from '../director/template-usage.mjs';

const root = path.resolve(import.meta.dirname, '..');
const runId = '18248a79-7a9f-43af-8551-47ed73c4e441';
const source = JSON.parse(fs.readFileSync(path.join(root, 'director', 'a-mode-runs', runId, 'props.json'), 'utf8'));
const dir = process.env.SHOTCRAFT_QA_OUTPUT_DIR || path.join(root, 'template', 'out', 'layout-qa-20260930');
fs.mkdirSync(dir, {recursive:true});
const browserExecutable = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const material = source.storyboard.shots.find(shot => shot.materialRole === 'backdrop')?.material;
if (!material) throw new Error('QA requires a verified video source');
const cards = new Map(source.storyboard.shots.filter(shot => shot.shotCard).map(shot => [shot.shotCard, shot]));
const selectedCards = process.argv.slice(2);
const serveUrl = await bundle({entryPoint:path.join(import.meta.dirname, 'src', 'index.ts'),
  publicDir:path.join(import.meta.dirname, 'public')});
for (const aspectRatio of ['9:16', '16:9']) {
  for (const [card, original] of cards) {
    if (selectedCards.length && !selectedCards.includes(card)) continue;
    const shot = {...original, durationInFrames:90};
    shot.material = material;
    shot.materialRole = 'backdrop';
    const inputProps = {...source, bgm:null, materialApiBaseUrl:'http://127.0.0.1:8769',
      storyboard:{...source.storyboard, aspectRatio, audio:undefined, subtitleV1:undefined, shots:[shot]}};
    const composition = await selectComposition({serveUrl, id:'DynamicVideo', inputProps, browserExecutable});
    const file = path.join(dir, `${aspectRatio === '9:16' ? 'portrait' : 'landscape'}-${card.split('/').at(-1)}.png`);
    await renderStill({serveUrl, composition, inputProps, output:file, frame:65, browserExecutable, imageFormat:'png'});
    console.log(`STILL ${file}`);
  }
}
const sampleShots = ['typography/blur-slide', 'typography/paper-title-card', 'typography/cel-flash-stomp']
  .map(card => ({...cards.get(card), durationInFrames:90, material, materialRole:'backdrop'}));
const inputProps = {...source, bgm:null, materialApiBaseUrl:'http://127.0.0.1:8769',
  storyboard:{...source.storyboard, aspectRatio:'9:16', audio:undefined, subtitleV1:undefined, shots:sampleShots}};
const composition = await selectComposition({serveUrl, id:'DynamicVideo', inputProps, browserExecutable});
const output = path.join(dir, 'portrait-sample.mp4');
await renderMedia({serveUrl, composition, inputProps, outputLocation:output, codec:'h264', pixelFormat:'yuv420p',
  concurrency:1, browserExecutable});
writeTemplateUsage(path.join(dir, 'template-usage.json'), inputProps.storyboard, output);
console.log(`SAMPLE ${output}`);
