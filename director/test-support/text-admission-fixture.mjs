import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Synthetic admission artifacts for isolated control-flow unit tests only.
export function installTextAdmissionFixture(root){
  const write=(file,content)=>{
    fs.writeFileSync(path.join(root,file),content);
    return crypto.createHash('sha256').update(content).digest('hex');
  };
  const source=write('unit-source.txt','synthetic source'),report=write('unit-report.json','{}');
  const landscape=write('unit-landscape.mp4','synthetic video'),portrait=write('unit-portrait.mp4','synthetic video');
  const ids=['typography/cel-flash-stomp','typography/blur-slide','typography/scramble','typography/brace-expand','typography/lead-word-zoom-assemble','typography/paper-title-card'];
  write('director/text-card-production-admission.json',JSON.stringify({schema:'native-business-text-admission-v1',cards:ids.map(id=>({id,
    localReview:'passed',acceptedFrames:[180],fps:30,sourceHashes:{'unit-source.txt':source},report:'unit-report.json',reportSha256:report,
    evidence:[{file:'unit-landscape.mp4',sha256:landscape},{file:'unit-portrait.mp4',sha256:portrait}]}))}));
}
