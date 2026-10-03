import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = path.join(root, 'template');
const outputRoot = path.join(root, '.isolated');
fs.mkdirSync(outputRoot, {recursive: true});
const output = fs.mkdtempSync(path.join(outputRoot, 'background-music-smoke-'));
const publicDir = path.join(output, 'public', 'audio');
fs.mkdirSync(publicDir, {recursive: true});
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const chrome = process.env.CHROME || 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=480:duration=3',
  '-c:a', 'pcm_s16le', path.join(publicDir, 'voice.wav')], {stdio: 'inherit'});
fs.copyFileSync(path.join(root, 'assets', 'audio', 'bgm', 'cat-walk.mp3'), path.join(publicDir, 'music.mp3'));
const storyboard = {
  title: '背景音乐隔离测试', fps: 30, audio: 'audio/voice.wav',
  style: {bg: '#101820', text: '#ffffff', accent: '#36b5a2', sub: '#87959a', captionStyle: 'plain'},
  shots: [{type: 'hook', text: '背景音乐隔离测试', durationInFrames: 90}],
};
const cli = path.join(template, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
for (const [name, bgm] of [['with-bgm', {src: 'audio/music.mp3', volume: 0.18}], ['without-bgm', null]]) {
  const props = path.join(output, `${name}.json`);
  const video = path.join(output, `${name}.mp4`);
  fs.writeFileSync(props, JSON.stringify({storyboard, bgm}), 'utf8');
  execFileSync(process.execPath, [cli, 'render', 'src/index.ts', 'DynamicVideo', video,
    `--props=${props}`, `--public-dir=${path.join(output, 'public')}`,
    `--browser-executable=${chrome}`, '--concurrency=1'], {cwd: template, stdio: 'inherit', timeout: 300000});
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', video], {encoding: 'utf8'}));
  if (!probe.streams.some(stream => stream.codec_type === 'video') || !probe.streams.some(stream => stream.codec_type === 'audio')) {
    throw new Error(`${name} 缺少视频或音频流`);
  }
}
const audioHash = video => execFileSync(ffmpeg, ['-v', 'error', '-i', path.join(output, video),
  '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 'md5', '-'], {encoding: 'utf8'}).trim();
if (audioHash('with-bgm.mp4') === audioHash('without-bgm.mp4')) throw new Error('两版声音完全相同，BGM 未进入合成');
console.log(JSON.stringify({ok: true, output, withBgm: 'with-bgm.mp4', withoutBgm: 'without-bgm.mp4'}));
