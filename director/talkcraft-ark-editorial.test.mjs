import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {auditEditorialProposal,validateEditorial,bindEditorialTiming,checkEditorial,recoverCachedEditorial,compactTalkcraftEditorialCatalog,repairInvalidSemanticLabels} from './talkcraft-ark-editorial.mjs';
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
      full.cards[i].fields.filter(field=>full.cards[i].required.includes(field.key)).map(field=>field.key));
    assert.deepEqual(compact.contracts[i].media,full.cards[i].media);
    assert.deepEqual(compact.contracts[i].mediaAlternatives,full.cards[i].mediaAlternatives);
    assert.deepEqual(compact.contracts[i].capabilities,full.cards[i].capabilities);
    assert.deepEqual(compact.contracts[i].dsl,full.cards[i].dsl);
    assert.deepEqual(compact.contracts[i].allowedBusinessKeys,full.cards[i].fields.filter(f=>f.writable&&f.role!=='media').map(f=>f.key));
    assert.deepEqual(compact.contracts[i].frozenKeys,full.cards[i].fields.filter(f=>!f.writable).map(f=>f.key));
  }
  // Keep capability constraints in the request even when they cost payload space.
  assert.ok(JSON.stringify(compact).length < (JSON.stringify(index.cards).length+JSON.stringify(full).length)*0.6);
});

const semantics = {sentences:[{i:0,text:'第一句。'},{i:1,text:'第二句。'}]};
const aligned = [{start:0,end:2},{start:2,end:5}];
const vocab = new Set(['强调']);
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

test('提案结构通过仍不冒充素材、实帧及用户验收，未知字段继续由正式契约拒绝',()=>{
  const catalog=loadTalkcraftGovernedCatalog(JSON.parse(readFileSync('_audit/video-talkcraft/references/cards-index.json','utf8')));
  const sentence={i:0,text:'原句',sem:['强调'],need:['强调'],weight:'main',entities:[]};
  const value={sentences:[sentence],shots:[{id:'s01',firstSentence:0,lastSentence:0,shotCard:'per-character-rise',
    templateParams:{cardProps:{text:'原句'}},nativePresentation:{holdAtNativeFrame:60,holdReason:'主体仍可见'}}]};
  const options={semantics:{sentences:[{i:0,text:'原句'}]},aligned:[{start:0,end:3}],vocab,catalog,projectRoot:process.cwd()};
  const report=auditEditorialProposal(value,options);
  assert.equal(report.passed,true);assert.equal(report.productionAdmitted,false);
  assert.equal(report.runtimeVerified,false);assert.equal(report.userAcceptance,false);
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
  for (const [name,data] of Object.entries({'source-run.json':{runId},'semantics.json':semantics,
    'qa/ark-editorial-response.json':valid(),'audio/timestamps.json':{sentences:semantics.sentences.map((s,i) => ({...s,start:i*2}))},
    'remotion/shots.json':validateEditorial(valid(),semantics,aligned,vocab).map(s=>({...s,shotCard:'impact-open-title',templateParams:{cardProps:{lineStart:'原稿',lastWord:'重点',sub:'基于真实输入'}}}))}))
    writeFileSync(path.join(project,name),JSON.stringify(data));
  return {root,runId};
}
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
  assert.deepEqual(calls,['semantic-check','semantic-shot-check']);
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
