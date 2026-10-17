import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nativeSampleCurrent,recordSampleRender} from './talkcraft-sample-provenance.mjs';
test('公共版式或字幕取色代码改变后，旧样片不能继续沿用审核凭据',t=>{
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-sample-skin-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const write=(name,value)=>{const f=path.join(project,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,value);};
 const files=['src/scenes/s01.tsx','src/scenes/scene-shared.tsx','src/talkcraft-template-adapter.tsx',
  'src/Main.tsx','src/Subtitles.tsx','src/timing.json','src/theme.ts','src/camera.tsx','overrides.json',
  'src/talkcraft-presentation-skin.mjs','src/talkcraft-color-contrast.mjs','src/text-occurrences.mjs'];
 for(const name of files)write('remotion/'+name,'original');
 write('remotion/shots.json',JSON.stringify([{id:'s01'}]));write('audio/full.mp3','same paid voice');
 write('qa/native-production-plan.json',JSON.stringify({cues:[]}));write('remotion/out/preview/s01.mp4','fixture sample bytes');
 recordSampleRender(project);assert.equal(nativeSampleCurrent(project),true);
 for(const name of files.slice(-3)){
  write('remotion/'+name,'changed skin');assert.equal(nativeSampleCurrent(project),false);
  write('remotion/'+name,'original');assert.equal(nativeSampleCurrent(project),true);
 }
});
test('shared scaffold does not send legacy card-call samples through the native proof gate',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-sample-proof-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'remotion/src/scenes'),{recursive:true});fs.mkdirSync(path.join(project,'qa'));
  fs.writeFileSync(path.join(project,'remotion/src/scenes/scene-shared.tsx'),'shared scaffold');
  assert.equal(nativeSampleCurrent(project),false);
  fs.writeFileSync(path.join(project,'qa/card-calls.json'),JSON.stringify({schema:'talkcraft-card-calls-v1',calls:[{shotId:'s01'}]}));
  assert.equal(nativeSampleCurrent(project),true);
  fs.writeFileSync(path.join(project,'qa/formal-bindings.json'),'{}');
  assert.equal(nativeSampleCurrent(project),false);
});
