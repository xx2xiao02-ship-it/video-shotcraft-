import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {auditEditorialTiming,editorialTimingDesignContract} from './talkcraft-editorial-timing-contract.mjs';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {textEffectContract,checkTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import {proposeDependencyTimeline} from './talkcraft-dependency-timeline.mjs';
import {nativeEditorialTimeline} from './talkcraft-editorial-native-plan.mjs';
import {resolveReveal} from './talkcraft-word-reveal.mjs';
import {createHash} from 'node:crypto';
import {savePlanningEditorialRepairFeedback,preserveCandidateMaterialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
const catalog=loadTalkcraftGovernedCatalog(JSON.parse(fs.readFileSync('_audit/video-talkcraft/references/cards-index.json')));
const cases=[
 ['chip-grid-single-select',{question:'消费选择',options:'消费\n储蓄',selected:2,equation:'储蓄'},'options','消费'],
 ['chapter-progress-list',{headText:'稳定预期',rows:'稳定收入|current'},'rows','稳定收入'],
 ['quote-bracket-pull',{keyText:'普通人'},'keyText','普通人'],
 ['danmu-bubble-praise',{bubbles:'个人\n经济',lead:.4},'bubbles','经济'],
 ['numbered-step-stack',{stepsDsl:'看新闻\n换视角'},'stepsDsl','换视角']
];
function fixture(t,id,cardId,props,field,text,late){
 const project=fs.mkdtempSync(path.resolve('.tmp/new-generation-timing-'));
 t.after(()=>fs.rmSync(project,{force:true,recursive:true}));
 fs.mkdirSync(path.join(project,'remotion/src'),{recursive:true});
 const card=catalog.cards.find(c=>c.cardId===cardId),n=card.duration.frames;
 // An unrelated task starts at 10 seconds. Its words own the clock; changing
 // the shot ID or global start must not change the rule or reference another run.
 const start=10,textFrame=late?n-12:0;
 const timing={scenes:[{id:'s1',text,chars:[...text].map((ch,i)=>({ch,t:start+textFrame/30+i*.01,e:start+textFrame/30+i*.01+.008}))}]};
 const bytes=JSON.stringify(timing);
 for(const file of ['remotion/timing.json','remotion/src/timing.json'])fs.writeFileSync(path.join(project,file),bytes);
 const events=[];
 // Bind all prior list entries so the production field index is real.
 const list=String(props[field]||text).split('\n').map(value=>value.split('|')[0]);
 for(const [i,value]of list.entries())events.push({field,text:value,sentenceIndex:0,anchor:text,
  role:value===text?'spoken':'context',...(value===text?{}:{reason:'同句明确的背景标签'})});
 const result={sentences:[{text}],shots:[{id,shotCard:cardId,subject:'person',firstSentence:0,lastSentence:0,
  templateParams:{cardProps:props},nativePresentation:{textFields:[{key:field,visibility:'visible'}],wordEvents:events}}]};
 return {result,options:{aligned:[{start,end:start+n/30}],catalog,projectRoot:project},bytes,project};
}
test('不同新任务和镜号使用同源生成合同，不借用演示文本或当前任务内容',()=>{
 for(const card of catalog.cards){
  const contract=editorialTimingDesignContract(card);
  assert.equal(contract.nativeFrames,card.duration.frames);
  assert.deepEqual(contract.reference,textEffectContract(card.cardId,Object.fromEntries(card.fields.map(f=>[f.key,f.default])),card.duration.frames));
  assert.equal(contract.referenceOnly,true);
  assert.equal(contract.rules.textReadableFrames,3);
  assert.ok(!JSON.stringify(contract.reference).includes('text":"'));
 }
});
test('新任务在正式生成接纳前一次发现五类晚锚点错误，结果和时钟不变',t=>{
 for(const [i,[card,props,field,text]]of cases.entries()){
  for(const id of ['fresh-'+i,'another-task-'+(90+i)]){
   const f=fixture(t,id,card,props,field,text,true),before=structuredClone(f.result);
   const report=auditEditorialTiming(f.result,f.options);
   assert.equal(report.passed,false,card);
   assert.ok(report.issues.some(x=>x.shotId===id&&['NATIVE_TEXT_WINDOW_MISMATCH','TEXT_EFFECT_DEPENDENCY_EARLY'].includes(x.code)),JSON.stringify(report));
   assert.deepEqual(f.result,before);
   assert.equal(fs.readFileSync(path.join(f.project,'remotion/timing.json'),'utf8'),f.bytes);
   assert.equal(fs.existsSync(path.join(f.project,'remotion/native-presentation.json')),false);
  }
 }
});
test('合法源字级计划可编译；不一致时钟和缺失时间轴不得宣称通过',t=>{
 const f=fixture(t,'new-legal','quote-bracket-pull',{keyText:'普通人'},'keyText','普通人',false);
 assert.equal(auditEditorialTiming(f.result,f.options).passed,true);
 fs.writeFileSync(path.join(f.project,'remotion/src/timing.json'),'{}');
 assert.ok(auditEditorialTiming(f.result,f.options).issues.some(i=>i.code==='EDITORIAL_TIMING_SOURCE_REQUIRED'));
 fs.unlinkSync(path.join(f.project,'remotion/timing.json'));fs.unlinkSync(path.join(f.project,'remotion/src/timing.json'));
 assert.equal(auditEditorialTiming(f.result,f.options).passed,false);
});
test('完整新任务一次汇总全部问题镜，不在首个时序错误处退出',t=>{
 const inputs=cases.map(([card,props,field,text],i)=>fixture(t,'joint-new-'+i,card,props,field,text,true));
 const result={sentences:[],shots:[]},aligned=[],scenes=[];let frame=300;
 for(const [i,f]of inputs.entries()){
  const scene=JSON.parse(f.bytes).scenes[0],shot=structuredClone(f.result.shots[0]);
  const n=f.options.catalog.cards.find(c=>c.cardId===shot.shotCard).duration.frames;
  const delta=frame/30-10;scene.id='s'+(i+1);
  scene.chars=scene.chars.map(c=>({...c,t:c.t+delta,e:c.e+delta}));
  shot.firstSentence=i;shot.lastSentence=i;shot.nativePresentation.wordEvents.forEach(e=>{e.sentenceIndex=i;});
  result.sentences.push(f.result.sentences[0]);result.shots.push(shot);scenes.push(scene);
  aligned.push({start:frame/30,end:(frame+n)/30});frame+=n;
 }
 for(const file of ['remotion/timing.json','remotion/src/timing.json'])fs.writeFileSync(path.join(inputs[0].project,file),JSON.stringify({scenes}));
 const report=auditEditorialTiming(result,{aligned,catalog,projectRoot:inputs[0].project});
 assert.equal(report.passed,false);
 assert.deepEqual([...new Set(report.issues.map(i=>i.shotId))],result.shots.map(s=>s.id));
 assert.equal(report.externalRequests,0);
});
test('同字段多句的免费修正与正式校验共用最后目标，不再只取首句',()=>{
 const shot={id:'unrelated-shot',shotCard:'converging-arrows',templateParams:{cardProps:{focusText:'先后两句',startDelay:.42}}};
 const row={shotId:shot.id,startFrame:0,endFrame:170,nativeFrames:100};
 const reveals={events:[{id:'first',beatId:shot.id,field:'focusText',localFrame:0},{id:'second',beatId:shot.id,field:'focusText',localFrame:50}]};
 const before=structuredClone(reveals),next=proposeDependencyTimeline(shot,row,reveals,{holdAt:80,reason:'完整主体可见阶段'});
 assert.equal(checkTextEffectDependencies([shot],{shots:[next]},reveals).passed,true);
 assert.deepEqual(reveals,before);
});
test('联合修订保留已执行的免费时间修正，仍按原规则复检锁定镜',t=>{
 const f=fixture(t,'preserved-new-shot','ink-underline',{line1Key:'钱包',line2Key:'关联'},'line1Key','钱包关联',false);
 const shot=f.result.shots[0],p=shot.nativePresentation,aligned=[{start:10,end:10+170/30}];
 p.holdAtNativeFrame=90;p.holdReason='完整文字仍可见';
 p.textFields=[{key:'line1Key',visibility:'visible'},{key:'line2Key',visibility:'visible'}];
 p.wordEvents=[{field:'line1Key',text:'钱包',anchor:'钱包',sentenceIndex:0,role:'spoken'},
  {field:'line2Key',text:'关联',anchor:'关联',sentenceIndex:0,role:'spoken'}];
 const timing={scenes:[{id:'s1',text:'钱包关联',chars:[...'钱包关联'].map((ch,i)=>({ch,t:10+[25,27,90,92][i]/30,e:10+([25,27,90,92][i]+1)/30}))}]};
 for(const file of ['remotion/timing.json','remotion/src/timing.json'])fs.writeFileSync(path.join(f.project,file),JSON.stringify(timing));
 const row={shotId:shot.id,cardId:shot.shotCard,startFrame:300,endFrame:470,nativeFrames:109,
  humanLayout:'none',mobileMinTextPx:12,textFields:p.textFields,timeline:nativeEditorialTimeline(170,109,90,p.holdReason)};
 const words=p.wordEvents.map(({sentenceIndex,...e},i)=>({...e,id:`${shot.id}-text-${i+1}`,beatId:shot.id,sentence:'s1'}));
 const reveals={events:words.map(e=>resolveReveal(timing,{id:shot.id,card:shot.shotCard,startFrame:300,endFrame:470},e))};
 const corrected=proposeDependencyTimeline(shot,row,reveals,{holdAt:90,reason:p.holdReason});
 const write=(file,data)=>{const name=path.join(f.project,file);fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,JSON.stringify(data));};
 write('qa/formal-bindings.json',{});write('audio/full.mp3','preserved');
 write('remotion/shots.json',[{...shot,start:10,end:470/30}]);
 write('remotion/native-presentation.json',{schema:'talkcraft-native-presentation-v1',fps:30,shots:[corrected]});
 write('remotion/word-reveal-plan.json',{scope:'native-shots',fps:30,events:words});
 const contract={baseProposal:structuredClone(f.result),editableShotIds:[]};
 const selectionRequest={...contract,requestId:createHash('sha256').update(JSON.stringify(contract)).digest('hex')};
 assert.equal(auditEditorialTiming(f.result,{...f.options,aligned}).passed,false);
 assert.equal(auditEditorialTiming(f.result,{...f.options,aligned,selectionRequest}).passed,true);
 // Exercise the real revision boundary: preparation archives the accepted
 // base and removes its active shot artifacts before the provider returns.
 write('input.txt','当前任务原稿');write('aligned-sentences.json',aligned);
 write('semantics.json',{sentences:f.result.sentences});write('qa/ark-editorial-response.json',f.result);
 const feedback=savePlanningEditorialRepairFeedback(f.project,{passed:false,issues:[{code:'TEXT_EFFECT_DEPENDENCY_EARLY',shotId:shot.id}]});
 const archive=path.join(f.project,'qa/storyboard-revisions/new-task-revision');
 preserveCandidateMaterialRepairFeedback(f.project,archive);
 for(const file of ['remotion/shots.json','remotion/native-presentation.json','remotion/word-reveal-plan.json'])fs.unlinkSync(path.join(f.project,file));
 const archivedContract={baseProposal:feedback.proposal,editableShotIds:[]};
 const archivedRequest={...archivedContract,requestId:createHash('sha256').update(JSON.stringify(archivedContract)).digest('hex')};
 const options={...f.options,aligned,selectionRequest:archivedRequest};
 assert.equal(auditEditorialTiming(feedback.proposal,options).passed,true);
 assert.equal(fs.existsSync(path.join(f.project,'remotion/shots.json')),false,'audit never reinstalls archived business artifacts');
 const prior=fs.readFileSync(path.join(archive,'remotion/word-reveal-plan.json'));
 fs.writeFileSync(path.join(archive,'remotion/word-reveal-plan.json'),'{}');
 assert.equal(auditEditorialTiming(feedback.proposal,options).passed,false,'hash mismatch cannot borrow another snapshot');
 fs.writeFileSync(path.join(archive,'remotion/word-reveal-plan.json'),prior);
 const changed=structuredClone(feedback.proposal);changed.shots[0].intent='different base';
 const changedContract={baseProposal:changed,editableShotIds:[]};
 assert.equal(auditEditorialTiming(changed,{...options,selectionRequest:{...changedContract,
  requestId:createHash('sha256').update(JSON.stringify(changedContract)).digest('hex')}}).passed,false);
 // Return to live evidence for the original anchor-tampering assertion.
 for(const file of ['remotion/shots.json','remotion/native-presentation.json','remotion/word-reveal-plan.json'])fs.copyFileSync(path.join(archive,file),path.join(f.project,file));
 words[0].anchor='关联';write('remotion/word-reveal-plan.json',{scope:'native-shots',fps:30,events:words});
 assert.equal(auditEditorialTiming(f.result,{...f.options,aligned,selectionRequest}).passed,false);
});
