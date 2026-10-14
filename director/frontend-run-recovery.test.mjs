import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../console-ui.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('async function restoreBWorkflowState()'), html.indexOf('async function startBAutoEditorial('));
const latestId = '14da5f88-75a0-4f24-a34a-5c6e5cb6cc7d';
const oldId = '8f62273e-8b5a-4e00-8fa7-b92f76c3eff7';

async function restore(requested = null, missing = false) {
  const calls = [], renders = [], nodes = new Map();
  const storage = new Map([['shotcraft-b-talkcraft-run', oldId]]);
  const context = vm.createContext({activeProductionMode:'B', bModeBusy:false, bFreshInput:false,
    bInputRevision:0, initialRoute:new URLSearchParams(requested ? {runId:requested} : {}),
    localStorage:{getItem:key=>storage.get(key), setItem:(key,value)=>storage.set(key,value)},
    $:selector=> { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); },
    setBProgress(){}, setProductionStartState(){}, currentTalkcraftFailure(){return null;},
    async renderBProductionAudit(id){renders.push(id);},
    async fetch(url, options) {
      calls.push({url, method:options?.method || 'GET'});
      return {ok:!missing, async json(){return {ok:!missing, run:missing ? null : {
        runId:requested || latestId, inputReady:true, sentences:25, shotbook:false}};}};
    },
  });
  await vm.runInContext(source + '\nrestoreBWorkflowState()', context);
  return {calls, renders, storage, nodes};
}
test('restoration selects backend latest instead of stale cached failure and never submits editorial', async () => {
  const result = await restore();
  assert.equal(result.calls[0].url, '/api/talkcraft/latest');
  assert.deepEqual(result.renders, [latestId]);
  assert.equal(result.storage.get('shotcraft-b-talkcraft-run'), latestId);
  assert.ok(result.calls.every(call=>call.method === 'GET'));
});
test('explicit user-selected run remains selected', async () => {
  const result = await restore(oldId);
  assert.equal(result.calls[0].url, `/api/talkcraft/status?id=${oldId}`);
  assert.deepEqual(result.renders, [oldId]);
});
test('missing explicit run reports failure without switching to another run', async () => {
  const result = await restore(oldId, true);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.renders, []);
  assert.match(result.nodes.get('#b-production-audit-state').textContent, /未切换/u);
});
