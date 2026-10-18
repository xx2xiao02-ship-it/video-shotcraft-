import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {generateTalkcraftDigitalHuman} from './talkcraft-digital-human.mjs';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {recordPlanningResult,recordSemanticPass,approveTalkcraftStoryboard} from './talkcraft-status.mjs';
import {recordReviewedCandidates} from './talkcraft-reviewed-templates.mjs';
import {fileSha256} from './talkcraft-digital-human-plan.mjs';
import {authorizeDigitalHumanAutomation} from './talkcraft-digital-human-policy.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'human-recovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runId='11111111-1111-4111-8111-111111111111',project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
 const write=(n,v)=>{fs.mkdirSync(path.dirname(path.join(project,n)),{recursive:true});fs.writeFileSync(path.join(project,n),JSON.stringify(v));};
 write('source-run.json',{runId,fps:30,totalFrames:90,digitalHumanMode:'segments'});
 write('input.txt','测试');write('remotion/shots.json',[{id:'s01',start:0,end:3,subject:'person',shotCard:'impact-open-title'}]);
 write('semantics.json',{sentences:[{i:0,text:'测试',shot:'s01',weight:'main',sem:['钩子']}]});write('aligned-sentences.json',[{start:0,end:3}]);
 write('audio/timestamps.json',{sentences:[{text:'测试',start:0,end:3,ok:true,match:1,words:[{text:'测试',start:0,end:3}]}]});
 write('SHOTBOOK.md','test');write('sources.md','sources');write('qa/card-candidates.json',{s01:{candidates:{钩子:[{slug:'impact-open-title'}]}}});write('qa/card-candidates.md','test');
 fs.mkdirSync(path.join(project,'assets'),{recursive:true});
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','libmp3lame',path.join(project,'audio/full.mp3')]);
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x64','-frames:v','1','-update','1',path.join(project,'assets/avatar.png')]);
 const video=path.join(root,'provider.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x00ff00:s=64x64:r=30:d=3,drawbox=x=20:y=10:w=24:h=44:color=0xc6906e:t=fill','-c:v','libx264','-pix_fmt','yuv420p',video]);
 recordReviewedCandidates(project,{skillRoot:path.resolve('_audit/video-talkcraft')});recordSemanticPass(root,runId);recordPlanningResult(root,runId,{passed:true});approveTalkcraftStoryboard(root,runId,'isolated technical fixture');
 return {root,runId,project,video,write};}
test('08中断后只查询原taskId；成功后重复继续不新增计费并核验真实解码',async t=>{
 const f=fixture(t);let creates=0,queries=0,interrupt=true;
 const provider={create:async()=>{creates++;return {taskId:'existing-paid-id'};},waitForResult:async id=>{assert.equal(id,'existing-paid-id');queries++;if(interrupt){interrupt=false;throw Error('local-interruption');}return {outputUrl:'fixture'};},download:async()=>fs.readFileSync(f.video)};
 await assert.rejects(()=>generateTalkcraftDigitalHuman({...f,provider}),/local-interruption/);
 const report=await generateTalkcraftDigitalHuman({...f,provider,resumeExisting:true});assert.equal(report.status,'SUCCESS');assert.equal(creates,1);assert.equal(queries,2);
 await generateTalkcraftDigitalHuman({...f,provider,reuseFirst:true});assert.equal(creates,1);assert.equal(queries,2);assert.equal(readTalkcraftDigitalHumanStatus(f.project).ready,true);
});
test('08提交结果未知时重复继续不会再次create',async t=>{
 const f=fixture(t);authorizeDigitalHumanAutomation(f.project,{approval:'用户授权优先复用、不足自动补足'});let creates=0;
 const provider={create:async()=>{creates++;throw Error('unknown-provider-outcome');}};
 await assert.rejects(()=>generateTalkcraftDigitalHuman({...f,provider,reuseFirst:true}),/unknown-provider-outcome/);
 await assert.rejects(()=>generateTalkcraftDigitalHuman({...f,provider,reuseFirst:true}),/提交状态不明确/);
 assert.equal(creates,1);
});
test('08复用登记的付费原片，保留旧同名素材，重新抠图且不调用供应商',async t=>{
 const f=fixture(t),source=path.join(f.root,'approved-source');fs.mkdirSync(path.join(source,'remotion/public/digital-human'),{recursive:true});fs.mkdirSync(path.join(source,'audio'));
 fs.copyFileSync(path.join(f.project,'source-run.json'),path.join(source,'source-run.json'));fs.copyFileSync(path.join(f.project,'audio/full.mp3'),path.join(source,'audio/full.mp3'));
 fs.copyFileSync(f.video,path.join(source,'remotion/public/digital-human/unit-1.mp4'));
 fs.writeFileSync(path.join(source,'digital-human-report.json'),JSON.stringify({status:'SUCCESS',audioHash:fileSha256(path.join(source,'audio/full.mp3')),units:[{index:0,fromFrame:0,durationInFrames:90,frames:90,status:'SUCCESS',file:'digital-human/unit-1.mp4'}]}));
 f.write('qa/rebuild-inputs.json',{sourceProject:source,unchangedAudio:fileSha256(path.join(source,'audio/full.mp3'))});
 f.write('remotion/public/digital-human/old-material.json',{preserved:true});
 const report=await generateTalkcraftDigitalHuman({...f,reuseFirst:true,provider:{create:()=>assert.fail('reused footage must not create')}});
 assert.equal(report.status,'SUCCESS');assert.equal(report.taskIds.length,0);assert.equal(report.units[0].reused,true);
 assert.equal(readTalkcraftDigitalHumanStatus(f.project).ready,true);
 const archive=JSON.parse(fs.readFileSync(path.join(f.project,'qa/digital-human-reuse-started.json'))).archive;
 assert.ok(fs.existsSync(path.join(archive,'old-material.json')));
});
