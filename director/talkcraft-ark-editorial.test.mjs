import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertEditorialGenerationState,auditEditorialProposal,validateEditorial,bindEditorialTiming,checkEditorial,recoverCachedEditorial,checkEditorialSelectionInput,compactTalkcraftEditorialCatalog,repairInvalidSemanticLabels,editorialShotSemantics,assertEditorialShotDeviationSemantics} from './talkcraft-ark-editorial.mjs';
import {saveEditorialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {loadTalkcraftGovernedCatalog,talkcraftEditorialContract} from './talkcraft-governed-contract.mjs';

test('精简火山提示词仍覆盖全部卡片和必填参数契约', () => {
  const index=JSON.parse(readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8'));
  const catalog=loadTalkcraftGovernedCatalog(index);
  const full=talkcraftEditorialContract(catalog);
  const compact=compactTalkcraftEditorialCatalog(index,catalog);
  assert.deepEqual(compact.cards.map(card=>card.slug),index.cards.map(card=>card.slug));
  assert.deepEqual(compact.contracts.map(card=>card.slug),full.cards.map(card=>card.slug));
  for (let i=0;i<full.cards.length;i++) {
    assert.deepEqual(compact.contracts[i].required,full.cards[i].required);
    assert.deepEqual(compact.contracts[i].fields.map(field=>field.key),
      full.cards[i].fields.filter(field=>full.cards[i].required.includes(field.key)||field.writable&&field.role!=='media').map(field=>field.key));
    assert.deepEqual(compact.contracts[i].media,full.cards[i].media);
    assert.deepEqual(compact.contracts[i].mediaAlternatives,full.cards[i].mediaAlternatives);
    assert.deepEqual(compact.contracts[i].capabilities,full.cards[i].capabilities);
    assert.deepEqual(compact.contracts[i].dsl,full.cards[i].dsl);
    assert.deepEqual(compact.contracts[i].allowedBusinessKeys,full.cards[i].fields.filter(f=>f.writable&&f.role!=='media').map(f=>f.key));
    assert.deepEqual(compact.contracts[i].frozenKeys,full.cards[i].fields.filter(f=>!f.writable).map(f=>f.key));
  }
  // All writable fields carry labels as well as types: text labels often define
  // index-list/DSL semantics. Omit parser bodies and full demos, never those labels.
  for(const card of compact.cards){
    const original=index.cards.find(c=>c.slug===card.slug);
    assert.equal(card.oneliner,original.oneliner||'');
    assert.equal(card.position,original.position||'任意');
    assert.equal(card.energy,original.energy||null);
  }
  assert.ok(compact.cards.find(c=>c.slug==='keyword-pop-highlight').usage.includes('信息峰值')); 
});

const semantics = {sentences:[{i:0,text:'第一句。'},{i:1,text:'第二句。'}]};
const aligned = [{start:0,end:2},{start:2,end:5}];
const vocab = new Set(['强调']);

test('偏离理由只允许使用本镜主语义和不分主次的硬语义',()=>{
  const sentences=[
    {i:0,text:'很多国际大奖，',sem:['例证'],weight:'main'},
    {i:1,text:'听着宏大，',sem:['对比'],weight:'sub'},
    {i:2,text:'请关注。',sem:['号召'],weight:'sub'}];
  const shot={id:'s02',firstSentence:0,lastSentence:2,templateParams:{semanticDeviations:{例证:'突出具体奖项语境',号召:'保留结尾行动提示'}}};
  assert.deepEqual([...editorialShotSemantics(sentences,shot)],['例证','号召']);
  assert.equal(assertEditorialShotDeviationSemantics([shot],sentences).passed,true);
  shot.templateParams.semanticDeviations={引用:'没有外部引用文献'};
  assert.throws(()=>assertEditorialShotDeviationSemantics([shot],sentences),/s02.*实际候选语义.*例证.*引用/u);
  shot.templateParams.semanticDeviations={例证:'突出具体奖项语境',引用:'不属于本镜的旧记录'};
  const audit=assertEditorialShotDeviationSemantics([shot],sentences);
  assert.deepEqual(audit.shots[0].matched,['例证']);assert.deepEqual(audit.shots[0].invalid,['引用']);
});

test('04提案不能用全局词表中的其他语义绕过本镜语义检查',()=>{
  const value={sentences:[{i:0,text:'第一句。',sem:['强调'],need:['强调'],entities:[],weight:'main'},
    {i:1,text:'第二句。',sem:['对比'],need:['对比'],entities:[],weight:'sub'}],
    shots:[{id:'s01',firstSentence:0,lastSentence:1,intent:'强调第一句',visual:'主体展示',
      templateParams:{semanticDeviations:{对比:'借用第二句对比理由'}}}]};
  assert.throws(()=>validateEditorial(value,semantics,aligned,new Set(['强调','对比'])),/本镜实际候选语义.*强调.*对比/u);
});

test('局部编译只原样保留锁定镜头历史理由，修改镜仍严格校验且不能串改锁定内容',()=>{
  const base={sentences:[{i:0,text:'第一句。',sem:['强调'],need:[],entities:[],weight:'main'},
    {i:1,text:'第二句。',sem:['强调'],need:[],entities:[],weight:'main'}],shots:[
    {id:'s01',firstSentence:0,lastSentence:0,intent:'第一观点',visual:'原图形',templateParams:{semanticDeviations:{强调:'突出第一句重点',对比:'原有历史理由'}}},
    {id:'s02',firstSentence:1,lastSentence:1,intent:'第二观点',visual:'新图形',templateParams:{semanticDeviations:{强调:'针对第二句重点'}}}]};
  const contract={editableShotIds:['s02'],baseProposal:structuredClone(base)};
  const request={...contract,requestId:createHash('sha256').update(JSON.stringify(contract)).digest('hex')};
  const words=new Set(['强调','对比']);
  assert.throws(()=>validateEditorial(base,semantics,aligned,words),/语义偏离/u);
  assert.doesNotThrow(()=>validateEditorial(base,semantics,aligned,words,{selectionRequest:request}));
  for(const mutate of [r=>r.shots[0].visual='修改锁定画面',r=>r.sentences[0].sem=['对比'],
    r=>r.shots[0].templateParams.semanticDeviations={对比:'只剩错误历史理由'}]){
    const changed=structuredClone(base);mutate(changed);
    assert.throws(()=>validateEditorial(changed,semantics,aligned,words,{selectionRequest:request}),/锁定/u);
  }
  const invalid=structuredClone(base);invalid.shots[1].templateParams.semanticDeviations.对比='修订镜新增错误理由';
  assert.throws(()=>validateEditorial(invalid,semantics,aligned,words,{selectionRequest:request}),/语义偏离/u);
  const allWrong=structuredClone(base);allWrong.shots[0].templateParams.semanticDeviations={对比:'完全错误旧理由'};
  const c={editableShotIds:['s02'],baseProposal:structuredClone(allWrong)};
  const q={...c,requestId:createHash('sha256').update(JSON.stringify(c)).digest('hex')};
  assert.throws(()=>validateEditorial(allWrong,semantics,aligned,words,{selectionRequest:q}),/实际候选语义/u);
});

test('已有分镜复检失败会撤销旧04完成状态供前后端同步',t=>{
  const {root,runId}=savedEditorial(t),project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  const completion=path.join(project,'qa/editorial-completion.json');
  writeFileSync(completion,JSON.stringify({schema:'talkcraft-editorial-completion-v1',passed:true,binding:{}}));
  const current=JSON.parse(readFileSync(path.join(project,'remotion/shots.json')));
  current[0].templateParams.semanticDeviations={引用:'挪用其他语义理由'};
  writeFileSync(path.join(project,'remotion/shots.json'),JSON.stringify(current));
  assert.throws(()=>checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:()=>({passed:true})}),/实际候选语义/u);
  const report=JSON.parse(readFileSync(completion));
  assert.equal(report.passed,false);assert.equal(report.previousPassed,true);assert.match(report.message,/实际候选语义/u);
  const feedback=JSON.parse(readFileSync(path.join(project,'qa/editorial-repair-feedback.json')));
  assert.equal(feedback.failedChecks[0].code,'SHOT_SEMANTIC_DEVIATION_MISMATCH');
});

