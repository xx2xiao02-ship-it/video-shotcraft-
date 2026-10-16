import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readNativeTiming} from './talkcraft-native-timing.mjs';
import {recordPlanningWordCheck} from './talkcraft-native-word-window.mjs';
import {alignBoundaryCuesToSpeechGaps,alignNativeShotBoundaries,prepareNativeProduction} from './talkcraft-native-preparation.mjs';
import {proceduralCue,installProceduralCue,riserWav} from './talkcraft-procedural-sfx.mjs';

function fixture(t){
  const base=path.resolve('tmp');fs.mkdirSync(base,{recursive:true});
  const project=fs.mkdtempSync(path.join(base,'planning-provider-words-'));
  t.after(()=>{assert.equal(path.dirname(project),base);fs.rmSync(project,{recursive:true,force:true});});
  const put=(f,x)=>{const file=path.join(project,f);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof x==='string'?x:JSON.stringify(x));};
  put('audio/full.mp3','fixture voice bytes');put('script.json',{sentences:['想清楚。']});
  put('audio/voice-timing.json',{voiceEngine:'volcengine-seed-tts-2.0',durationSeconds:3,
    words:[{word:'想',startTime:.2,endTime:.4},{word:'清',startTime:.4,endTime:.6},{word:'楚',startTime:.6,endTime:.8}]});
  put('audio/timestamps.json',readNativeTiming(project));
  put('qa/formal-bindings.json',{bindings:[]});
  put('semantics.json',{sentences:[{text:'想清楚。',shot:'s01',sem:['论点']}]});
  put('SHOTBOOK.md','## s01 0.000–3.000 秒\n- 节拍、音效：待精确定位与核验');
  put('remotion/shots.json',[{id:'s01',start:0,end:3,shotCard:'per-character-rise',templateParams:{cardProps:{text:'想清楚'}}}]);
  put('remotion/src/timing.json',{scenes:[{id:'s1',chars:[{ch:'想',t:.2,e:.4},{ch:'清',t:.4,e:.6},{ch:'楚',t:.6,e:.8}]}]});
  put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[{
    shotId:'s01',cardId:'per-character-rise',startFrame:0,endFrame:90,nativeFrames:85,humanLayout:'none',mobileMinTextPx:12,
    textFields:[{key:'text',visibility:'visible'}],timeline:[
      {kind:'motion',fromFrame:0,toFrame:50,nativeFromFrame:0,nativeToFrame:50},
      {kind:'hold',fromFrame:51,toFrame:55,nativeFromFrame:50,nativeToFrame:50,reason:'完整文字仍可见'},
      {kind:'motion',fromFrame:56,toFrame:89,nativeFromFrame:51,nativeToFrame:84}]}]});
  const plan={scope:'native-shots',fps:30,events:[{id:'word',beatId:'s01',field:'text',text:'想清楚',anchor:'想清楚',sentence:'s1',role:'spoken'}]};
  put('remotion/word-reveal-plan.json',plan);
  return {project,put,plan};
}

test('无离线 ASR 文件时，供应商原生词仍真实检查锚点并生成音效准备',t=>{
  const f=fixture(t);assert.equal(fs.existsSync(path.join(f.project,'audio/word-timestamps.json')),false);
  const checked=recordPlanningWordCheck(f.project);assert.equal(checked.passed,true);assert.equal(checked.eventCount,1);
  const reveals=JSON.parse(fs.readFileSync(path.join(f.project,'remotion/word-reveals.json')));
  assert.equal(reveals.events[0].globalFrame,6);
  assert.deepEqual(alignNativeShotBoundaries(f.project),[]);
  const production=prepareNativeProduction(f.project,path.resolve('_audit/video-talkcraft'));
  assert.equal(production.beats[0].t,.2);assert.ok(production.cues.length);
});

test('供应商路径缺失锚词必须在规划阶段失败，不能因无 ASR 文件跳过',t=>{
  const f=fixture(t);f.plan.events[0].anchor='不存在的词';f.put('remotion/word-reveal-plan.json',f.plan);
  const report=recordPlanningWordCheck(f.project);assert.equal(report.passed,false);
  assert.equal(report.issues[0].code,'NATIVE_WORD_ANCHOR_INVALID');assert.match(report.issues[0].message,/找不到锚词/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.project,'qa/native-word-window-check.json'))).passed,false);
});

