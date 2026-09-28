import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {applySemanticDecisions} from './talkcraft-semantic-decisions.mjs';

const workspace = path.resolve('tmp');

test('only applies decisions for exact aligned text and keeps shot assignments', () => {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-semantics-test-'));
  try {
    const project = path.join(root, 'project');
    const skill = path.join(root, 'skill');
    mkdirSync(project);
    mkdirSync(path.join(skill, 'references'), {recursive:true});
    writeFileSync(path.join(skill, 'references', 'cards-index.json'), JSON.stringify({vocab:[{word:'钩子'}]}));
    const skeleton = {version:1, sentences:[{i:0, text:'为什么？', shot:'s01', sem:[], need:[], entities:[], weight:''}]};
    writeFileSync(path.join(project, 'semantics.json'), JSON.stringify(skeleton));
    const choices = {schema:'talkcraft-semantic-decisions-v1', sentences:[
      {i:0, text:'为什么？', sem:['钩子'], need:['强调'], entities:[], weight:'main'}]};
    writeFileSync(path.join(project, 'semantic-decisions.json'), JSON.stringify(choices));
    assert.equal(applySemanticDecisions(project, skill).main, 1);
    const after = JSON.parse(readFileSync(path.join(project, 'semantics.json')));
    assert.equal(after.sentences[0].shot, 's01');
    choices.sentences[0].text = '别的问题？';
    writeFileSync(path.join(project, 'semantic-decisions.json'), JSON.stringify(choices));
    assert.throws(() => applySemanticDecisions(project, skill), /stale/);
    assert.deepEqual(JSON.parse(readFileSync(path.join(project, 'semantics.json'))), after);
  } finally {
    if (!root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(root, {recursive:true, force:true});
  }
});
