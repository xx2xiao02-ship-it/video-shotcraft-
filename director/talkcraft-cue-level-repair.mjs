import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same=(a,b)=>JSON.stringify(a,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)===
 JSON.stringify(b,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
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
 const runtime=nativeCueRuntime(plan.cues);
 const current=JSON.parse(fs.readFileSync(path.join(project,'remotion/cues.json'),'utf8'));
 const source=fs.readFileSync(path.join(project,'remotion/src/sfx.ts'),'utf8').replaceAll('\r\n','\n');
 if(source!==nativeCueSource(current))throw Error('音效源与清单不一致，不能自动修补');
 if(same(current,runtime))return {changed:false};
 if(!same(current,original))throw Error('音效清单不匹配当前原卡计划，不能自动改写');
 const changes=runtime.flatMap((cue,i)=>cue.volume===original[i].volume?[]:[{index:i,file:cue.file,t:cue.t,before:original[i].volume,after:cue.volume}]);
 return {changed:changes.length>0,runtime,source:nativeCueSource(runtime),changes};
}
