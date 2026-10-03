import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sourceHash} from '../director/text-card-source-binding.mjs';
const root=path.resolve(import.meta.dirname,'..'),batch=process.argv[2];
assert.match(batch||'',/^card-business-text-batch\d+(?:-v\d+)?$/);
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const hash=file=>sourceHash(fs.readFileSync(path.join(root,file)));
const report=read(`template/out/${batch}/acceptance.json`),fixture=read(`template/fixtures/${batch}.json`);
if(fixture.baselineFixture) fixture.cards=[...read(fixture.baselineFixture).cards,...fixture.cards];
const output=`template/out/${batch}/encoded-audio-timing.json`;
assert.ok(!fs.existsSync(path.join(root,output)),'Preserve prior timing evidence');
const pcm=file=>{
  const raw=execFileSync('ffmpeg',['-v','error','-i',path.join(root,file),'-vn','-f','f32le','-ar','48000','-ac','1','pipe:1'],
    {windowsHide:true,maxBuffer:16*1024*1024});
  const samples=new Float32Array(raw.length/4);for(let i=0;i<samples.length;i++) samples[i]=raw.readFloatLE(i*4);return samples;
};
const checks=[];
for(const item of report.cases.filter(item=>item.audio)){
  const input=fixture.cards.find(card=>card.id===item.card);
  const source=input.wordSource ? read(input.wordSource) : null;
  const explicit=process.argv.find(arg=>arg.startsWith('--frames='))?.slice(9).split(',').map(Number);
  const boundaries=source?.groups || explicit?.map(frame=>({start:frame}));
  assert.ok(boundaries?.length,'Provide the source word manifest or explicit sound event frames');
  assert.equal(hash(item.audio.file),item.audio.sha256);assert.equal(hash(item.video.file),item.video.sha256);
  const x=pcm(item.audio.file),y=pcm(item.video.file),beats=[];
  for(const boundary of boundaries){
    const frame=boundary.start;assert.ok(Number.isInteger(frame)&&frame>=0&&frame<report.durationInFrames);
    const begin=Math.round(frame/30*48000),length=Math.min(8192,x.length-begin);
    let xx=0;for(let i=0;i<length;i+=4) xx+=x[begin+i]**2;
    assert.ok(xx>1e-7,'No measurable source audio around this boundary');
    const compare=(lag,stride)=>{
      let xy=0,yy=0,energy=0;
      for(let i=0;i<length;i+=stride){const pos=begin+i+lag;if(pos<0||pos>=y.length)continue;
        xy+=x[begin+i]*y[pos];yy+=y[pos]**2;energy+=x[begin+i]**2;}
      return {score:xy/Math.sqrt(energy*yy),gain:xy/energy};
    };
    let lag=0,best=-Infinity;
    for(let offset=-3200;offset<=3200;offset+=4){const score=compare(offset,4).score;if(score>best){best=score;lag=offset;}}
    let refined=lag,result=compare(lag,1);
    for(let offset=lag-4;offset<=lag+4;offset++){const value=compare(offset,1);if(value.score>result.score){refined=offset;result=value;}}
    assert.ok(result.score>=0.94 && Math.abs(refined)<=160,'Encoded audio timing changed');
    assert.ok(Math.abs(result.gain-input.audio.volume)<0.03,'Actual encoded volume differs from resolved input');
    beats.push({word:boundary.text||null,frame,offsetSamples:refined,correlation:result.score,gain:result.gain});
  }
  checks.push({card:item.card,aspect:item.aspect,video:item.video.file,videoSha256:item.video.sha256,
    source:item.audio.file,sourceSha256:item.audio.sha256,volume:input.audio.volume,beats});
}
assert.ok(checks.length>0);
fs.writeFileSync(path.join(root,output),JSON.stringify({status:'encoded-waveform-timing-passed-not-listening-acceptance',
  method:'48kHz mono waveform correlation within 8192-sample windows around actual source event boundaries',
  scope:'Encoding offset and gain only; ASR word-boundary accuracy and listening remain separate',
  sampleRate:48000,tool:'template/measure-business-audio-timing.mjs',toolSha256:hash('template/measure-business-audio-timing.mjs'),checks},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,boundaries:checks.reduce((n,item)=>n+item.beats.length,0),
  offsets:checks.flatMap(item=>item.beats.map(beat=>beat.offsetSamples)),listeningAcceptance:'pending'}));
