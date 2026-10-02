import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./console-ui.html', import.meta.url), 'utf8');
const stateCode = html.slice(
  html.indexOf('let productionStartState = "ready";'),
  html.indexOf('// 本次会话内最新一次渲染/生成启动时刻'),
);

function renderHarness() {
  const elements = Object.fromEntries(['sb-render','render-start-error','gen-status','gen-pct',
    'gen-progress-bar','gen-progress-card','preview-card','preview-video','template-usage-toggle',
    'template-usage-report','production-start-generation'].map(id => [id,
    {hidden:false, disabled:false, textContent:'existing', style:{display:'', width:'100%'},
      removeAttribute:() => {if(id === 'preview-video') throw new Error('must preserve existing preview');}}]));
  const calls = [];
  const run = {runId:'reviewed', storyboard:{shots:[]}, error:'旧编导错误', status:'rendered'};
  const context = vm.createContext({
    document:{getElementById:id => elements[id]}, $:selector => elements[selector.slice(1)],
    activeProductionMode:'A', state:{tasks:[], aModeBusy:false}, musicSelections:{A:null},
    showToast:message => calls.push(message), userErrorMessage:error => error.message,
    apiFetch:async url => {
      if (url === '/api/render/readiness') return {ok:true};
      if (url === '/api/render/confirm') {calls.push('confirm'); return {ok:false,error:'第 1、2 镜缺少背景视频'};}
      return {ok:true,run};
    },
    setGenProgress:(pct,message) => {elements['gen-status'].textContent = message;},
    refresh:() => {}, sessionRenderStart:Infinity,
  });
  vm.runInContext(stateCode, context);
  vm.runInContext('activeAModeRunId = reviewedAModeRunId = autoLoadedStoryboardRunId = "reviewed";', context);
  const handler = html.slice(html.indexOf('$("#sb-render").onclick = async () => {'),
    html.indexOf('\n}\n\n// P2：成片画廊'));
  vm.runInContext(handler, context);
  vm.runInContext(html.slice(html.indexOf('async function refreshAModeProgress()'),
    html.indexOf('async function refresh()')), context);
  return {elements, calls, context, run};
}

test('render rejection persists through polling, preserves preview, and never retries', async () => {
  const {elements,calls,context} = renderHarness();
  await elements['sb-render'].onclick();
  assert.equal(calls.filter(value => value === 'confirm').length, 1);
  assert.equal(elements['sb-render'].disabled, false);
  assert.equal(elements['render-start-error'].hidden, false);
  assert.match(elements['render-start-error'].textContent, /渲染未启动.*第 1、2 镜缺少背景视频/);
  assert.equal(elements['preview-card'].style.display, '');
  assert.equal(elements['template-usage-report'].textContent, 'existing');
  assert.equal(vm.runInContext('sessionRenderStart',context), Infinity);
  const at = vm.runInContext('renderStartFailure.at',context);
  for (let i=0;i<3;i++) await vm.runInContext('refreshAModeProgress()', context);
  assert.match(elements['gen-status'].textContent, /缺少背景视频/);
  assert.equal(elements['gen-pct'].textContent, '未启动');
  assert.equal(vm.runInContext('renderStartFailure.at',context), at);
  assert.equal(vm.runInContext('productionStartState',context), 'complete');
});

test('a genuinely newer render task clears only the matching run rejection', async () => {
  const {elements,context} = renderHarness();
  await elements['sb-render'].onclick();
  vm.runInContext('state.tasks = [{type:"render",runId:"other",status:"running",startedAt:renderStartFailure.at+1}]',context);
  await vm.runInContext('refreshAModeProgress()',context);
  assert.equal(elements['render-start-error'].hidden, false);
  vm.runInContext('state.tasks = [{type:"render",runId:"reviewed",status:"running",startedAt:renderStartFailure.at+1}]',context);
  await vm.runInContext('refreshAModeProgress()',context);
  assert.equal(elements['render-start-error'].hidden, true);
  assert.equal(vm.runInContext('renderStartFailure',context), null);
});

