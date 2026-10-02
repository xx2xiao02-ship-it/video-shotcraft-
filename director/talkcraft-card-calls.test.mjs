import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {approveTalkcraftSample, approveTalkcraftStoryboard, readTalkcraftStatus, recordPreflightResult} from './talkcraft-status.mjs';
import {writeTalkcraftQaManifests} from './talkcraft-qa-manifests.mjs';
import {assertTalkcraftCardCallsBound, assertTalkcraftCardCallsQaEvidence, readTalkcraftCardCalls,
  readTalkcraftCardOptions, talkcraftCardCallsQaEvidence, writeTalkcraftCardCalls} from './talkcraft-card-calls.mjs';

const workspace = path.resolve(process.env.TALKCRAFT_TEST_TEMP_ROOT || 'tmp');
const skillRoot = path.resolve(process.env.TALKCRAFT_SKILL_ROOT || '_audit/video-talkcraft');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');

function fixture({aspectRatio='16:9', themeBg='#f5f7f4', candidate='highlighter-sweep',
  cardCallsRequired=false, secondShot=false} = {}) {
  mkdirSync(workspace, {recursive:true});
  const root = mkdtempSync(path.join(workspace, 'talkcraft-card-calls-test-'));
  const runId = randomUUID();
  const project = path.join(root, 'director', 'b-mode-runs', runId, 'talkcraft');
  mkdirSync(path.join(project, 'audio'), {recursive:true});
  mkdirSync(path.join(project, 'qa'), {recursive:true});
  mkdirSync(path.join(project, 'remotion'), {recursive:true});
  const themeSnapshot = {aspectRatio, bg:themeBg, card:'#ffffff', ink:'#1f2929', mid:'#60706e',
    accent:'#116b59', accent2:'#ac5839', border:'#d9e1db'};
  const totalSeconds = secondShot ? 16 : 8;
  writeFileSync(path.join(project, 'source-run.json'), JSON.stringify({runId, fps:30, totalFrames:totalSeconds * 30, cardCallsRequired,
    aspectRatio, themeSnapshot}));
  writeFileSync(path.join(project, 'semantics.json'), JSON.stringify({sentences:[
    {shot:'s01', weight:'main', sem:['引用']},
    ...(secondShot ? [{shot:'s02', weight:'main', sem:['引用']}] : []),
  ]}));
  writeFileSync(path.join(project, 'SHOTBOOK.md'), '# Shotbook\n\nS01 visual call');
  writeFileSync(path.join(project, 'sources.md'), '# Sources\n\n- [source-1](https://example.com/source)');
  writeFileSync(path.join(project, 'audio', 'timestamps.json'), JSON.stringify({total:totalSeconds, sentences:[{match:0.99}]}));
  writeFileSync(path.join(project, 'audio', 'full.mp3'), 'fixture audio');
  writeFileSync(path.join(project, 'remotion', 'timing.json'), JSON.stringify({totalSec:totalSeconds, scenes:[
    {text:'重点内容', chars:[]}, ...(secondShot ? [{text:'补充内容', chars:[]}] : []),
  ]}));
  const shots = [{id:'s01', start:0, end:8, text:'重点内容', subject:'graphics'},
    ...(secondShot ? [{id:'s02', start:8, end:16, text:'补充内容', subject:'graphics'}] : [])];
  writeFileSync(path.join(project, 'remotion', 'shots.json'), JSON.stringify(shots));
  const candidateEntry = () => candidate ? {media:'文', semantics:['引用'], waived:{}, candidates:{引用:[{
    slug:candidate, score:1, energy:'中', why:['P0'],
  }]}} : {media:'文', semantics:['引用'], waived:{}, candidates:{}};
  const candidates = {s01:candidateEntry(), ...(secondShot ? {s02:candidateEntry()} : {})};
  writeFileSync(path.join(project, 'qa', 'card-candidates.json'), JSON.stringify(candidates));
  writeFileSync(path.join(project, 'qa', 'card-candidates.md'), '# Official candidates');
  recordPreflightResult(root, runId, {passed:true});
  approveTalkcraftStoryboard(root, runId, 'test fixture');
  return {root, runId, project};
}

