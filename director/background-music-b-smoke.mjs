import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scaffoldTalkcraftProject} from './talkcraft-scaffold.mjs';
import {talkcraftMusicProps, writeMusicSelection} from './background-music.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, '.isolated');
fs.mkdirSync(outputRoot, {recursive: true});
const root = fs.mkdtempSync(path.join(outputRoot, 'talkcraft-bgm-smoke-'));
const runId = '01234567-89ab-4cde-8fab-0123456789ab';
const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
const remotion = path.join(project, 'remotion');
const skill = path.join(projectRoot, '_audit', 'video-talkcraft');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const chrome = process.env.CHROME || 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
fs.mkdirSync(path.join(root, 'assets', 'audio', 'bgm'), {recursive: true});
fs.copyFileSync(path.join(projectRoot, 'assets', 'audio', 'bgm', 'cat-walk.mp3'),
  path.join(root, 'assets', 'audio', 'bgm', 'cat-walk.mp3'));
writeMusicSelection(root, 'B', {source: 'builtin', name: 'cat-walk.mp3', volume: 0.18});
fs.mkdirSync(path.join(project, 'audio'), {recursive: true});
fs.mkdirSync(remotion, {recursive: true});
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=480:duration=3',
  '-c:a', 'libmp3lame', path.join(project, 'audio', 'full.mp3')], {stdio: 'inherit'});
fs.writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({
  totalFrames: 90, fps: 30,
  themeSnapshot: {name: '测试', bg: '#101820', ink: '#ffffff', mid: '#87959a', accent: '#36b5a2'},
}), 'utf8');
fs.writeFileSync(path.join(remotion, 'shots.json'), JSON.stringify([{id: 's01', start: 0, end: 3}]), 'utf8');
fs.writeFileSync(path.join(remotion, 'timing.json'), JSON.stringify({
  totalSec: 3, scenes: [{id: 's01', text: '测试', startSec: 0, durationSec: 3,
    chars: [{ch: '测', t: 0, e: 0.4}, {ch: '试', t: 0.4, e: 0.8}]}],
}), 'utf8');
scaffoldTalkcraftProject(root, skill, runId);
talkcraftMusicProps(root, remotion, true);
fs.writeFileSync(path.join(remotion, 'without-bgm.json'), JSON.stringify({bgm: null}), 'utf8');
const cli = path.join(projectRoot, 'template', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
for (const [name, props] of [['with-bgm', 'bgm-props.json'], ['without-bgm', 'without-bgm.json']]) {
  const video = path.join(root, `${name}.mp4`);
  execFileSync(process.execPath, [cli, 'render', 'src/index.ts', 'Main', video,
    `--props=${path.join(remotion, props)}`, `--public-dir=${path.join(remotion, 'public')}`,
    `--browser-executable=${chrome}`, '--concurrency=1', '--scale=0.25'],
  {cwd: remotion, stdio: 'inherit', timeout: 300000});
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', video], {encoding: 'utf8'}));
  if (!probe.streams.some(stream => stream.codec_type === 'video') || !probe.streams.some(stream => stream.codec_type === 'audio')) {
    throw new Error(`${name} 缺少视频或音频流`);
  }
}
const audioHash = video => execFileSync(ffmpeg, ['-v', 'error', '-i', path.join(root, video),
  '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 'md5', '-'], {encoding: 'utf8'}).trim();
if (audioHash('with-bgm.mp4') === audioHash('without-bgm.mp4')) throw new Error('TalkCraft BGM 未进入合成');
console.log(JSON.stringify({ok: true, output: root, withBgm: 'with-bgm.mp4', withoutBgm: 'without-bgm.mp4'}));
