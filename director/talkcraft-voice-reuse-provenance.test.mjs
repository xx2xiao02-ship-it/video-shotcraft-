import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {B_PIPELINE,assertPipelineProvenance} from './talkcraft-pipeline-provenance.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-provenance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceRunId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222';
 const old=path.join(root,sourceRunId,'talkcraft'),project=path.join(root,runId,'talkcraft');
 const source={...B_PIPELINE,runId,sourceRunId,voiceMode:'volcengine-tts2',speakerId:'speaker_1',voice:'speaker_1',speechRate:0};
 const previous={...source,runId:sourceRunId,voiceEngine:'volcengine-seed-tts-2.0'};
 for(const [p,s] of [[old,previous],[project,source]]){fs.mkdirSync(path.join(p,'audio'),{recursive:true});fs.writeFileSync(path.join(p,'source-run.json'),JSON.stringify(s));fs.writeFileSync(path.join(p,'input.txt'),'同一篇文案');fs.writeFileSync(path.join(p,'audio/full.mp3'),'paid-audio-fixture');fs.writeFileSync(path.join(p,'audio/voice-timing.json'),JSON.stringify({voice:'speaker_1',voiceEngine:'volcengine-seed-tts-2.0',timingMethod:'volcengine-word-timestamps'}));}
 return {project,old,source,previous};}
test('缺失摘要字段时仅从指定来源完全相同的文案音频时间戳恢复，保持当前任务数据不变',t=>{
 const f=fixture(t),file=path.join(f.project,'source-run.json'),before=fs.readFileSync(file);
 const r=assertPipelineProvenance(f.project,{requireVoice:true});assert.equal(r.voiceEngine,'volcengine-seed-tts-2.0');assert.equal(r.voiceReuse.sourceRunId,f.source.sourceRunId);
 assert.equal(Object.keys(r.voiceReuse.inputs).length,3);assert.deepEqual(fs.readFileSync(file),before);
 assert.deepEqual(assertPipelineProvenance(f.project,{requireVoice:true}),r);
});
test('音频、时间戳或原文任一不同都不能复用来源摘要',t=>{
 for(const name of ['input.txt','audio/full.mp3','audio/voice-timing.json']){const f=fixture(t);fs.appendFileSync(path.join(f.project,name),' ');assert.throws(()=>assertPipelineProvenance(f.project,{requireVoice:true}),/哈希不一致/);}
});
test('跨任务编号、源引擎、选定音色或语速不一致仍严格拒绝',t=>{
 for(const patch of [{sourceRunId:'../other'},{runId:'wrong'},{speakerId:'speaker_2'},{speechRate:1}]){
  const f=fixture(t);fs.writeFileSync(path.join(f.project,'source-run.json'),JSON.stringify({...f.source,...patch}));assert.throws(()=>assertPipelineProvenance(f.project,{requireVoice:true}));
 }
 const f=fixture(t);fs.writeFileSync(path.join(f.old,'source-run.json'),JSON.stringify({...f.previous,voiceEngine:'other'}));assert.throws(()=>assertPipelineProvenance(f.project,{requireVoice:true}),/来源记录无效/);
});
