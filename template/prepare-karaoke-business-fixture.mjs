import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sourceHash} from '../director/text-card-source-binding.mjs';
import {deriveKaraokeTimings,KARAOKE_CARD} from '../director/karaoke-timing.mjs';
const root=path.resolve(import.meta.dirname,'..');
const prefix='director/b-mode-runs/006ece4b-3d9b-4f26-b669-6feb54b861d3/talkcraft/audio/';
const sourceAudio=prefix+'full.mp3',sourceTiming=prefix+'timestamps.json',sourceBoundary=prefix+'voice-timing.boundary.jsonl';
const hash=file=>sourceHash(fs.readFileSync(path.join(root,file)));
const timing=JSON.parse(fs.readFileSync(path.join(root,sourceTiming),'utf8'));
const sentence=timing.sentences[0];assert.equal(sentence.ok,true);assert.ok(sentence.match>=0.9);
const boundaries=fs.readFileSync(path.join(root,sourceBoundary),'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(boundaries[0].text,sentence.text);
const end=boundaries[1].offset/10000000;
assert.ok(sentence.end<end && end<6);
const audio='template/public/audio/card-batch012-karaoke-voice-v2.wav';
assert.ok(!fs.existsSync(path.join(root,audio)),'Preserve existing audio');
execFileSync('ffmpeg',['-n','-v','error','-i',path.join(root,sourceAudio),'-af',
  `atrim=start=0:end=${end},asetpts=PTS-STARTPTS,apad=whole_dur=6`,'-t','6','-ar','48000','-ac','2','-c:a','pcm_s16le',path.join(root,audio)],{windowsHide:true});
const pcm=execFileSync('ffmpeg',['-v','error','-i',path.join(root,audio),'-f','f32le','-ar','48000','-ac','1','pipe:1'],{windowsHide:true,maxBuffer:4*1024*1024});
assert.equal(pcm.length/4,288000);
for(let sample=Math.ceil(end*48000)+1;sample<pcm.length/4;sample++) assert.equal(pcm.readFloatLE(sample*4),0,'Tail must be silent');
const lines=['你收藏了','上千条','干货','为什么','能力还是','一点没涨'];
const words=sentence.words;
const groups=deriveKaraokeTimings([{fromFrame:0,words}],lines,180);
const wordSource='template/fixtures/card-business-text-batch012-v11-word-source.json';
assert.ok(!fs.existsSync(path.join(root,wordSource)));
fs.writeFileSync(path.join(root,wordSource),JSON.stringify({schema:'local-asr-karaoke-source-v1',
  text:sentence.text,words,groups,asrAnchorCoverage:sentence.match,audioStartSeconds:0,audioEndSeconds:end,
  frameUnit:'shot-local frames at 30fps',wordUnit:'original audio seconds',
  sourceHashes:Object.fromEntries([sourceAudio,sourceTiming,sourceBoundary,'template/prepare-karaoke-business-fixture.mjs'].map(file=>[file,hash(file)])),
  tailSilencePassed:true,decodedAudioSamples:288000,
  outputAudio:audio,outputAudioSha256:hash(audio),listeningAcceptance:'pending'},null,2)+'\n');
const fixture='template/fixtures/card-business-text-batch012-v11.json';assert.ok(!fs.existsSync(path.join(root,fixture)));
fs.writeFileSync(path.join(root,fixture),JSON.stringify({schema:'card-business-text-fixtures-v1',fps:30,
  durationInFrames:180,aspects:['16:9','9:16'],cards:[{id:KARAOKE_CARD,lines,narration:sentence.text,words,wordSource,
    audio:{src:'audio/card-batch012-karaoke-voice-v2.wav',volume:0.7},inspectFrames:[5,24,48,75,100,124,179]}]},null,2)+'\n');
console.log(JSON.stringify({fixture,wordSource,groups,sourceAudioEndSeconds:end,asrAnchorCoverage:sentence.match}));
