import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainJointSelection} from './talkcraft-editorial-joint-selection.mjs';
import {planNodeCorrection} from './talkcraft-correction-center.mjs';
import {createHash} from 'node:crypto';
const w=(shotId,...slugs)=>({shotId,choices:slugs.map(slug=>({slug,choiceId:shotId+slug}))});
test('全范围有解才提供候选，剪除局部可行但整体必冲突的选项；不选择或编参数',()=>{
 const shots=['a','b','c'].map(id=>({id})),windows=[w('a','x','z'),w('b','x','y'),w('c','y')];
 const before=structuredClone(windows),result=constrainJointSelection(windows,shots);
 assert.deepEqual(result.map(w=>w.choices.map(c=>c.slug)),[['z'],['x'],['y']]);
 assert.deepEqual(windows,before);assert.ok(!Object.hasOwn(result[0],'selected'));
 assert.throws(()=>constrainJointSelection([w('a','x'),w('b','x')],shots),/没有联合去重解/);
 assert.throws(()=>constrainJointSelection(windows,shots,{maxVisits:0}),/超出预算/);
});
test('锁定镜头不可占用，30镜以外允许复用',()=>{
 const shots=Array.from({length:31},(_,i)=>({id:String(i),shotCard:i===0?'x':null}));
 assert.deepEqual(constrainJointSelection([w('1','x','y')],shots)[0].choices.map(c=>c.slug),['y']);
 assert.deepEqual(constrainJointSelection([w('30','x','y')],shots)[0].choices.map(c=>c.slug),['x','y']);
});
test('重复选卡在免费复检后按有效授权提出完整联合修订；中心不接受漏边或重复费用',()=>{
 const inputs={voice:'current'},provider={provider:'acctoken',model:'deepseek-v4.1-flash'};
 const authorization={schema:'talkcraft-correction-authorization-v1',runId:'current',inputs,provider,scope:['editorial'],
   expiresAt:new Date(2000).toISOString(),approval:'用户授权完整联合修订',maxModelTasks:1};
 const f={run:{runId:'current',editorialChecked:false,nextStage:'editorial-check',provenance:{verified:true},lastFailure:{task:{name:'talkcraft-editorial'}}},
   fingerprint:'current',progressKey:'checks',inputs,provider,authorization,now:1000,
   feedback:{failedChecks:[{code:'template_window_reuse',shotId:'s16',previousShotId:'s12'},{code:'template_window_reuse',shotId:'s23',previousShotId:'s05'}]},
   revisionPlan:{requestId:'joint',editableShotIds:['s16','s23']},attempts:[{fingerprint:'current',action:'local-recheck'}]};
 const p=planNodeCorrection(f);assert.equal(p.action,'editorial-repair');assert.equal(p.approved,true);assert.equal(p.productionAdmitted,false);
 assert.equal(planNodeCorrection({...f,revisionPlan:{...f.revisionPlan,editableShotIds:['s16']}}).action,null);
 const authorizationSha256=createHash('sha256').update(JSON.stringify(authorization)).digest('hex');
 assert.equal(planNodeCorrection({...f,attempts:[...f.attempts,{action:'editorial-repair',fingerprint:'prior',authorizationSha256}]}).action,null);
 assert.equal(planNodeCorrection({...f,authorization:{...authorization,runId:'old'}}).action,null);
});