test('dead automatic rendering retry code is retired', () => {
  assert.doesNotMatch(html, /MAX_ATTEMPTS|return tryRender\(\)|渲染失败，3 秒后自动重试/);
});

test('parallel director progress counts completed batches and retains legacy progress', async () => {
  const {elements,context,run} = renderHarness();
  Object.assign(run, {status:'running', stage:'shot-director', storyboard:null, error:null,
    totalBatches:7, completedBatches:2, activeBatches:[1,4,5], repairingBatches:[4]});
  await vm.runInContext('refreshAModeProgress()',context);
  assert.match(elements['gen-status'].textContent, /已完成2\/7批.*正在处理：1、4、5.*修正批次：4/);
  assert.equal(elements['gen-progress-bar'].style.width, (50 + 40 * 2 / 7) + '%');
  delete run.completedBatches;
  run.batch = 3;
  await vm.runInContext('refreshAModeProgress()',context);
  assert.match(elements['gen-status'].textContent, /第3\/7批/);
  assert.equal(elements['gen-progress-bar'].style.width, (50 + 40 * 2 / 7) + '%');
});

test('render polling updates real frame progress even while bridge logs are empty', async () => {
  const elements = {'gen-status':{},'gen-pct':{},'pbar-render':{style:{}},'pinfo-render':{}};
  const progress = {startedAt:200,stage:'frames',completed:30,total:100,concurrency:{effective:5},remaining:'8s'};
  const task = {id:40,type:'render',startedAt:100};
  const response = {since:0,done:false,logs:[],runId:'11111111-1111-4111-8111-111111111111',progress};
  const context = vm.createContext({state:{lastFetched:{},tasks:[task]},document:{getElementById:id=>elements[id]},
    apiFetch:async()=>({...response}),fetch:async()=>({ok:true,json:async()=>progress}),
    setGenProgress:(pct,message)=>{elements['gen-pct'].textContent=pct;elements['gen-status'].textContent=message;}});
  vm.runInContext(html.slice(html.indexOf('async function fetchLogs(id)'),html.indexOf('// 打开成片所在文件夹')),context);
  await vm.runInContext('fetchLogs(40)',context);
  assert.equal(elements['gen-pct'].textContent,30);
  assert.match(elements['gen-status'].textContent,/30\/100 帧.*5 路并行.*8s/);
  assert.equal(elements['pbar-render'].style.width,'30%');
  response.progress = null;
  await vm.runInContext('fetchLogs(40)',context);
  assert.equal(elements['gen-pct'].textContent,30,'static fallback works without restarting the active server');
  progress.startedAt = 50;
  await vm.runInContext('fetchLogs(40)',context);
  assert.equal(elements['gen-pct'].textContent,'处理中','stale progress must not show a fake percentage');
});

function createState() {
  const button = {hidden: false, disabled: false, textContent: '', removeAttribute: () => {}};
  const retiredNote = {hidden: true};
  const existingButton = {hidden: true};
  const directorEntry = {hidden: false, textContent: ''};
  const progressCard = {style: {display: 'none'}};
  const progressText = {textContent: '等待开始…'};
  const context = vm.createContext({
    document: {getElementById: (id) => ({
      'production-start-generation': button,
      'a-mode-retired-note': retiredNote,
      'load-existing-storyboard': existingButton,
      'b-enter-director': directorEntry,
      'gen-progress-card': progressCard,
      'gen-status': progressText,
    })[id]},
    activeProductionMode: 'A', bFreshInput:false,
  });
  vm.runInContext(stateCode, context);
  return {button, retiredNote, existingButton, directorEntry, progressCard, progressText, context, run: (code) => vm.runInContext(code, context)};
}

test('new B input ignores historical completion and keeps generation available', () => {
  const {button, run} = createState();
  run(`activeProductionMode = 'B'; bFreshInput = true;
    syncProductionStartState([{type:'talkcraft-bootstrap',status:'done',startedAt:100}]);`);
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(run('productionStartState'), 'ready');
});

