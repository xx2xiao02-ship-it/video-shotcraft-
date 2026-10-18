import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {saveCandidateMaterialRepairFeedback,savePlanningEditorialRepairFeedback,currentEditorialRepairFeedback,saveEditorialRepairFeedback,preserveCandidateMaterialRepairFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {prepareTalkcraftStoryboardRevision} from './talkcraft-status.mjs';

function fixture(t){
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-repair-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'qa'));fs.mkdirSync(path.join(project,'audio'));fs.mkdirSync(path.join(project,'remotion'));
  const write=(file,value)=>fs.writeFileSync(path.join(project,file),JSON.stringify(value));
  write('input.txt','原稿');write('audio/full.mp3','保留配音');write('aligned-sentences.json',[{start:0,end:3}]);
  write('semantics.json',{sentences:[{i:0,text:'原稿',shot:'s01',need:['身份']}]});
  write('remotion/shots.json',[{id:'s01',shotCard:'tracking-in',firstSentence:0,lastSentence:0}]);
  write('material-research-plan.json',{shots:[{shotId:'s01',research:[{kind:'identity',query:'指定机构'}]}]});
  const issues=[{shotId:'s01',code:'MATERIAL_DISPLAY_SLOT_UNAVAILABLE'},{shotId:'s01',code:'REAL_SOURCE_NOT_BOUND'}];
  return {project,write,readiness:{passed:false,materialIssues:issues}};
}

test('07完整文字失败替代06通过记录，保留原展示设计和独立字幕，不串用旧问题',t=>{
  const {project,write}=fixture(t);
  saveCandidateMaterialRepairFeedback(project,{passed:true,materialIssues:[]});
  const native={textFields:[{key:'text',visibility:'visible'}],wordEvents:[{field:'text',sentenceIndex:0,anchor:'原稿',text:'原稿'}]};
  write('qa/ark-editorial-response.json',{shots:[{id:'s01',nativePresentation:native}],captionEmphasis:{sentences:[{i:0,keywords:['原稿']}]}});
  write('remotion/native-presentation.json',{shots:[]});write('remotion/word-reveal-plan.json',{events:[]});
  const checks=[{code:'NATIVE_WORD_COVERAGE',shotId:'s01',message:'缺少字段落点'}];
  const before=fs.readFileSync(path.join(project,'remotion/shots.json'),'utf8');
  savePlanningEditorialRepairFeedback(project,{passed:false,issues:checks});
  const feedback=currentEditorialRepairFeedback(project);
  assert.equal(feedback.stage,'planning-check');assert.deepEqual(feedback.failedChecks,checks);
  assert.deepEqual(feedback.proposal.shots[0].nativePresentation,native);
  assert.ok(feedback.proposal.captionEmphasis);assert.equal(fs.readFileSync(path.join(project,'remotion/shots.json'),'utf8'),before);
  write('remotion/word-reveal-plan.json',{events:['changed']});assert.equal(currentEditorialRepairFeedback(project),null);
});

test('09完整失败保持当前节点范围；字级输入变化不能借用旧反馈',t=>{
 const {project,write}=fixture(t);
 savePlanningEditorialRepairFeedback(project,{passed:false,issues:[{code:'OLD_07',shotId:'s01'}]});
 savePlanningEditorialRepairFeedback(project,{stage:'preflight',passed:false,issues:[{code:'NATIVE_WORD_COVERAGE',shotId:'s01'}]});
 assert.equal(currentEditorialRepairFeedback(project).stage,'preflight');
 write('remotion/word-reveal-plan.json',{events:['changed']});assert.equal(currentEditorialRepairFeedback(project),null);
});

test('07修订快照保存当前原生展示和文字计划指纹，恢复不读取另一次运行',t=>{
  const {project,write}=fixture(t);
  write('remotion/native-presentation.json',{shots:['bound']});write('remotion/word-reveal-plan.json',{events:['bound']});
  savePlanningEditorialRepairFeedback(project,{passed:false,issues:[{code:'NATIVE_WORD_COVERAGE',shotId:'s01'}]});
  const revision=path.join(project,'qa/storyboard-revisions/exact');fs.mkdirSync(revision,{recursive:true});
  const record=preserveCandidateMaterialRepairFeedback(project,revision);
  assert.equal(record.stage,'planning-check');assert.ok(fs.existsSync(path.join(revision,'remotion/word-reveal-plan.json')));
  fs.unlinkSync(path.join(project,'remotion/shots.json'));fs.unlinkSync(path.join(project,'remotion/native-presentation.json'));
  assert.equal(currentEditorialRepairFeedback(project).stage,'planning-check');
});
test('06当前完整失败替代旧04反馈，同镜问题保留并集中到一个修订目标',t=>{
  const {project,readiness}=fixture(t);
  saveEditorialRepairFeedback(project,{shots:[]},{issues:[{code:'OLD_MOTION_ERROR'}]});
  const record=saveCandidateMaterialRepairFeedback(project,readiness);
  assert.deepEqual(currentEditorialRepairFeedback(project).failedChecks,readiness.materialIssues);
  assert.equal(record.repairTargets.length,1);assert.equal(record.repairTargets[0].checks.length,2);
  assert.equal(record.proposal.shots[0].shotCard,'tracking-in');assert.equal(record.paidCalls,0);
});

