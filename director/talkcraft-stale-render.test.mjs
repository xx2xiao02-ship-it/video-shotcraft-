import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {preserveStaleFinalArtifacts} from './talkcraft-stages.mjs';

test('stale final render is archived while current render is preserved',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'talkcraft-stale-render-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const put=(rel,value='x')=>{const file=path.join(project,...rel.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
  put('remotion/out/final.mp4','old-final');
  put('qa/official-render.json','old-proof');
  const archive=preserveStaleFinalArtifacts(project,{isCurrent:()=>false,now:()=>123});
  assert.equal(archive,path.join(project,'qa','render-history','123'));
  assert.equal(fs.existsSync(path.join(project,'remotion/out/final.mp4')),false);
  assert.equal(fs.readFileSync(path.join(archive,'final.mp4'),'utf8'),'old-final');
  assert.equal(fs.readFileSync(path.join(archive,'official-render.json'),'utf8'),'old-proof');
  put('remotion/out/final.mp4','current-final');
  assert.throws(()=>preserveStaleFinalArtifacts(project,{isCurrent:()=>true}),/preserved/);
  assert.equal(fs.readFileSync(path.join(project,'remotion/out/final.mp4'),'utf8'),'current-final');
});