test('03已通过的语义标注不能冒充已有分镜，未通过或输入过期仍阻断',t=>{
  const project=mkdtempSync(path.resolve('tmp/editorial-semantic-only-'));
  t.after(()=>rmSync(project,{recursive:true,force:true}));
  writeFileSync(path.join(project,'semantic-decisions.json'),'{"sentences":[]}');
  assert.doesNotThrow(()=>assertEditorialGenerationState(project,{semanticPassed:true}));
  for(const semanticPassed of [false,undefined])
    assert.throws(()=>assertEditorialGenerationState(project,{semanticPassed}),/03校验/);
  assert.equal(readFileSync(path.join(project,'semantic-decisions.json'),'utf8'),'{"sentences":[]}');
});

test('实际SHOTBOOK或镜头文件仍独立阻止重复生成，不受语义通过影响',t=>{
  for(const name of ['SHOTBOOK.md','remotion/shots.json']){
    const project=mkdtempSync(path.resolve('tmp/editorial-existing-shots-'));
    t.after(()=>rmSync(project,{recursive:true,force:true}));
    mkdirSync(path.join(project,'remotion'),{recursive:true});
    writeFileSync(path.join(project,name),'保留已有成果');
    assert.throws(()=>assertEditorialGenerationState(project,{semanticPassed:true}),/已有分镜/);
    assert.equal(readFileSync(path.join(project,name),'utf8'),'保留已有成果');
  }
});
test('免费分镜恢复缺少缓存时明确停止，不能退回外部模型生成', t => {
  const root=mkdtempSync(path.resolve('tmp/recovery-no-cache-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const runId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  mkdirSync(path.join(root,'director/b-mode-runs',runId,'talkcraft'),{recursive:true});
  writeFileSync(path.join(root,'director/b-mode-runs',runId,'talkcraft/source-run.json'),JSON.stringify({runId}));
  let requests=0;
  assert.throws(()=>recoverCachedEditorial(root,runId,{call:async()=>{requests++;}}),/没有已保存的分镜结果/);
  assert.equal(requests,0);
});
const valid = () => ({sentences:semantics.sentences.map((s,i) => ({...s,sem:['强调'],need:['强调'],entities:[],weight:i ? 'sub' : 'main'})),
  shots:[{id:'s01',firstSentence:0,lastSentence:1,intent:'同一观点',visual:'主体延续，第二句强调关键点',start:999,end:1000}]});

test('提案集中校验复用正式模板规则，一次呈现非法需求、重复模板和容量失败且不修改模型结果',()=>{
  const catalog=loadTalkcraftGovernedCatalog(JSON.parse(readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8')));
  const value=valid();value.sentences[0].need=['机制'];value.sentences[1].need=['步骤'];
  value.shots=[0,1].map(i=>({id:`s0${i+1}`,firstSentence:i,lastSentence:i,shotCard:'per-character-rise',
    templateParams:{cardProps:{text:'保留原字'}},nativePresentation:{holdAtNativeFrame:60,holdReason:'主体仍可见'}}));
  const before=structuredClone(value);
  const report=auditEditorialProposal(value,{semantics,aligned:[{start:0,end:1},{start:1,end:2}],vocab,catalog,projectRoot:process.cwd()});
  assert.deepEqual(value,before);assert.equal(report.passed,false);
  assert.equal(report.issues.filter(i=>i.code==='NEED_VOCAB').length,2);
  assert.equal(report.issues.filter(i=>i.code==='NATIVE_EDITORIAL_PLAN').length,2);
  assert.equal(report.issues.filter(i=>i.code==='template_window_reuse').length,1);
});

test('提案结构通过仍不冒充素材、实帧及用户验收，未知字段继续由正式契约拒绝',t=>{
  const catalog=loadTalkcraftGovernedCatalog(JSON.parse(readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8')));
  const sentence={i:0,text:'原句',sem:['强调'],need:['强调'],weight:'main',entities:[]};
  const value={sentences:[sentence],shots:[{id:'s01',firstSentence:0,lastSentence:0,shotCard:'per-character-rise',
    templateParams:{cardProps:{text:'原句'}},nativePresentation:{holdAtNativeFrame:60,holdReason:'主体仍可见',
      textFields:[{key:'text',visibility:'visible'}],wordEvents:[{field:'text',text:'原句',sentenceIndex:0,anchor:'原句',role:'spoken'}]}}]};
  const projectRoot=mkdtempSync(path.resolve('.tmp/editorial-proposal-clock-'));
  t.after(()=>rmSync(projectRoot,{recursive:true,force:true}));
  mkdirSync(path.join(projectRoot,'remotion'),{recursive:true});
  writeFileSync(path.join(projectRoot,'remotion/timing.json'),JSON.stringify({scenes:[{id:'s1',text:'原句',chars:[{ch:'原',t:0,e:.1},{ch:'句',t:.1,e:.2}]}]}));
  const options={semantics:{sentences:[{i:0,text:'原句'}]},aligned:[{start:0,end:3}],vocab,catalog,projectRoot};
  const report=auditEditorialProposal(value,options);
  assert.equal(report.passed,true);assert.equal(report.productionAdmitted,false);
  assert.equal(report.runtimeVerified,false);assert.equal(report.userAcceptance,false);
  const noText=structuredClone(value);noText.shots[0].nativePresentation.textFields=[];
  assert.ok(auditEditorialProposal(noText,options).issues.some(i=>i.code==='NATIVE_EDITORIAL_PLAN'&&i.message.includes('真实锚词')));
  value.shots[0].templateParams.cardProps.notARegisteredField='不允许';
  assert.equal(auditEditorialProposal(value,options).passed,false);
});

test('附加非法语义可本地移除，保留原文、合法标注与全部镜头设计',()=>{
  const value=valid(); value.sentences[0].sem.push('现象');
  const before=structuredClone(value);
  const repairs=repairInvalidSemanticLabels(value,vocab);
  assert.deepEqual(value,valid());
  assert.deepEqual(value.shots,before.shots);
  assert.deepEqual(repairs,[{sentenceIndex:0,from:'现象',to:null,reason:'删除词表外的附加标签，保留模型已有合法语义'}]);
  assert.doesNotThrow(()=>validateEditorial(value,semantics,aligned,vocab));
  assert.deepEqual(repairInvalidSemanticLabels(value,vocab),[]);
});

test('全部语义非法或非数组时仍然阻断，不能以猜测或空标注通过',()=>{
  for (const sem of [['现象'],[],null,'强调']) {
    const value=valid(); value.sentences[0].sem=sem;
    assert.deepEqual(repairInvalidSemanticLabels(value,vocab),[]);
    assert.deepEqual(value.sentences[0].sem,sem);
    assert.throws(()=>validateEditorial(value,semantics,aligned,vocab));
  }
});

function savedEditorial(t) {
  const root=mkdtempSync(path.resolve('tmp/auto-preflight-test-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const runId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  for (const dir of ['qa','audio','remotion']) mkdirSync(path.join(project,dir),{recursive:true});
  writeFileSync(path.join(project,'input.txt'),semantics.sentences.map(s=>s.text).join(''));
  writeFileSync(path.join(project,'aligned-sentences.json'),JSON.stringify(aligned));
  for (const [name,data] of Object.entries({'source-run.json':{runId},'semantics.json':semantics,
    'qa/ark-editorial-response.json':valid(),'audio/timestamps.json':{sentences:semantics.sentences.map((s,i) => ({...s,start:i*2}))},
    'remotion/shots.json':validateEditorial(valid(),semantics,aligned,vocab).map(s=>({...s,shotCard:'impact-open-title',templateParams:{cardProps:{lineStart:'原稿',lastWord:'重点',sub:'基于真实输入'}}}))}))
    writeFileSync(path.join(project,name),JSON.stringify(data));
  return {root,runId};
}
test('正式免费输入检查复用发送器，重复检查不消耗授权、不改缓存或节点；过期反馈不回退',t=>{
  const {root,runId}=savedEditorial(t),project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  unlinkSync(path.join(project,'remotion/shots.json'));
  const texts=['你有没有发现，','很多国际大奖，','听着宏大，','其实距离普通人很远。'];
  const a=[{start:0,end:2.36},{start:2.36,end:3.745},{start:3.745,end:4.805},{start:4.805,end:7.07}].map((r,i)=>({...r,text:texts[i]}));
  const sentences=texts.map((text,i)=>({i,text,sem:['例证'],need:[],weight:i===2?'sub':'main'}));
  const proposal={sentences,shots:[{id:'s01',firstSentence:0,lastSentence:0,subject:'other',shotCard:'impact-open-title'},
    {id:'s02',firstSentence:1,lastSentence:2,subject:'person',shotCard:'motion-blur-slam-in'},
    {id:'s03',firstSentence:3,lastSentence:3,subject:'other',shotCard:'per-character-rise'}],materialResearch:{shots:[{shotId:'s02',research:[]}]},
    editorialSelectionRejection:{issues:[{code:'EDITORIAL_WORD_EVENT_SCOPE',shotId:'s02',message:'后句被借用'}]}};
  const files={'input.txt':texts.join(''),'aligned-sentences.json':JSON.stringify(a),'semantics.json':JSON.stringify({sentences}),
    'remotion/timing.json':JSON.stringify({scenes:texts.map((text,i)=>({id:`s${i+1}`,text,
      chars:[...text].map((ch,k)=>({ch,t:a[i].start+k*.04,e:a[i].start+k*.04+.03}))}))}),
    'audio/timestamps.json':JSON.stringify({sentences:a.map(r=>({...r,ok:true,match:1}))}),
    'qa/ark-editorial-response.json':JSON.stringify(proposal),'qa/rebuild-inputs.json':JSON.stringify({personWindows:[{start:2.36,end:4.805}]}),
    'qa/editorial-submission-authorization.json':'保留已有费用授权记录','qa/editorial-completion.json':JSON.stringify({passed:false}),
    'audio/full.mp3':'保留既有配音数据'};
  for(const [name,value]of Object.entries(files))writeFileSync(path.join(project,name),value);
  saveEditorialRepairFeedback(project,proposal,{issues:proposal.editorialSelectionRejection.issues});
  for(let i=0;i<2;i++){
    const receipt=checkEditorialSelectionInput(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft')});
    assert.equal(receipt.passed,true);assert.equal(receipt.externalRequests,0);assert.equal(receipt.authorizationConsumed,false);
    assert.equal(receipt.productionAdmitted,false);assert.deepEqual(receipt.editableShotIds,['s02']);
    const input=JSON.parse(readFileSync(path.join(project,receipt.output,'model-input.json')));
    assert.deepEqual(input.windows[0].anchorScope.sentences.map(r=>r.text),texts.slice(1,3));
    assert.ok(!readFileSync(path.join(project,receipt.output,'prompt.txt'),'utf8').includes(texts[3]));
  }
  for(const [name,value]of Object.entries(files))assert.equal(readFileSync(path.join(project,name),'utf8'),value,name);
  assert.equal(existsSync(path.join(project,'remotion/shots.json')),false);
  assert.equal(existsSync(path.join(project,'editorial.lock')),false);
  writeFileSync(path.join(project,'qa/ark-editorial-response.json'),JSON.stringify({...proposal,other:'返回已换轮次'}));
  assert.throws(()=>checkEditorialSelectionInput(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft')}),/完全对应/);
  assert.equal(existsSync(path.join(project,'editorial.lock')),false);
});
test('局部修订被拒绝后正式免费恢复仍阻断，不能套回旧底稿通过或修改语义',async t=>{
  const {root,runId}=savedEditorial(t),project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  unlinkSync(path.join(project,'remotion/shots.json'));
  writeFileSync(path.join(project,'aligned-sentences.json'),JSON.stringify(aligned));
  writeFileSync(path.join(project,'audio/timestamps.json'),JSON.stringify({sentences:semantics.sentences.map((s,i)=>
    ({...s,...aligned[i],ok:true,match:1}))}));
  const responseFile=path.join(project,'qa/ark-editorial-response.json');
  const result=JSON.parse(readFileSync(responseFile));
  result.editorialSelectionRejection={issues:[{code:'EDITORIAL_REPAIR_SELECTION_INVALID',message:'s15选择不兼容方案'}]};
  writeFileSync(responseFile,JSON.stringify(result));
  const before=readFileSync(path.join(project,'semantics.json')),cached=readFileSync(responseFile);let stages=0;
  await assert.rejects(()=>recoverCachedEditorial(root,runId,{stage:()=>{stages++;}}),/s15选择不兼容方案/);
  assert.equal(stages,0);assert.deepEqual(readFileSync(responseFile),cached);
  assert.deepEqual(readFileSync(path.join(project,'semantics.json')),before);
  assert.equal(existsSync(path.join(project,'SHOTBOOK.md')),false);
  assert.equal(existsSync(path.join(project,'remotion/shots.json')),false);
});
test('editorial check validates proposal only and never advances candidate or preflight gates', t => {
  const {root,runId}=savedEditorial(t); const calls=[];
  const result=checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:(stage,id) => {assert.equal(id,runId);calls.push(stage);}});
  assert.deepEqual(calls,['semantic-check','semantic-shot-check']);
  assert.equal(result.status,'editorial_checked');assert.equal(result.proposalOnly,true);
});
test('later preflight failure is owned by its own node, not hidden inside editorial check', t => {
  const {root,runId}=savedEditorial(t); const calls=[];
  const result=checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:stage => {
    calls.push(stage); if(stage === 'preflight') throw new Error('missing materials');
  }});
  assert.equal(result.status,'editorial_checked');
  assert.deepEqual(calls,['semantic-check','semantic-shot-check']);
});test('semantic failure stops before automatic preflight', t => {
  const {root,runId}=savedEditorial(t); const calls=[];
  assert.throws(() => checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:stage => {calls.push(stage);throw new Error('invalid semantics');}}),/invalid semantics/);
  assert.deepEqual(calls,['semantic-check']);
});

test('保存分镜中的跨卡参数错误在预检和时间轴写入前被发现',t=>{
  const {root,runId}=savedEditorial(t),calls=[];
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  const file=path.join(project,'remotion/shots.json'),shots=JSON.parse(readFileSync(file));
  shots[0].shotCard='type-contrast-emphasis';writeFileSync(file,JSON.stringify(shots));
  const semanticsFile=path.join(project,'semantics.json'),before=readFileSync(semanticsFile,'utf8');
  assert.throws(()=>checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:s=>calls.push(s)}),/UNKNOWN_FIELD/);
  assert.deepEqual(calls,['semantic-check']);assert.equal(readFileSync(semanticsFile,'utf8'),before);
});

test('编导检查不读取后续预检结果，节点状态由后续预检独立负责',t=>{
  const {root,runId}=savedEditorial(t),calls=[];
  const result=checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:s=>{calls.push(s);return s==='preflight'?{passed:false,issues:['缺少素材']}:undefined;}});
  assert.equal(result.status,'editorial_checked');assert.deepEqual(calls,['semantic-check','semantic-shot-check']);
});
test('镜头归属失败只阻断分镜，逐句校验先完成且不进入预检',t=>{
  const {root,runId}=savedEditorial(t),calls=[];
  assert.throws(()=>checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:s=>{
    calls.push(s);return s==='semantic-shot-check'?{passed:false}:undefined;
  }}),/分镜句子归属校验未通过/);
  assert.deepEqual(calls,['semantic-check','semantic-shot-check']);
});
test('正式 B 管线的原卡动作计划失败由提案节点直接阻断，不写入后续预检报告',t=>{
  const {root,runId}=savedEditorial(t),calls=[];
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  writeFileSync(path.join(project,'source-run.json'),JSON.stringify({runId,pipeline:'video-talkcraft'}));
  writeFileSync(path.join(project,'SHOTBOOK.md'),'# SHOTBOOK\n');
  writeFileSync(path.join(project,'sources.md'),'# Sources\n');
  assert.throws(()=>checkEditorial(root,runId,{skillRoot:path.resolve('_audit/video-talkcraft'),stage:s=>{calls.push(s);return {passed:true};}}),/NATIVE_EDITORIAL_PLAN/);
  assert.deepEqual(calls,['semantic-check']);
  const feedback=JSON.parse(readFileSync(path.join(project,'qa/editorial-repair-feedback.json')));
  assert.equal(feedback.failedChecks[0].code,'NATIVE_EDITORIAL_PLAN');
  assert.equal(existsSync(path.join(project,'qa/preflight-result.json')),false);
});test('semantic timing keeps original precision at shot boundaries', () => {
  const actual=bindEditorialTiming({sentences:[{i:0,text:'第一句。',t:16.641}]},
    {sentences:[{text:'第一句。',start:16.6413046}]},[{id:'s02',firstSentence:0,lastSentence:0}]);
  assert.equal(actual.sentences[0].t,16.6413046);
  assert.equal(actual.sentences[0].shot,'s02');
});
test('Ark editorial derives seconds from saved timing, never model invented seconds', () => {
  const shots = validateEditorial(valid(),semantics,aligned,vocab);
  assert.equal(shots[0].start,0); assert.equal(shots[0].end,5);
});
test('model card binding is preserved and required for new editorial',()=>{
 const value=valid();value.shots[0].shotCard='bar-chart-growth';value.shots[0].templateParams={cardProps:{title:'业务标题',barsData:'原稿|12'}};
 const options={cardSlugs:new Set(['bar-chart-growth'])};
 const shots=validateEditorial(value,semantics,aligned,vocab,options);
 assert.equal(shots[0].shotCard,'bar-chart-growth');assert.equal(shots[0].templateParams.cardProps.title,'业务标题');
 delete value.shots[0].templateParams;assert.throws(()=>validateEditorial(value,semantics,aligned,vocab,options),/禁止本地关键词替代/);
});
test('Ark editorial rejects changed text, missing sentences and unknown semantics', () => {
  for (const mutate of [v => {v.sentences[0].text='改稿';},v => v.sentences.pop(),v => {v.sentences[0].sem=['不存在'];}]) {
    const v=valid(); mutate(v); assert.throws(() => validateEditorial(v,semantics,aligned,vocab));
  }
});
test('Ark editorial rejects missing coverage, overlap and invalid timeline', () => {
  for (const mutate of [v => {v.shots[0].lastSentence=0;},v => {v.shots[0].firstSentence=1;},v => v.shots.push({...v.shots[0],id:'s02'})]) {
    const v=valid(); mutate(v); assert.throws(() => validateEditorial(v,semantics,aligned,vocab));
  }
  assert.throws(() => validateEditorial(valid(),semantics,[{start:0,end:2},{start:2,end:NaN}],vocab));
});