test('new B input invalidates an in-flight history restore and prevents latest fallback', async () => {
  let finish;
  const storage = new Map([['shotcraft-b-talkcraft-run','old-run']]);
  const requests = [];
  const context = vm.createContext({activeProductionMode:'B', bModeBusy:false, bFreshInput:false, bInputRevision:0,
    setBProgress:() => {}, setProductionStartState:() => {},
    initialRoute:new URLSearchParams(), localStorage:{getItem:key => storage.get(key), setItem:(key,value) => storage.set(key,value)},
    fetch:url => {requests.push(url); return new Promise(resolve => {finish=resolve;});},
    currentTalkcraftFailure:() => {throw new Error('stale result consumed');},
    renderBProductionAudit:() => {throw new Error('stale audit rendered');},
  });
  vm.runInContext(html.slice(html.indexOf('async function restoreBWorkflowState()'), html.indexOf('async function startCMode()')), context);
  const pending = vm.runInContext('restoreBWorkflowState()', context);
  vm.runInContext('bInputRevision++; bFreshInput = true;', context);
  storage.clear();
  finish({ok:true,json:async () => ({ok:true,run:{runId:'old-run'}})});
  await pending;
  await vm.runInContext('restoreBWorkflowState()', context);
  assert.equal(requests.length, 1);
  assert.equal(storage.size, 0);
});

test('A mode generation entry shows readiness, running and retry states', () => {
  const {button, retiredNote, existingButton, directorEntry, run} = createState();
  run('setProductionStartState("ready")');
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /开始 AI 编导/);
  assert.equal(directorEntry.textContent, '进入 AI 编导');
  run('setProductionStartState("running")');
  assert.equal(button.hidden, true);
  run('setProductionStartState("failed")');
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /重新启动 AI 编导/);
  run('setProductionStartState("complete")');
  assert.equal(button.hidden, true);
  run('setProductionStartState("delivered")');
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /开始新一轮 AI 编导/);
  assert.equal(retiredNote.hidden, false);
  assert.equal(existingButton.hidden, false);
});

test('A mode tracks director and render task state', () => {
  const {button, progressCard, progressText, run, context} = createState();
  context.tasks = [
    {type: 'a-director', status: 'running', startedAt: 2},
  ];
  run('syncProductionStartState(tasks)');
  assert.equal(button.hidden, true);
  assert.equal(progressCard.style.display, '');
  context.tasks[0].status = 'error';
  run('syncProductionStartState(tasks)');
  assert.match(button.textContent, /重新启动 AI 编导/);
  assert.equal(progressText.textContent, 'AI 编导失败，请检查任务日志');
  context.tasks.push({type: 'render', status: 'done', startedAt: 3});
  run('syncProductionStartState(tasks)');
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /开始新一轮 AI 编导/);
  context.tasks.push({type: 'a-director', status: 'running', startedAt: 4});
  run('syncProductionStartState(tasks)');
  assert.equal(button.hidden, true);
});

test('B and C mode task states do not reuse A mode render failure', () => {
  const {button, directorEntry, run, context} = createState();
  context.tasks = [{type: 'render', status: 'error', startedAt: 1}];
  run('activeProductionMode = "B"; syncProductionStartState(tasks)');
  assert.equal(button.textContent, '开始生成视频');
  context.tasks.push({type: 'talkcraft-bootstrap', status: 'running', startedAt: 2});
  run('syncProductionStartState(tasks)');
  assert.equal(button.hidden, true);
  context.tasks[1].status = 'error';
  run('syncProductionStartState(tasks)');
  assert.equal(button.textContent, '重新生成视频');
  run('activeProductionMode = "C"; syncProductionStartState(tasks)');
  assert.equal(button.textContent, '开始生成视频');
  assert.equal(directorEntry.hidden, true);
});

