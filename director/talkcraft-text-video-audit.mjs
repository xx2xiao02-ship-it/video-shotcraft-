import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {TEXT_VIDEO_VERSION,hasVideoBackground} from './talkcraft-text-video.mjs';
export function auditTextVideoFiles(project,shots){
 const issues=[],files=[],publicRoot=path.resolve(project,'remotion/public');
 for(const shot of shots){const p=shot.templateParams||{};if(!hasVideoBackground(shot))continue;
  try{
   const file=path.resolve(publicRoot,p.materialSrc),relative=path.relative(publicRoot,fs.realpathSync(file));
   if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(file).isFile())throw Error('背景必须位于当前工程的本地素材目录');
   const sha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   if(p.backgroundPresentation===TEXT_VIDEO_VERSION&&p.materialSha256&&p.materialSha256!==sha256)throw Error('背景文件与已绑定的SHA-256不一致；原来源与授权核验继续由素材治理负责');
   const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',timeout:15000}));
   const stream=probe.streams.find(s=>s.codec_type==='video'),duration=Number(stream?.duration||probe.format?.duration),rate=p.materialPlaybackRate??1;
   if(!stream||stream.disposition?.attached_pic||!Number.isFinite(duration)||!(rate>0)||duration/rate+1/30<Number(shot.end)-Number(shot.start))throw Error('实际视频流不存在或时长不足，不能以图片/空路径/循环补位');
   files.push({shotId:shot.id,path:relative,sha256,duration,playbackRate:rate});
  }catch(error){issues.push({shotId:shot.id,code:'TEXT_VIDEO_FILE_INVALID',message:error.message});}
 }
 return {passed:!issues.length,issues,files};
}
