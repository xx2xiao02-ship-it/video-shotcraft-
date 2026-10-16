import {execFileSync} from 'node:child_process';
import {existsSync,renameSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const rate=value=>{const [a,b=1]=String(value).split('/').map(Number);return a/b;};
export function probeHostRate(file){
  const data=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0',
    '-show_entries','stream=r_frame_rate,avg_frame_rate,nb_frames,width,height,duration','-of','json',file],{encoding:'utf8'}));
  const s=data.streams?.[0];if(!s)throw Error('人物视频缺少视频轨');
  const fps=rate(s.r_frame_rate),avgFps=rate(s.avg_frame_rate);
  if(!(fps>0)||!(avgFps>0)||Math.abs(fps-avgFps)/fps>.005)throw Error('人物原视频帧率不恒定，不能直接转换或切分');
  return {fps,avgFps,frames:Number(s.nb_frames),width:s.width,height:s.height,duration:Number(s.duration)};
}

// host-footage.md §1 explicitly permits optical flow when the composition fps
// must remain fixed. Never use fps=30 or -r to manufacture repeated frames.
// Raw provider footage and previous derivatives remain untouched.
export function prepareHostFramerate(input,output,{fps=30}={}){
  const source=probeHostRate(input);
  if(Math.abs(source.fps-fps)<.01)return {file:input,method:'native',source};
  if(fps!==30||Math.abs(source.fps-25)>.01)throw Error(`人物原视频 ${source.fps}fps 需要单独适配，不能重复帧直转`);
  const proof=output+'.json',inputSha256=hash(input);
  if(existsSync(output)){
    if(!existsSync(proof))throw Error('已有光流文件缺少来源证据，已保留');
    const record=JSON.parse(readFileSync(proof,'utf8'));
    if(record.inputSha256!==inputSha256||record.outputSha256!==hash(output)||record.fps!==fps)
      throw Error('已有光流文件或来源变化，已保留');
    return {file:output,...record};
  }
  const part=output+'.part.mp4';
  if(existsSync(part))throw Error('已有光流临时文件，已保留');
  const filter='minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1';
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',input,'-vf',filter,
    '-an','-c:v','libx264','-threads','4','-pix_fmt','yuv420p',part],{stdio:'inherit'});
  const result=probeHostRate(part);
  if(Math.abs(result.fps-fps)>.01||result.width!==source.width||result.height!==source.height)
    throw Error('光流转换的帧率或尺寸不符');
  renameSync(part,output);
  const record={schema:'talkcraft-host-optical-flow-v1',method:'optical-flow',fps,source,
    inputSha256,outputSha256:hash(output),output:result,filter,
    rule:'video-talkcraft/references/host-footage.md §1',userAcceptance:false};
  writeFileSync(proof,JSON.stringify(record,null,2));
  return {file:output,...record};
}
