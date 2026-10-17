import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {renderTalkcraftWav} from './talkcraft-wav-render.mjs';

test('real WAV export accepts a project with video CRF and preserves audio-only props',async t=>{
  const skillRoot=path.resolve('_audit/video-talkcraft');
  fs.mkdirSync('tmp',{recursive:true});
  const project=fs.mkdtempSync(path.resolve('tmp/wav-crf-regression-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'src'));fs.mkdirSync(path.join(project,'public'));
  fs.symlinkSync(path.join(skillRoot,'runtime/node_modules'),path.join(project,'node_modules'),process.platform==='win32'?'junction':'dir');
  fs.writeFileSync(path.join(project,'package.json'),'{}');
  fs.writeFileSync(path.join(project,'remotion.config.js'),"import {Config} from '@remotion/cli/config';Config.setCrf(10);Config.setVideoImageFormat('png');");
  fs.writeFileSync(path.join(project,'src/index.ts'),`import React from 'react';import {registerRoot,Composition,Audio,staticFile} from 'remotion';
const Main=({sfxSolo,audioOnly})=>{if(!sfxSolo||!audioOnly)throw Error('audio props lost');return React.createElement(Audio,{src:staticFile('tone.wav')});};
registerRoot(()=>React.createElement(Composition,{id:'Main',component:Main,durationInFrames:30,fps:30,width:320,height:180}));`);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=1000:duration=1',path.join(project,'public/tone.wav')]);
  const output=path.join(project,'mix.wav');
  const chrome='C:/Users/Administrator/AppData/Local/Google/Chrome/Bin/chrome.exe';
  await renderTalkcraftWav({project,skillRoot,output,props:{sfxSolo:true},concurrency:1,
    browser:process.env.REMOTION_BROWSER_EXECUTABLE||(fs.existsSync(chrome)?chrome:undefined)});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
  assert.equal(probe.streams.length,1);assert.equal(probe.streams[0].codec_type,'audio');
  assert.ok(Math.abs(Number(probe.format.duration)-1)<1/30);
  execFileSync('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);
  const original=fs.readFileSync(output);
  await assert.rejects(renderTalkcraftWav({project,skillRoot,output}),/禁止覆盖/);
  assert.deepEqual(fs.readFileSync(output),original);
});