test('过期原始配音不能继续通过原生字级门禁',t=>{
  const f=fixture(t);f.put('audio/full.mp3','changed voice');
  assert.equal(recordPlanningWordCheck(f.project).passed,false);
  assert.throws(()=>prepareNativeProduction(f.project,path.resolve('_audit/video-talkcraft')),/不一致/);
});

test('上游无采样的 riser 按原合成定义落盘，不能换成别的音效或覆盖旧文件',t=>{
  const f=fixture(t),cue=proceduralCue({name:'riser',dur:.46},path.resolve('_audit/video-talkcraft'));
  const dir=path.join(f.project,'sfx'),out=installProceduralCue(cue,dir),bytes=fs.readFileSync(out.file);
  assert.equal(bytes.toString('utf8',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),48000);
  assert.equal(bytes.readUInt32LE(40)/96000,.61);assert.ok(bytes.subarray(44).some(x=>x!==0));
  assert.deepEqual(bytes,riserWav(.46));assert.equal(installProceduralCue(cue,dir).sha256,out.sha256);
  fs.writeFileSync(out.file,'existing');assert.throws(()=>installProceduralCue(cue,dir),/已保留/);
  assert.throws(()=>proceduralCue({name:'unknown'},path.resolve('_audit/video-talkcraft')),/缺少真实采样/);
});

test('合成 riser 保留原卡时序并达到独立音效审计的最低音量',t=>{
  const f=fixture(t);
  const shots=JSON.parse(fs.readFileSync(path.join(f.project,'remotion/shots.json')));
  shots[0].shotCard='soft-blur-in';f.put('remotion/shots.json',shots);
  const production=prepareNativeProduction(f.project,path.resolve('_audit/video-talkcraft'));
  assert.equal(production.cues[0].file,'riser-600ms.wav');
  assert.equal(production.cues[0].volume,.18);
});

test('短促入场音可提前到相邻字级气口，长 riser 保留原卡落点',()=>{
  const shots=[{id:'s01',start:0,end:1},{id:'s02',start:1,end:2},{id:'s03',start:2,end:3}];
  const timing={sentences:[{words:[{start:0,end:.4},{start:1,end:1.3},{start:2,end:2.3}]}]};
  const cues=[{shotId:'s02',t:1.3,file:'pk-ui-pop.mp3'},{shotId:'s03',t:2.2,file:'riser-600ms.wav'}];
  assert.equal(alignBoundaryCuesToSpeechGaps(cues,shots,timing,{minimum:2}),1);
  assert.equal(cues.find(c=>c.shotId==='s02').t,.45);
  assert.equal(cues.find(c=>c.shotId==='s02').timingSource,'speech-gap-preroll');
  assert.equal(cues.find(c=>c.shotId==='s03').t,2.2);
});

test('气口音效优先落在更长停顿，避免字级边界残留人声尾音',()=>{
  const shots=[{id:'s01',start:0,end:1},{id:'s02',start:1,end:2},{id:'s03',start:3,end:4}];
  const timing={sentences:[{words:[{start:0,end:.4},{start:1,end:1.4},{start:3,end:3.3}]}]};
  const cues=[{shotId:'s02',t:1.2,file:'pk-ui-pop.mp3'},{shotId:'s03',t:3.2,file:'pk-ui-pop.mp3'}];
  assert.equal(alignBoundaryCuesToSpeechGaps(cues,shots,timing,{minimum:1}),1);
  assert.equal(cues.find(c=>c.shotId==='s02').t,1.2);
  assert.equal(cues.find(c=>c.shotId==='s03').t,1.45);
});

test('有真实配音电平时优先使用更安静气口',()=>{
  const shots=[{id:'s01',start:0,end:1},{id:'s02',start:1,end:2},{id:'s03',start:3,end:4}];
  const timing={sentences:[{words:[{start:0,end:.4},{start:1,end:1.4},{start:3,end:3.3}]}]};
  const cues=[{shotId:'s02',t:1.2,file:'pk-ui-pop.mp3'},{shotId:'s03',t:3.2,file:'pk-ui-pop.mp3'}];
  const voiceDbForGap=gap=>gap.start<1?-48:-25;
  assert.equal(alignBoundaryCuesToSpeechGaps(cues,shots,timing,{minimum:1,voiceDbForGap}),1);
  assert.equal(cues.find(c=>c.shotId==='s02').t,.45);
  assert.equal(cues.find(c=>c.shotId==='s03').t,3.2);
});
