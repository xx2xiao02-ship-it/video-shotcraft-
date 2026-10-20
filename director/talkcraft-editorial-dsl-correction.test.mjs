import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEditorialAnchorScope,editorialAnchorModelScope} from './talkcraft-editorial-anchor-scope.mjs';
import {proposeEditorialDslCorrection,approveEditorialDslCorrection,executeEditorialDslCorrection} from './talkcraft-editorial-dsl-correction.mjs';
test('任意新任务镜号：仅同句原文证明的误拆DSL可无损归位，重复执行幂等',()=>{
 const id='new-shot-42',text='所有人相信物价稳定';
 const scope=buildEditorialAnchorScope({shotId:id,firstSentence:0,lastSentence:0,sentences:[{text}],inputSha256:'new-task',includeTiming:false});
 const ref=editorialAnchorModelScope(scope,id).sentences[0].sentenceRef;
 const request={requestId:'new-request',editableShotIds:[id],windows:[{shotId:id,anchorScope:scope,choices:[{choiceId:'this-card',slug:'source-chapter'}]}]};
 const catalog={cards:[{cardId:'source-chapter',policy:{dsl:{rows:{syntax:'chapter'}}}}]};
 const raw={requestId:request.requestId,repairs:[{shotId:id,choiceId:'this-card',templateParams:{cardProps:{rows:'所|有人相信物价稳定|current'}},nativePresentation:{wordEvents:[{field:'rows',role:'spoken',text,sentenceRef:ref,fromOffset:0,throughOffset:[...text].length-1}]}}]};
 const before=structuredClone(raw),plan=proposeEditorialDslCorrection(raw,request,catalog);
 assert.equal(plan.changes.length,1);const approval=approveEditorialDslCorrection(plan,raw,request,catalog);
 const fixed=executeEditorialDslCorrection(plan,approval,raw,request,catalog);
 assert.equal(fixed.repairs[0].templateParams.cardProps.rows,'01|所有人相信物价稳定|current');
 assert.deepEqual(raw,before);assert.deepEqual(fixed.repairs[0].nativePresentation,raw.repairs[0].nativePresentation);
 assert.equal(proposeEditorialDslCorrection(fixed,request,catalog).changes.length,0);
 for(const mutate of [r=>r.repairs[0].choiceId='foreign',r=>r.repairs[0].shotId='other-shot',
  r=>r.repairs[0].templateParams.cardProps.rows='01|有人相信物价稳定|current',
  r=>r.repairs[0].nativePresentation.wordEvents[0].sentenceRef='foreign',
  r=>r.repairs[0].nativePresentation.wordEvents[0].text='不同文案',
  r=>r.repairs[0].templateParams.cardProps.rows='所|不同文案|current']){
   const bad=structuredClone(raw);mutate(bad);assert.equal(proposeEditorialDslCorrection(bad,request,catalog).changes.length,0);
 }
 const tampered=structuredClone(plan);tampered.changes[0].after='|编造文案|current';
 assert.equal(approveEditorialDslCorrection(tampered,raw,request,catalog).approved,false);
 assert.throws(()=>executeEditorialDslCorrection(tampered,approval,raw,request,catalog),/审批/);
 assert.equal(proposeEditorialDslCorrection(raw,request,{cards:[{...catalog.cards[0],policy:{dsl:{rows:{syntax:'unknown'}}}}]}).changes.length,0);
});
