import fs from 'node:fs';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {validateOpeningPilot, OPENING_SHORT_CARDS} from '../director/opening-short-policy.mjs';
import {applyVideoPlayback, assertNoAdjacentVideoReuse} from '../director/video-material-policy.mjs';
import {probeVideo, extractFrame, ffmpegPath} from '../director/packaging-media.mjs';
import {writeTemplateUsage} from '../director/template-usage.mjs';

const root = path.resolve(import.meta.dirname,'..');
const runId='f4f78a6c-aa2b-4917-9bed-66398863f3f9';
const sourceFile=path.join(root,'director/a-mode-runs',runId,'props.json');
const original=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const out=path.join(root,'template/out/opening-short-pilot-v1');
fs.mkdirSync(out,{recursive:true});
const backgrounds=original.storyboard.shots.slice(0,3).map(shot=>shot.material);
if (backgrounds.some(file=>!file)||new Set(backgrounds).size!==3) throw new Error('缺少三条不同的已编导背景素材');
const base=[
  {shotCard:null,durationInFrames:30,displayLines:['这两年'],type:'hook'},
  {shotCard:'typography/marker-underline-title',durationInFrames:60,displayLines:['现金','更有用'],type:'claim'},
  {shotCard:'typography/paper-title-card',durationInFrames:60,displayLines:['留住现金','留住选择'],type:'keypoint'},
].map((shot,i)=>({...shot,material:backgrounds[i],materialRole:shot.shotCard?'backdrop':'background',
  text:original.storyboard.shots[0].text,displayText:shot.displayLines.join('\n')}));
validateOpeningPilot(base);
assertNoAdjacentVideoReuse(base);
const materials=backgrounds.map(file=>({path:file,duration_sec:probeVideo(path.join(root,'materials/_scenes',file)).durationSeconds}));
const shots=applyVideoPlayback(base,materials);
const storyboard={...original.storyboard,shots};
// Keep the original narration and caption clock; cuts are visual only.
const props={...original,storyboard};
const file=path.join(out,'props.json');
fs.writeFileSync(file,JSON.stringify(props,null,2));
const cli=path.join(import.meta.dirname,'node_modules/@remotion/cli/remotion-cli.js');
const video=path.join(out,'dynamic.mp4');
if (!process.argv.includes('--package-only')) {
const result=spawnSync(process.execPath,[cli,'render','src/index.ts','DynamicVideo',video,'--props',file,
  '--browser-executable','C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe',
  '--concurrency','2'],{cwd:import.meta.dirname,stdio:'inherit',windowsHide:true});
if(result.error||result.status!==0)throw result.error||new Error(`样片渲染失败：${result.status}`);
}
const info=probeVideo(video);
if(info.width!==1080||info.height!==1920||!info.hasAudio||Math.abs(info.durationSeconds-5)>0.1)
  throw new Error('样片的画幅、时长或配音不符合要求');
execFileSync(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
const preview=path.join(out,'preview.mp4');
execFileSync(ffmpegPath(),['-y','-v','error','-i',video,'-c:v','libx264','-preset','fast','-crf','18',
  '-pix_fmt','yuv420p','-color_range','tv','-movflags','+faststart','-c:a','aac',preview],{windowsHide:true});
for(const [name,time] of [['shot-1',0.6],['shot-2',2.6],['shot-3',4.65]])
  extractFrame(video,time,path.join(out,`${name}.png`));
writeTemplateUsage(path.join(out,'template-usage.json'),storyboard,preview);
fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({sourceRunId:runId,pilotOnly:true,
  productionEnabled:false,info,openingFrames:150,shotFrames:shots.map(shot=>shot.durationInFrames),
  policies:OPENING_SHORT_CARDS,audioPreserved:storyboard.audio===original.storyboard.audio,
  captionsPreserved:JSON.stringify(storyboard.subtitleV1)===JSON.stringify(original.storyboard.subtitleV1),
  fullDecodePassed:true},null,2));
console.log(`开场样片验收通过：${preview}`);
