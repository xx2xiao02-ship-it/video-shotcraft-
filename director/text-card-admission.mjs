import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {textCardSourcesCurrent} from './text-card-source-binding.mjs';
import {TEXT_CARD_CONTRACTS} from './text-card-contracts.mjs';

const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function currentFile(root,relative,expected){
  const file=path.resolve(root,relative);
  return file.startsWith(path.resolve(root)+path.sep) && fs.existsSync(file) && sha(file)===expected;
}

export function readTextCardAdmission(root){
  try {
    const record=JSON.parse(fs.readFileSync(path.join(root,'director/text-card-production-admission.json'),'utf8'));
    if(record.schema!=='native-business-text-admission-v1') return null;
    return record;
  }catch{return null;}
}

export function admittedTextCards(root){
  const record=readTextCardAdmission(root);
  return (record?.cards || []).filter(item=>{
    try {
      const supported=TEXT_CARD_CONTRACTS[item.id]?.acceptedFrames || [180];
      if(item.localReview!=='passed' || item.acceptedFrames?.length!==1 || !supported.includes(item.acceptedFrames[0]) || item.fps!==30) return false;
      if(!textCardSourcesCurrent(root,item)) return false;
      if(!currentFile(root,item.report,item.reportSha256)) return false;
      return item.evidence?.length===2 && item.evidence.every(video=>currentFile(root,video.file,video.sha256));
    }catch{return false;}
  }).map(item=>item.id);
}
