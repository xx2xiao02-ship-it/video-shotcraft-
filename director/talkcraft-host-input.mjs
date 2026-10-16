import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';

export const HOST_LIMIT = 300 * 1024 * 1024;
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const rate=value=>{const [a,b=1]=String(value).split('/').map(Number);return a/b;};

// The uploaded original is immutable evidence. No TTS, speed changes, frame
// duplication or chroma key is applied to a real person's recording.
export function prepareRecordedHost(project) {
  const sourceFile=path.join(project,'source-run.json');
  const source=JSON.parse(readFileSync(sourceFile,'utf8'));
  if(source.workflowPath!=='recorded-host')throw Error('此任务不是已固定的真人视频路径');
  const video=path.join(project,'assets/host-original.mp4');
  if(!existsSync(video)||hash(video)!==source.hostInputSha256)throw Error('真人口播原文件缺失或发生变化；禁止切换到合成路径');
  const voice=path.join(project,'audio/full.mp3');
  if(existsSync(voice))throw Error('已有原声已保留，请使用恢复校验，不重复提取');
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  if(!v||!a)throw Error('真人口播视频必须同时包含可解码画面和原声，不能自动改用 TTS');
  const duration=Number(v.duration||probe.format.duration),fps=rate(v.avg_frame_rate);
  if(!(duration>0)||Math.abs(fps-30)>.01||Math.abs(rate(v.r_frame_rate)-fps)>.01)
    throw Error('当前渲染工程固定 30fps，请提供恒定 30fps 的原始口播视频；不会通过重复帧强制转换');
  execFileSync('ffmpeg',['-v','error','-xerror','-i',video,'-map','0:v:0','-map','0:a:0','-f','null','-'],{timeout:300000});
  mkdirSync(path.join(project,'remotion/public/dh'),{recursive:true});
  copyFileSync(video,path.join(project,'remotion/public/dh/host.mp4'));
  const pcm=path.join(project,'audio/full.wav');
  execFileSync('ffmpeg',['-v','error','-i',video,'-map','0:a:0','-vn','-c:a','pcm_s16le',pcm]);
  execFileSync('ffmpeg',['-v','error','-i',pcm,'-c:a','libmp3lame','-q:a','2',voice]);
  execFileSync('ffmpeg',['-v','error','-i',video,'-frames:v','1','-update','1',path.join(project,'assets/avatar.png')]);
  const metadata={voice:'recorded-original',voiceEngine:'recorded-original',durationSeconds:duration,totalFrames:Math.round(duration*30),
    timingMethod:'recorded-video-awaiting-alignment',hostSha256:hash(video),audioSha256:hash(voice),pcmSha256:hash(pcm)};
  writeFileSync(path.join(project,'audio/voice-timing.json'),JSON.stringify(metadata,null,2));
  writeFileSync(sourceFile,JSON.stringify({...source,voiceEngine:'recorded-original',totalFrames:metadata.totalFrames,
    hostVideo:'dh/host.mp4',hostInputVerified:true},null,2));
  return metadata;
}

export function verifyRecordedVoice(project,source) {
  try {
    const record=JSON.parse(readFileSync(path.join(project,'audio/voice-timing.json'),'utf8'));
    return source.workflowPath==='recorded-host'&&record.voiceEngine==='recorded-original'&&
      record.hostSha256===source.hostInputSha256&&record.hostSha256===hash(path.join(project,'assets/host-original.mp4'))&&
      record.audioSha256===hash(path.join(project,'audio/full.mp3'))&&record.pcmSha256===hash(path.join(project,'audio/full.wav'));
  }catch{return false;}
}

export function bindRecordedHostShots(project) {
  const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
  if(source.workflowPath!=='recorded-host')return;
  if(!verifyRecordedVoice(project,source))throw Error('真人原声与视频来源核验失败');
  const shots=JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8'));
  const dir=path.join(project,'remotion/public/digital-human');mkdirSync(dir,{recursive:true});
  for(const shot of shots.filter(s=>s.subject==='person')){
    const target=path.join(dir,`${shot.id}.mp4`);
    if(!/^[a-z][a-z0-9]*$/i.test(shot.id)||!(shot.start>=0&&shot.end>shot.start))throw Error('真人镜头区间无效');
    const binding={hostSha256:source.hostInputSha256,startFrame:Math.round(shot.start*30),endFrame:Math.round(shot.end*30)};
    const receipt=target+'.binding.json';
    if(existsSync(target)){
      if(!existsSync(receipt)||JSON.stringify(JSON.parse(readFileSync(receipt,'utf8')))!==JSON.stringify(binding))throw Error(`真人镜头 ${shot.id} 区间已变化；旧素材保留，需重新处理该镜头`);
      continue;
    }
    execFileSync('ffmpeg',['-v','error','-i',path.join(project,'remotion/public/dh/host.mp4'),
      '-vf',`trim=start_frame=${Math.round(shot.start*30)}:end_frame=${Math.round(shot.end*30)},setpts=PTS-STARTPTS`,
      '-an','-c:v','libx264','-pix_fmt','yuv420p',target]);
    const check=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',target],{encoding:'utf8'}));
    if(Number(check.streams?.[0]?.nb_read_frames)!==binding.endFrame-binding.startFrame)throw Error(`真人镜头 ${shot.id} 帧数不匹配`);
    writeFileSync(receipt,JSON.stringify(binding));
  }
}
