import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ffprobePath} from './packaging-media.mjs';

const root=path.resolve(import.meta.dirname,'..');
const graphics=process.argv.includes('--graphics');
const source=graphics?'template/out/short-graphic-acceptance-v1/acceptance.json':'template/out/short-card-acceptance-v1/acceptance.json';
const outputDir=path.dirname(source);
const report=JSON.parse(fs.readFileSync(path.join(root,source),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
if(report.localVisualReview!=='passed') throw new Error('必须先完成本地视觉检查，不能仅凭解码成功开放');
for(const [file,sha] of Object.entries(report.sourceHashes))
  if(hash(file)!==sha) throw new Error(`验收源码已变化：${file}`);
const frameEvidence=[];
for(const card of report.cards)for(const result of card.results) {
  const file=`${outputDir}/${result.video}`;
  const probe=JSON.parse(execFileSync(ffprobePath(),['-v','error','-select_streams','v:0','-show_entries',
    'stream=nb_frames,width,height,r_frame_rate','-of','json',path.join(root,file)],{encoding:'utf8',windowsHide:true})).streams[0];
  // AAC packet padding affects container duration, not the actual visual cut.
  if(Number(probe.nb_frames)!==result.frames || probe.r_frame_rate!=='30/1' ||
      Number(probe.width)!==(result.aspect==='9:16'?1080:1920) || Number(probe.height)!==(result.aspect==='9:16'?1920:1080))
    throw new Error(`视频实际帧数或画幅异常：${file}`);
  frameEvidence.push({file,sha256:result.videoSha256,frames:Number(probe.nb_frames),fps:30,aspect:result.aspect});
  if(!result.fullDecodePassed || hash(file)!==result.videoSha256)
    throw new Error('渲染产物与验收不一致');
}
const admission={schema:'short-card-acceptance-v1',fps:report.fps,localVisualReview:'passed',userVisualReview:'pending',
  scope:report.scope,sourceHashes:report.sourceHashes,acceptanceReport:source,acceptanceSha256:hash(source),
  frameEvidence,
  cards:report.cards.map(({id,status,acceptedFrames,completionFrame,completionRatio,holdFrames,exitFrames,maxLines,maxChars,reason,fps,kind,graphicLimits})=>
    ({id,status,acceptedFrames,completionFrame,completionRatio,holdFrames,exitFrames,maxLines,maxChars,reason,fps,kind,graphicLimits}))};
if(graphics) {
  const prior=JSON.parse(fs.readFileSync(path.join(root,'director/short-card-production-admission.json'),'utf8'));
  const ids=new Set(admission.cards.map(card=>card.id));
  admission.cards=[...prior.cards.filter(card=>!ids.has(card.id)),...admission.cards];
  const evidenceFiles=new Set(frameEvidence.map(item=>item.file));
  admission.frameEvidence=[...prior.frameEvidence.filter(item=>!evidenceFiles.has(item.file)),...frameEvidence];
  admission.graphicAcceptanceReport=source;
  admission.graphicAcceptanceSha256=hash(source);
  admission.acceptanceReport=prior.acceptanceReport;
  admission.acceptanceSha256=prior.acceptanceSha256;
}
fs.writeFileSync(path.join(root,'director/short-card-production-admission.json'),JSON.stringify(admission,null,2)+'\n');
console.log('已保存可版本管理的短镜头准入记录；用户视觉验收仍为 pending');
