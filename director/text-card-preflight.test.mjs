import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {preflightAModeRender} from './a-mode-render-preflight.mjs';
import {installTextAdmissionFixture} from './test-support/text-admission-fixture.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'text-preflight-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'director'));
  fs.mkdirSync(path.join(root,'template/public'),{recursive:true});
  fs.writeFileSync(path.join(root,'template/public/audio.mp3'),'synthetic control-flow audio');
  installTextAdmissionFixture(root);
  const write=shot=>fs.writeFileSync(path.join(root,'director/storyboard.json'),JSON.stringify({mode:'A',fps:30,audio:'audio.mp3',shots:[shot]}));
  return {root,write};
}
test('long business admission does not permit arbitrary frames, capacity or stale source',t=>{
  const {root,write}=fixture(t);
  const shot={shotCard:'typography/blur-slide',durationInFrames:180,displayLines:['保留储备','才有选择'],material:'real.mp4',materialRole:'backdrop'};
  write(shot);assert.equal(preflightAModeRender(root,{probe:()=>6}).shots[0].shotCard,shot.shotCard);
  write({...shot,durationInFrames:90});assert.throws(()=>preflightAModeRender(root,{probe:()=>3}),/180帧/);
  write({...shot,displayLines:['不能丢掉这一行']});assert.throws(()=>preflightAModeRender(root,{probe:()=>6}),/容量/);
  write(shot);fs.writeFileSync(path.join(root,'unit-source.txt'),'changed');
  assert.throws(()=>preflightAModeRender(root,{probe:()=>6}),/业务验收/);
});
test('short admission is independent of long admission and retains its own capacity',t=>{
  const {root,write}=fixture(t);
  const shot={shotCard:'typography/marker-underline-title',durationInFrames:60,displayLines:['现金','更有用'],material:'real.mp4',materialRole:'backdrop'};
  write(shot);assert.throws(()=>preflightAModeRender(root,{probe:()=>2}));
  const source='synthetic short renderer';fs.writeFileSync(path.join(root,'short-source.txt'),source);
  fs.writeFileSync(path.join(root,'director/short-card-production-admission.json'),JSON.stringify({schema:'short-card-acceptance-v1',fps:30,
    localVisualReview:'passed',sourceHashes:{'short-source.txt':crypto.createHash('sha256').update(source).digest('hex')},
    cards:[{id:shot.shotCard,status:'accepted',fps:30,acceptedFrames:[60],completionFrame:42,holdFrames:18,exitFrames:0,maxLines:2,maxChars:6}]}));
  assert.equal(preflightAModeRender(root,{probe:()=>2}).shots[0].durationInFrames,60);
  write({...shot,displayLines:['这行超过六字限制','更有用']});assert.throws(()=>preflightAModeRender(root,{probe:()=>2}),/容量/);
  write(shot);fs.writeFileSync(path.join(root,'short-source.txt'),'changed');
  assert.throws(()=>preflightAModeRender(root,{probe:()=>2}));
});
