import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerReviewedMaterialRecovery,loadReviewedMaterialRecovery} from './talkcraft-reviewed-material-recovery.mjs';
import {prepareResearchBindings} from './talkcraft-research-binding.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const catalog={cards:[{cardId:'pair',policy:{media:{src:'image'}}}]};
function fixture(t){
  const p=fs.mkdtempSync(path.join(os.tmpdir(),'reviewed-recovery-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
  const snapshot='qa/storyboard-revisions/explicit/material-binding-plan.json',dir=path.dirname(snapshot);
  const write=(f,v)=>{fs.mkdirSync(path.dirname(path.join(p,f)),{recursive:true});fs.writeFileSync(path.join(p,f),JSON.stringify(v));};
  fs.writeFileSync(path.join(p,'input.txt'),'original');write('source-run.json',{runId:'current'});
  const binding={field:'src',localPath:'source.png',sha256:sha('source'),sourceUrl:'https://official.example/source',
    sourceVerified:true,licenseVerified:true,license:'public domain',licenseUrl:'https://official.example/terms',
    identityReason:'机构本人资料',contentLanguage:'zh-CN'};
  const shot={id:'s01',shotCard:'pair',firstSentence:0,lastSentence:0,start:0,end:4,templateParams:{cardProps:{title:'保持标题'}}};
  const row={shotId:'s01',research:[],materialBindings:[binding]};
  write('remotion/shots.json',[shot]);write('material-research-plan.json',{shots:[{shotId:'s01',research:[]}]});
  write(dir+'/remotion/shots.json',[{...shot,templateParams:{cardProps:{title:'保持标题',src:'source.png'}}}]);
  write(dir+'/material-research-plan.json',{shots:[row]});
  write(snapshot,{schema:'talkcraft-material-binding-plan-v1',inputSha256:sha('original'),bindings:[binding]});
  // The shot identity is explicit in the acquisition plan, not guessed by filename.
  const plan=JSON.parse(fs.readFileSync(path.join(p,snapshot)));plan.bindings[0].shotId='s01';write(snapshot,plan);
  fs.mkdirSync(path.join(p,'remotion/public'),{recursive:true});fs.writeFileSync(path.join(p,'remotion/public/source.png'),'source');
  return {p,write,snapshot,options:{snapshot,planSha256:sha(fs.readFileSync(path.join(p,snapshot)))}};
}
test('明确选择本任务哈希快照，正式绑定恢复且重复继续不重写业务文件',t=>{
  const {p,options}=fixture(t);registerReviewedMaterialRecovery(p,catalog,options);
  const before=fs.readFileSync(path.join(p,'material-research-plan.json'));
  assert.equal(JSON.parse(before).shots[0].materialBindings,undefined);
  const result=prepareResearchBindings(p,catalog);assert.equal(result.issues.length,0);assert.equal(result.applied.length,1);
  const shot=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0];assert.equal(shot.templateParams.cardProps.src,'source.png');
  const stamp=fs.statSync(path.join(p,'remotion/shots.json')).mtimeMs;
  prepareResearchBindings(p,catalog);assert.equal(fs.statSync(path.join(p,'remotion/shots.json')).mtimeMs,stamp);
});
test('没有明确恢复记录时绝不搜索旧快照',t=>{
  const {p}=fixture(t);assert.equal(loadReviewedMaterialRecovery(p,catalog,[],{}),null);
  assert.equal(prepareResearchBindings(p,catalog).applied.length,0);
});
test('其他任务、原稿变化或快照哈希变化均保持阻断',t=>{
  const {p,options,write}=fixture(t);registerReviewedMaterialRecovery(p,catalog,options);
  const load=()=>loadReviewedMaterialRecovery(p,catalog,JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json'))),{shots:[]});
  write('source-run.json',{runId:'other'});assert.throws(load,/当前任务/);
  write('source-run.json',{runId:'current'});fs.writeFileSync(path.join(p,'input.txt'),'changed');assert.throws(load,/原稿/);
  fs.writeFileSync(path.join(p,'input.txt'),'original');fs.appendFileSync(path.join(p,options.snapshot),' ');assert.throws(load,/哈希/);
});
test('切镜、文字构图或明确文件变化不能使用旧绑定',t=>{
  const {p,options,write}=fixture(t);
  const shots=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')));
  for(const mutate of [s=>s.end=5,s=>s.templateParams.cardProps.title='新标题',s=>s.templateParams.cardProps.src='different.png']){
    const changed=structuredClone(shots);mutate(changed[0]);write('remotion/shots.json',changed);
    assert.throws(()=>registerReviewedMaterialRecovery(p,catalog,options),/改变|冲突/);
  }
});
test('非本任务快照路径、未核验素材和缺少声明不能通过正式来源门禁',t=>{
  const {p,options,write}=fixture(t);
  assert.throws(()=>registerReviewedMaterialRecovery(p,catalog,{...options,snapshot:'../other/material-binding-plan.json'}),/当前任务/);
  const plan=JSON.parse(fs.readFileSync(path.join(p,options.snapshot)));plan.bindings[0].licenseVerified=false;write(options.snapshot,plan);
  registerReviewedMaterialRecovery(p,catalog,{...options,planSha256:sha(fs.readFileSync(path.join(p,options.snapshot)))});
  assert.equal(prepareResearchBindings(p,catalog).issues[0].code,'REVIEWED_SOURCE_BINDING_REJECTED');
});
