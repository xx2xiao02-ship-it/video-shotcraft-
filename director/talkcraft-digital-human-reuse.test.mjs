import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {planDigitalHumanReuse} from './talkcraft-digital-human-reuse.mjs';
import {fileSha256} from './talkcraft-digital-human-plan.mjs';
import {authorizeDigitalHumanAutomation,readDigitalHumanAutomation} from './talkcraft-digital-human-policy.mjs';
import {automaticTalkcraftStage} from './talkcraft-auto-advance.mjs';
import {EDITORIAL_SELECTION_NATIVE_RULES,EDITORIAL_NATIVE_RULES} from './talkcraft-editorial-native-plan.mjs';
test('局部选卡规则不得同时要求模型填写编译器独占的速度；初次编导仍支持受控变速',()=>{
 assert.ok(EDITORIAL_SELECTION_NATIVE_RULES.includes('禁止返回playbackRate（包括null和1）'));
 assert.ok(!EDITORIAL_SELECTION_NATIVE_RULES.includes('playbackRate为可选请求速度'));
 assert.ok(EDITORIAL_NATIVE_RULES.includes('playbackRate为可选请求速度'));
});
function fixture(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'human-reuse-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const project=path.join(base,'current'),source=path.join(base,'source');
 const write=(p,n,v)=>{fs.mkdirSync(path.dirname(path.join(p,n)),{recursive:true});fs.writeFileSync(path.join(p,n),JSON.stringify(v));};
 for(const p of [project,source]){write(p,'source-run.json',{fps:30,totalFrames:180,digitalHumanMode:'segments'});write(p,'audio/full.mp3','same-paid-voice');write(p,'input.txt','same-text');}
 write(project,'remotion/shots.json',[{id:'s01',start:0,end:2,subject:'person'},{id:'s02',start:2,end:3,subject:'other'},{id:'s03',start:3,end:6,subject:'person'}]);
 const voice=fileSha256(path.join(project,'audio/full.mp3'));
 write(project,'qa/rebuild-inputs.json',{sourceProject:source,unchangedAudio:voice});
 const units=[{index:0,fromFrame:0,durationInFrames:60,frames:60,status:'SUCCESS',file:'digital-human/a.mp4'},
 {index:1,fromFrame:90,durationInFrames:45,frames:45,status:'SUCCESS',file:'digital-human/b.mp4'},
 {index:2,fromFrame:135,durationInFrames:45,frames:45,status:'SUCCESS',file:'digital-human/c.mp4'}];
 for(const u of units)write(source,'remotion/public/'+u.file,u.index);
 write(source,'digital-human-report.json',{status:'SUCCESS',audioHash:voice,units});
 return {project,source,write,units,voice};}
test('按完整配音和帧区间复用，合并镜头可由多个已付费片段拼接，不按同名ID冒用',t=>{
 const f=fixture(t),r=planDigitalHumanReuse(f.project);assert.deepEqual(r.missing,[]);assert.equal(r.reuse.length,2);assert.equal(r.reuse[1].parts.length,2);assert.equal(r.reuse[1].parts.reduce((s,p)=>s+p.frames,0),90);
});
test('来源缺片只列出缺失区间，音频或实际帧数变化停止而不是新增付费',t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.source,'remotion/public/digital-human/c.mp4'));
 assert.deepEqual(planDigitalHumanReuse(f.project).missing,[1]);
 assert.throws(()=>planDigitalHumanReuse(f.project,{probe:()=>1}),/帧数/);
 f.write(f.project,'audio/full.mp3','changed');assert.throws(()=>planDigitalHumanReuse(f.project),/配音不一致/);
});
test('自动补足授权绑定本次任务输入；07通过才自动进入08，14保持人工审核',t=>{
 const f=fixture(t);assert.equal(readDigitalHumanAutomation(f.project).enabled,false);
 authorizeDigitalHumanAutomation(f.project,{approval:'用户确认不足自动生成、复用优先'});
 assert.equal(readDigitalHumanAutomation(f.project).enabled,true);
 const r={provenance:{verified:true},nextStage:'digital-human',digitalHumanAutomation:{enabled:true},planningPassed:true,storyboardApproved:true};
 assert.equal(automaticTalkcraftStage(r),'digital-human');assert.equal(automaticTalkcraftStage({...r,storyboardApproved:false}),null);
 assert.equal(automaticTalkcraftStage({...r,nextStage:'approve-final'}),null);
 f.write(f.project,'audio/full.mp3','new-voice');assert.equal(readDigitalHumanAutomation(f.project).enabled,false);
});
