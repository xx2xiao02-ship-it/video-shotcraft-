import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {selectComposition, renderMedia, renderStill} from '@remotion/renderer';
import {writeTemplateUsage} from '../director/template-usage.mjs';

const dir = path.join(import.meta.dirname, 'out', 'layout-qa-20260930');
const props = JSON.parse(fs.readFileSync(path.join(dir, 'full-props.json'), 'utf8'));
const shots = props.storyboard.shots;
let frame = 0;
const ranges = shots.map(shot => {
  const range = {shot, start:frame, end:frame + shot.durationInFrames};
  frame = range.end;
  return range;
}).filter(({shot}) => ['typography/word-relay-geometry', 'ui-entrance/clipcard-looping'].includes(shot.shotCard));
if (ranges.length !== 2 || ranges[0].end !== ranges[1].start) throw new Error('QA repair expects two adjacent affected shots');
const start = ranges[0].start;
const end = ranges[1].end;
const outputDir = path.join(dir, process.argv[2] || 'corrected');
fs.mkdirSync(outputDir, {recursive:true});
const original = path.join(dir, 'full', 'dynamic.mp4');
const output = path.join(outputDir, 'dynamic.mp4');
if (fs.existsSync(output)) throw new Error('Existing QA output was preserved');
const browserExecutable = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const serveUrl = await bundle({entryPoint:path.join(import.meta.dirname, 'src', 'index.ts'), publicDir:path.join(import.meta.dirname, 'public')});
const inputProps = {...props, bgm:null, storyboard:{...props.storyboard, audio:undefined}};
const composition = await selectComposition({serveUrl, id:'DynamicVideo', inputProps, browserExecutable});
for (const range of ranges) {
  await renderStill({serveUrl, composition, inputProps, frame:range.start + 65, browserExecutable,
    output:path.join(outputDir, `${range.shot.shotCard.split('/').at(-1)}.png`), imageFormat:'png'});
}
const segment = path.join(outputDir, 'repaired-segment.mp4');
await renderMedia({serveUrl, composition, inputProps, outputLocation:segment, browserExecutable,
  frameRange:[start, end - 1], codec:'h264', concurrency:1});
// Replace only these video frames; keep the original continuous audio stream.
execFileSync('ffmpeg', ['-n', '-v', 'error', '-i', original, '-i', segment,
  '-filter_complex', `[0:v]split=2[a][c];[a]trim=end_frame=${start},setpts=PTS-STARTPTS[before];[1:v]setpts=PTS-STARTPTS[fix];[c]trim=start_frame=${end},setpts=PTS-STARTPTS[after];[before][fix][after]concat=n=3:v=1:a=0,scale=in_range=auto:out_range=tv[v]`,
  '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
  '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output], {stdio:'inherit', windowsHide:true});
const count = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', 'stream=nb_read_frames', '-of', 'default=noprint_wrappers=1:nokey=1', output], {encoding:'utf8'}).trim());
if (count !== frame) throw new Error(`QA repaired frame count ${count} != ${frame}`);
writeTemplateUsage(path.join(outputDir, 'template-usage.json'), props.storyboard, output);
console.log(`VERIFIED ${count} frames: ${output}`);
