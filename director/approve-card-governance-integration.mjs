import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

if (!process.argv.includes('--record-reviewed')) throw new Error('Inspect the actual renders before recording local review');
const root=path.resolve(import.meta.dirname,'..');
const batch=process.argv[2];
if (!/^[a-z0-9-]+$/.test(batch || '')) throw new Error('Specify the reviewed snapshot batch');
const evidenceFile=`template/out/${batch}/evidence.json`;
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>{
  const absolute=path.resolve(root,file);
  if (!absolute.startsWith(root+path.sep)) throw new Error('Evidence outside the project');
  return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
};
const report=read(evidenceFile);
if (report.schema!=='card-governance-batch-v2' || report.batch!==batch || hash(report.snapshot.file)!==report.snapshot.sha256)
  throw new Error('Integration report does not match its frozen baseline');
const snapshot=read(report.snapshot.file);
const routingOnly=report.routingOnly===true;
const numericSnapshot=read(snapshot.files['director/numeric-card-production-admission.json'].snapshot);
if (hash(numericSnapshot.report)!==numericSnapshot.reportSha256) throw new Error('Prior numeric report changed');
const priorNumericReport=read(numericSnapshot.report);
const priorNumeric=priorNumericReport.numeric || [...priorNumericReport.legacy.numeric,...priorNumericReport.addedNumeric];
for (const item of Object.values(snapshot.files)) if (hash(item.snapshot)!==item.sha256) throw new Error('Frozen source/evidence changed');
for (const [file,sha] of Object.entries(report.sourceHashes)) if (hash(file)!==sha) throw new Error(`Source changed after render: ${file}`);
if (routingOnly) for (const file of snapshot.sourceFiles) if (file!=='template/src/DynamicVideo.tsx' && hash(file)!==snapshot.files[file].sha256)
  throw new Error(`Unexpected source change in routing batch: ${file}`);
// The unchanged fixture dependency was frozen before the native stage of this batch.
const fixtureSource='demos/_fixtures/Fixtures.tsx';
const nativeReportFile='template/out/card-governance-batch-002-odometer-v2/acceptance.json';
const native=read(nativeReportFile);
const frozenFixture='.isolated/card-governance-batch-002/baseline/demos/_fixtures/Fixtures.tsx';
if (!report.sourceHashes[fixtureSource] && (hash(fixtureSource)!==native.sourceHashes[fixtureSource] || hash(frozenFixture)!==native.sourceHashes[fixtureSource]))
  throw new Error('Fixture dependency changed since the frozen native baseline');
report.sourceHashes[fixtureSource]=hash(fixtureSource);
report.additionalSourceBaseline={source:fixtureSource,snapshot:frozenFixture,sha256:hash(frozenFixture),
  priorReport:nativeReportFile,priorReportSha256:hash(nativeReportFile)};
const verifySample=(item,compare)=>{
  if (hash(item.file)!==item.sha256) throw new Error('Rendered sample changed');
  if (compare && (!item.pixelIdentical || !item.baseline || hash(item.baseline)!==item.baselineSha256)) throw new Error('Missing exact frozen-source comparison');
};
const verifyVideo=(item,frames,compare,sampleCount=compare ? 3 : 4)=>{
  if (!item.fullDecodePassed || hash(item.file)!==item.sha256 || Number(item.stream.nb_frames)!==frames || item.stream.r_frame_rate!=='30/1') throw new Error('Invalid video acceptance');
  const expected=item.aspect==='9:16' ? [1080,1920] : [1920,1080];
  if (item.stream.width!==expected[0] || item.stream.height!==expected[1]) throw new Error('Wrong aspect dimensions');
  if (item.samples.length!==sampleCount || new Set(item.samples.map(sample=>sample.frame)).size!==item.samples.length ||
      item.samples.some(sample=>!Number.isInteger(sample.frame) || sample.frame<0 || sample.frame>=frames)) throw new Error('Incomplete sample coverage');
  item.samples.forEach(sample=>verifySample(sample,compare));
};
if (report.legacy.long.length!==12 || report.legacy.short.length!==8 || report.legacy.numeric.length!==priorNumeric.length || report.addedNumeric.length!==(routingOnly ? 0 : 8))
  throw new Error('Incomplete real-render coverage');
