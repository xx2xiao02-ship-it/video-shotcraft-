import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadMaterialIndex,matchSceneVideos} from './b-mode-material-match.mjs';
import {fitVideoPlayback} from './video-material-policy.mjs';

function materialLibraryRoot(root) {
 const primary=path.join(root,'materials','_scenes');
 if(fs.existsSync(primary)) {
   const probe=fs.readdirSync(primary,{withFileTypes:true}).some(entry=>entry.isFile()||entry.isDirectory());
   if(probe)return path.join(root,'materials');
 }
 const isolated=path.join(root,'.isolated','digital-human','materials');
 if(fs.existsSync(path.join(isolated,'_scenes')))return isolated;
 return path.join(root,'materials');
}
const isBackgroundRole = value => ['background', '背景素材'].includes(String(value || '').trim().toLowerCase());
export function allocateUniqueBackgrounds(root,project){
 const file=path.join(project,'remotion/shots.json'),shots=JSON.parse(fs.readFileSync(file,'utf8'));
 // The model may return the business label in Chinese. Normalize it before
 // allocation so every downstream renderer and exclusivity check sees one role.
 for (const shot of shots) {
   const params = shot.templateParams || {};
   if (isBackgroundRole(params.materialRole)) params.materialRole = 'background';
 }
 const genericQuery = value => /按已有口播语义绑定|城市素材仅作背景底床|人物输入保持既有时间轴/u.test(String(value || ''));
 const queryFor = shot => [shot.intent, shot.visual, shot.templateParams?.materialQuery]
   .filter(value => value && !genericQuery(value)).join('；');
 const pending=shots.filter(s=>isBackgroundRole(s.templateParams?.materialRole) &&
   (!s.templateParams.materialSrc || !s.templateParams.materialMatchReason || genericQuery(s.templateParams.materialQuery)));
 const libraryRoot=materialLibraryRoot(root);
 const library=loadMaterialIndex(root).filter(v=>v.path&&fs.existsSync(path.join(libraryRoot,'_scenes',v.path)));
 const pendingIds=new Set(pending.map(s=>s.id));
 const used=new Set(shots.filter(s=>!pendingIds.has(s.id)).map(s=>s.templateParams?.materialSourceId).filter(Boolean)),hashes=new Set(),unresolved=[];
 for(const shot of shots){const p=shot.templateParams||{};if(!pendingIds.has(shot.id)&&isBackgroundRole(p.materialRole)&&p.materialSrc){const src=path.resolve(project,'remotion/public',p.materialSrc);if(fs.existsSync(src))hashes.add(createHash('sha256').update(fs.readFileSync(src)).digest('hex'));}}
 let assigned=0;
 for(const shot of pending){
   const p=shot.templateParams,tried=new Set();let found=false;
   for(let attempt=0;attempt<library.length;attempt++){
     const candidates=library.filter(v=>!used.has(String(v.sourceId||v.sourceUrl||v.path))&&!tried.has(v.path));
     const shotDurationSec = Number(shot.end) - Number(shot.start);
     const searchText=queryFor(shot) || String(p.materialQuery || shot.visual || shot.intent || '');
     const match=matchSceneVideos([{text:searchText,durationSec:shotDurationSec}],candidates,{durationSecByScene:[shotDurationSec]})[0];
     if(!match?.path)break;
     tried.add(match.path);const item=candidates.find(v=>v.path===match.path),src=path.join(libraryRoot,'_scenes',match.path);
     const hash=createHash('sha256').update(fs.readFileSync(src)).digest('hex');if(hashes.has(hash))continue;
     const identity=String(item.sourceId||item.sourceUrl||item.path),relative=`broll/${shot.id}-${hash.slice(0,12)}${path.extname(src)}`;
     const destination=path.join(project,'remotion/public',relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(src,destination);
     const playback = Number.isFinite(shotDurationSec) && shotDurationSec > 0
       ? fitVideoPlayback(Number(item.duration_sec), Math.max(1, Math.round(shotDurationSec * 30)), 30)
       : {playbackRate:1};
     Object.assign(p,{materialSrc:relative,materialSourceId:identity,materialQuery:searchText,materialMatchReason:match.reason,
       materialDurationSec:Number(item.duration_sec), materialPlaybackRate:playback.playbackRate,
       materialFit:playback.playbackRate < 1 ? 'slowdown' : 'cover'});
     used.add(identity);hashes.add(hash);assigned++;found=true;break;
   }
   if(!found)unresolved.push({shotId:shot.id,query:p.materialQuery||shot.visual,reason:'没有未使用的独立背景源，需要补充素材'});
 }
 // Existing allocations from an earlier run also receive the same timing
 // contract; otherwise a rerender would still use the old 1x playback path.
 for (const shot of shots) {
   const p = shot.templateParams || {};
   if (!isBackgroundRole(p.materialRole) || !p.materialSrc) continue;
   const identity = String(p.materialSourceId || '').toLowerCase();
   const item = library.find(v => String(v.sourceId || v.sourceUrl || v.path).toLowerCase() === identity ||
     String(v.path).toLowerCase() === identity);
   const duration = Number(p.materialDurationSec || item?.duration_sec);
   const shotDurationSec = Number(shot.end) - Number(shot.start);
   if (Number.isFinite(duration) && duration > 0 && Number.isFinite(shotDurationSec) && shotDurationSec > 0) {
     const playback = fitVideoPlayback(duration, Math.max(1, Math.round(shotDurationSec * 30)), 30);
     Object.assign(p, {materialDurationSec:duration, materialPlaybackRate:playback.playbackRate,
       materialFit:playback.playbackRate < 1 ? 'slowdown' : 'cover'});
   }
 }
 fs.writeFileSync(file,JSON.stringify(shots,null,2));fs.mkdirSync(path.join(project,'qa'),{recursive:true});
 fs.writeFileSync(path.join(project,'qa/background-allocation.json'),JSON.stringify({assigned,unresolved},null,2));
 return {assigned,unresolved};
}
