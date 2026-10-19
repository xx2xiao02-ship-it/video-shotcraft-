import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CORRECTION_NODE_POLICIES} from './talkcraft-node-correction-plan.mjs';
import {workflowNodeForTask} from './talkcraft-workflow-contract.mjs';

test('各节点免费修正及来源采集阶段必须贯通正式入口白名单与工作节点映射',()=>{
 const server=fs.readFileSync(new URL('../console-server.mjs',import.meta.url),'utf8');
 const declaration=server.match(/const TALKCRAFT_STAGE_NAMES = new Set\([^\n]+\);\r?\nfor\(const stage of [^\n]+TALKCRAFT_STAGE_NAMES.add\(stage\);/u)?.[0];
 assert.ok(declaration,'从正式入口读取实际白名单，不能以另一个模拟列表替代');
 const stages=vm.runInNewContext(declaration+'\nArray.from(TALKCRAFT_STAGE_NAMES)');
 for(const policy of CORRECTION_NODE_POLICIES.filter(p=>p.freeStage)){
  assert.ok(stages.includes(policy.freeStage),`${policy.node}: ${policy.freeStage}未接入`);
  assert.equal(workflowNodeForTask(policy.freeStage),policy.node);
 }
 assert.ok(stages.includes('material-research'));
 assert.equal(workflowNodeForTask('material-research'),'candidates');
});
