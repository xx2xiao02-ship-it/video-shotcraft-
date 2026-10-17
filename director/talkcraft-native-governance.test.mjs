import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {checkNativeGovernance,governedVisibleText,nativeGovernanceStatus,validateNativeTimeline,nativeFrameAt} from './talkcraft-native-governance.mjs';
import {readTalkcraftStatus,recordPreflightResult} from './talkcraft-status.mjs';
import {outputFrameForNativeFrame} from './talkcraft-native-time-map.mjs';
const base=path.resolve('tmp');fs.mkdirSync(base,{recursive:true});
function fixture(t){const root=fs.mkdtempSync(path.join(base,'native-governance-test-')),id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',project=path.join(root,'director/b-mode-runs',id,'talkcraft');
 t.after(()=>{assert.ok(root.startsWith(base+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const put=(file,value)=>{const target=path.join(project,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,typeof value==='string'?value:JSON.stringify(value));};
 put('source-run.json',{runId:id,fps:30,totalFrames:300});put('qa/formal-bindings.json',{bindings:[]});
 put('semantics.json',{sentences:[]});put('SHOTBOOK.md','plan');put('sources.md','sources');put('audio/timestamps.json',{sentences:[]});put('audio/full.mp3','preserved voice');
 put('remotion/shots.json',[{id:'s01',start:0,end:10,shotCard:'card',templateParams:{cardProps:{text:'消费预期'}}}]);
 const row={shotId:'s01',cardId:'card',startFrame:0,endFrame:300,nativeFrames:90,humanLayout:'none',mobileMinTextPx:12,textFields:[{key:'text',visibility:'visible'}],timeline:[{kind:'motion',fromFrame:0,toFrame:44,nativeFromFrame:0,nativeToFrame:44},{kind:'hold',fromFrame:45,toFrame:254,nativeFromFrame:44,nativeToFrame:44,reason:'完整主体驻留至口播结束'},{kind:'motion',fromFrame:255,toFrame:299,nativeFromFrame:45,nativeToFrame:89}]};
 const words={scope:'native-shots',fps:30,events:[{id:'s01-text',beatId:'s01',field:'text',text:'消费预期',role:'spoken'}]};
 return {root,id,project,put,row,words};}
test('已通过旧预检的正式模板缺少逐词计划时仍被阻断',t=>{const f=fixture(t);recordPreflightResult(f.root,f.id,{passed:true});const status=readTalkcraftStatus(f.root,f.id);assert.equal(status.preflightPassed,false);assert.match(status.preflightIssues.join(' '),/NATIVE_GOVERNANCE_REQUIRED/);const check=checkNativeGovernance(f.project);assert.equal(check.passed,false);assert.ok(check.issues.some(i=>i.code==='NATIVE_WORD_PLAN_REQUIRED'));});
test('完整原生动作和明确驻留通过；参数或音频改变后旧检查失效',t=>{const f=fixture(t);f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[f.row]});f.put('remotion/word-reveal-plan.json',f.words);assert.equal(checkNativeGovernance(f.project,{write:true,catalog:{cards:[{cardId:'card',duration:{frames:90},fields:[{key:'text',role:'content',type:'text'}]}]}}).passed,true);assert.equal(nativeGovernanceStatus(f.project).passed,true);f.put('audio/full.mp3','different voice');assert.equal(nativeGovernanceStatus(f.project).passed,false);});
test('缺失文字字段、重复事件和不合法清单均失败',t=>{const f=fixture(t);f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[{...f.row,textFields:[]}]});f.put('remotion/word-reveal-plan.json',{...f.words,events:[...f.words.events,...f.words.events]});const result=checkNativeGovernance(f.project);assert.equal(result.passed,false);assert.ok(result.issues.some(i=>i.code==='NATIVE_WORD_DUPLICATE'));f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:{}});assert.equal(checkNativeGovernance(f.project).passed,false);});
test('长卡不能截断、加速、倒放或遗漏动作帧',t=>{const {row}=fixture(t);assert.deepEqual(validateNativeTimeline(row,300,90),[]);for(const timeline of [[{kind:'motion',fromFrame:0,toFrame:299,nativeFromFrame:0,nativeToFrame:89}],[{kind:'motion',fromFrame:0,toFrame:299,nativeFromFrame:0,nativeToFrame:299}]])assert.ok(validateNativeTimeline({timeline},300,90).length);assert.equal(nativeFrameAt(row.timeline,100),44);assert.equal(nativeFrameAt(row.timeline,255),45);assert.equal(nativeFrameAt(row.timeline,299),89);assert.throws(()=>nativeFrameAt(row.timeline,300),/未覆盖/);});
test('缺省字段覆盖不能把漏掉的大字或低字号放行',t=>{const f=fixture(t);f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[{...f.row,mobileMinTextPx:9}]});f.put('remotion/word-reveal-plan.json',{...f.words,events:[{...f.words.events[0],text:'消费'}]});const check=checkNativeGovernance(f.project);assert.ok(check.issues.some(i=>i.code==='NATIVE_LAYOUT_REQUIRED'));assert.ok(check.issues.some(i=>i.code==='NATIVE_WORD_COVERAGE'));});
test('原卡音效随动作驻留迁移，不能提前在旧的相对秒数播放',t=>{const {row}=fixture(t);assert.equal(outputFrameForNativeFrame(row.timeline,44),44);assert.equal(outputFrameForNativeFrame(row.timeline,45),255);assert.equal(outputFrameForNativeFrame(row.timeline,89),299);assert.throws(()=>outputFrameForNativeFrame(row.timeline,90),/未被/);});

