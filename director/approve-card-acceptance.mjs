import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {GRAPHIC_CONTRACTS} from './graphic-contracts.mjs';

if(!process.argv.includes('--record-reviewed'))throw new Error('必须先人工检查横竖版样帧，再明确记录审核');
const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'template/out/card-acceptance-20260930-v3/acceptance.json');
const report=JSON.parse(fs.readFileSync(file));
if(report.cards.length!==157||!report.integration?.fullDecodePassed)throw new Error('全量检查或真实合成链验证尚未完成');
for(const [relative,expected] of Object.entries(report.sourceHashes)){
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected)throw new Error(`源码变化：${relative}`);
}
const evidence=[];
for(const card of Object.keys(GRAPHIC_CONTRACTS))if(!report.businessCases.some(item=>item.card===card))throw new Error(`业务样板缺失：${card}`);
for(const item of report.businessCases.filter(item=>GRAPHIC_CONTRACTS[item.card])){
  const card=item.card;
  if(!item||item.results.length!==6||item.results.some(result=>!result.nonblank))throw new Error(`业务样板未通过：${card}`);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',item.video],{encoding:'utf8',windowsHide:true}));
  const picture=probe.streams.find(stream=>stream.codec_type==='video');
  if(picture.width!==1080||picture.height!==1920||Number(picture.nb_frames)!==180)throw new Error(`样板视频尺寸/帧数错误：${card}`);
  execFileSync('ffmpeg',['-v','error','-i',item.video,'-f','null','-'],{windowsHide:true});
  evidence.push({card,video:path.relative(root,item.video),videoSha256:crypto.createHash('sha256').update(fs.readFileSync(item.video)).digest('hex')});
}
const admission={version:1,review:'passed',userVisualAcceptance:'pending',reviewer:'Codex local sample review',
  scope:'two structured graphic contracts only; not all 157 cards',cards:Object.keys(GRAPHIC_CONTRACTS),
  sourceHashes:{...report.sourceHashes,'director/admission-source-policy.mjs':crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'director/admission-source-policy.mjs'))).digest('hex')},
  evidence,report:path.relative(root,file),reportSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'director/card-production-admission.json'),JSON.stringify(admission,null,2));
console.log(JSON.stringify({admitted:admission.cards,userVisualAcceptance:admission.userVisualAcceptance}));
