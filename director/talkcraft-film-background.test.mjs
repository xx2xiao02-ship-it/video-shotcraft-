import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFilmBackground,saveFilmBackground,filmBackgroundFile,snapshotFilmBackground,assertFilmBackgroundSnapshot,normalizeFilmBackground} from './talkcraft-film-background.mjs';
const fixture=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'film-background-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
test('default is the approved folded paper; task snapshot is stable after future setting changes',t=>{
 const root=fixture(t),project=path.join(root,'task');
 assert.equal(readFilmBackground(root).kind,'paper');
 const snapshot=snapshotFilmBackground(root,project);
 assert.equal(snapshot.sha256,'86c945198ae2b50c79d8a63641f5ca72e6dc3056bcc208324b54da9335a9bcce');
 saveFilmBackground(root,{kind:'solid',color:'#123456',fit:'contain'});
 assert.equal(readFilmBackground(root).kind,'solid');
 assert.equal(assertFilmBackgroundSnapshot(project,snapshot).kind,'paper');
 fs.writeFileSync(path.join(project,'remotion/public',snapshot.src),'changed');
 assert.throws(()=>assertFilmBackgroundSnapshot(project,snapshot),/快照缺失或已改变/);
});
test('custom background image is locally bound and content addressed',t=>{
 const root=fixture(t),bytes=fs.readFileSync(filmBackgroundFile(root));
 const saved=saveFilmBackground(root,{kind:'image',color:'#d6cebf',fit:'cover',imageDataUrl:'data:image/png;base64,'+bytes.toString('base64')});
 assert.match(saved.asset,/^[0-9a-f]{64}\.png$/);
 const snapshot=snapshotFilmBackground(root,path.join(root,'task'));
 assert.equal(snapshot.sha256,saved.asset.split('.')[0]);
 assert.equal(snapshot.kind,'image');
});
test('invalid images, remote paths and invalid settings cannot replace saved background',t=>{
 const root=fixture(t);
 for(const input of [{kind:'image',asset:'../../secret.png'},{kind:'solid',color:'red'},{kind:'paper',fit:'stretch'},
   {kind:'image',imageDataUrl:'https://example.com/image.png'},{kind:'image',imageDataUrl:'data:image/png;base64,YWJj'}]){
  assert.throws(()=>saveFilmBackground(root,input));
 }
 assert.equal(readFilmBackground(root).kind,'paper');
 assert.throws(()=>normalizeFilmBackground({kind:'video'}));
});
test('solid background has no media path and is valid as a renderer input',t=>{
 const root=fixture(t);saveFilmBackground(root,{kind:'solid',color:'#d6cebf'});
 const snap=snapshotFilmBackground(root,path.join(root,'task'));
 assert.equal(snap.src,undefined);assert.equal(filmBackgroundFile(root),null);
 assert.equal(assertFilmBackgroundSnapshot(root,snap).color,'#d6cebf');
});