test('当前07快照优先于共存的旧04归档；当前快照失效也不回退旧04',t=>{
  const {project,write}=fixture(t);
  write('qa/editorial-revision-feedback.json',{schema:'talkcraft-editorial-repair-feedback-v1',failedChecks:[{code:'OLD_04'}],snapshot:'qa/storyboard-revisions/old'});
  savePlanningEditorialRepairFeedback(project,{passed:false,issues:[{code:'NATIVE_WORD_COVERAGE',shotId:'s01'}]});
  const snapshot=path.join(project,'qa/storyboard-revisions/current');
  preserveCandidateMaterialRepairFeedback(project,snapshot);
  fs.unlinkSync(path.join(project,'remotion/shots.json'));
  assert.equal(currentEditorialRepairFeedback(project).stage,'planning-check');
  fs.writeFileSync(path.join(snapshot,'semantics.json'),'tampered');
  assert.equal(currentEditorialRepairFeedback(project),null);
});
test('原稿、音频、时钟、语义、分镜、来源或绑定计划变化后旧06反馈不沿用',t=>{
  const {project,write,readiness}=fixture(t);
  saveEditorialRepairFeedback(project,{shots:[]},{issues:[{code:'OLD'}]});
  for(const name of ['input.txt','audio/full.mp3','aligned-sentences.json','semantics.json','remotion/shots.json','material-research-plan.json','material-binding-plan.json']){
    const file=path.join(project,name),before=fs.existsSync(file)?fs.readFileSync(file):null;
    saveCandidateMaterialRepairFeedback(project,readiness);write(name,{changed:true});
    assert.equal(currentEditorialRepairFeedback(project),null,name);
    if(before)fs.writeFileSync(file,before);else fs.unlinkSync(file);
  }
});
test('正式修订快照保留最新06反馈；原稿或快照改变、新分镜落地后不沿用',t=>{
  const {project,write,readiness}=fixture(t);
  saveCandidateMaterialRepairFeedback(project,readiness);
  const revision=path.join(project,'qa/storyboard-revisions/test');
  preserveCandidateMaterialRepairFeedback(project,revision);
  fs.unlinkSync(path.join(project,'remotion/shots.json'));
  write('semantics.json',{sentences:[]});fs.unlinkSync(path.join(project,'material-research-plan.json'));
  assert.deepEqual(currentEditorialRepairFeedback(project).failedChecks,readiness.materialIssues);
  write('remotion/shots.json',[{id:'new'}]);assert.equal(currentEditorialRepairFeedback(project),null);
  fs.unlinkSync(path.join(project,'remotion/shots.json'));
  write('audio/full.mp3','changed');assert.equal(currentEditorialRepairFeedback(project),null);
  write('audio/full.mp3','保留配音');
  fs.writeFileSync(path.join(revision,'semantics.json'),'changed');assert.equal(currentEditorialRepairFeedback(project),null);
});
test('原正式修订入口归档旧逐镜素材计划，06反馈仍进入下一次编导输入',t=>{
  const {project,readiness,write}=fixture(t);
  write('qa/semantics-before-ark.json',{sentences:[]});write('qa/storyboard-adjustment-request.json',{request:'修订资料展示'});
  write('source-run.json',{});write('material-binding-plan.json',{bindings:[]});
  saveCandidateMaterialRepairFeedback(project,readiness);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-revision-entry-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const runId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const target=path.join(root,'director/b-mode-runs',runId,'talkcraft');fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(project,target,{recursive:true});
  const result=prepareTalkcraftStoryboardRevision(root,runId);
  assert.deepEqual(currentEditorialRepairFeedback(target).failedChecks,readiness.materialIssues);
  assert.equal(fs.existsSync(path.join(target,'material-research-plan.json')),false);
  assert.equal(fs.existsSync(path.join(target,'material-binding-plan.json')),false);
  assert.ok(fs.existsSync(path.join(result.revision,'material-binding-plan.json')));
  assert.equal(fs.readFileSync(path.join(target,'audio/full.mp3'),'utf8'),fs.readFileSync(path.join(project,'audio/full.mp3'),'utf8'));
});
test('06成功结果清除当前修订需求，不伪造用户通过或删除旧反馈',t=>{
  const {project}=fixture(t);
  saveEditorialRepairFeedback(project,{shots:[]},{issues:[{code:'OLD'}]});
  saveCandidateMaterialRepairFeedback(project,{passed:true,materialIssues:[]});
  assert.equal(currentEditorialRepairFeedback(project),null);
  assert.ok(fs.existsSync(path.join(project,'qa/editorial-repair-feedback.json')));
});
test('生成06反馈不修改任何生产输入、素材或节点审批',t=>{
  const {project,readiness}=fixture(t);
  const files=['input.txt','audio/full.mp3','aligned-sentences.json','semantics.json','remotion/shots.json','material-research-plan.json'];
  const before=files.map(f=>fs.readFileSync(path.join(project,f),'utf8'));
  const record=saveCandidateMaterialRepairFeedback(project,readiness);
  assert.deepEqual(files.map(f=>fs.readFileSync(path.join(project,f),'utf8')),before);
  assert.equal(record.userAcceptance,false);assert.equal(record.passed,false);
});
