import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readWordAlignment} from './talkcraft-word-alignment.mjs';
import {wordTimingFile} from './talkcraft-native-timing.mjs';
import {proceduralCue,installProceduralCue} from './talkcraft-procedural-sfx.mjs';
import {outputFrameForNativeFrame} from './talkcraft-native-time-map.mjs';

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
  const beats=[],cues=[];
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
      const localFrame=row?outputFrameForNativeFrame(row.timeline,Math.round(cue.t*30)):Math.round(cue.t*30);
      const t=shot.start+localFrame/30,frame=Math.round(t*30);
      if(t>=shot.end-.5 || usedFrames.has(frame)) continue;
      const sample=samples.SFX_SAMPLES?.[cue.name];
      const synthesis=sample?null:proceduralCue(cue,skillRoot);
      const file=synthesis?.file||cue.name.replace(/^pk:/u,'pk-')+(Array.isArray(sample)?'-1':'')+'.mp3';
      usedFrames.add(frame);
      cues.push({t,file,volume:Math.min(.25,(cue.vol??.4)*.5),
        ...(cue.rate?{rate:cue.rate}:{}),clip:Math.min(cue.clip??.6,.8),shotId:shot.id,
        sourceCard:shot.shotCard,nativeSec:cue.t,...(synthesis?{procedural:synthesis.procedural}:{}),...(row?{timingSource:'native-frame-map',nativeFrame:Math.round(cue.t*30),outputLocalFrame:localFrame}:{})});
    }
  }
  const plan={schema:'talkcraft-native-production-v1',fps:30,unit:'seconds',
    inputs:Object.fromEntries([path.relative(project,wordTimingFile(project)).replaceAll('\\','/'),'remotion/shots.json',...(presentation?['remotion/native-presentation.json']:[])].map(f=>[f,hash(path.join(project,f))])),
    beats,cues,userAcceptance:false};
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
  const runtime=cues.map(({t,file,volume,rate,clip})=>({t,file,volume,...(rate?{rate}:{}),clip}));
  return {runtime};
}

export function installNativeCues(project,skillRoot,shotIds,options) {
  const {runtime}=prepareNativeCueAssets(project,skillRoot,path.join(project,'remotion/public/sfx'),shotIds,options);
  fs.writeFileSync(path.join(project,'remotion/src/sfx.ts'),
    'export type SfxCue = {t:number; file:string; volume:number; rate?:number; clip?:number};\n'+
    'export const CUES: SfxCue[] = '+JSON.stringify(runtime,null,2)+';\nexport const SFX_CUES=CUES;\nexport const cues=CUES;\n');
  return {count:runtime.length,shotIds};
}
