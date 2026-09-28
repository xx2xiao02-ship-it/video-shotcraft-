import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planDigitalHumanUnits} from './b-mode-digital-human-plan.mjs';
import {planCombinedDigitalHumanAudio, createCombinedDigitalHumanAudio,
  splitCombinedDigitalHumanVideo} from './b-mode-digital-human-batch.mjs';
import {renderDigitalHumanComposition} from './b-mode-digital-human-composition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomUUID();
const runDir = path.join(root, 'director', 'b-mode-runs', runId);
const publicDir = path.join(root, 'template', 'public', 'b-mode', runId);
mkdirSync(runDir, {recursive:true});
mkdirSync(publicDir, {recursive:true});
const scenes = [
  {text:'数字人开场。', subject:'person'}, {text:'图解说明。', subject:'graphics'},
  {text:'数字人继续。', subject:'person'}, {text:'数字人收尾。', subject:'person'},
];
const timing = {fps:30, totalFrames:120, timingMethod:'fixture_exact_frames',
  segments:scenes.map((scene, index) => ({text:scene.text, fromFrame:index * 30, durationInFrames:30}))};
const plan = planDigitalHumanUnits(scenes.map(scene => scene.text).join(''), scenes, timing);
const segments = planCombinedDigitalHumanAudio(plan.units);
const audio = path.join(publicDir, 'digital-human-input.wav');
const combinedAudio = path.join(publicDir, 'digital-human-combined.wav');
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
  'sine=frequency=440:sample_rate=48000:duration=4','-ac','2','-c:a','pcm_s16le',audio]);
createCombinedDigitalHumanAudio(audio, combinedAudio, segments);
const avatar = path.join(runDir, 'avatar-01.png');
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i',
  'color=c=green:s=512x512:d=1','-frames:v','1',avatar]);
const combinedVideo = path.join(runDir, 'digital-human-combined.mp4');
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-loop','1','-framerate','30',
  '-i',avatar,'-frames:v','90','-c:v','libx264','-pix_fmt','yuv420p',combinedVideo]);
const outputs = segments.map((_, index) => path.join(runDir,
  `digital-human-person-${String(index + 1).padStart(2, '0')}.mp4`));
const split = splitCombinedDigitalHumanVideo(combinedVideo, outputs, segments);
const units = plan.units.map((unit, index) => ({...unit, index, avatarIndex:0,
  durationSeconds:split[index].durationSeconds, status:'SUCCESS', output:outputs[index]}));
for (const [index, unit] of plan.units.entries()) {
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-ss',String(unit.fromFrame / 30),
    '-i',audio,'-t',String(unit.durationInFrames / 30),'-c:a','pcm_s16le',
    path.join(publicDir, `digital-human-person-${String(index + 1).padStart(2, '0')}.wav`)]);
}
const composition = renderDigitalHumanComposition({root, runId, timing, plan, units, avatarPaths:[avatar]});
writeFileSync(path.join(runDir, 'digital-human-report.json'), JSON.stringify({runId,
  kind:'mock-digital-human-combined', generationMode:'combined', runningHubCalled:false,
  taskIds:[], status:'SUCCESS', units, combined:{segments, output:combinedVideo},
  output:composition.output, composition}, null, 2), 'utf8');
console.log(JSON.stringify({runId, output:composition.output, totalFrames:composition.totalFrames,
  splitFrames:split.map(item => item.frames), runningHubCalled:false}));
