import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeTaskExecution} from './task-execution-readiness.mjs';
import {taskStageLabel} from './talkcraft-failure-report.mjs';

test('real asynchronous task child starts and exits successfully', async () => {
  const result = await probeTaskExecution();
  assert.equal(result.ok, true, JSON.stringify(result));
});
test('denied launch returns a failure without accepting work', async () => {
  const result = await probeTaskExecution({spawnProcess() { throw Object.assign(new Error('denied'), {code:'EPERM'}); }});
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EPERM');
});
test('editorial failure is distinguished from QA and bootstrap failures', () => {
  assert.equal(taskStageLabel('talkcraft-editorial'), '分镜生成');
  assert.equal(taskStageLabel('talkcraft-bootstrap'), '配音和时间轴处理');
  assert.equal(taskStageLabel('talkcraft-qa'), '机器质检');
});