function highlighterCall(runId) {
  return {runId, calls:[{shotId:'s01', cardId:'highlighter-sweep', props:{
    docHead:'来源摘要', linesBefore:'', keyText:'重点内容', linesAfter:'', hlColor:'#116b59',
    dimTo:0.4, startDelay:0.7, sweepDur:0.6, fontSize:21,
  }, evidenceReferences:['sources.md#source-1']}]};
}

test('options are intersected with official candidates and aspect/theme gates', () => {
  const light = fixture();
  try {
    const options = readTalkcraftCardOptions(light.root, skillRoot, light.runId);
    assert.equal(options.ready, true);
    assert.deepEqual(options.shots[0].options.map(option => option.cardId), ['highlighter-sweep']);
    assert.equal(options.shots[0].options[0].implementation.exportName, 'highlighterSweepCard');
    assert.equal(options.shots[0].options[0].implementation.source, 'workbench/src/cards/highlighter-sweep.tsx');
    assert.match(options.shots[0].options[0].implementation.implementationSha256, /^[0-9a-f]{64}$/u);
    assert.match(options.shots[0].options[0].candidateSetSha256, /^[0-9a-f]{64}$/u);
    assert.notEqual(options.shots[0].options[0].candidateSetSha256, options.shots[0].options[0].implementation.implementationSha256);
  } finally {
    if (!light.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(light.root, {recursive:true, force:true});
  }

  const portrait = fixture({aspectRatio:'9:16', themeBg:'#0e1410'});
  try {
    const options = readTalkcraftCardOptions(portrait.root, skillRoot, portrait.runId);
    assert.deepEqual(options.shots[0].options, []);
    assert.match(options.shots[0].emptyReason, /16:9/u);
  } finally {
    if (!portrait.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(portrait.root, {recursive:true, force:true});
  }

  const unsupported = fixture({candidate:'still-layout-relay'});
  try {
    const options = readTalkcraftCardOptions(unsupported.root, skillRoot, unsupported.runId);
    assert.deepEqual(options.shots[0].options, []);
    assert.equal(options.shots[0].unsupportedCandidates[0].cardId, 'still-layout-relay');
    assert.match(options.shots[0].emptyReason, /不会随机替换/u);
  } finally {
    if (!unsupported.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(unsupported.root, {recursive:true, force:true});
  }
});

test('new card-call runs require explicit calls while legacy runs remain compatible', () => {
  const fresh = fixture({cardCallsRequired:true});
  try {
    assert.throws(() => assertTalkcraftCardCallsBound(fresh.root, skillRoot, fresh.runId,
      {requireCardCalls:true}), /显式保存一张主卡/u);
  } finally {
    if (!fresh.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(fresh.root, {recursive:true, force:true});
  }
  const legacy = fixture();
  try {
    assert.equal(assertTalkcraftCardCallsBound(legacy.root, skillRoot, legacy.runId).present, false);
  } finally {
    if (!legacy.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(legacy.root, {recursive:true, force:true});
  }
});

test('valid calls persist a server-derived binding, assemble the real component, and read back', () => {
  const state = fixture();
  try {
    const saved = writeTalkcraftCardCalls(state.root, skillRoot, state.runId, highlighterCall(state.runId));
    assert.equal(saved.record.schema, 'talkcraft-card-calls-v1');
    assert.equal(saved.record.calls.length, 1);
    assert.equal(saved.record.calls[0].cardId, 'highlighter-sweep');
    assert.equal(saved.record.calls[0].implementationSha256,
      readTalkcraftCardOptions(state.root, skillRoot, state.runId).shots[0].options[0].implementation.implementationSha256);
    assert.ok(saved.record.calls[0].evidence.some(item => item.kind === 'scene-binding'));
    assert.ok(saved.record.calls[0].evidence.some(item => item.kind === 'scene-registry'));
    const scene = path.join(state.project, 'remotion', 'src', 'scenes', 's01.tsx');
    const copiedCard = path.join(state.project, 'remotion', 'src', 'talkcraft-cards', 'highlighter-sweep.tsx');
    const sceneIndex = path.join(state.project, 'remotion', 'src', 'scenes', 'index.ts');
    const soundSource = path.join(state.project, 'remotion', 'src', 'sfx.ts');
    const soundAsset = path.join(state.project, 'remotion', 'public', 'sfx', 'pk-text-marker-pen-line.mp3');
    const mainSource = readFileSync(path.join(state.project, 'remotion', 'src', 'Main.tsx'), 'utf8');
    assert.match(readFileSync(scene, 'utf8'), /highlighterSweepCard as CardDefinition/u);
    assert.match(readFileSync(sceneIndex, 'utf8'), /s01:S01/u);
    assert.match(readFileSync(soundSource, 'utf8'), /pk-text-marker-pen-line\.mp3/u);
    assert.match(readFileSync(soundSource, 'utf8'), /rate\?:number; clip\?:number/u);
    assert.match(mainSource, /playbackRate=\{cue\.rate \?\? 1\}/u);
    assert.match(mainSource, /trimAfter=\{cue\.clip/u);
    assert.ok(saved.record.sfx.assets.some(item => item.file === 'pk-text-marker-pen-line.mp3'));
    assert.ok(existsSync(soundAsset));
    assert.ok(existsSync(copiedCard));
    assert.equal(readTalkcraftCardCalls(state.root, state.runId).present, true);
    assert.equal(assertTalkcraftCardCallsBound(state.root, skillRoot, state.runId).present, true);
    const updated = highlighterCall(state.runId);
    updated.calls[0].props.startDelay = 0.85;
    const reassembled = writeTalkcraftCardCalls(state.root, skillRoot, state.runId, updated);
    assert.equal(reassembled.record.calls[0].callId, saved.record.calls[0].callId);
    assert.equal(reassembled.record.sfx.cues[0].t, 0.85);
    assert.equal(assertTalkcraftCardCallsBound(state.root, skillRoot, state.runId).present, true);
  } finally {
    if (!state.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(state.root, {recursive:true, force:true});
  }
});

test('sample binding may cover s01 first; full-render binding requires every shot', () => {
  const state = fixture({cardCallsRequired:true, secondShot:true});
  try {
    const saved = writeTalkcraftCardCalls(state.root, skillRoot, state.runId, highlighterCall(state.runId));
    assert.equal(saved.record.calls.length, 1);
    assert.equal(assertTalkcraftCardCallsBound(state.root, skillRoot, state.runId,
      {requireCardCalls:true, requiredShotIds:['s01']}).complete, false);
    assert.throws(() => assertTalkcraftCardCallsBound(state.root, skillRoot, state.runId,
      {requireCardCalls:true, requireCompleteCoverage:true}), /仍有镜头未绑定主卡/u);
    const sampleFile = path.join(state.project, 'remotion', 'out', 'preview', 's01.mp4');
    mkdirSync(path.dirname(sampleFile), {recursive:true});
    writeFileSync(sampleFile, 'isolated sample fixture');
    approveTalkcraftSample(state.root, state.runId);
    assert.equal(readTalkcraftStatus(state.root, state.runId).sampleApproved, true);
    const completed = writeTalkcraftCardCalls(state.root, skillRoot, state.runId, {runId:state.runId,calls:[
      ...highlighterCall(state.runId).calls,
      {shotId:'s02', cardId:'highlighter-sweep', props:{
        docHead:'补充摘要', linesBefore:'', keyText:'补充内容', linesAfter:'', hlColor:'#116b59',
        dimTo:0.4, startDelay:0.7, sweepDur:0.6, fontSize:21,
      }, evidenceReferences:['sources.md#source-1']},
    ]});
    assert.equal(completed.record.calls.length, 2);
    assert.equal(assertTalkcraftCardCallsBound(state.root, skillRoot, state.runId,
      {requireCardCalls:true, requireCompleteCoverage:true}).complete, true);
    assert.equal(readTalkcraftStatus(state.root, state.runId).sampleApproved, true);
    const changedS01 = highlighterCall(state.runId);
    changedS01.calls[0].props.keyText = '修改首镜';
    changedS01.calls.push({shotId:'s02', cardId:'highlighter-sweep', props:completed.record.calls[1].props,
      evidenceReferences:completed.record.calls[1].evidence.filter(item => item.kind === 'source-reference').map(item => item.reference)});
    assert.throws(() => writeTalkcraftCardCalls(state.root, skillRoot, state.runId, changedS01), /不能再修改 s01/u);
  } finally {
    if (!state.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(state.root, {recursive:true, force:true});
  }
});

test('official SFX cues follow card timing, bar count, rate, clip, and the final mix cap', () => {
  const alt = fixture({candidate:'alt-block-lines'});
  try {
    const saved = writeTalkcraftCardCalls(alt.root, skillRoot, alt.runId, {runId:alt.runId,calls:[{
      shotId:'s01',cardId:'alt-block-lines',props:{line1:'先做选择',line2:'避免随机',fontSize:66,
        blockColor:'#116b59',ink:'#1f2929',posX:82,lead:0.5},
    }]});
    assert.deepEqual(saved.record.sfx.cues.map(cue => cue.t), [0.76,0.88]);
    assert.ok(saved.record.sfx.cues.every(cue => cue.file === 'click.mp3' && cue.volume <= 0.35));
  } finally {
    if (!alt.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(alt.root, {recursive:true, force:true});
  }

  const chart = fixture({candidate:'bar-chart-growth'});
  try {
    const saved = writeTalkcraftCardCalls(chart.root, skillRoot, chart.runId, {runId:chart.runId,calls:[{
      shotId:'s01',cardId:'bar-chart-growth',props:{title:'半年趋势',barsData:'一月|1\n二月|2',chipText:'持续增长',
        maxVal:10,barColor:'#116b59',titleSize:34,posX:96,posY:96,lead:0.4},
      evidenceReferences:['sources.md#source-1'],
    }]});
    const cues = saved.record.sfx.cues;
    assert.deepEqual(cues.map(cue => cue.t), [0.52,0.72,0.78,1.06]);
    assert.equal(cues.filter(cue => cue.file === 'pk-mech-lock-quick.mp3').length, 2);
    assert.deepEqual(cues.filter(cue => cue.rate).map(cue => cue.rate), [0.92]);
    assert.equal(cues.at(-1).clip, 0.2);
    assert.ok(cues.every(cue => cue.volume <= 0.35));
  } finally {
    if (!chart.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(chart.root, {recursive:true, force:true});
  }
});

test('invalid updates leave the saved call and generated scene unchanged', () => {
  const state = fixture();
  try {
    writeTalkcraftCardCalls(state.root, skillRoot, state.runId, highlighterCall(state.runId));
    const callFile = path.join(state.project, 'qa', 'card-calls.json');
    const sceneFile = path.join(state.project, 'remotion', 'src', 'scenes', 's01.tsx');
    const soundFile = path.join(state.project, 'remotion', 'src', 'sfx.ts');
    const beforeRecord = digest(callFile);
    const beforeScene = digest(sceneFile);
    const beforeSound = digest(soundFile);
    const forged = highlighterCall(state.runId);
    forged.calls[0].sourcePath = 'C:/outside.tsx';
    assert.throws(() => writeTalkcraftCardCalls(state.root, skillRoot, state.runId, forged), /服务端决定/u);
    assert.equal(digest(callFile), beforeRecord);
    assert.equal(digest(sceneFile), beforeScene);
    assert.equal(digest(soundFile), beforeSound);
    const unsupported = highlighterCall(state.runId);
    unsupported.calls[0].cardId = 'still-layout-relay';
    assert.throws(() => writeTalkcraftCardCalls(state.root, skillRoot, state.runId, unsupported), /当前已验证候选/u);
    assert.equal(digest(callFile), beforeRecord);
  } finally {
    if (!state.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(state.root, {recursive:true, force:true});
  }
});

test('call record drives QA manifests and binds the emitted cues to the selected card', () => {
  const state = fixture();
  try {
    const saved = writeTalkcraftCardCalls(state.root, skillRoot, state.runId, highlighterCall(state.runId));
    writeFileSync(path.join(state.project, 'remotion', 'beats.json'), '[]');
    writeTalkcraftQaManifests(state.root, state.runId, skillRoot);
    const cards = JSON.parse(readFileSync(path.join(state.project, 'remotion', 'cards-used.json'), 'utf8'));
    const cues = JSON.parse(readFileSync(path.join(state.project, 'remotion', 'cues.json'), 'utf8'));
    assert.deepEqual(cards.slugs, ['highlighter-sweep']);
    assert.deepEqual(cards.byShot, {s01:['highlighter-sweep']});
    assert.equal(cues.length, 1);
    assert.equal(cues[0].t, 0.7);
    assert.equal(cues[0].volume, 0.35);
    assert.equal(cues[0].file, 'pk-text-marker-pen-line.mp3');
    assert.equal(cues[0].clip, 0.6);
    assert.equal(saved.record.sfx.sourceSha256, digest(path.join(state.project, 'remotion', 'src', 'sfx.ts')));
    const evidence = talkcraftCardCallsQaEvidence(state.root, skillRoot, state.runId);
    assert.equal(assertTalkcraftCardCallsQaEvidence(state.root, skillRoot, state.runId, evidence), true);
    assert.throws(() => assertTalkcraftCardCallsQaEvidence(state.root, skillRoot, state.runId,
      {...evidence,recordSha256:'0'.repeat(64)}), /missing or stale/u);
    writeFileSync(path.join(state.project, 'remotion', 'cues.json'), '[]\n');
    assert.throws(() => assertTalkcraftCardCallsQaEvidence(state.root, skillRoot, state.runId,evidence), /missing or stale/u);
  } finally {
    if (!state.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(state.root, {recursive:true, force:true});
  }
});

test('legacy QA still reads SHOTBOOK and legacy src/cards without a call record', () => {
  const state = fixture({candidate:null});
  try {
    const cardsDir = path.join(state.project, 'remotion', 'src', 'cards');
    const sfxDir = path.join(state.project, 'remotion', 'public', 'sfx');
    mkdirSync(cardsDir, {recursive:true});
    mkdirSync(sfxDir, {recursive:true});
    writeFileSync(path.join(state.project, 'SHOTBOOK.md'), '# Shotbook\n\n## S01\n- 选卡行：引用 → highlighter-sweep');
    writeFileSync(path.join(cardsDir, 'highlighter-sweep.tsx'), 'legacy source copy');
    writeFileSync(path.join(state.project, 'remotion', 'src', 'sfx.ts'),
      "export const CUES = [{t:0.5,file:'click.mp3',volume:0.2}];\n");
    writeFileSync(path.join(sfxDir, 'click.mp3'), 'legacy cue');
    writeFileSync(path.join(state.project, 'remotion', 'beats.json'), '[]');
    writeTalkcraftQaManifests(state.root, state.runId, skillRoot);
    const cards = JSON.parse(readFileSync(path.join(state.project, 'remotion', 'cards-used.json'), 'utf8'));
    assert.deepEqual(cards.slugs, ['highlighter-sweep']);
    assert.deepEqual(cards.byShot, {s01:['highlighter-sweep']});
    assert.equal(existsSync(path.join(state.project, 'qa', 'card-calls.json')), false);
  } finally {
    if (!state.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(state.root, {recursive:true, force:true});
  }
});

test('legacy multi-layer scene trees without a call record remain untouched', () => {
  const state = fixture({candidate:null});
  try {
    const sceneDir = path.join(state.project, 'remotion', 'src', 'scenes');
    mkdirSync(sceneDir, {recursive:true});
    writeFileSync(path.join(state.project, 'remotion', 'src', 'index.ts'), 'legacy entry');
    writeFileSync(path.join(sceneDir, 's01.tsx'), 'export const S01 = () => null;');
    writeFileSync(path.join(sceneDir, 's01-layer.tsx'), 'export const Layer = () => null;');
    writeFileSync(path.join(sceneDir, 'index.ts'), 'export const SCENES = {s01:S01};\nexport const SCENE_PARAMS = {};');
    const before = digest(path.join(sceneDir, 'index.ts'));
    assert.equal(assertTalkcraftCardCallsBound(state.root, skillRoot, state.runId).present, false);
    assert.equal(digest(path.join(sceneDir, 'index.ts')), before);
    assert.equal(existsSync(path.join(state.project, 'qa', 'card-calls.json')), false);
  } finally {
    if (!state.root.startsWith(workspace + path.sep)) throw new Error('Test cleanup escaped workspace');
    rmSync(state.root, {recursive:true, force:true});
  }
});
