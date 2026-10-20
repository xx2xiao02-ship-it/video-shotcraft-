import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sfxSoloCurrent} from './talkcraft-sfx-solo.mjs';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same=(a,b)=>JSON.stringify(a,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)===
 JSON.stringify(b,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
// Measure the actual verified stem: overlapping cues and real renderer gain
// make isolated source-file levels insufficient evidence for an output repair.
export function measuredCueVolume(cue,pcm){
 const a=Math.max(0,Math.floor((cue.t-.05)*16000)),b=Math.min(pcm.length/2,Math.floor((cue.t+Math.max(.45,Math.min(cue.clip??.45,1)))*16000));
 const win=Math.min(800,b-a);if(win<=0)throw Error('音效窗口没有可测量采样');let peak=0;
 for(let start=a;start+win<=b;start+=Math.max(1,Math.floor(win/2))){let sum=0;for(let i=start;i<start+win;i++){const x=pcm.readInt16LE(i*2)/32768;sum+=x*x;}peak=Math.max(peak,Math.sqrt(sum/win));}
 if(peak>=10**(-45/20))return cue.volume;
 const volume=Math.ceil(cue.volume*10**(-42/20)/Math.max(peak,1e-12)*10000)/10000;
 if(volume>1)throw Error('原卡音效无法在安全增益范围内满足原检测阈值');return volume;
}
export function nativeCueRuntime(cues){
 return cues.map(({t,file,volume,rate,clip,procedural})=>({t,file,
  volume:procedural?.name==='riser'?Math.max(volume,.25):volume,...(rate?{rate}:{}),clip}));
}
export const nativeCueSource=runtime=>'export type SfxCue = {t:number; file:string; volume:number; rate?:number; clip?:number};\n'+
 'export const CUES: SfxCue[] = '+JSON.stringify(runtime,null,2)+';\nexport const SFX_CUES=CUES;\nexport const cues=CUES;\n';
// Derive only a technical level correction from this task's sealed cue plan.
// No additions, missing cues, retiming, replacements or authored content repair.
export function planNativeCueLevelRepair(project){
 const plan=JSON.parse(fs.readFileSync(path.join(project,'qa/native-production-plan.json'),'utf8'));
 if(plan.schema!=='talkcraft-native-production-v1')throw Error('音效电平恢复缺少当前制作计划');
 for(const [name,hash] of Object.entries(plan.inputs))if(sha(path.join(project,name))!==hash)throw Error('音效电平恢复计划已过期：'+name);
 const original=plan.cues.map(({t,file,volume,rate,clip})=>({t,file,volume,...(rate?{rate}:{}),clip}));
 const legacy=nativeCueRuntime(plan.cues);
 let runtime=legacy;
 const current=JSON.parse(fs.readFileSync(path.join(project,'remotion/cues.json'),'utf8'));
 const source=fs.readFileSync(path.join(project,'remotion/src/sfx.ts'),'utf8').replaceAll('\r\n','\n');
 if(source!==nativeCueSource(current))throw Error('音效源与清单不一致，不能自动修补');
 const priorFile=path.join(project,'qa/audio-level-repair.json');
 const prior=fs.existsSync(priorFile)?JSON.parse(fs.readFileSync(priorFile)):null;
 const priorMatches=prior?.runtimeSha256===createHash('sha256').update(JSON.stringify(current)).digest('hex');
 if(!same(current,original)&&!same(current,legacy)&&!priorMatches)throw Error('音效清单不匹配当前原卡计划，不能自动改写');
 let measurement;
 if(sfxSoloCurrent(project)){
   const stem=path.join(project,'remotion/out/sfx-solo.wav');
   const pcm=execFileSync('ffmpeg',['-v','error','-i',stem,'-vn','-ac','1','-ar','16000','-f','s16le','-'],{maxBuffer:64*1024*1024});
   runtime=current.map(cue=>({...cue,volume:measuredCueVolume(cue,pcm)}));
   measurement={stemSha256:sha(stem),cueSha256:sha(path.join(project,'remotion/cues.json')),thresholdDbfs:-45,targetDbfs:-42};
 }else if(priorMatches)runtime=current;
 if(same(current,runtime))return {changed:false};
 const changes=runtime.flatMap((cue,i)=>cue.volume===current[i].volume?[]:[{index:i,file:cue.file,t:cue.t,before:current[i].volume,after:cue.volume}]);
 return {changed:changes.length>0,runtime,source:nativeCueSource(runtime),changes,measurement,runtimeSha256:createHash('sha256').update(JSON.stringify(runtime)).digest('hex')};
}
