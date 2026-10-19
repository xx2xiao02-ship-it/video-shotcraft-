import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditorialAnchorScope,editorialAnchorModelScope,compileEditorialAnchorEvents} from './talkcraft-editorial-anchor-scope.mjs';
import {proposeEditorialPunctuationCorrection,approveEditorialPunctuationCorrection,executeEditorialPunctuationCorrection} from './talkcraft-editorial-punctuation-correction.mjs';
import {proposeEditorialReuseCorrection,approveEditorialReuseCorrection} from './talkcraft-editorial-reuse-correction.mjs';
import {auditTemplateReuse} from './talkcraft-template-governance.mjs';
import {resolveReveal} from './talkcraft-word-reveal.mjs';

function fixture(){
 const scope=buildEditorialAnchorScope({shotId:'s05',firstSentence:0,lastSentence:0,sentences:[{text:'存钱、消费、规划未来，'}],inputSha256:'current',includeTiming:false});
 const sentenceRef=editorialAnchorModelScope(scope,'s05').sentences[0].sentenceRef;
 const event=(field,text,fromOffset,throughOffset)=>({field,text,sentenceRef,fromOffset,throughOffset,role:'spoken',reason:'原句片段'});
 const request={requestId:'current',editableShotIds:['s05'],windows:[{shotId:'s05',anchorScope:scope}]};
 const raw={requestId:'current',repairs:[{shotId:'s05',choiceId:'own',templateParams:{cardProps:{post:'，'}},nativePresentation:{wordEvents:[
   event('pre','存钱、消费、',0,5),event('key','规划未来',6,9),event('post','，',10,10)]}}]};
 return {scope,request,raw};
}
test('本句中间尾标点与独立标点由源文证明修复，审批后执行，严格锚点通过且原文不改',()=>{
 const {scope,request,raw}=fixture(),before=structuredClone(raw);
 const plan=proposeEditorialPunctuationCorrection(raw,request),approval=approveEditorialPunctuationCorrection(plan,raw,request);
 assert.equal(plan.changes.length,2);assert.equal(approval.approved,true);
 const fixed=executeEditorialPunctuationCorrection(raw,request,plan,approval);
 assert.deepEqual(raw,before);assert.deepEqual(fixed.repairs[0].templateParams,raw.repairs[0].templateParams);
 assert.deepEqual(fixed.repairs[0].nativePresentation.wordEvents.map(e=>e.text),raw.repairs[0].nativePresentation.wordEvents.map(e=>e.text));
 assert.equal(compileEditorialAnchorEvents(fixed.repairs[0].nativePresentation.wordEvents,scope,'s05').length,3);
 assert.equal(proposeEditorialPunctuationCorrection(fixed,request).changes.length,0);
 assert.equal(plan.externalRequests,0);assert.equal(approval.productionAdmitted,false);
});
test('跨镜跨句、源文不符、缺父事件、歧义父事件和未知卡字段不能修复',()=>{
 for(const mutate of [r=>r.repairs[0].nativePresentation.wordEvents[2].sentenceRef+='old',
 r=>r.repairs[0].nativePresentation.wordEvents[2].text='。',
 r=>r.repairs[0].nativePresentation.wordEvents.splice(1,1),
 r=>r.repairs[0].nativePresentation.wordEvents.splice(2,0,structuredClone(r.repairs[0].nativePresentation.wordEvents[1])),
 r=>r.repairs[0].templateParams.cardProps.post='不同']){
  const {request,raw}=fixture();mutate(raw);
  assert.equal(proposeEditorialPunctuationCorrection(raw,request).changes.filter(c=>c.evidence.kind==='exact-source-adjacent-punctuation').length,0);
 }
});
test('审批拒绝篡改方案、原响应或合同，执行不能绕过审批',()=>{
 const {request,raw}=fixture(),plan=proposeEditorialPunctuationCorrection(raw,request),approval=approveEditorialPunctuationCorrection(plan,raw,request);
 const forged=structuredClone(plan);forged.changes[0].replacement.fromOffset=6;
 assert.equal(approveEditorialPunctuationCorrection(forged,raw,request).approved,false);
 assert.throws(()=>executeEditorialPunctuationCorrection(raw,request,forged,approval),/审批/);
 const changed=structuredClone(raw);changed.repairs[0].intent='different';
 assert.equal(approveEditorialPunctuationCorrection(plan,changed,request).approved,false);
 assert.equal(approveEditorialPunctuationCorrection(plan,raw,{...request,extra:'different'}).approved,false);
});
test('独立标点沿用唯一源文锚点的真实时钟，渲染解析不再次误拒；任意标点及歧义仍拒绝',()=>{
 const {scope,request,raw}=fixture(),plan=proposeEditorialPunctuationCorrection(raw,request);
 const fixed=executeEditorialPunctuationCorrection(raw,request,plan,approveEditorialPunctuationCorrection(plan,raw,request));
 const events=compileEditorialAnchorEvents(fixed.repairs[0].nativePresentation.wordEvents,scope,'s05');
 const text=scope.sentences[0].text,timing={scenes:[{id:'s1',chars:[...text].map((ch,i)=>({ch,t:i/10,e:i/10+0.05}))}]};
 const beat={id:'s05',card:'ink-underline',startFrame:0,endFrame:90};
 const event={...events.at(-1),id:'punctuation',sentence:'s1'};
 const resolved=resolveReveal(timing,beat,event);assert.equal(resolved.spokenSec,0.9);assert.equal(resolved.globalFrame,27);
 assert.equal(resolved.text,'，');
 assert.throws(()=>resolveReveal(timing,beat,{...event,text:'。'}),/标点/);
 assert.throws(()=>resolveReveal(timing,beat,{...event,anchor:'存钱'}),/标点/);
 const ambiguous={scenes:[{id:'s1',chars:[...text+'来，'].map((ch,i)=>({ch,t:i/10,e:i/10+0.05}))}]};
 assert.throws(()=>resolveReveal(ambiguous,beat,event),/标点/);
});
test('重复选卡按完整冲突分量联合提案，不换卡、不编承接、不把候选当完整设计',()=>{
 const ids=['s05','s12','s16','s20','s22','s23'];
 const request={requestId:'current',editableShotIds:ids,baseProposal:{shots:ids.map(id=>({id}))},windows:ids.map(id=>({shotId:id,choices:[
  {choiceId:id,slug:['s12','s16'].includes(id)?'line-by-line-slide':'ink-underline'},
  {choiceId:id+'alternate',slug:'soft-blur-in'}]}))};
 const raw={requestId:'current',repairs:ids.map(shotId=>({shotId,choiceId:shotId,templateParams:{}}))},before=structuredClone(raw);
 const plan=proposeEditorialReuseCorrection(raw,request),approval=approveEditorialReuseCorrection(plan,raw,request);
 assert.equal(plan.groups.length,2);assert.equal(plan.groups.flatMap(g=>g.conflicts).length,7);
 assert.equal(plan.groups.find(g=>g.shotIds.includes('s05')).shotIds.length,4);
 assert.equal(approval.approved,true);assert.equal(approval.allowProvider,false);assert.equal(approval.allowAutomaticReplacement,false);
 assert.deepEqual(raw,before);assert.equal(auditTemplateReuse(ids.map(id=>({id,shotCard:request.windows.find(w=>w.shotId===id).choices[0].slug}))).length,7);
 const forged=structuredClone(plan);forged.groups.pop();assert.equal(approveEditorialReuseCorrection(forged,raw,request).approved,false);
 assert.equal(approveEditorialReuseCorrection(plan,{...raw,requestId:'old'},request).approved,false);
});
