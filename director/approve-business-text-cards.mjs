import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {bindTextCardSources} from './text-card-source-binding.mjs';
import {assertTextCardDuration} from './text-card-contracts.mjs';
import {deriveKaraokeTimings} from './karaoke-timing.mjs';
import {LIST_CARD_IDS,validateListCardParams} from './list-card-contracts.mjs';
import {SCREEN_CARD_IDS} from './screen-card-contracts.mjs';
import {assertScreenCardAssets} from './screen-card-assets.mjs';

if(!process.argv.includes('--record-reviewed')) throw new Error('Inspect real business samples and videos before recording admission');
const root=path.resolve(import.meta.dirname,'..');
const batch=process.argv.find(arg=>arg.startsWith('--batch='))?.slice(8) || 'card-business-text-batch004';
if(!/^card-business-text-batch\d+(?:-v\d+|-media-v\d+)?$/.test(batch)) throw new Error('Invalid isolated batch');
const file=`template/out/${batch}/acceptance.json`;
const output=path.join(root,'director/text-card-production-admission.json');
const prior=fs.existsSync(output) ? JSON.parse(fs.readFileSync(output,'utf8')) : null;
const read=file=>JSON.parse(fs.readFileSync(path.resolve(root,file),'utf8'));
const hash=file=>{
  const absolute=path.resolve(root,file);
  if(!absolute.startsWith(root+path.sep)) throw new Error('Artifact outside project');
  return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
};
const report=read(file),fixture=read(`template/fixtures/${batch}.json`);
if(fixture.baselineFixture) fixture.cards=[...read(fixture.baselineFixture).cards,...fixture.cards];
if(fixture.mediaSource){
  assert.equal(hash(fixture.mediaSource),fixture.mediaSourceSha256,'Frozen screen capture changed');
  assert.equal(report.sourceHashes[fixture.mediaSource],fixture.mediaSourceSha256,'Capture provenance is not report-bound');
  for(const asset of fixture.mediaSources || []) assert.equal(report.sourceHashes[asset],hash(asset),'Screen PNG is not report-bound: '+asset);
}
assert.equal(report.schema,'business-text-card-batch-v1');assert.equal(report.sourceConsistency,true);
assert.equal(report.cases.length,fixture.cards.length*2);
assert.equal(report.durationInFrames,fixture.durationInFrames);
assert.equal(report.fps,fixture.fps);assert.equal(fixture.fps,30);
assert.ok(Number.isInteger(fixture.durationInFrames) && fixture.durationInFrames>60);
const allComponentSources=new Set(report.cases.map(item=>item.source));
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
if(only){
  assert.equal(new Set(only).size,only.length,'Duplicate selected card');
  assert.ok(only.length>0 && only.every(id=>fixture.cards.some(card=>card.id===id)),'Unknown selected card');
  fixture.cards=fixture.cards.filter(card=>only.includes(card.id));
}
const reviewedCases=report.cases.filter(item=>fixture.cards.some(card=>card.id===item.card));
assert.equal(reviewedCases.length,fixture.cards.length*2);
const selectedComponentSources=new Set(reviewedCases.map(item=>item.source));
for(const [source,sha] of Object.entries(report.sourceHashes)){
  if(allComponentSources.has(source) && !selectedComponentSources.has(source)) continue;
  assert.equal(hash(source),sha,'Source changed: '+source);
}
const audioTimingFile=fixture.cards.some(input=>input.audio) ? `template/out/${batch}/encoded-audio-timing.json` : null;
const audioTiming=audioTimingFile ? read(audioTimingFile) : null;
if(audioTiming) assert.equal(audioTiming.status,'encoded-waveform-timing-passed-not-listening-acceptance');
const expected=new Set(fixture.cards.flatMap(card=>fixture.aspects.map(aspect=>card.id+'/'+aspect)));
for(const item of reviewedCases){
  assert.equal(expected.delete(item.card+'/'+item.aspect),true,'Unexpected/duplicate case');
  assert.equal(item.error,undefined);assert.equal(item.directorConsumption,'passed-authored-plan');assert.equal(item.resolvedCard,item.card);
  const input=fixture.cards.find(card=>card.id===item.card);
  assert.deepEqual(item.lines,input.lines);assert.equal(item.samples.length,input.inspectFrames.length);
  assert.deepEqual(item.samples.map(sample=>sample.frame),input.inspectFrames);
  assert.equal(hash(item.propsFile),item.propsSha256);
  const props=read(item.propsFile);
  assert.equal(props.storyboard.mode,'A');assert.equal(props.storyboard.shots[0].shotCard,item.card);
  assert.deepEqual(props.storyboard.shots[0].displayLines,input.lines);
  assertTextCardDuration(item.card,fixture.durationInFrames);
  assert.equal(props.storyboard.shots[0].durationInFrames,fixture.durationInFrames);
  if(SCREEN_CARD_IDS.has(item.card)){
    const params=assertScreenCardAssets(root,item.card,input.templateParams);
    assert.deepEqual(item.templateParams,params);
    assert.deepEqual(props.storyboard.shots[0].templateParams,params);
    assert.equal(item.materialRole,'none');assert.equal(item.material,null);
    assert.equal(props.storyboard.shots[0].material,undefined);
    assert.equal(props.storyboard.shots[0].materialRole,'none');
    assert.equal(report.sourceHashes['director/screen-card-contracts.mjs'],hash('director/screen-card-contracts.mjs'));
    assert.equal(report.sourceHashes['director/screen-card-assets.mjs'],hash('director/screen-card-assets.mjs'));
  }
  if(LIST_CARD_IDS.has(item.card)){
    assert.ok(fixture.dataSource,'List requires frozen data provenance');
    assert.equal(hash(fixture.dataSource),fixture.dataSourceSha256);
    assert.equal(report.sourceHashes[fixture.dataSource],fixture.dataSourceSha256);
    assert.equal(report.sourceHashes['director/list-card-contracts.mjs'],hash('director/list-card-contracts.mjs'));
    assert.equal(report.sourceHashes['demos/data/scroll-brake-moves/BusinessRowContent.tsx'],hash('demos/data/scroll-brake-moves/BusinessRowContent.tsx'));
    const params=validateListCardParams(item.card,input.templateParams);
    assert.deepEqual(item.templateParams,params);
    assert.deepEqual(props.storyboard.shots[0].templateParams,params);
    const records=read(fixture.dataSource).records;
    params.rows.forEach((row,i)=>{
      const original=records.find(record=>record.id===row.id);
      assert.ok(original?.locallyTested);assert.equal(row.title,original.title);assert.equal(row.detail,original.detail);assert.equal(row.tag,String(i+1));
    });
  }
  if(input.words){
    const source=read(input.wordSource);
    assert.equal(source.tailSilencePassed,true);assert.deepEqual(source.words,input.words);
    assert.deepEqual(props.storyboard.shots[0].templateParams?.timedWords,deriveKaraokeTimings([{fromFrame:0,words:input.words}],input.lines,fixture.durationInFrames));
    assert.deepEqual(source.groups,props.storyboard.shots[0].templateParams.timedWords);
  }
  if(input.audio){
    assert.deepEqual(props.storyboard.shots[0].audio,{src:input.audio.src,volume:input.audio.volume});
    assert.equal(item.audio.src,input.audio.src);assert.equal(item.audio.volume,input.audio.volume);
    assert.equal(hash(item.audio.file),item.audio.sha256);
    assert.equal(item.video.audioRemux.source,item.audio.file);
    assert.equal(item.video.audioRemux.sourceSha256,item.audio.sha256);
    assert.equal(item.video.audioRemux.volume,input.audio.volume);
    assert.equal(item.video.audioStream.codec_type,'audio');
    assert.ok(Math.abs(Number(item.video.audioStream.duration)-fixture.durationInFrames/fixture.fps)<0.001);
    const timing=audioTiming.checks.find(check=>check.card===item.card && check.aspect===item.aspect);
    assert.equal(timing?.video,item.video.file);assert.equal(timing.videoSha256,item.video.sha256);
    assert.ok(timing.beats.length>0 && timing.beats.every(beat=>Number.isInteger(beat.frame) && beat.frame>=0 && beat.frame<fixture.durationInFrames &&
      Number.isFinite(beat.offsetSamples) && Math.abs(beat.offsetSamples)<=160),'Encoded beat timing not verified');
  }
  if(!SCREEN_CARD_IDS.has(item.card)){
    assert.equal(props.storyboard.shots[0].materialRole,'backdrop');assert.ok(props.storyboard.shots[0].material);
  }
  for(const sample of item.samples) assert.equal(hash(sample.file),sample.sha256);
  assert.equal(item.nativeDefault.resolvedCard,item.card);assert.equal(hash(item.nativeDefault.file),item.nativeDefault.sha256);
  assert.equal(item.video?.fullDecodePassed,true);assert.equal(hash(item.video.file),item.video.sha256);
  assert.equal(Number(item.video.stream.nb_frames),fixture.durationInFrames);assert.equal(item.video.stream.r_frame_rate,'30/1');
  assert.equal(item.video.stream.width,item.aspect==='9:16'?1080:1920);assert.equal(item.video.stream.height,item.aspect==='9:16'?1920:1080);
  if(batch!=='card-business-text-batch004'){
    assert.equal(item.decodedVideoReview?.length,2,'Final encoded video frames must be inspected');
    for(const sample of item.decodedVideoReview) assert.equal(hash(sample.file),sample.sha256);
  }
}
assert.equal(expected.size,0);
if(audioTimingFile){
  report.sourceHashes[audioTimingFile]=hash(audioTimingFile);
  report.localAudioReview='encoded-waveform-timing-passed';
  report.listeningAcceptance='pending';
}
report.localVisualReview=reviewedCases.length===report.cases.length ? 'passed' : 'partial';
report.reviewedRuntimeIds=fixture.cards.map(card=>card.id);
report.reviewer='Codex: real business screen content, aspect checks and fully decoded real videos';
fs.writeFileSync(path.resolve(root,file),JSON.stringify(report,null,2)+'\n');
const componentSources=allComponentSources;
const cards=fixture.cards.map(input=>{
  const cases=report.cases.filter(item=>item.card===input.id),source=cases[0].source;
  return {id:input.id,source,sourceHashes:Object.fromEntries(Object.entries(report.sourceHashes).filter(([file])=>!componentSources.has(file)||file===source)),
    localReview:'passed',acceptedFrames:[fixture.durationInFrames],fps:fixture.fps,scope:`tested authored business fixture at ${fixture.durationInFrames} frames/${fixture.fps}fps; no short admission or paid-model acceptance`,
    validatedLines:input.lines,report:file,reportSha256:hash(file),evidence:cases.map(item=>({aspect:item.aspect,file:item.video.file,sha256:item.video.sha256})),
    actualModelValidated:false,userAcceptance:'pending',shortVersion:'not-accepted'};
});
for(const card of cards) card.sourceBinding=bindTextCardSources(root,card.id,card.sourceHashes);
const replaced=new Set(cards.map(card=>card.id));
const history=[...(prior?.history || []),...(prior ? [{cards:prior.cards.filter(card=>replaced.has(card.id)),supersededBy:file}] : [])];
fs.writeFileSync(output,JSON.stringify({schema:'native-business-text-admission-v1',cards:[...(prior?.cards || []).filter(card=>!replaced.has(card.id)),...cards],history},null,2)+'\n');
console.log(JSON.stringify({newRuntimeVariants:cards.filter(card=>!prior?.cards?.some(old=>old.id===card.id)).length,
  revalidatedRuntimeVariants:cards.filter(card=>prior?.cards?.some(old=>old.id===card.id)).length,
  ids:cards.map(card=>card.id),paidModelValidated:false,userAcceptance:'pending',productionServerReloaded:false}));
