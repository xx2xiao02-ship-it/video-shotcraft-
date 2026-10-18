import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {planTalkcraftDigitalHuman,digitalHumanShotsHash,fileSha256} from './talkcraft-digital-human-plan.mjs';
const read=f=>JSON.parse(fs.readFileSync(f));
export function planDigitalHumanReuse(project,{probe=null}={}){
 const plan=planTalkcraftDigitalHuman(project),voice=fileSha256(path.join(project,'audio/full.mp3'));
 const registry=path.join(project,'qa/rebuild-inputs.json');
 if(!fs.existsSync(registry))return {...plan,reuse:[],missing:plan.units.map(u=>u.index),audioHash:voice,shotsHash:digitalHumanShotsHash(path.join(project,'remotion/shots.json'))};
 const registered=read(registry),source=path.resolve(registered.sourceProject||'.');
 if(registered.unchangedAudio!==voice||!fs.existsSync(path.join(source,'source-run.json'))||
   fileSha256(path.join(source,'audio/full.mp3'))!==voice)throw Error('复用来源与本次完整配音不一致，不能挪用口型');
 const reportFile=path.join(source,'digital-human-report.json');
 if(!fs.existsSync(reportFile))return {...plan,reuse:[],missing:plan.units.map(u=>u.index),audioHash:voice,shotsHash:digitalHumanShotsHash(path.join(project,'remotion/shots.json'))};
 const report=read(reportFile);
 if(report.status!=='SUCCESS'||report.audioHash!==voice)throw Error('来源数字人任务尚未成功或配音指纹变化');
 const media=path.join(source,'remotion/public'),reuse=[],missing=[];
 for(const unit of plan.units){
  let cursor=unit.fromFrame;const parts=[];
  while(cursor<unit.fromFrame+unit.durationInFrames){
   const found=report.units.find(u=>u.status==='SUCCESS'&&u.fromFrame<=cursor&&u.fromFrame+u.durationInFrames>cursor);
   if(!found)break;
   const file=path.resolve(media,found.file||'.'),relative=path.relative(media,file);
   if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('复用人物文件越出已登记媒体目录');
   if(!fs.existsSync(file))break;
   const frames=probe?probe(file):found.frames;
   if(frames!==found.durationInFrames||found.frames!==frames)throw Error('已有数字人帧数与来源区间不一致');
   const count=Math.min(unit.fromFrame+unit.durationInFrames,found.fromFrame+frames)-cursor;
   parts.push({file,sha256:fileSha256(file),startFrame:cursor-found.fromFrame,frames:count});cursor+=count;
  }
  if(cursor===unit.fromFrame+unit.durationInFrames)reuse.push({index:unit.index,parts});else missing.push(unit.index);
 }
 return {...plan,reuse,missing,sourceProject:source,sourceReportSha256:fileSha256(reportFile),audioHash:voice,
   shotsHash:digitalHumanShotsHash(path.join(project,'remotion/shots.json'))};
}
export function decodedDigitalHumanFrames(file){
 const r=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,r_frame_rate,avg_frame_rate','-of','json',file],{encoding:'utf8'})).streams?.[0];
 if(r?.r_frame_rate!=='30/1'||r?.avg_frame_rate!=='30/1')throw Error('复用人物素材不是恒定30fps');
 execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{stdio:'pipe'});
 return Number(r.nb_read_frames);
}
// Build a seed only once. A pre-existing report always belongs to query/local
// recovery, never to this initial reuse planner or another billable create.
export function seedDigitalHumanReuse(project,{probe=decodedDigitalHumanFrames}={}){
 const reportFile=path.join(project,'digital-human-report.json');if(fs.existsSync(reportFile))return {existing:true};
 const plan=planDigitalHumanReuse(project,{probe});
 const snapshot=path.join(project,'qa/digital-human-reuse-plan.json');
 const fingerprint=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 if(fs.existsSync(snapshot)&&read(snapshot).fingerprint!==fingerprint)throw Error('未完成的数字人复用输入变化，停止而不新增生成');
 const dir=path.join(project,'remotion/public/digital-human');
 if(!fs.existsSync(snapshot)){
  fs.mkdirSync(path.dirname(snapshot),{recursive:true});fs.writeFileSync(snapshot,JSON.stringify({schema:'talkcraft-digital-human-reuse-plan-v1',fingerprint,plan},null,2),{flag:'wx'});
 }
 // Preserve old IDs/assets before installing the current run's exact mapping.
 const archive=path.join(project,'qa/digital-human-assets-history',fingerprint);
 const marker=path.join(project,'qa/digital-human-reuse-started.json');
 if(!fs.existsSync(marker)){
  if(fs.existsSync(dir)){
   fs.mkdirSync(path.dirname(archive),{recursive:true});if(fs.existsSync(archive))throw Error('已有复用资产归档，禁止覆盖');
   fs.renameSync(dir,archive);
  }
  fs.writeFileSync(marker,JSON.stringify({fingerprint,archive,startedAt:new Date().toISOString()}),{flag:'wx'});
 }else if(read(marker).fingerprint!==fingerprint)throw Error('已有另一份数字人复用事务');
 fs.mkdirSync(dir,{recursive:true});
 const units=plan.units.map(u=>({...u,status:'PENDING'}));
 for(const reuse of plan.reuse){
  const unit=units[reuse.index],output=path.join(dir,`unit-${unit.index+1}.mp4`),proof=output+'.reuse.json';
  if(fs.existsSync(output)){
   if(!fs.existsSync(proof)||read(proof).sha256!==fileSha256(output)||probe(output)!==unit.durationInFrames)
    throw Error('复用中断文件缺少完整验证，停止核实；不新增计费');
  }else{
   const args=['-v','error','-n'];for(const part of reuse.parts){if(fileSha256(part.file)!==part.sha256)throw Error('来源人物素材变化');args.push('-i',part.file);}
   const filters=reuse.parts.map((p,i)=>`[${i}:v]trim=start_frame=${p.startFrame}:end_frame=${p.startFrame+p.frames},setpts=PTS-STARTPTS[v${i}]`);
   filters.push(reuse.parts.map((_,i)=>`[v${i}]`).join('')+`concat=n=${reuse.parts.length}:v=1:a=0[v]`);
   const temporary=output+'.part.mp4';if(fs.existsSync(temporary))throw Error('复用编码中断，保留中间结果等待核实');
   execFileSync('ffmpeg',[...args,'-filter_complex',filters.join(';'),'-map','[v]','-an','-c:v','libx264','-pix_fmt','yuv420p',temporary],{stdio:'pipe'});
   if(probe(temporary)!==unit.durationInFrames)throw Error('复用切片帧数错误');fs.renameSync(temporary,output);
   fs.writeFileSync(proof,JSON.stringify({fingerprint,sha256:fileSha256(output)}),{flag:'wx'});
  }
  Object.assign(unit,{status:'SUCCESS',reused:true,frames:unit.durationInFrames,file:`digital-human/${path.basename(output)}`,reuseParts:reuse.parts});
 }
 const report={schema:'talkcraft-digital-human-v1',runId:read(path.join(project,'source-run.json')).runId,mode:plan.mode,fps:30,
  shotsHash:plan.shotsHash,audioHash:plan.audioHash,status:'PREPARING',taskIds:[],units,reuseFingerprint:fingerprint};
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{flag:'wx'});return {existing:true,reused:plan.reuse.length,missing:plan.missing};
}
