import fs from 'node:fs';
import path from 'node:path';
import {admissionArtifactsCurrent, admissionSourcesCurrent} from './admission-source-policy.mjs';

export function admittedNumericCards(root) {
  const files=['director/numeric-card-production-admission.json','director/numeric-card-current-long-admission.json'];
  const admitted=[];
  for (const file of files) {
    try {
      const report=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
      if(report.schema!=='numeric-card-production-admission-v1' || report.localReview!=='passed' ||
          !admissionSourcesCurrent(root,report.sourceHashes) || !admissionArtifactsCurrent(root,report)) continue;
      admitted.push(...(report.cards || []));
    } catch { /* Preserve other valid numeric admission records when one is stale. */ }
  }
  return [...new Set(admitted)];
}
