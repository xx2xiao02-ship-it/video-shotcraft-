import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';
import {renderDigitalHumanComposition} from './b-mode-digital-human-composition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomUUID();
const runDir = path.join(root, 'director', 'b-mode-runs', runId);
const publicDir = path.join(root, 'template', 'public', 'b-mode', runId);
mkdirSync(runDir, {recursive:true});
mkdirSync(publicDir, {recursive:true});
const scenes = [
  {text:'人物开场。', subject:'person'}, {text:'图解说明。', subject:'graphics'},
  {text:'人物继续。', subject:'person'}, {text:'人物补充。', subject:'person'},
  {text:'素材展示。', subject:'material'}, {text:'人物收尾。', subject:'person'},
];
const timing = {fps:30, totalFrames:180, timingMethod:'fixture_exact_frames', segments:scenes.map((scene, index) =>
  ({text:scene.text, fromFrame:index * 30, durationInFrames:30}))};
const plan = planDigitalHumanUnits(scenes.map(scene => scene.text).join(''), scenes, timing);
if (plan.units.length !== 3 || plan.units[1].sceneIndexes.join(',') !== '2,3') throw new Error('相邻人物镜头未合并');
const audio = path.join(publicDir, 'digital-human-input.wav');
execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-f','lavfi','-i',
  'sine=frequency=440:sample_rate=48000:duration=6','-ac','2','-c:a','pcm_s16le',audio]);
const colors = ['0x268674', '0xd99342'];
const avatarPaths = colors.map((color, index) => {
  const file = path.join(runDir, `avatar-${index + 1}.png`);
  execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-f','lavfi','-i',
    `color=c=${color}:s=512x512:d=1`, '-frames:v','1',file]);
  return file;
});
const units = plan.units.map((unit, index) => {
  const clipAudio = path.join(publicDir, `digital-human-person-${index + 1}.wav`);
  const output = path.join(runDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.mp4`);
  execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-ss',String(unit.fromFrame / 30),
    '-i',audio,'-t',String(unit.durationInFrames / 30),'-c:a','pcm_s16le',clipAudio]);
  execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-loop','1','-framerate','30',
    '-i',avatarPaths[index % avatarPaths.length],'-i',clipAudio,'-frames:v',String(unit.durationInFrames),
    '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',output]);
  return {index, sceneIndexes:unit.sceneIndexes, fromFrame:unit.fromFrame,
    durationInFrames:unit.durationInFrames, durationSeconds:unit.durationInFrames / 30,
    avatarIndex:index % avatarPaths.length, status:'SUCCESS', output};
});
writeFileSync(path.join(runDir, 'digital-human-timing.json'), JSON.stringify(timing, null, 2), 'utf8');
const composition = renderDigitalHumanComposition({root, runId, timing, plan, units, avatarPaths});
const report = {runId, kind:'mock-digital-human-composition', status:'SUCCESS',
  runningHubCalled:false, paidTaskIds:[], units, composition};
writeFileSync(path.join(runDir, 'digital-human-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({runId, ...composition, runningHubCalled:false}));
