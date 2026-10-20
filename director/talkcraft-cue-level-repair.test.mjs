import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {nativeCueRuntime,nativeCueSource,planNativeCueLevelRepair,measuredCueVolume} from './talkcraft-cue-level-repair.mjs';
import {sfxSoloInputs} from './talkcraft-sfx-solo.mjs';
import {riserWav} from './talkcraft-procedural-sfx.mjs';
function fixture(t){const project=fs.mkdtempSync(path.join(os.tmpdir(),'cue-level-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const write=(name,value)=>{const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2));};
 const cues=[{t:3,file:'riser.wav',volume:.18,clip:.8,procedural:{name:'riser'}},{t:5,file:'pop.mp3',volume:.2,clip:.6,rate:1.1}];
 const old=cues.map(({procedural,...cue})=>cue);write('remotion/shots.json','[]');
 write('qa/native-production-plan.json',{schema:'talkcraft-native-production-v1',inputs:{'remotion/shots.json':createHash('sha256').update('[]').digest('hex')},cues});
 write('remotion/cues.json',old);write('remotion/src/sfx.ts',nativeCueSource(old));return {project,write,cues,old};}
test('只按当前计划修复合成上升音电平，时间音高采样和其他音量保持原值；重复继续无变更',t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.project,'remotion/src/sfx.ts'));
 const result=planNativeCueLevelRepair(f.project);assert.equal(result.changed,true);
 assert.deepEqual(result.changes,[{index:0,file:'riser.wav',t:3,before:.18,after:.25}]);
 assert.deepEqual(result.runtime[1],f.old[1]);assert.deepEqual(fs.readFileSync(path.join(f.project,'remotion/src/sfx.ts')),before);
 f.write('remotion/cues.json',result.runtime);f.write('remotion/src/sfx.ts',result.source);
 assert.equal(planNativeCueLevelRepair(f.project).changed,false);
});
test('跨输入记录、漏音效或运行源码不一致均禁止自动补写',t=>{
 const f=fixture(t);f.write('remotion/shots.json','[1]');assert.throws(()=>planNativeCueLevelRepair(f.project),/过期/);
 f.write('remotion/shots.json','[]');f.write('remotion/cues.json',[]);assert.throws(()=>planNativeCueLevelRepair(f.project),/不一致/);
 f.write('remotion/src/sfx.ts',nativeCueSource([]));assert.throws(()=>planNativeCueLevelRepair(f.project),/不匹配/);
});
test('真实合成波形经过正式增益后满足原版50ms检测门槛，且不削波',t=>{
 const f=fixture(t),file=path.join(f.project,'riser.wav');fs.writeFileSync(file,riserWav(.6));
 const volume=nativeCueRuntime(f.cues)[0].volume;
 const raw=execFileSync('ffmpeg',['-v','error','-i',file,'-af',`volume=${volume}`,'-ac','1','-ar','16000','-f','s16le','-']);
 let peak=0,max=0;const win=800;
 for(let start=0;start+win<raw.length/2;start+=400){let sum=0;for(let i=start;i<start+win;i++){const x=raw.readInt16LE(i*2)/32768;sum+=x*x;max=Math.max(max,Math.abs(x));}peak=Math.max(peak,Math.sqrt(sum/win));}
 assert.ok(20*Math.log10(peak)>=-45);assert.ok(max<1);
});


test('任意新任务真实输出低电平按原50ms窗口补偿，静音拒绝，合格电平不变',()=>{
 const pcm=Buffer.alloc(16000*2);for(let i=0;i<16000;i++)pcm.writeInt16LE(Math.round(.005*Math.sin(i*.35)*32768),i*2);
 const cue={t:.1,clip:.6,volume:.15};const volume=measuredCueVolume(cue,pcm);assert.ok(volume>.15&&volume<1);
 const raised=Buffer.from(pcm);for(let i=0;i<16000;i++)raised.writeInt16LE(Math.round(pcm.readInt16LE(i*2)*volume/.15),i*2);
 assert.equal(measuredCueVolume({...cue,volume},raised),volume);assert.throws(()=>measuredCueVolume(cue,Buffer.alloc(32000)),/无法/);
});


test('只有同源码同清单的已核验纯音效轨驱动电平方案，其他音量保持原值',t=>{
 const f=fixture(t);f.write('remotion/src/Main.tsx','verified main');const runtime=nativeCueRuntime(f.cues);f.write('remotion/cues.json',runtime);f.write('remotion/src/sfx.ts',nativeCueSource(runtime));
 const stem=path.join(f.project,'remotion/out/sfx-solo.wav');fs.mkdirSync(path.dirname(stem),{recursive:true});execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=900:duration=7','-af','volume=0.04',stem]);
 f.write('qa/sfx-solo-render.json',{schema:'talkcraft-sfx-solo-render-v1',...sfxSoloInputs(f.project),outputSha256:createHash('sha256').update(fs.readFileSync(stem)).digest('hex')});
 const result=planNativeCueLevelRepair(f.project);assert.equal(result.changed,true);assert.equal(result.changes.length,2);assert.equal(result.measurement.thresholdDbfs,-45);assert.equal(result.runtime[0].t,runtime[0].t);assert.equal(result.runtime[1].rate,runtime[1].rate);
 f.write('remotion/cues.json',result.runtime);f.write('remotion/src/sfx.ts',result.source);f.write('qa/audio-level-repair.json',{runtimeSha256:result.runtimeSha256});assert.equal(planNativeCueLevelRepair(f.project).changed,false);
 f.write('remotion/cues.json',result.runtime.map((c,i)=>i?c:{...c,t:c.t+.1}));f.write('remotion/src/sfx.ts',nativeCueSource(result.runtime.map((c,i)=>i?c:{...c,t:c.t+.1})));assert.throws(()=>planNativeCueLevelRepair(f.project),/不匹配/);
});