test('A mode can open its history without a new script, while B still requires one', () => {
  const enterCode = html.slice(html.indexOf('function enterBProduction()'), html.indexOf('function postPendingBDirectorPayload()'));
  const elements = {
    '#b-fulltext': {value: ''},
    '#mode-c-selection-note': {hidden: true},
    '#storyboard-card': {style: {display: ''}},
    '#preview-card': {style: {display: ''}},
    '#gen-progress-card': {style: {display: 'none'}},
  };
  const events = [];
  const context = vm.createContext({
    $: selector => elements[selector],
    activeProductionMode: 'A',
    sessionStorage: {setItem: () => {}},
    switchView: view => events.push(view),
    showToast: message => events.push(message),
  });
  vm.runInContext(enterCode, context);
  vm.runInContext('enterBProduction()', context);
  assert.deepEqual(events, ['produce']);
  assert.equal(elements['#gen-progress-card'].style.display, '');
  vm.runInContext('activeProductionMode = "B"; enterBProduction()', context);
  assert.equal(events[1], '请先粘贴口播文案');
});

test('A mode readiness failures stay on production and never start a billable call', async () => {
  const startCode = html.slice(html.indexOf('function showAModeStartError('),
    html.indexOf('$("#production-start-generation").onclick = startSelectedProduction;'));
  const error = {hidden:true, textContent:''};
  const settingsButton = {hidden:true};
  const events = [];
  let readiness = {ok:true, configured:false};
  const context = vm.createContext({
    $: selector => ({'#b-fulltext': {value:'测试文案'}, '#a-mode-start-error': error,
      '#a-mode-open-settings': settingsButton})[selector],
    activeProductionMode:'A',
    productionRequestActive:false, renderRetryActive:false, productionStartState:'ready', refresh:() => {},
    apiFetch:async () => readiness,
    switchView:view => events.push(view),
    showToast:message => events.push(message),
    userErrorMessage:error => error.message,
    window:{confirm:() => {throw new Error('must not ask for paid call');}},
  });
  vm.runInContext(startCode, context);
  await vm.runInContext('startSelectedProduction()', context);
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /配置火山方舟/);
  assert.equal(settingsButton.hidden, false);
  assert.deepEqual(events, []);

  readiness = {ok:false, error:'服务暂时不可用'};
  await vm.runInContext('startSelectedProduction()', context);
  assert.equal(error.textContent, '服务暂时不可用');
  assert.equal(settingsButton.hidden, true);
  assert.deepEqual(events, []);

  readiness = null;
  context.apiFetch = async () => {throw new Error('连接超时');};
  await vm.runInContext('startSelectedProduction()', context);
  assert.match(error.textContent, /连接超时/);
  assert.equal(settingsButton.hidden, true);
  assert.deepEqual(events, []);
});

test('A mode configured readiness reaches cost confirmation without launching when cancelled', async () => {
  const startCode = html.slice(html.indexOf('function showAModeStartError('),
    html.indexOf('$("#production-start-generation").onclick = startSelectedProduction;'));
  const error = {hidden:false, textContent:'旧错误'};
  const settingsButton = {hidden:false};
  let confirmations = 0;
  const context = vm.createContext({
    $: selector => ({'#b-fulltext': {value:'测试文案'}, '#a-mode-start-error': error,
      '#a-mode-open-settings': settingsButton})[selector],
    activeProductionMode:'A',
    productionRequestActive:false, renderRetryActive:false, productionStartState:'ready', refresh:() => {},
    apiFetch:async () => ({ok:true, configured:true}),
    window:{confirm:() => {confirmations++; return false;}},
  });
  vm.runInContext(startCode, context);
  await vm.runInContext('startSelectedProduction()', context);
  assert.equal(confirmations, 1);
  assert.equal(error.hidden, true);
  assert.equal(settingsButton.hidden, true);
});

test('A mode only navigates to model settings after an explicit click', () => {
  const handlerCode = html.slice(html.indexOf("$('#a-mode-open-settings').onclick ="), html.indexOf('async function startAMode('));
  const settings = {open:false, scrollIntoView:() => {}};
  const button = {};
  const events = [];
  const context = vm.createContext({
    $: selector => selector === '#a-mode-open-settings' ? button : settings,
    switchView:view => events.push(view),
  });
  vm.runInContext(handlerCode, context);
  assert.deepEqual(events, []);
  button.onclick();
  assert.deepEqual(events, ['director']);
  assert.equal(settings.open, true);
});

