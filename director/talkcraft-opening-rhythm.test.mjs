import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTalkcraftTemplateGovernance,isOpeningTemplateEligible,isOpeningShot,auditTemplateReuse,auditOpeningRhythm} from './talkcraft-template-governance.mjs';
const durationIssues=shot=>auditTalkcraftTemplateGovernance([shot]).issues.filter(i=>i.code==='opening_shot_duration_exceeded');

test('实际开场长驻留不能凭原生短卡或伪造durationSec绕过',()=>{
  for(const [shotCard,start,end] of [['tracking-in',2.3600416,7.0750837],['per-character-rise',7.0750837,14.400208]]) {
    assert.equal(isOpeningTemplateEligible(shotCard),true);
    const [issue]=durationIssues({id:'s02',shotCard,start,end,durationSec:2});
    assert.ok(issue);assert.equal(issue.actualDurationSec,end-start);
  }
});

test('开场3.4秒边界及运行时durationSec结构都受实际时长门禁约束',()=>{
  const shot={id:'s01',shotCard:'per-character-rise',start:0,end:3.4};
  assert.equal(durationIssues(shot).length,0);
  const runtime={id:'s03',shotCard:'per-character-rise',startSec:7.99,durationSec:3.401};
  assert.equal(durationIssues(runtime).length,1);
  runtime.startSec=8;assert.equal(durationIssues(runtime).length,0);
  assert.equal(isOpeningShot({}),false);
});
test('同一观点承接链可复用；仅同组、短理由、未来镜头和循环引用不能豁免',()=>{
  const rows=[{id:'s01',shotCard:'quote-card',templateParams:{templateContinuity:{pointId:'预期'}}},
    {id:'s02',shotCard:'quote-card',templateParams:{templateContinuity:{pointId:'预期',continuesShotId:'s01',reason:'继续解释同一观点'}}},
    {id:'s03',shotCard:'quote-card',templateParams:{templateContinuity:{pointId:'预期',continuesShotId:'s02',reason:'仍在解释同一观点'}}}];
  assert.equal(auditTemplateReuse(rows).length,0);
  for(const changes of [{reason:'继续'},{continuesShotId:'s03'},{pointId:'其他观点'},{continuesShotId:undefined}]){
    const copy=structuredClone(rows);Object.assign(copy[1].templateParams.templateContinuity,changes);
    assert.ok(auditTemplateReuse(copy).length>0);
  }
});
test('30镜滑动窗口独立于推荐排名，带理由也不豁免原卡时长',()=>{
  const rows=Array.from({length:31},(_,i)=>({id:'s'+i,shotCard:'card-'+i}));
  rows[29].shotCard=rows[0].shotCard;assert.equal(auditTemplateReuse(rows).length,1);
  rows[29].shotCard='different';rows[30].shotCard=rows[0].shotCard;
  assert.equal(auditTemplateReuse(rows).length,0);
  assert.equal(auditOpeningRhythm([{id:'s01',start:0,end:4,shotCard:'tracking-in',templateParams:{semanticDeviations:{论点:'有很充分的理由'}}}]).passed,false);
});
