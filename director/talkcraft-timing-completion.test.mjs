import test from 'node:test';import assert from 'node:assert/strict';
import {proposeTimingRows} from './talkcraft-timing-completion.mjs';
import {checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {readNativeTiming} from './talkcraft-native-timing.mjs';
import {timingCompletionPlan,executeApprovedTimingCompletion} from './talkcraft-timing-completion.mjs';
const fixture=()=>{
 const shot={id:'s05',shotCard:'ink-underline',templateParams:{cardProps:{line1Key:'钱',line2Key:'关联'}}};
 const row={shotId:'s05',startFrame:0,endFrame:170,nativeFrames:109,timeline:[
  {kind:'motion',fromFrame:0,toFrame:90,nativeFromFrame:0,nativeToFrame:90},
  {kind:'hold',fromFrame:91,toFrame:151,nativeFromFrame:90,nativeToFrame:90,reason:'保留已显现内容'},
  {kind:'motion',fromFrame:152,toFrame:169,nativeFromFrame:91,nativeToFrame:108}]};
 return {shots:[{id:'s01'},{id:'s02'},{id:'s03'},shot],presentation:{shots:[row]},reveals:{events:[
  {id:'a',beatId:'s05',field:'line1Key',text:'钱',localFrame:25},
  {id:'b',beatId:'s05',field:'line2Key',text:'关联',localFrame:90}]}};
};
test('节点提出可行驻留方案，原文锚点卡片参数及输入对象均不改写',()=>{
 const f=fixture(),before=structuredClone(f),plan=proposeTimingRows(f.shots,f.presentation,f.reveals);
 assert.equal(plan.operations.length,1);assert.equal(plan.operations[0].shotId,'s05');
 const result=checkTextEffectDependencies([f.shots[3]],{shots:[plan.operations[0].after]},f.reveals);
 assert.equal(result.passed,true,JSON.stringify(result.issues));assert.deepEqual(f,before);
 const again=proposeTimingRows(f.shots,{shots:[plan.operations[0].after]},f.reveals);assert.equal(again.operations.length,0);
});

const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function projectFixture(t){
 const base=path.resolve('tmp');fs.mkdirSync(base,{recursive:true});const project=fs.mkdtempSync(path.join(base,'timing-recovery-'));
 t.after(()=>{assert.equal(path.dirname(project),base);fs.rmSync(project,{recursive:true,force:true});});
 const put=(file,value)=>{const target=path.join(project,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value));};
 const words=Array.from({length:3},(_,i)=>['想','清','楚'].map((word,j)=>({word,startTime:i*3+.2+j*.2,endTime:i*3+.4+j*.2}))).flat();
 words.push({word:'钱包',startTime:9+25/30,endTime:10},{word:'关',startTime:12,endTime:12.2},{word:'联',startTime:12.2,endTime:12.4});
 put('source-run.json',{runId:'test-run',pipeline:'video-talkcraft'});put('input.txt','想清楚。想清楚。想清楚。钱包关联。');
 put('audio/full.mp3','preserved voice bytes');put('script.json',{sentences:['想清楚。','想清楚。','想清楚。','钱包关联。']});
 put('audio/voice-timing.json',{voiceEngine:'volcengine-seed-tts-2.0',durationSeconds:440/30,words});put('audio/timestamps.json',readNativeTiming(project));
 const scenes=Array.from({length:4},(_,i)=>({id:'s'+(i+1),chars:words.filter(w=>w.startTime>=i*3&&(i===3||w.startTime<(i+1)*3)).flatMap(w=>[...w.word].map(ch=>({ch,t:w.startTime,e:w.endTime})))}));
 put('remotion/src/timing.json',{scenes});put('qa/formal-bindings.json',{bindings:[]});
 const shots=Array.from({length:3},(_,i)=>({id:'s0'+(i+1),start:i*3,end:(i+1)*3,shotCard:'per-character-rise',templateParams:{cardProps:{text:'想清楚'}}}));
 const last={...fixture().shots[3],start:9,end:440/30};last.templateParams.cardProps.line1Key='钱包';shots.push(last);put('remotion/shots.json',shots);
 const rows=shots.slice(0,3).map((s,i)=>({shotId:s.id,cardId:s.shotCard,startFrame:i*90,endFrame:(i+1)*90,nativeFrames:85,humanLayout:'none',mobileMinTextPx:12,textFields:[{key:'text',visibility:'visible'}],timeline:[
  {kind:'motion',fromFrame:0,toFrame:50,nativeFromFrame:0,nativeToFrame:50},{kind:'hold',fromFrame:51,toFrame:55,nativeFromFrame:50,nativeToFrame:50,reason:'完整内容保持'},
  {kind:'motion',fromFrame:56,toFrame:89,nativeFromFrame:51,nativeToFrame:84}]}));
 rows.push({...fixture().presentation.shots[0],cardId:'ink-underline',startFrame:270,endFrame:440,humanLayout:'none',mobileMinTextPx:12,textFields:[{key:'line1Key',visibility:'visible'},{key:'line2Key',visibility:'visible'}]});
 put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:rows});
 const events=shots.slice(0,3).map((s,i)=>({id:s.id+'-text',beatId:s.id,field:'text',text:'想清楚',anchor:'想清楚',sentence:'s'+(i+1),role:'spoken'}));
 events.push({id:'a',beatId:'s05',field:'line1Key',text:'钱包',anchor:'钱包',sentence:'s4',role:'spoken'},{id:'b',beatId:'s05',field:'line2Key',text:'关联',anchor:'关联',sentence:'s4',role:'spoken'});
 put('remotion/word-reveal-plan.json',{scope:'native-shots',fps:30,events});
 const plan=timingCompletionPlan(project),proposal={action:'timing-completion',timingCompletionPlan:plan};
 put('qa/governance-case.json',{current:true});put('qa/governance-template-map.json',{current:true});
 put('qa/correction-center.json',{approved:true,runId:'test-run',action:'timing-completion',timingCompletionPlan:plan,proposal,approval:{planSha256:digest(proposal)},governance:{caseSha256:digest({current:true}),mapSha256:digest({current:true})}});
 return {project,put,plan};
}
test('正式执行可重复继续且不改音频，时间证据变化后旧审批不能复用',t=>{
 const f=projectFixture(t);assert.equal(f.plan.operations.length,1);
 const file=path.join(f.project,'remotion/native-presentation.json');
 const first=executeApprovedTimingCompletion(f.project),after=fs.readFileSync(file);
 assert.deepEqual(first.applied,['s05']);assert.equal(first.paidCalls,0);
 assert.equal(executeApprovedTimingCompletion(f.project).reused,true);assert.deepEqual(fs.readFileSync(file),after);
 assert.equal(fs.readFileSync(path.join(f.project,'audio/full.mp3'),'utf8'),'preserved voice bytes');
 f.put('audio/voice-timing.json',{changed:true});assert.throws(()=>executeApprovedTimingCompletion(f.project));assert.deepEqual(fs.readFileSync(file),after);
});
test('修正结果落盘失败回滚原计划，不留半次应用',t=>{
 const f=projectFixture(t),file=path.join(f.project,'remotion/native-presentation.json'),before=fs.readFileSync(file);
 fs.mkdirSync(path.join(f.project,'qa/timing-completion.json.tmp'));
 assert.throws(()=>executeApprovedTimingCompletion(f.project));assert.deepEqual(fs.readFileSync(file),before);
 assert.ok(fs.existsSync(path.join(f.project,'qa/timing-completion-history',f.plan.planId+'.json')));
});
test('时长无解或前三镜锁定时只记录原因，不能裁尾改速或强行应用',()=>{
 const f=fixture();f.presentation.shots[0].endFrame=110;
 let p=proposeTimingRows(f.shots,f.presentation,f.reveals);assert.equal(p.operations.length,0);assert.match(p.unresolved.find(u=>u.shotId==='s05').reason,/须重选/);
 const opening=fixture();opening.shots=opening.shots.slice(3);
 p=proposeTimingRows(opening.shots,opening.presentation,opening.reveals);assert.equal(p.operations.length,0);assert.match(p.unresolved[0].reason,/前三镜锁定/);
});
