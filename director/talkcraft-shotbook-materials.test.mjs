import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {syncShotbookMaterials} from './talkcraft-shotbook-materials.mjs';
import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'shotbook-material-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 fs.mkdirSync(path.join(p,'qa'));fs.mkdirSync(path.join(p,'remotion/public/pages'),{recursive:true});
 const src='remotion/public/pages/detail.png';fs.writeFileSync(path.join(p,src),'verified-image-fixture');
 const shots=[{id:'s07',templateParams:{cardProps:{src,src2:src,text:'looks-like-image.png'}}},{id:'s08',subject:'person',templateParams:{cardProps:{hostSrc:'host.webm'}}}];
 const rows=['src','src2'].map(field=>({shotId:'s07',field,path:src,sha256:hash('verified-image-fixture'),kind:'image',origin:'explicit'}));
 rows.push({shotId:'s08',field:'hostSrc',path:'host.webm',kind:'video',origin:'digital-human-runtime'});
 const book='# SHOTBOOK\n## s07 1–2 秒\n- 意图：保留原始设计\n- 素材：文\n## s08 2–3 秒\n- 素材：文\n## 未完成 / 未采集清单\n- 需人审\n';
 const save=()=>{fs.writeFileSync(path.join(p,'remotion/shots.json'),JSON.stringify(shots));fs.writeFileSync(path.join(p,'qa/template-material-bindings.json'),JSON.stringify({schema:'talkcraft-template-material-bindings-v1',bindings:rows,unresolved:[]}));fs.writeFileSync(path.join(p,'SHOTBOOK.md'),book);};save();
 return {p,shots,rows,book,save};
}
test('当前已核验内部素材槽同步到SHOTBOOK，去重但不算人物和疑似路径文字，保留设计及备份',t=>{
 const f=fixture(t),r=syncShotbookMaterials(f.p);assert.equal(r.changed,true);
 const next=fs.readFileSync(path.join(f.p,'SHOTBOOK.md'),'utf8');assert.match(next,/- 素材：图\(remotion\/public\/pages\/detail.png\)/);
 assert.equal((next.match(/detail.png/g)||[]).length,1);assert.match(next,/s08 2–3 秒\n- 素材：文/);assert.match(next,/意图：保留原始设计/);
 assert.equal(fs.readFileSync(path.join(f.p,'qa/shotbook-material-history',hash(f.book)+'.md'),'utf8'),f.book);
 assert.equal(syncShotbookMaterials(f.p).changed,false);
});
test('过期哈希或当前槽位不符时原子拒绝，不能借旧记录声明素材',t=>{
 const f=fixture(t);f.rows[0].sha256='0'.repeat(64);f.save();assert.throws(()=>syncShotbookMaterials(f.p),/哈希失效/);
 assert.equal(fs.readFileSync(path.join(f.p,'SHOTBOOK.md'),'utf8'),f.book);
 f.rows[0].sha256=hash('verified-image-fixture');f.shots[0].templateParams.cardProps.src='other.png';f.save();
 assert.throws(()=>syncShotbookMaterials(f.p),/当前槽位不一致/);
});
test('已有不同素材声明保留并报冲突，不静默覆盖作者记录',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.p,'SHOTBOOK.md'),f.book.replace('- 素材：文','- 素材：图(custom.png)'));
 assert.throws(()=>syncShotbookMaterials(f.p),/已有不同素材声明/);assert.match(fs.readFileSync(path.join(f.p,'SHOTBOOK.md'),'utf8'),/custom.png/);
});
test('新任务真实视频按正式边框实现同步上游可读声明；重复继续幂等，文件变化拒绝',t=>{
 const f=fixture(t),file=path.join(f.p,'remotion/public/context.mp4');
 execFileSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=64x64:r=30','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',file],{stdio:'ignore'});
 Object.assign(f.shots[0],{start:0,end:.8,shotCard:'tracking-in'});
 Object.assign(f.shots[0].templateParams,{materialRole:'background',materialSrc:'context.mp4',materialSha256:hash(fs.readFileSync(file)),materialSourceId:'this-task-source',materialMatchReason:'已核验本句市场语境',backgroundPresentation:'text-video-v1'});
 f.save();assert.equal(syncShotbookMaterials(f.p).changed,true);
 const book=fs.readFileSync(path.join(f.p,'SHOTBOOK.md'),'utf8');assert.match(book,/## s07[^\n]*\n- 背景呈现：ThemeFrame hairline/u);
 assert.equal(syncShotbookMaterials(f.p).changed,false);
 const receipt=JSON.parse(fs.readFileSync(path.join(f.p,'qa/shotbook-material-sync.json')));
 assert.equal(receipt.backgroundFraming[0].video.sha256,f.shots[0].templateParams.materialSha256);
 assert.equal(receipt.backgroundFraming[0].sourceSha256.length,64);
 fs.writeFileSync(file,'not-a-video');assert.throws(()=>syncShotbookMaterials(f.p),/真实视频证明/);
 assert.equal(fs.readFileSync(path.join(f.p,'SHOTBOOK.md'),'utf8'),book);
});
