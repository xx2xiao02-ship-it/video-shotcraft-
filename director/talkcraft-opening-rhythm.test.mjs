import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTalkcraftTemplateGovernance,isOpeningTemplateEligible,isOpeningShot} from './talkcraft-template-governance.mjs';
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
