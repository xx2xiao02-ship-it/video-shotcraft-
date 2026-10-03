import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

if(!process.argv.includes('--record-reviewed'))throw new Error('先检查真实横竖产物，再记录本地审核');
const root=path.resolve(import.meta.dirname,'..');
const folder='template/out/card-governance-batch-001-v3';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const evidenceFile=`${folder}/integration/evidence.json`;
const integration=read(evidenceFile),isolated=read(`${folder}/acceptance.json`);
function verifySources(report) {
  if(!Object.keys(report.sourceHashes || {}).length)throw new Error('缺少源码绑定');
  for(const [file,sha] of Object.entries(report.sourceHashes))if(hash(file)!==sha)throw new Error(`验收后源码变化：${file}`);
}
function verifySample(item) {
  if(hash(item.file)!==item.sha256)throw new Error(`验收样帧变化：${item.file}`);
  if(item.baseline && hash(item.baseline)!==item.baselineSha256)throw new Error('历史样帧已变化');
  if(item.refreshedBaseline && hash(item.refreshedBaseline)!==item.refreshedBaselineSha256)throw new Error('隔离旧源码样帧已变化');
}
function verifyVideo(item) {
  if(!item.fullDecodePassed || hash(item.file)!==item.sha256)throw new Error(`视频验收证据失效：${item.file}`);
  item.samples.forEach(verifySample);
}
verifySources(integration);verifySources(isolated);
if(integration.oldGraphics.length!==12 || integration.oldGraphics.some(item=>!item.pixelIdentical) ||
    integration.oldShortCards.length!==8 || integration.oldShortCards.some(item=>item.samples.some(sample=>!sample.pixelIdentical)) ||
    integration.numeric.length!==4 || isolated.results.length!==8)throw new Error('当前批次真实渲染证据不完整');
integration.oldGraphics.forEach(verifySample);
[...integration.oldShortCards,...integration.numeric].forEach(verifyVideo);
for(const item of isolated.results) {
  if(!item.fullDecodePassed || hash(`${folder}/${item.video}`)!==item.sha256)throw new Error('独立业务视频证据失效');
  for(const sample of item.samples)if(hash(`${folder}/${sample.file}`)!==sample.sha256)throw new Error('独立业务样帧证据失效');
}
const compatibility={report:evidenceFile,sha256:hash(evidenceFile),
  oldGraphicSamples:12,shortVideos:8,review:'passed',reviewer:'Codex local visual and source-bound compatibility review'};
for(const file of ['director/card-production-admission.json','director/short-card-production-admission.json']) {
  const previous=read(file);
  const snapshot=path.join(root,folder,'integration',`prior-${path.basename(file)}`);
  if(!fs.existsSync(snapshot))fs.copyFileSync(path.join(root,file),snapshot);
  const sourceHashes=Object.fromEntries([...new Set([...Object.keys(previous.sourceHashes),'director/numeric-card-contracts.mjs'])]
    .map(source=>[source,integration.sourceHashes[source]]));
  fs.writeFileSync(path.join(root,file),JSON.stringify({...previous,sourceHashes,compatibility},null,2)+'\n');
}
const sources=['template/src/DynamicVideo.tsx','template/src/TemplateAdapter.tsx',
  'demos/data/counter-confetti/CounterConfetti.tsx','demos/_fixtures/Motion.tsx','demos/_fixtures/TemplateSkin.ts',
  'director/numeric-card-contracts.mjs','director/numeric-card-admission.mjs','director/admission-source-policy.mjs','director/a-mode-run.mjs',
  'director/a-mode-render-preflight.mjs','director/a-mode-shot.schema.json'];
const admission={schema:'numeric-card-production-admission-v1',cards:['data/counter-confetti'],localReview:'passed',
  actualModelValidated:false,userAcceptance:'pending',shortVersion:'not-accepted',
  scope:'138-frame native scalar metric, real DynamicVideo integration, zero and decimal boundary checks; no paid model call',
  sourceHashes:Object.fromEntries(sources.map(file=>[file,hash(file)])),
  evidence:integration.numeric.map(item=>({file:item.file,sha256:item.sha256})),
  report:evidenceFile,reportSha256:hash(evidenceFile),isolatedReport:`${folder}/acceptance.json`,isolatedReportSha256:hash(`${folder}/acceptance.json`)};
fs.writeFileSync(path.join(root,'director/numeric-card-production-admission.json'),JSON.stringify(admission,null,2)+'\n');
console.log(JSON.stringify({localAdmitted:admission.cards,oldGraphicSamples:12,oldShortVideos:8,userAcceptance:'pending',actualModelValidated:false}));