test('无效对象生成明确检查失败，不能让页面状态读取崩溃',t=>{
 const f=fixture(t);f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[null,{...f.row,textFields:[null],timeline:[null]}]});
 f.put('remotion/word-reveal-plan.json',{...f.words,events:[null,...f.words.events]});
 const report=checkNativeGovernance(f.project);assert.equal(report.passed,false);assert.ok(report.issues.some(i=>i.code==='NATIVE_PLAN_INVALID'));
});

test('金句卡配置关键词色时必须有原生强调标记',t=>{
 const f=fixture(t);
 const putLines=lines=>f.put('remotion/shots.json',[{id:'s01',start:0,end:10,shotCard:'quote-card',templateParams:{cardProps:{lines,kwColor:'#1a4a8a'}}}]);
 f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[{...f.row,cardId:'quote-card',textFields:[{key:'lines',visibility:'visible'}]}]});
 f.put('remotion/word-reveal-plan.json',{...f.words,events:[{...f.words.events[0],field:'lines'}]});
 putLines('消费预期');
 assert.ok(checkNativeGovernance(f.project).issues.some(i=>i.code==='NATIVE_KEYWORD_UNUSED'));
 putLines('**消费预期**');
 assert.ok(!checkNativeGovernance(f.project).issues.some(i=>i.code==='NATIVE_KEYWORD_UNUSED'));
});

test('锚点词 DSL 只按可见文案校验，不要求时间与样式列出现在画面',()=>{
 const card={policy:{dsl:{stepsDsl:{syntax:'anchored-words'}}}};
 assert.equal(governedVisibleText(card,'stepsDsl','经济冷了|1.2|#fff\n央行降息|2.4|#000'),'经济冷了央行降息');
});

test('正式字级编译入口未显式传目录时也使用同一已审DSL规则',t=>{
 const f=fixture(t),words='很多|0.00\n国际|0.72\n大奖|1.02|serif\n听着|1.36\n宏大|1.52|color';
 f.put('source-run.json',{runId:f.id,pipeline:'video-talkcraft'});
 f.put('remotion/shots.json',[{id:'s01',start:0,end:10,shotCard:'type-contrast-emphasis',templateParams:{cardProps:{words}}}]);
 f.put('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[{...f.row,cardId:'type-contrast-emphasis',nativeFrames:67,textFields:[{key:'words',visibility:'visible'}],timeline:[
  {kind:'motion',fromFrame:0,toFrame:33,nativeFromFrame:0,nativeToFrame:33},
  {kind:'hold',fromFrame:34,toFrame:266,nativeFromFrame:33,nativeToFrame:33,reason:'保留完整内容'},
  {kind:'motion',fromFrame:267,toFrame:299,nativeFromFrame:34,nativeToFrame:66}]}]});
 f.put('remotion/word-reveal-plan.json',{...f.words,events:[{...f.words.events[0],field:'words',text:'很多国际大奖听着宏大'}]});
 const result=checkNativeGovernance(f.project);assert.equal(result.passed,true,JSON.stringify(result.issues));
 f.put('remotion/word-reveal-plan.json',{...f.words,events:[{...f.words.events[0],field:'words',text:'很多国际大奖'}]});
 assert.ok(checkNativeGovernance(f.project).issues.some(i=>i.code==='NATIVE_WORD_COVERAGE'));
});