test('重叠句子错误给出具体镜头及真实句序，禁止自动改写覆盖范围',()=>{
  const value=valid();value.shots=[{...value.shots[0],lastSentence:0},{...value.shots[0],id:'s02'}];
  const before=structuredClone(value);
  assert.throws(()=>validateEditorial(value,semantics,aligned,vocab),/s02.*应从第 2 句开始.*第 1–2 句/u);
  assert.deepEqual(value,before);
});


test('04提案在保存前检查全片文字比例；不依赖06且不改模型内容',()=>{
 const catalog=loadTalkcraftGovernedCatalog(JSON.parse(readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8')));
 const rows=Array.from({length:7},(_,i)=>({i,text:'原句',sem:['强调'],need:['强调'],weight:'main',entities:[]}));
 const value={sentences:rows,shots:rows.map((_,i)=>({id:`s${String(i+1).padStart(2,'0')}`,firstSentence:i,lastSentence:i,shotCard:'per-character-rise',templateParams:{cardProps:{text:'原句'}},nativePresentation:{holdAtNativeFrame:60,holdReason:'主体仍可见',textFields:[{key:'text',visibility:'visible'}],wordEvents:[{field:'text',text:'原句',sentenceIndex:i,anchor:'原句',role:'spoken'}]}}))};
 const before=structuredClone(value),options={semantics:{sentences:rows},aligned:rows.map((_,i)=>({start:i*3,end:(i+1)*3})),vocab,catalog,projectRoot:process.cwd()};
 const report=auditEditorialProposal(value,options);
 assert.equal(report.expression.passed,false);assert.equal(report.expression.count,4);
 assert.deepEqual(report.expression.textShotIds,['s04','s05','s06','s07']);
 assert.ok(report.issues.some(i=>i.code==='FILM_TEXT_DOMINANCE'&&i.shotIds.length===4));
 assert.deepEqual(value,before);assert.equal(report.productionAdmitted,false);
});
