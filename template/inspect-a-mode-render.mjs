import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {backgroundCoverage} from '../director/background-policy.mjs';

const runId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(runId || '')) throw new Error('需要真实任务 ID');
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'director', 'a-mode-runs', runId);
const sb = JSON.parse(fs.readFileSync(path.join(dir, 'storyboard.json')));
const output = path.join(dir, 'out');
const video = path.join(output, 'dynamic.mp4');
const qa = path.join(output, 'qa');
fs.mkdirSync(qa, {recursive:true});
const run = (cmd, args) => execFileSync(cmd, args, {encoding:'utf8', windowsHide:true, maxBuffer:8 * 1024 * 1024});
const probe = JSON.parse(run('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',video]));
const picture = probe.streams.find(stream => stream.codec_type === 'video');
const audio = probe.streams.find(stream => stream.codec_type === 'audio');
const frames = sb.shots.reduce((n,shot) => n + shot.durationInFrames,0);
const portrait = sb.aspectRatio === '9:16';
if (picture.width !== (portrait ? 1080 : 1920) || picture.height !== (portrait ? 1920 : 1080)) throw new Error('成片画幅错误');
if (Number(picture.nb_frames) !== frames || Math.abs(Number(probe.format.duration) - frames/sb.fps) > 0.15) throw new Error('成片时间轴错误');
if (!audio || Math.abs(Number(audio.duration) - frames/sb.fps) > 0.2) throw new Error('成片配音时长错误');
run('ffmpeg', ['-v','error','-i',video,'-f','null','-']);
let start = 0;
const shots = sb.shots.map((shot, index) => {
  const second = (start + Math.floor(shot.durationInFrames * 0.55))/sb.fps;
  start += shot.durationInFrames;
  const file = path.join(qa, `shot-${String(index+1).padStart(2,'0')}.png`);
  run('ffmpeg', ['-v','error','-y','-ss',String(second),'-i',video,'-frames:v','1','-vf','scale=360:-2',file]);
  return {shot:index+1,second,file,text:shot.text,displayText:shot.displayText,material:shot.material || null,
    materialRole:shot.materialRole,template:shot.shotCard};
});
for (let i=0;i<shots.length;i+=6) {
  const batch = shots.slice(i,i+6);
  const inputs = batch.flatMap(shot => ['-i',shot.file]);
  const layout = batch.map((_,n) => `${(n%3)*360}_${Math.floor(n/3)*(portrait?640:202)}`).join('|');
  const sheet = path.join(qa,`sheet-${String(i/6+1).padStart(2,'0')}.png`);
  run('ffmpeg',['-v','error','-y',...inputs,'-filter_complex',`xstack=inputs=${batch.length}:layout=${layout}:fill=black`, '-frames:v','1',sheet]);
}
const report = {runId, width:picture.width,height:picture.height,frames,duration:Number(probe.format.duration),
  pixelFormat:picture.pix_fmt,colorRange:picture.color_range,fullDecodePassed:true,
  ...backgroundCoverage(sb.shots),shots};
fs.writeFileSync(path.join(qa,'inspection.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,shots:shots.length}));
