import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readWordAlignment} from './talkcraft-word-alignment.mjs';
import {wordTimingFile} from './talkcraft-native-timing.mjs';
import {proceduralCue,installProceduralCue} from './talkcraft-procedural-sfx.mjs';
import {nativeCueRuntime,nativeCueSource} from './talkcraft-cue-level-repair.mjs';

function measuredGapVoiceDb(project,gaps){
  try{
    const raw=execFileSync('ffmpeg',['-v','error','-i',path.join(project,'audio/full.mp3'),'-vn','-ac','1','-ar','16000','-f','s16le','-'],{maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore']});
    const sampleCount=Math.floor(raw.byteLength/2);
    const result=new Map();
    for(const gap of gaps){
      const start=Math.max(0,Math.floor(gap.start*16000));
      const end=Math.min(sampleCount,Math.floor((gap.start+.5)*16000));
      let square=0;
      for(let i=start;i<end;i++){const value=raw.readInt16LE(i*2)/32768;square+=value*value;}
      const rms=Math.sqrt(square/Math.max(1,end-start)+1e-14);
      result.set(gap.start.toFixed(6),20*Math.log10(Math.max(rms,1e-7)));
    }
    return result;
  }catch{return new Map();}
}

export function alignBoundaryCuesToSpeechGaps(cues,shots,timing,{minimum=4,voiceDbForGap=null}={}){
  const words=(timing.sentences||[]).flatMap(sentence=>sentence.words||[]).sort((a,b)=>a.start-b.start);
  const gaps=[];
  for(let i=0;i+1<words.length;i++)if(words[i+1].start-words[i].end>=.5)gaps.push({start:words[i].end,end:words[i+1].start});
  const candidates=[];
  for(const shot of shots.slice(1)){
    const gap=gaps.find(item=>Math.abs(item.end-shot.start)<=.06);
    if(!gap)continue;
    const cue=cues.find(item=>item.shotId===shot.id&&item.t>=shot.start&&item.t-shot.start<=.8&&!/riser/iu.test(item.file));
    if(!cue)continue;
    const voiceDb=voiceDbForGap?.(gap);
    candidates.push({gap,cue,duration:gap.end-gap.start,voiceDb:Number.isFinite(voiceDb)?voiceDb:null});
  }
  // Prefer the widest real pauses. Provider word boundaries can retain a
  // small amount of breath/tail audio, so a mathematically valid 500 ms gap
  // is less reliable than a longer pause for an unmasked cue.
  candidates.sort((a,b)=>{
    if(a.voiceDb!==null||b.voiceDb!==null)return (a.voiceDb??Infinity)-(b.voiceDb??Infinity)||b.duration-a.duration;
    return b.duration-a.duration||a.gap.start-b.gap.start;
  });
  let aligned=0;
  for(const {gap,cue} of candidates.slice(0,minimum)){
    const originalT=cue.t;
    // Put the 500 ms audit window fully inside the detected pause and leave
    // 50 ms on both sides. Anchoring at the end of a long pause allowed the
    // next spoken word to enter the measurement window.
    cue.t=gap.start+.05;
    cue.boundaryLead={originalT,gapStart:gap.start,gapEnd:gap.end};
    cue.timingSource='speech-gap-preroll';
    aligned+=1;
  }
  cues.sort((a,b)=>a.t-b.t);
  return aligned;
}
import {outputFrameForNativeFrame} from './talkcraft-native-time-map.mjs';

// Demo SFX tables can include later shots in a showcase. They do not extend
// the finite registered card or justify stretching its native animation.
export function nativeCuePosition(cue,row){
  if(!Number.isFinite(cue.t)||cue.t<0)throw Error('原卡音效时间必须为非负秒数');
  const nativeFrame=Math.round(cue.t*30);
  if(row&&nativeFrame>=row.nativeFrames)return {admitted:false,nativeFrame,
    reason:'演示音效位于已登记原卡有限时长之外，不属于本镜'};
  return {admitted:true,nativeFrame,localFrame:row?outputFrameForNativeFrame(row.timeline,nativeFrame):nativeFrame};
}

const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');

function preparationTiming(project) {
  const aligned=readWordAlignment(project);if(aligned)return aligned;
  const file=path.join(project,'audio/timestamps.json');
  if(!fs.existsSync(file)||read(file).timingSource!=='tts-native')return null;
  // Native provider words have the same timing responsibilities as CPU alignment.
  // Validate the raw provider/hash evidence; never substitute sentence interpolation.
  return read(wordTimingFile(project));
}

export function alignNativeShotBoundaries(project) {
  const timing=preparationTiming(project);if(!timing)return [];
  const file=path.join(project,'remotion/shots.json'),shots=read(file);
  const sem=read(path.join(project,'semantics.json')).sentences;
  const changes=[];
  for(let n=1;n<shots.length;n++) {
    const i=sem.findIndex(s=>s.shot===shots[n].id);
    if(i<0)throw Error('镜头没有语义句映射：'+shots[n].id);
    const first=timing.sentences[i].words.find(w=>/[\p{L}\p{N}]/u.test(w.text));
    if(first.start<shots[n].start-.001) {
      const previousEnd=timing.sentences[i-1]?.words.at(-1)?.end??0;
      if(first.start<previousEnd-.001 || first.start<=shots[n-1].start)throw Error('字级切镜边界发生重叠');
      changes.push({shotId:shots[n].id,before:shots[n].start,after:first.start,unit:'seconds',sentence:i});
      shots[n].start=first.start;shots[n-1].end=first.start;
    }
  }
  if(changes.length) {
    const backup=path.join(project,'qa/shots-before-word-boundaries.json');
    if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
    write(file,shots);write(path.join(project,'qa/word-shot-boundaries.json'),{changes,userAcceptance:false});
    const book=path.join(project,'SHOTBOOK.md');
    fs.writeFileSync(book,fs.readFileSync(book,'utf8').replace(/^## (s\d+) [\d.]+–[\d.]+ 秒/gmu,(all,id)=>{
      const s=shots.find(s=>s.id===id);return s?`## ${id} ${s.start.toFixed(3)}–${s.end.toFixed(3)} 秒`:all;
    }));
  }
  return changes;
}

// A preparation plan is derived from the existing voice and the selected cards.
// It never replaces provider timing, card content, or the user's overrides.
export function prepareNativeProduction(project,skillRoot) {
  const timing=preparationTiming(project);
  if(!timing) throw Error('正式模板制作需要已核验的字级时间轴');
  const shots=read(path.join(project,'remotion/shots.json'));
  const presentationFile=path.join(project,'remotion/native-presentation.json');
  const presentation=fs.existsSync(presentationFile)?read(presentationFile):null;
  const semantics=read(path.join(project,'semantics.json'));
  const window={};
  new Function('window',fs.readFileSync(path.join(skillRoot,'demos/_lib/sfx-map.js'),'utf8'))(window);
  const samples={};
  new Function('window',fs.readFileSync(path.join(skillRoot,'demos/_lib/sfx-samples.js'),'utf8'))(samples);
  const beats=[],cues=[],excludedCues=[];
  for(const [i,s] of timing.sentences.entries()) {
    const w=s.words.find(w=>/[\p{L}\p{N}]/u.test(w.text));
    const shot=shots.find(s=>s.start<=w.start&&w.start<s.end);
    if(!shot || shot.end-w.start<.5) throw Error('句首词锚落在镜尾保护带，请核对分镜：'+i);
    beats.push({t:w.start,anchor:w.text,sentence:i,shotId:shot.id,
      what:semantics.sentences[i]?.sem?.join(' / ')||'口播句起',label:`beat-${String(i+1).padStart(2,'0')}`});
  }
  const usedFrames=new Set();
  for(const shot of shots) {
    const original=window.SFX_MAP?.[shot.shotCard];
    if(!Array.isArray(original) || !original.length) throw Error('主卡没有可核验的原音效表：'+shot.shotCard);
    for(const cue of original) {
      const row=presentation?.shots?.find(s=>s.shotId===shot.id);
      const position=nativeCuePosition(cue,row);
      if(!position.admitted){excludedCues.push({shotId:shot.id,sourceCard:shot.shotCard,
        nativeFrames:row.nativeFrames,cue,...position});continue;}
      const localFrame=position.localFrame;
      const t=shot.start+localFrame/30,frame=Math.round(t*30);
      if(t>=shot.end-.5 || usedFrames.has(frame)) continue;
      const sample=samples.SFX_SAMPLES?.[cue.name];
      const synthesis=sample?null:proceduralCue(cue,skillRoot);
      const file=synthesis?.file||cue.name.replace(/^pk:/u,'pk-')+(Array.isArray(sample)?'-1':'')+'.mp3';
      usedFrames.add(frame);
      const volume=Math.min(.25,Math.max(synthesis?.procedural?.name==='riser'?.18:0,(cue.vol??.4)*.5));
      cues.push({t,file,volume,
        ...(cue.rate?{rate:cue.rate}:{}),clip:Math.min(cue.clip??.6,.8),shotId:shot.id,
        sourceCard:shot.shotCard,nativeSec:cue.t,...(synthesis?{procedural:synthesis.procedural}:{}),...(row?{timingSource:'native-frame-map',nativeFrame:Math.round(cue.t*30),outputLocalFrame:localFrame}:{})});
    }
  }
  const gapVoiceDb=measuredGapVoiceDb(project,(()=>{
    const words=(timing.sentences||[]).flatMap(sentence=>sentence.words||[]).sort((a,b)=>a.start-b.start),items=[];
    for(let i=0;i+1<words.length;i++)if(words[i+1].start-words[i].end>=.5)items.push({start:words[i].end,end:words[i+1].start});
    return items;
  })());
  alignBoundaryCuesToSpeechGaps(cues,shots,timing,{minimum:4,voiceDbForGap:gap=>gapVoiceDb.get(gap.start.toFixed(6))});
  const plan={schema:'talkcraft-native-production-v1',fps:30,unit:'seconds',
    inputs:Object.fromEntries([path.relative(project,wordTimingFile(project)).replaceAll('\\','/'),'remotion/shots.json',...(presentation?['remotion/native-presentation.json']:[])].map(f=>[f,hash(path.join(project,f))])),
    beats,cues,excludedCues,userAcceptance:false};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  write(path.join(project,'qa/native-production-plan.json'),plan);
  write(path.join(project,'remotion/beats.json'),beats);
  let book=fs.readFileSync(path.join(project,'SHOTBOOK.md'),'utf8');
  let id='';
  book=book.split(/\r?\n/u).map(line=>{
    const heading=/^## (s\d+)\b/u.exec(line);if(heading)id=heading[1];
    if(line==='- 节拍、音效：待精确定位与核验') {
      const rows=beats.filter(b=>b.shotId===id),fx=cues.filter(c=>c.shotId===id);
      return '- 节拍、音效：真实词锚 '+rows.map(b=>`${b.anchor}@${b.t.toFixed(3)}s`).join('、')+
        '；原卡音效 '+fx.map(c=>`${c.file}@${c.t.toFixed(3)}s`).join('、')+'；明细见 qa/native-production-plan.json';
    }
    return line;
  }).join('\n');
  fs.writeFileSync(path.join(project,'SHOTBOOK.md'),book);
  return plan;
}

export function prepareNativeCueAssets(project,skillRoot,dest,shotIds=null,{resolveAsset=file=>file}={}) {
  const file=path.join(project,'qa/native-production-plan.json');
  if(!fs.existsSync(file)) throw Error('缺少正式制作准备计划');
  const plan=read(file);
  for(const [name,digest] of Object.entries(plan.inputs))
    if(hash(path.join(project,name))!==digest) throw Error('制作准备计划已过期：'+name);
  const samples={};
  new Function('window',fs.readFileSync(path.join(skillRoot,'demos/_lib/sfx-samples.js'),'utf8'))(samples);
  const cues=plan.cues.filter(c=>!shotIds||shotIds.includes(c.shotId));
  fs.mkdirSync(dest,{recursive:true});
  for(const c of cues) {
    const canonical=path.join(project,'remotion/public/sfx',c.file),prepared=resolveAsset(canonical);
    if(prepared!==canonical){fs.copyFileSync(prepared,path.join(dest,c.file));continue;}
    if(c.procedural){installProceduralCue(c,dest);continue;}
    const key=c.file.replace(/(-1)?\.mp3$/u,'').replace(/^pk-/u,'pk:');
    const sample=samples.SFX_SAMPLES[key];
    fs.writeFileSync(path.join(dest,c.file),Buffer.from(Array.isArray(sample)?sample[0]:sample,'base64'));
  }
  const runtime=nativeCueRuntime(cues);
  return {runtime};
}

export function installNativeCues(project,skillRoot,shotIds,options) {
  const {runtime}=prepareNativeCueAssets(project,skillRoot,path.join(project,'remotion/public/sfx'),shotIds,options);
  fs.writeFileSync(path.join(project,'remotion/src/sfx.ts'),
    nativeCueSource(runtime));
  return {count:runtime.length,shotIds};
}
