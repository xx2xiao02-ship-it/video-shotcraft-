import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {planTalkcraftDigitalHuman} from './talkcraft-digital-human-plan.mjs';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';

test('TalkCraft digital human groups adjacent person shots on the master 30 fps timeline', t => {
  const project = mkdtempSync(path.join(os.tmpdir(), 'talkcraft-dh-plan-'));
  t.after(() => rmSync(project, {recursive:true, force:true}));
  mkdirSync(path.join(project, 'remotion'), {recursive:true});
  writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({fps:30,totalFrames:120,digitalHumanMode:'combined'}));
  const shots = [
    {id:'s01',start:0,end:1,subject:'person'},
    {id:'s02',start:1,end:2,subject:'other'},
    {id:'s03',start:2,end:3,subject:'person'},
    {id:'s04',start:3,end:4,subject:'person'},
  ];
  writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify(shots));
  const plan = planTalkcraftDigitalHuman(project);
  assert.deepEqual(plan.units.map(unit => [unit.fromFrame, unit.durationInFrames, unit.shotIds]),
    [[0,30,['s01']],[60,60,['s03','s04']]]);
  assert.equal(readTalkcraftDigitalHumanStatus(project).units, 2);
  shots[1].subject = undefined;
  writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify(shots));
  assert.match(readTalkcraftDigitalHumanStatus(project).error, /subject=person 或 other/);
  assert.throws(() => planTalkcraftDigitalHuman(project), /subject=person 或 other/);
  assert.equal(readFileSync(path.join(project, 'source-run.json'), 'utf8').includes('combined'), true);
});