test('A mode director entry opens its production stage, while C has no separate director', () => {
  const enterCode = html.slice(html.indexOf('function enterSelectedDirector()'), html.indexOf('function enterBProduction()'));
  const events = [];
  const context = vm.createContext({
    activeProductionMode:'A',
    enterBProduction:() => events.push('produce'),
    $:() => ({focus:() => events.push('focus')}),
    showToast:message => events.push(message),
  });
  vm.runInContext(enterCode, context);
  vm.runInContext('enterSelectedDirector()', context);
  assert.deepEqual(events, ['produce', 'focus', 'A 模式编导在制作台启动']);
  vm.runInContext("activeProductionMode = 'C'; enterSelectedDirector()", context);
  assert.match(events[3], /没有独立编导台/);
});

test('A mode rejects empty generation and keeps the retired plan/action APIs inert', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-retired-a-'));
  fs.mkdirSync(path.join(root, 'director'), {recursive: true});
  fs.writeFileSync(path.join(root, 'director', 'storyboard.json'), JSON.stringify({fps: 30, shots: [{text: '历史镜头', durationInFrames: 90}]}));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, ['console-server.mjs'], {
    cwd: import.meta.dirname,
    env: {...process.env, SHOTCRAFT_ROOT: root, PORT: String(port)},
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(`${base}/api/state`); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'console server did not start');
    const subtitleUrl = base + '/api/subtitle-v1/settings';
    const subtitleResponse = await (await fetch(subtitleUrl)).json();
    const subtitleSettings = subtitleResponse.settings;
    subtitleSettings.horizontal.templateId = subtitleSettings.vertical.templateId = 'shadow';
    const savedShadow = await (await fetch(subtitleUrl,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(subtitleSettings)})).json();
    assert.equal(savedShadow.ok,true);
    const reloadedShadow = await (await fetch(subtitleUrl)).json();
    assert.equal(reloadedShadow.settings.horizontal.templateId,'shadow');
    assert.equal(reloadedShadow.settings.vertical.templateId,'shadow');
    const invalid = await (await fetch(`${base}/api/generate`, {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:''})})).json();
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /文案/);
    const unconfirmed = await (await fetch(`${base}/api/generate`, {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:'测试文案'})})).json();
    assert.equal(unconfirmed.ok, false);
    assert.match(unconfirmed.error, /确认模型调用可能计费/);
    const oldPlan = await fetch(`${base}/api/generate/plan`, {method:'POST'});
    assert.equal(oldPlan.status, 410);
    for (const action of ['plan', 'generate']) {
      const response = await fetch(`${base}/api/action`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action}),
      });
      assert.equal(response.status, 410);
    }
    const existing = await (await fetch(`${base}/api/storyboard`)).json();
    assert.equal(existing.exists, true);
    assert.equal(existing.storyboard.shots[0].text, '历史镜头');
    const post = async (route, body) => (await fetch(base + route, {method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    assert.match((await post('/api/action',{action:'render'})).error,/分镜审核/);
    assert.match((await post('/api/render/confirm',{})).error,/已审核任务 ID/);
    // Simulate a surviving worker after the console was restarted. No model is invoked.
    fs.mkdirSync(path.join(root,'director','a-mode-runs'),{recursive:true});
    fs.writeFileSync(path.join(root,'director','a-mode-runs','operation.json'),JSON.stringify({status:'running',pid:process.pid}));
    const blocked = await Promise.all([
      post('/api/generate',{text:'测试文案',approveModelCost:true}),
      post('/api/render/confirm',{legacyConfirmed:true}),
    ]);
    for (const result of blocked) {assert.equal(result.ok,false); assert.match(result.error,/正在执行/);}
    const runId = '12345678-1234-1234-1234-123456789abc';
    const runDir = path.join(root,'director','a-mode-runs',runId);
    fs.mkdirSync(runDir,{recursive:true});
    fs.writeFileSync(path.join(runDir,'status.json'),JSON.stringify({runId,status:'error'}));
    fs.writeFileSync(path.join(runDir,'timing.json'),'{}');
    const audioDir = path.join(root,'template','public','audio','a-mode');
    fs.mkdirSync(audioDir,{recursive:true});
    fs.writeFileSync(path.join(audioDir,runId+'.mp3'),'fixture');
    const unapprovedResume = await post('/api/a-mode/resume',{runId});
    assert.equal(unapprovedResume.ok,false);
    assert.match(unapprovedResume.error,/需确认可能计费/);
    assert.deepEqual((await (await fetch(`${base}/api/state`)).json()).tasks, []);
    assert.equal(fs.existsSync(path.join(root, 'director', '_input.txt')), false);
  } finally {
    server.kill();
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('active director wins over a newer unrelated render failure', () => {
  const {button,existingButton,run,context} = createState();
  context.tasks = [{type:'a-director',status:'running',startedAt:1}, {type:'render',status:'error',startedAt:2}];
  run('syncProductionStartState(tasks)');
  assert.equal(button.hidden,true);
  assert.equal(existingButton.disabled,true);
});

test('readiness in flight suppresses double-click and releases on cancellation', async () => {
  const code = html.slice(html.indexOf('function showAModeStartError('),html.indexOf('$("#production-start-generation").onclick = startSelectedProduction;'));
  let resolveReadiness;
  let calls = 0;
  const context = vm.createContext({productionRequestActive:false,renderRetryActive:false,productionStartState:'ready',activeProductionMode:'A',
    $:()=>({value:'文案',hidden:false}),refresh:()=>{},
    apiFetch:()=>{calls++;return new Promise(resolve=>{resolveReadiness=resolve;});},window:{confirm:()=>false}});
  vm.runInContext(code,context);
  const first = vm.runInContext('startSelectedProduction()',context);
  await vm.runInContext('startSelectedProduction()',context);
  assert.equal(calls,1);
  resolveReadiness({ok:true,configured:true});
  await first;
  assert.equal(context.productionRequestActive,false);
});

test('all inline UI scripts parse after governance changes', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('editorial semantic success cannot hide automatic preflight failure', () => {
  const context=vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('function currentTalkcraftFailure('),html.indexOf('async function renderBProductionAudit(')),context);
  for (const name of ['talkcraft-editorial','talkcraft-editorial-check']) {
    const failure={code:'TALKCRAFT_PREFLIGHT_FAILED',task:{name}};
    context.run={semanticPassed:true,candidatesReady:true,preflight:false,failureReport:failure};
    assert.equal(vm.runInContext('currentTalkcraftFailure(run)',context),failure);
    context.run.preflight=true;
    context.run.preflightCompleted=true;
    assert.equal(vm.runInContext('currentTalkcraftFailure(run)',context),null);
  }
});

test('material video uses the render process API address', () => {
  const render = fs.readFileSync(new URL('./director/render.mjs', import.meta.url), 'utf8');
  const video = fs.readFileSync(new URL('./template/src/DynamicVideo.tsx', import.meta.url), 'utf8');
  assert.match(render, /process\.env\.PORT \|\| 8765/);
  assert.match(render, /JSON\.stringify\(\{ storyboard, bgm, materialApiBaseUrl \}/);
  assert.match(render, /headers: \{Range: 'bytes=0-1'\}/);
  assert.match(video, /src=\{materialApiBaseUrl \+ "\/api\/library\/video\?path="/);
  assert.doesNotMatch(video, /src=\{"http:\/\/127\.0\.0\.1:8765\/api\/library\/video/);
  assert.doesNotMatch(video, /materialApiBaseUrl = 'http:\/\/127\.0\.0\.1:8765'/);
  assert.match(video, /未指定 materialApiBaseUrl/);
});
