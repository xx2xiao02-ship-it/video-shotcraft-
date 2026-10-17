import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {syncTalkcraftShotSource} from './talkcraft-binding.mjs';

function fixture(t, planned, rendered) {
  const base = path.resolve('tmp');fs.mkdirSync(base,{recursive:true});
  const project = fs.mkdtempSync(path.join(base,'talkcraft-source-sync-'));
  t.after(()=>{if(!project.startsWith(base+path.sep))throw Error('Test cleanup escaped workspace');fs.rmSync(project,{recursive:true,force:true});});
  fs.mkdirSync(path.join(project,'remotion/src'),{recursive:true});
  fs.writeFileSync(path.join(project,'remotion/shots.json'),JSON.stringify(planned));
  const file=path.join(project,'remotion/src/shots.ts');
  const source=`export const SHOTS: Shot[] = ${JSON.stringify(rendered)};\nexport const shotSequence = () => null;\n`;
  fs.writeFileSync(file,source);return {project,file,source};
}
test('精确 ID 对账后按编导顺序同步业务参数，保留相机数据', t=>{
  const planned=[{id:'s01',start:0,end:1,shotCard:'impact-open-title',templateParams:{cardProps:{lineStart:'业务原稿'}}},
    {id:'s02',start:1,end:2,shotCard:'type-contrast-emphasis',subject:'person',templateParams:{cardProps:{words:'保留|现金'},templateHostSrc:'avatar.mp4'}}];
  const rendered=[{id:'s02',startSec:1,durationSec:1,path:[{t:0,scale:1.1}]},{id:'s01',startSec:0,durationSec:1,path:[{t:0,scale:1}]}];
  const {project,file}=fixture(t,planned,rendered);
  assert.equal(syncTalkcraftShotSource(project).shots,2);
  const result=JSON.parse(fs.readFileSync(file,'utf8').match(/= (\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(result.map(s=>s.id),['s01','s02']);
  assert.deepEqual(result[1].templateParams,planned[1].templateParams);
  assert.equal(result[1].subject,'person');assert.deepEqual(result[1].path,rendered[0].path);
});
test('口播停顿由上一镜头承接时允许渲染时长桥接空档', t=>{
  const planned=[{id:'s01',start:0,end:1,shotCard:'impact-open-title'},
    {id:'s02',start:1.5,end:2,shotCard:'type-contrast-emphasis'}];
  const rendered=[{id:'s01',startSec:0,durationSec:1.5},{id:'s02',startSec:1.5,durationSec:0.5}];
  const {project}=fixture(t,planned,rendered);
  assert.equal(syncTalkcraftShotSource(project).shots,2);
});
test('拆分子镜头不能被旧父镜头静默忽略，失败时保留源码',t=>{
  const {project,file,source}=fixture(t,[{id:'s01a',start:0,end:1}],[{id:'s01',startSec:0,durationSec:1}]);
  assert.throws(()=>syncTalkcraftShotSource(project),/源码缺少 s01a.*源码多出 s01/);
  assert.equal(fs.readFileSync(file,'utf8'),source);
});
test('重复 ID 和时间轴变更必须报告，不能保留旧时长渲染',t=>{
  const planned=[{id:'s01',start:0,end:2}],rendered=[{id:'s01',startSec:0,durationSec:1}];
  const {project,file,source}=fixture(t,planned,rendered);
  assert.throws(()=>syncTalkcraftShotSource(project),/时间轴不一致/);
  assert.equal(fs.readFileSync(file,'utf8'),source);
  fs.writeFileSync(path.join(project,'remotion/shots.json'),JSON.stringify([planned[0],planned[0]]));
  assert.throws(()=>syncTalkcraftShotSource(project),/重复镜头 ID/);
  assert.equal(fs.readFileSync(file,'utf8'),source);
});
test('换卡后不能沿用旧场景的参数表',t=>{
  const {project,file,source}=fixture(t,[{id:'s01',start:0,end:1,shotCard:'type-contrast-emphasis'}],
    [{id:'s01',startSec:0,durationSec:1,shotCard:'impact-open-title'}]);
  assert.throws(()=>syncTalkcraftShotSource(project),/模板已改变/);
  assert.equal(fs.readFileSync(file,'utf8'),source);

  const rebuilt=syncTalkcraftShotSource(project,{allowReviewedRebuild:true});
  assert.deepEqual(rebuilt.rebuilt,[{shotId:'s01',from:'impact-open-title',to:'type-contrast-emphasis',reason:'template'}]);
  const synced=JSON.parse(fs.readFileSync(path.join(project,'remotion/src/shots.ts'),'utf8').match(/export const SHOTS: Shot\[\] = (\[[\s\S]*?\]);\r?\nexport const shotSequence/u)[1]);
  assert.equal(synced[0].shotCard,'type-contrast-emphasis');
});
