import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {buildSourceAudit} from './card-source-audit.mjs';
import {resolveRuntimeCardId} from './card-runtime-choice.mjs';
import {themeAdapter} from './theme-contract.mjs';
import {
  BUSINESS_CARD_CONTRACTS,
  GRAPHIC_CONTRACTS,
  validateBusinessCardParams,
  validateGraphicParams,
} from './graphic-contracts.mjs';

const root=path.resolve(import.meta.dirname,'..');
const fixtureFile='template/fixtures/card-business-data-batch016.json';
const evidenceFolder='template/out/card-business-data-batch016-v3';
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex');
const fixture=read(fixtureFile);
const acceptance=read(`${evidenceFolder}/acceptance.json`);
const source=read(fixture.sourceSnapshot.file);
const audit=buildSourceAudit(root);
const runtimeIds=audit.registrations.map(registration=>registration.id);
const expectedIds=[
  'ui-entrance/bezier-source-converge-merge',
  'typography/word-relay-filmstrip',
  'outro/ui-to-brand-morph/icon-flip-bloom-logo',
  'outro/ui-to-brand-morph/input-morphs-into-logo',
  'interaction/ai-stream-response/stream-response',
  'interaction/type-and-filter',
  'ui-entrance/avatar-bracket-carousel',
  'data/avatar-grid-radial-build-colorize',
];

const templateRequire=createRequire(path.join(root,'template/package.json'));
const typescript=templateRequire('typescript');
const adapterFile=path.join(root,'template/src/TemplateAdapter.tsx');
const adapterJs=typescript.transpileModule(fs.readFileSync(adapterFile,'utf8'),{
  compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2022},
}).outputText;
const adapterExports={};
new Function('require','exports',adapterJs)(createRequire(adapterFile),adapterExports);

function atPath(value,expression){
  return expression.split('.').reduce((current,key)=>current?.[key],value);
}

