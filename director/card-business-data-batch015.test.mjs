import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {buildSourceAudit} from './card-source-audit.mjs';
import {resolveRuntimeCardId} from './card-runtime-choice.mjs';
import {themeAdapter} from './theme-contract.mjs';
import {GRAPHIC_CONTRACTS,validateGraphicParams} from './graphic-contracts.mjs';
import {HISTORICAL_EVIDENCE_TOOLS} from './admission-source-policy.mjs';

const root=path.resolve(import.meta.dirname,'..');
const evidenceRoot=path.join(root,'.isolated/card-governance-batch-015-worktree');
const evidenceFolder='template/out/card-business-data-batch015-v3';
const readAt=(base,file)=>JSON.parse(fs.readFileSync(path.resolve(base,file),'utf8'));
const read=file=>readAt(root,file);
const hashAt=(base,file)=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(base,file))).digest('hex');
const fixtureFile='template/fixtures/card-business-data-batch015-v3.json';
const fixture=readAt(evidenceRoot,fixtureFile);
const snapshot=readAt(evidenceRoot,fixture.metricsSource.file);
const progress=readAt(evidenceRoot,snapshot.sources.currentProgress.file);
const previous=readAt(evidenceRoot,snapshot.sources.previousProgressSnapshot.file);
const acceptance=readAt(evidenceRoot,`${evidenceFolder}/acceptance.json`);
const compatibilityFile='template/out/card-business-data-batch015-compatibility-20261003-r6/compatibility.json';
const compatibility=read(compatibilityFile);
const compatibilitySha256='27b12265a8064ad141257b89ae1d2d4f6eca94f9888224e2db8c435f34715847';
const templateRequire=createRequire(path.join(root,'template/package.json'));
const ts=templateRequire('typescript');
const adapterFile=path.join(root,'template/src/TemplateAdapter.tsx');
const adapterJs=ts.transpileModule(fs.readFileSync(adapterFile,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const adapterExports={};
new Function('require','exports',adapterJs)(createRequire(adapterFile),adapterExports);
const audit=buildSourceAudit(root);

function atPath(value,expression){
  return expression.split('.').reduce((current,key)=>current?.[key],value);
}

function resolveSource(expression){
  const [source,...parts]=expression.split('.');
  return atPath({snapshot,progress,previous}[source],parts.join('.'));
}

function evidenceFile(relative){
  const file=path.resolve(evidenceRoot,relative);
  assert.ok(file===evidenceRoot || file.startsWith(`${evidenceRoot}${path.sep}`),`evidence path escapes isolated worktree: ${relative}`);
  return file;
}

function assertEvidence(relative,expected){
  const file=evidenceFile(relative);
  assert.ok(fs.existsSync(file),`missing evidence: ${relative}`);
  assert.equal(hashAt(evidenceRoot,relative),expected,`evidence hash mismatch: ${relative}`);
}

function assertCompatibilityProof(relative,expected){
  const reportFile=path.resolve(root,compatibilityFile);
  assert.ok(fs.existsSync(reportFile),`missing compatibility proof: ${compatibilityFile}`);
  assert.equal(hashAt(root,compatibilityFile),compatibilitySha256,'compatibility proof changed');
  assert.equal(compatibility.status,'passed');
  assert.equal(compatibility.previousReport,`${evidenceFolder}/acceptance.json`);
  assert.deepEqual(compatibility.summary,{
    cases:16,
    propsExact:16,
    compositionExact:16,
    decodedVideos:16,
    pixelComparisons:32,
    pixelIdentical:32,
  });
  assert.equal(compatibility.sourceHashes?.[relative],hashAt(root,relative));
}

test('batch 15 values are tied to the current frozen governance sources',()=>{
  assert.equal(hashAt(evidenceRoot,fixture.metricsSource.file),fixture.metricsSource.sha256);
  assert.equal(fixture.schema,'business-card-data-batch-v1');
  assert.equal(fixture.batch,15);
  assert.equal(fixture.asOf,snapshot.asOf);
  assert.deepEqual(snapshot.counts,progress.counts);
  assert.equal(fixture.cards.length,8);
  for(const source of Object.values(snapshot.sources))
    assert.equal(hashAt(evidenceRoot,source.file),source.sha256,source.file+' changed after snapshot');
  assert.equal(Object.values(snapshot.admittedByKind).reduce((sum,value)=>sum+value,0),snapshot.counts.currentLocallyAdmitted);
  for(const item of fixture.cards){
    assert.equal(item.kind,'graphic');
    assert.equal(item.backgroundPolicy.role,'none');
    assert.ok(item.backgroundPolicy.reason.startsWith('特殊强调免背景：'));
    assert.ok(GRAPHIC_CONTRACTS[item.id],item.id+' lacks a graphic contract');
    for(const [field,binding] of Object.entries(item.sourceBindings))
      assert.equal(atPath(item,field),resolveSource(binding),item.id+' binding mismatch at '+field);
    for(const row of item.templateParams.rows)
      assert.ok(item.narration.includes(row.evidence),item.id+' evidence is absent from narration');
    validateGraphicParams(item.id,item.templateParams,item.narration);
  }
});

test('batch 15 resolves exact runtime IDs and consumes real props through the adapter',()=>{
  assert.equal(typeof adapterExports.translateShot,'function');
  const runtimeIds=audit.registrations.map(registration=>registration.id);
  const theme=themeAdapter({...read('director/current-theme.json'),aspectRatio:'16:9'},'A');
  const skin={bg:theme.style.bg,text:theme.style.text,muted:theme.style.sub,accent:theme.style.accent,
    surface:theme.theme.surface||theme.style.bg,
    fontFamily:theme.style.fontFamily||"'Noto Sans SC','Microsoft YaHei',sans-serif",
    transparentBackground:false};
  for(const item of fixture.cards){
    const registration=audit.registrations.find(candidate=>candidate.id===item.id);
    assert.ok(registration?.skinDeclared,item.id+' is not a skin-aware registration');
    assert.equal(registration.adapter?.shotCard,item.id);
    assert.equal(resolveRuntimeCardId(item.id,runtimeIds),item.id);
    const props=adapterExports.translateShot(item.id,{
      text:item.narration,lines:item.lines,templateParams:item.templateParams,narration:item.narration,
      durationInFrames:fixture.durationInFrames,skin,
    });
    assert.ok(props,item.id+' was not translated');
    assert.deepEqual(props.skin,skin);
    assert.equal(props.durationInFrames,fixture.durationInFrames);
    assert.equal(props.title,item.lines.join('\n'));
    for(const [key,value] of Object.entries(item.templateParams))
      assert.deepEqual(props[key],value,item.id+' did not consume '+key);
  }
});

test('batch 15 report binds all real props, frames, and decoded videos',()=>{
  assert.equal(acceptance.schema,'business-data-card-batch-acceptance-v1');
  assert.equal(acceptance.fixtureFile,fixtureFile);
  assert.equal(acceptance.fps,fixture.fps);
  assert.equal(acceptance.durationInFrames,fixture.durationInFrames);
  assert.equal(acceptance.sourceConsistency,true);
  assert.equal(acceptance.localVisualReview,'passed-encoded-mp4-frames');
  assert.equal(acceptance.productionAdmission,'not-recorded');
  assert.equal(acceptance.cases.length,fixture.cards.length*fixture.aspects.length);

  const expectedCards=new Set(fixture.cards.map(item=>item.id));
  const seen=new Set();
  for(const item of acceptance.cases){
    assert.ok(expectedCards.has(item.card),`unexpected card in report: ${item.card}`);
    assert.ok(fixture.aspects.includes(item.aspect),`unexpected aspect in report: ${item.aspect}`);
    const key=`${item.card}|${item.aspect}`;
    assert.equal(seen.has(key),false,`duplicate case: ${key}`);
    seen.add(key);
    assert.equal(item.resolvedCard,item.componentId);
    assert.equal(item.componentPropsFile.endsWith('-component-props.json'),true);
    assert.equal(item.propsFile.endsWith('-props.json'),true);
    assertEvidence(item.componentPropsFile,item.componentPropsSha256);
    assertEvidence(item.propsFile,item.propsSha256);
    assertEvidence(item.nativeDefault.file,item.nativeDefault.sha256);
    for(const sample of item.samples) assertEvidence(sample.file,sample.sha256);
    for(const sample of item.decodedVideoReview) assertEvidence(sample.file,sample.sha256);
    assert.equal(item.video.fullDecodePassed,true,`${key} did not fully decode`);
    assert.equal(item.video.stream.r_frame_rate,'30/1');
    assert.equal(Number(item.video.stream.nb_frames),fixture.durationInFrames);
    assertEvidence(item.video.file,item.video.sha256);
    const stream=item.video.stream;
    assert.deepEqual(item.aspect==='16:9'
      ? {width:stream.width,height:stream.height}
      : {width:stream.width,height:stream.height},
      item.aspect==='16:9' ? {width:1920,height:1080} : {width:1080,height:1920});
  }
  assert.equal(seen.size,acceptance.cases.length);
  assert.equal(acceptance.visualReviewEvidence.length,fixture.cards.length);
  for(const review of acceptance.visualReviewEvidence) assertEvidence(review.file,review.sha256);

  // The report is a historical snapshot. Mutable governance counters and the
  // admission record are intentionally checked against that isolated snapshot;
  // component/runtime sources must still match the current main worktree.
  const mutableSnapshots=new Set([
    'director/card-production-admission.json',
    'director/numeric-card-production-admission.json',
    'director/text-card-production-admission.json',
    'director/card-source-audit.mjs',
    'template/out/card-governance-progress/progress.json',
  ]);
  for(const [relative,expected] of Object.entries(acceptance.sourceHashes)){
    assertEvidence(relative,expected);
    const current=path.resolve(root,relative);
    const historicalTool=HISTORICAL_EVIDENCE_TOOLS.has(relative.replaceAll('\\\\','/'));
    if(!mutableSnapshots.has(relative) && !historicalTool && fs.existsSync(current)){
      if(compatibility.sourceHashes?.[relative]===hashAt(root,relative))
        assertCompatibilityProof(relative,expected);
      else
        assert.equal(hashAt(root,relative),expected,`current source changed: ${relative}`);
    }
  }
});
