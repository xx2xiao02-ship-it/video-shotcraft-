import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ffmpegPath} from '../director/packaging-media.mjs';
import {buildSourceAudit} from '../director/card-source-audit.mjs';
import {registryBinding} from '../director/text-card-source-binding.mjs';

const root=path.resolve(import.meta.dirname,'..');
const batch=process.argv[2];
if(!/^card-business-text-batch\d+(?:-v\d+)?$/.test(batch || '')) throw new Error('Isolated batch required');
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const currentFile=`template/out/${batch}/acceptance.json`;
const current=read(currentFile),baseline=read(current.baselineFixture);
const previousFile=baseline.compatibility?.previousReport || 'template/out/card-business-text-batch004/acceptance.json',previous=read(previousFile);
if(baseline.compatibility?.previousReportSha256)
  assert.equal(hash(previousFile),baseline.compatibility.previousReportSha256,'Previous evidence report changed');
assert.equal(current.sourceConsistency,true);assert.equal(previous.sourceConsistency,true);
for(const [source,sha] of Object.entries(current.sourceHashes)) assert.equal(hash(source),sha,'Current source changed');
// These modules author and validate props; DynamicVideo does not import them.
const planOnly=new Set(['director/a-mode-run.mjs','director/text-card-contracts.mjs','template/accept-business-text-batch004.mjs',
  'template/reuse-business-text-baseline.mjs','template/render-business-text-videos.mjs']);
const scopedSources=baseline.compatibility?.scopedRegistrySources;
if(previous.localVisualReview!=='passed'){
  assert.equal(baseline.compatibility?.reuseUnadmittedEvidence,true,'Unreviewed evidence requires explicit isolated reuse');
  assert.equal(previous.productionAdmission,'not-recorded');
  assert.ok(scopedSources,'Unreviewed reuse requires original registry source evidence');
}
if(scopedSources){
  assert.deepEqual(Object.keys(scopedSources).sort(),['director/text-card-contracts.mjs','template/src/TemplateAdapter.tsx']);
  for(const [source,snapshot] of Object.entries(scopedSources)){
    assert.equal(hash(snapshot.file),previous.sourceHashes[source],'Original registry snapshot does not match report');
    const originalText=fs.readFileSync(path.resolve(root,snapshot.file),'utf8');
    const currentText=fs.readFileSync(path.resolve(root,source),'utf8');
    for(const card of baseline.cards)
      assert.deepEqual(registryBinding(source,currentText,card.id),registryBinding(source,originalText,card.id),
        'Actual card entry or shared registry logic changed: '+card.id);
    current.sourceHashes[snapshot.file]=hash(snapshot.file);
    planOnly.add(source);
  }
}
let adapterCompatibility;
if(baseline.compatibility){
  assert.equal(baseline.compatibility.adapterSha256,previous.sourceHashes['template/src/TemplateAdapter.tsx']);
  const registrations=buildSourceAudit(root).registrations;
  for(const binding of baseline.compatibility.adapters)
    assert.deepEqual(registrations.find(item=>item.id===binding.id)?.adapter,binding.adapter,'Baseline adapter contract changed: '+binding.id);
  adapterCompatibility={priorAdapterSha256:baseline.compatibility.adapterSha256,
    currentAdapterSha256:hash('template/src/TemplateAdapter.tsx'),baselineContractsUnchanged:true};
  planOnly.add('template/src/TemplateAdapter.tsx');
}
for(const [source,sha] of Object.entries(previous.sourceHashes))
  if(!planOnly.has(source)) assert.equal(hash(source),sha,'Renderer dependency changed: '+source);
const ids=new Set(baseline.cards.map(card=>card.id));
let reused=0;
for(const item of current.cases.filter(item=>ids.has(item.card))){
  if(item.video) continue;
  const old=previous.cases.find(test=>test.card===item.card&&test.aspect===item.aspect);
  assert.equal(item.error,undefined);assert.equal(item.directorConsumption,'passed-authored-plan');
  assert.equal(old.error,undefined);assert.equal(old.directorConsumption,'passed-authored-plan');
  assert.equal(item.resolvedCard,item.card);assert.equal(item.propsSha256,old.propsSha256);
  assert.equal(hash(item.propsFile),old.propsSha256);assert.equal(hash(old.propsFile),old.propsSha256);
  assert.equal(item.nativeDefault.sha256,old.nativeDefault.sha256);
  assert.equal(item.samples.length,old.samples.length);
  for(const sample of item.samples){
    const original=old.samples.find(test=>test.frame===sample.frame);
    assert.equal(sample.sha256,original.sha256,'Fresh business frame differs');
    assert.equal(hash(sample.file),sample.sha256);assert.equal(hash(original.file),original.sha256);
  }
  assert.equal(old.video.fullDecodePassed,true);assert.equal(hash(old.video.file),old.video.sha256);
  if(item.audio){
    assert.deepEqual(item.audio,old.audio,'Resolved audio changed');
    assert.equal(hash(item.audio.file),item.audio.sha256);
  }
  execFileSync(ffmpegPath(),['-v','error','-i',path.resolve(root,old.video.file),'-f','null','-'],{windowsHide:true});
  const target=`template/out/${batch}/${path.basename(old.video.file)}`;
  assert.equal(fs.existsSync(path.resolve(root,target)),false,'Preserve existing evidence');
  fs.copyFileSync(path.resolve(root,old.video.file),path.resolve(root,target));
  assert.equal(hash(target),old.video.sha256);
  item.video={...old.video,file:target,compatibilityReuse:{report:previousFile,reportSha256:hash(previousFile),
    authoredPlanRevalidated:true,exactPropsPreserved:true,rendererDependenciesUnchanged:!adapterCompatibility,
    priorLocalVisualReview:previous.localVisualReview,scopedRegistrySourcesVerified:!!scopedSources,
    ...(adapterCompatibility ? {adapterCompatibility,affectedRendererBehaviorRevalidated:true} : {}),
    freshBusinessSamplesByteIdentical:true,nativeDefaultByteIdentical:true,fullDecodeRevalidated:true}};
  reused++;
}
assert.equal(current.cases.filter(item=>ids.has(item.card)).length,ids.size*2);
current.sourceHashes['template/reuse-business-text-baseline.mjs']=hash('template/reuse-business-text-baseline.mjs');
current.sourceHashes[previousFile]=hash(previousFile);
current.compatibilityScope='Plan/catalog changes revalidated for all baseline cards; exact render inputs and all fresh samples byte-identical; prior real videos decoded again. Adapter extensions, when present, require unchanged prior contracts plus actual fresh baseline rendering.';
fs.writeFileSync(path.resolve(root,currentFile),JSON.stringify(current,null,2)+'\n');
console.log(JSON.stringify({reusedVideos:reused,newVideoRenderRequired:current.cases.filter(item=>!item.error&&!item.video).length}));