function collectLocalImages(value,found=[]){
  if(typeof value==='string' && /^textures\/live\//.test(value)) found.push(value);
  else if(Array.isArray(value)) for(const item of value) collectLocalImages(item,found);
  else if(value && typeof value==='object') for(const item of Object.values(value)) collectLocalImages(item,found);
  return found;
}

function skinFor(aspectRatio='16:9'){
  const theme=themeAdapter({...read('director/current-theme.json'),aspectRatio},'A');
  return {
    bg:theme.style.bg,
    text:theme.style.text,
    muted:theme.style.sub,
    accent:theme.style.accent,
    surface:theme.theme.surface||theme.style.bg,
    fontFamily:theme.style.fontFamily||"'Noto Sans SC','Microsoft YaHei',sans-serif",
    transparentBackground:false,
  };
}

test('batch 16 fixture is bound to its frozen source snapshot',()=>{
  assert.equal(fixture.schema,'business-card-data-batch-v1');
  assert.equal(fixture.batch,16);
  assert.equal(fixture.fps,30);
  assert.equal(fixture.durationInFrames,180);
  assert.deepEqual(fixture.aspects,['16:9','9:16']);
  assert.equal(hash(fixture.sourceSnapshot.file),fixture.sourceSnapshot.sha256);
  assert.equal(source.schema,'card-business-data-batch016-source-v1');
  assert.equal(hash(source.auditFile),source.auditSha256);
  assert.deepEqual(source.gridSourceIds,fixture.gridSourceIds);
  assert.deepEqual(fixture.cards.map(item=>item.id),expectedIds);
  assert.equal(fixture.cards.length,expectedIds.length);
  assert.deepEqual(audit.counts.cards,source.counts.cards);
  assert.deepEqual(audit.counts.variants,source.counts.variants);
  assert.deepEqual(audit.counts.runtimeRegistrations,source.counts.runtimeRegistrations);
  assert.deepEqual(audit.counts.resolvedVariants,source.counts.resolvedVariants);
  assert.ok(audit.counts.adapterDeclaredVariants>=source.counts.adapterDeclaredVariants);

  for(const item of fixture.cards){
    const validator=GRAPHIC_CONTRACTS[item.id] ? validateGraphicParams : validateBusinessCardParams;
    validator(item.id,item.templateParams,item.narration);
    assert.ok(item.sourceBindings,`${item.id} has no source bindings`);
    for(const [field,expression] of Object.entries(item.sourceBindings)){
      const [context,...parts]=expression.split('.');
      assert.equal(context,'source',`${item.id} binding must use frozen source context`);
      const expected=atPath(source,parts.join('.'));
      const actual=atPath(item,field);
      if(field==='templateParams.avatars' && expression==='source.records.avatarRoles'){
        assert.deepEqual(actual.map(avatar=>avatar.role),expected,`${item.id} role source binding mismatch`);
      }else if(field==='templateParams.items' && expression==='source.gridSourceIds'){
        assert.equal(actual.length,expected.length,`${item.id} grid source count mismatch`);
        for(const [index,row] of actual.entries()){
          const suffix=String(row.label).replace(/^V\d+\s+/,'');
          assert.ok(expected[index].split('/').at(-1).startsWith(suffix),`${item.id} grid source mismatch at row ${index+1}`);
        }
      }else assert.deepEqual(actual,expected,`${item.id} source binding mismatch at ${field}`);
    }
    for(const relative of collectLocalImages(item.templateParams)){
      const file=path.resolve(root,'template/public',relative);
      assert.ok(file.startsWith(path.resolve(root,'template/public')+path.sep),`${item.id} asset escapes public root`);
      assert.ok(fs.existsSync(file),`${item.id} missing real local asset: ${relative}`);
    }
  }
});
test('batch 16 resolves exact registrations and consumes every business prop',()=>{
  assert.equal(typeof adapterExports.translateShot,'function');
  assert.ok(adapterExports.COMPONENT_CONTRACTS);
  const skin=skinFor();
  for(const item of fixture.cards){
    const registration=audit.registrations.find(candidate=>candidate.id===item.id);
    assert.ok(registration,`missing exact runtime registration: ${item.id}`);
    assert.equal(registration.adapter?.shotCard,item.id);
    assert.notEqual(registration.adapter?.enabled,false);
    assert.equal(registration.skinDeclared,true,`${item.id} is not theme-parameterized`);
    assert.equal(resolveRuntimeCardId(item.id,runtimeIds),item.id);
    assert.ok(fs.existsSync(path.resolve(root,registration.file)),`${item.id} source is missing`);

    const props=adapterExports.translateShot(item.id,{
      text:item.narration,
      lines:item.lines,
      templateParams:item.templateParams,
      narration:item.narration,
      durationInFrames:fixture.durationInFrames,
      skin,
    });
    assert.ok(props,`${item.id} returned no component props`);
    assert.deepEqual(props.skin,skin);
    assert.equal(props.durationInFrames,fixture.durationInFrames);
    const contract=adapterExports.COMPONENT_CONTRACTS[item.id];
    assert.ok(contract,`${item.id} has no adapter contract`);
    assert.ok(contract.paramsMap,`${item.id} has no structured parameter mapping`);
    for(const [sourceKey,targetKey] of Object.entries(contract.paramsMap))
      assert.deepEqual(props[targetKey],item.templateParams[sourceKey],`${item.id} did not consume ${sourceKey}`);
  }
});

test('unknown batch 16 IDs cannot fall back to a default card',()=>{
  assert.equal(adapterExports.translateShot('batch016/unknown-card',{
    text:'未知卡',lines:['未知卡'],templateParams:{},narration:'未知卡',durationInFrames:180,skin:skinFor(),
  }),null);
  assert.throws(()=>resolveRuntimeCardId('batch016/unknown-card',runtimeIds),/没有精确运行注册/);
});

test('batch 16 report binds encoded video evidence and selected component props',()=>{
  assert.equal(acceptance.schema,'business-data-card-batch-acceptance-v1');
  assert.equal(acceptance.fixtureFile,'template/fixtures/card-business-data-batch016-v3.json');
  assert.equal(acceptance.sourceConsistency,true);
  assert.equal(acceptance.localVisualReview,'passed-encoded-mp4-frames');
  assert.equal(acceptance.productionAdmission,'not-recorded');
  assert.equal(acceptance.fps,fixture.fps);
  assert.equal(acceptance.durationInFrames,fixture.durationInFrames);
  assert.equal(acceptance.cases.length,fixture.cards.length*fixture.aspects.length);

  const expectedCards=new Set(fixture.cards.map(item=>item.id));
  const seen=new Set();
  const assertEvidence=(file,expected)=>{
    const absolute=path.resolve(root,file);
    assert.ok(absolute.startsWith(`${root}${path.sep}`),`evidence escapes project root: ${file}`);
    assert.ok(fs.existsSync(absolute),`missing evidence: ${file}`);
    assert.equal(hash(file),expected,`evidence hash mismatch: ${file}`);
  };
  for(const [source,expected] of Object.entries(acceptance.sourceHashes)) assertEvidence(source,expected);

  for(const [index,item] of acceptance.cases.entries()){
    assert.ok(expectedCards.has(item.card),`unexpected card: ${item.card}`);
    assert.ok(fixture.aspects.includes(item.aspect),`unexpected aspect: ${item.aspect}`);
    const key=`${item.card}|${item.aspect}`;
    assert.equal(seen.has(key),false,`duplicate case: ${key}`);
    seen.add(key);
    assert.equal(item.resolvedCard,item.card);
    assert.equal(item.componentId,item.card);
    assert.equal(item.directorConsumption,'passed-authored-plan');
    assert.equal(item.error,undefined);
    assertEvidence(item.propsFile,item.propsSha256);
    assertEvidence(item.componentPropsFile,item.componentPropsSha256);
    assertEvidence(item.nativeDefault.file,item.nativeDefault.sha256);
    assert.equal(item.nativeDefault.resolvedCard,item.card);
    for(const sample of item.samples) assertEvidence(sample.file,sample.sha256);
    assert.equal(item.samples.length,4);

    const encodedFrames=item.decodedVideoReview;
    assert.equal(encodedFrames?.length,2,`${key} is missing encoded-frame review evidence`);
    assert.deepEqual(encodedFrames.map(sample=>sample.frame),[60,179]);
    for(const sample of encodedFrames) assertEvidence(sample.file,sample.sha256);

    assert.equal(item.video.fullDecodePassed,true,`${key} did not fully decode`);
    assert.equal(item.video.stream.r_frame_rate,'30/1');
    assert.equal(Number(item.video.stream.nb_frames),fixture.durationInFrames);
    assert.deepEqual({width:item.video.stream.width,height:item.video.stream.height},
      item.aspect==='16:9'?{width:1920,height:1080}:{width:1080,height:1920});
    assertEvidence(item.video.file,item.video.sha256);

    const props=read(item.propsFile);
    const shot=props.storyboard?.shots?.[0];
    assert.equal(shot?.shotCard,item.card);
    assert.deepEqual(shot?.displayLines,item.lines);
    assert.deepEqual(shot?.templateParams,item.templateParams);
    assert.equal(shot?.durationInFrames,fixture.durationInFrames);
    const componentProps=read(item.componentPropsFile);
    assert.equal(componentProps.componentId,item.componentId);
    assert.equal(componentProps.componentFile,item.componentFile);
    assert.equal(componentProps.componentSha256,hash(item.componentFile));
    assert.equal(componentProps.adapterProps.durationInFrames,fixture.durationInFrames);
  }
  assert.equal(seen.size,acceptance.cases.length);
});

