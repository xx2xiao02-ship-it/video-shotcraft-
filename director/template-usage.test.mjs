import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createTemplateUsage, writeTemplateUsage} from './template-usage.mjs';
import {preflightAModeRender} from './a-mode-render-preflight.mjs';
import {createTalkcraftTemplateUsage} from './talkcraft-template-usage.mjs';
import {assertBackgroundCoverage, backgroundCoverage} from './background-policy.mjs';

test('a claim label or inline video never silently exempts a background', () => {
  assert.deepEqual(backgroundCoverage([
    {type:'claim', materialRole:'none', reason:'普通观点'},
    {material:'video.mp4', materialRole:'inline-element'},
    {material:'video.mp4', materialRole:'none', reason:'特殊强调免背景：留白'},
  ]).missingShots, [1, 2, 3]);
  assert.throws(() => assertBackgroundCoverage(Array.from({length:4}, () => (
    {type:'claim', materialRole:'none', reason:'特殊强调免背景：反差停顿'}))), /占一半/);
});

test('legacy A storyboard cannot bypass coverage by omitting the policy marker', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-legacy-background-'));
  try {
    fs.writeFileSync(path.join(root, 'storyboard.json'), JSON.stringify({mode:'A', fps:30,
      shots:[{durationInFrames:90, type:'claim', materialRole:'none'}]}));
    assert.throws(() => preflightAModeRender(root, {runDir:root}), /第 1 镜缺少背景/);
    const file = path.join(root, 'storyboard.json');
    const sb = JSON.parse(fs.readFileSync(file));
    delete sb.mode;
    sb.runId = 'legacy';
    sb.audio = 'audio/a-mode/legacy.mp3';
    fs.writeFileSync(file, JSON.stringify(sb));
    assert.throws(() => preflightAModeRender(root, {runId:'legacy', runDir:root}), /缺少背景/);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});

test('TalkCraft counts multiple cards per shot once and rounds absolute frame boundaries', () => {
  const report = createTalkcraftTemplateUsage({fps:30, aspectRatio:'9:16'},
    [{id:'s01', start:0, end:1.05}, {id:'s02', start:1.05, end:2}, {id:'s03', start:2, end:3}],
    {s01:['title', 'title', 'image'], s02:['title']});
  assert.equal(report.totalShots, 3);
  assert.equal(report.templatedShots, 2);
  assert.deepEqual(report.noTemplateShotIds, ['s03']);
  assert.equal(report.templates.find(item => item.template === 'title').calls, 2);
  assert.equal(report.templates.find(item => item.template === 'title').durationInFrames, 60);
  assert.equal(report.templates.find(item => item.template === 'title').durationSeconds, 2);
  assert.equal(report.backgroundVideoShots, undefined);
});

const shots = [
  {shotCard:'title', durationInFrames:50, material:'video.mp4', materialRole:'backdrop'},
  {shotCard:'title', durationInFrames:25, type:'claim', materialRole:'none', direction:'特殊强调免背景：证据展示后停顿强调唯一结论'},
  {durationInFrames:25, material:'video.mp4', materialRole:'inline-element'},
];

test('template counts preserve all shots and use the declared fps', () => {
  const report = createTemplateUsage({fps:25, aspectRatio:'9:16', shots});
  assert.equal(report.templates.reduce((sum, item) => sum + item.calls, 0), 3);
  assert.equal(report.templatedShots, 2);
  assert.equal(report.noTemplateShots, 1);
  assert.equal(report.backgroundVideoShots, 1);
  assert.deepEqual(report.exemptBackgroundShots, [2]);
  assert.deepEqual(report.missingBackgroundShots, [3]);
  assert.equal(report.templates[0].durationSeconds, 3);
  assert.deepEqual(report.templates[0].shots, [1, 2]);
});

test('persisted report is bound to the supplied video bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-usage-'));
  try {
    const video = path.join(dir, 'fixture.mp4');
    fs.writeFileSync(video, 'test bytes, not a rendered video');
    const file = path.join(dir, 'template-usage.json');
    const report = writeTemplateUsage(file, {fps:25, shots}, video);
    assert.equal(report.videoSha256, crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex'));
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), report);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('strict render preflight rejects inline-only video and accepts explicit claim exemption', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotcraft-background-'));
  try {
    const audioDir = path.join(dir, 'template', 'public');
    fs.mkdirSync(audioDir, {recursive:true});
    fs.writeFileSync(path.join(audioDir, 'voice.mp3'), 'fixture');
    const file = path.join(dir, 'storyboard.json');
    const storyboard = {fps:25, audio:'voice.mp3', backgroundPolicy:'video-default-v1', shots};
    fs.writeFileSync(file, JSON.stringify(storyboard));
    assert.throws(() => preflightAModeRender(dir, {runDir:dir, probe:() => 4}), /第 3 镜缺少背景/);
    storyboard.shots = [shots[0], shots[1]];
    fs.writeFileSync(file, JSON.stringify(storyboard));
    fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify({fps:25, totalFrames:75}));
    assert.equal(preflightAModeRender(dir, {runDir:dir, probe:() => 3}).shots.length, 2);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});
