import fs from 'node:fs';
import path from 'node:path';
import {admissionArtifactsCurrent, admissionSourcesCurrent} from './admission-source-policy.mjs';

export function admittedGraphicCards(root) {
  const file=path.join(root,'director','card-production-admission.json');
  if(!fs.existsSync(file))return [];
  try{
    const report=JSON.parse(fs.readFileSync(file));
    if(report.version!==1||report.review!=='passed' ||
        !admissionSourcesCurrent(root,report.sourceHashes) || !admissionArtifactsCurrent(root,report))return [];
    return report.cards || [];
  }catch{return [];}
}