report.legacy.long.forEach(item=>{
  if(item.resolvedCard!==item.card) throw new Error('Missing exact long graphic composition binding; legacy reused-props evidence cannot be admitted');
  verifySample(item,true);
});
report.legacy.short.forEach(item=>verifyVideo(item,60,true));
const caseKey=item=>`${item.card}/${JSON.stringify(item.params)}/${item.aspect}`;
const priorCases=new Map(priorNumeric.map(item=>[caseKey(item),item]));
for (const item of report.legacy.numeric) {
  const prior=priorCases.get(caseKey(item));
  if (!prior) throw new Error('Unexpected or duplicate prior numeric case');
  verifyVideo(item,Number(prior.stream.nb_frames),true,prior.samples.length);priorCases.delete(caseKey(item));
}
if (priorCases.size) throw new Error('Missing prior numeric case');
report.addedNumeric.forEach(item=>verifyVideo(item,144,false));
const expectedCases=new Set(routingOnly ? [] : ['0/16:9','0/9:16','12.34/16:9','12.34/9:16','1200/16:9','1200/9:16','999999/16:9','999999/9:16']);
for (const item of report.addedNumeric) {
  if (item.card!=='data/odometer-digit-roll' || !expectedCases.delete(`${item.params.value}/${item.aspect}`)) throw new Error('Unexpected or duplicate new metric case');
}
if (expectedCases.size) throw new Error('Missing metric/aspect case');
if (routingOnly) {
  if (report.routingChecks?.length!==2 || !report.routingChecks.every(check=>check.mode==='A' && check.rejected)) throw new Error('Missing real runtime rejection checks');
  verifySample(report.legacyDirectoryChoice,true);
}
const files=['director/card-production-admission.json','director/short-card-production-admission.json','director/numeric-card-production-admission.json'];
for (const file of files) if (hash(file)!==snapshot.files[file].sha256) throw new Error(`Admission changed concurrently: ${file}`);
report.localVisualReview='passed';
report.reviewer='Codex actual DynamicVideo sample review and same-environment frozen-source pixel comparison';
fs.writeFileSync(path.resolve(root,evidenceFile),JSON.stringify(report,null,2)+'\n');
const compatibility={report:evidenceFile,sha256:hash(evidenceFile),review:'passed',oldGraphicSamples:12,shortVideos:8,
  oldNumericVideos:report.legacy.numeric.length,newNumericVideos:report.addedNumeric.length,snapshot:report.snapshot,reviewer:report.reviewer};
const runtimeDependencies=routingOnly ? ['director/card-runtime-choice.mjs','director/card-runtime-choice.d.mts'] : [];
for (const file of files.slice(0,2)) {
  const previous=read(snapshot.files[file].snapshot);
  const sourceHashes=Object.fromEntries([...new Set([...Object.keys(previous.sourceHashes),...runtimeDependencies])].map(source=>[source,report.sourceHashes[source]]));
  if (Object.values(sourceHashes).some(value=>!value)) throw new Error('Missing legacy source hash');
  fs.writeFileSync(path.resolve(root,file),JSON.stringify({...previous,sourceHashes,compatibility},null,2)+'\n');
}
const numericFile=files[2];
const previous=read(snapshot.files[numericFile].snapshot);
const sources=[...new Set([...Object.keys(previous.sourceHashes),'demos/data/odometer-digit-roll/OdometerDigitRoll.tsx',
  'demos/data/odometer-digit-roll/odometer-contract.mjs','demos/data/odometer-digit-roll/odometer-contract.d.mts',fixtureSource,
  'director/admission-source-policy.mjs',...runtimeDependencies])];
const sourceHashes=Object.fromEntries(sources.map(file=>[file,report.sourceHashes[file]]));
if (Object.values(sourceHashes).some(value=>!value)) throw new Error('Missing numeric source binding');
const cards=[...new Set([...previous.cards,...report.addedNumeric.map(item=>item.card)])];
fs.writeFileSync(path.resolve(root,numericFile),JSON.stringify({...previous,cards,sourceHashes,localReview:'passed',
  actualModelValidated:false,userAcceptance:previous.userAcceptance,shortVersion:'not-accepted',
  scope:'native counter 138f and odometer 144f at 30fps, real DynamicVideo composition and frozen-source compatibility; no paid model call',
  evidence:[...report.legacy.numeric,...report.addedNumeric].map(item=>({file:item.file,sha256:item.sha256})),
  priorEvidence:previous.evidence,report:evidenceFile,reportSha256:hash(evidenceFile),compatibility,
  addedCardAcceptance:routingOnly ? previous.addedCardAcceptance : {'data/odometer-digit-roll':{localReview:'passed',actualModelValidated:false,userAcceptance:'pending',minFrames:144,fps:30}}},null,2)+'\n');
console.log(JSON.stringify({cards,compatibility,productionServerReloaded:false,paidModelValidated:false}));
