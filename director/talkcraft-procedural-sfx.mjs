import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Upstream sfx_dump.mjs explicitly leaves riser/ping/lowpad to production
// synthesis. Implement only the riser used here, following demos/_lib/sfx.js:
// white noise -> bandpass Q=2.2, exponential 220->3200 Hz, exponential gain
// .0001->.4 then .08s release; source stops .15s after the sweep.
export function riserWav(duration=.6,rate=1){
  if(!Number.isFinite(duration)||duration<=0||duration>10||!Number.isFinite(rate)||rate<=0||rate>4)throw Error('上升音效时长或音高无效');
  const sr=48000,n=Math.ceil((duration+.15)*sr),pcm=Buffer.alloc(n*2);let state=73129,x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<n;i++){
    const t=i/sr;state=(Math.imul(state,1664525)+1013904223)>>>0;const x=state/2147483648-1;
    const frequency=220*rate*Math.pow(3200/220,Math.min(1,t/duration));
    const w=2*Math.PI*frequency/sr,a=Math.sin(w)/(2*2.2),a0=1+a;
    const y=(a*x-a*x2+2*Math.cos(w)*y1-(1-a)*y2)/a0;
    x2=x1;x1=x;y2=y1;y1=y;
    const gain=t<=duration?.0001*Math.pow(.4/.0001,t/duration):t<=duration+.08?.4*Math.pow(.0001/.4,(t-duration)/.08):.0001;
    pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,y*gain*.9))*32767),i*2);
  }
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sr,24);
  header.writeUInt32LE(sr*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
export function proceduralCue(cue,skillRoot){
  if(cue.name!=='riser')throw Error('原卡音效缺少真实采样：'+cue.name);
  const source=path.join(skillRoot,'demos/_lib/sfx.js'),bytes=fs.readFileSync(source);
  if(!/riser:\s*function/u.test(bytes.toString()))throw Error('上游缺少 riser 合成定义');
  const duration=cue.dur||.6;
  return {file:`riser-${Math.round(duration*1000)}ms.wav`,procedural:{name:'riser',duration,rate:1,
    source,sourceSha256:createHash('sha256').update(bytes).digest('hex'),recipe:'upstream-riser-white-noise-bandpass-v1'}};
}
export function installProceduralCue(cue,directory){
  const p=cue.procedural;
  if(!p||p.name!=='riser'||p.recipe!=='upstream-riser-white-noise-bandpass-v1'||
    createHash('sha256').update(fs.readFileSync(p.source)).digest('hex')!==p.sourceSha256)throw Error('合成音效的上游来源不一致');
  const bytes=riserWav(p.duration,p.rate),file=path.join(directory,cue.file);
  fs.mkdirSync(directory,{recursive:true});
  if(fs.existsSync(file)&&!fs.readFileSync(file).equals(bytes))throw Error('已有音效与原版合成配方不同，已保留：'+cue.file);
  if(!fs.existsSync(file))fs.writeFileSync(file,bytes,{flag:'wx'});
  return {file,sha256:createHash('sha256').update(bytes).digest('hex')};
}
