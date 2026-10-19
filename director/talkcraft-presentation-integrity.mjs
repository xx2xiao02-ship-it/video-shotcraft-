import {titleFocus} from './talkcraft-title-presentation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chooseReadableText} from './talkcraft-color-contrast.mjs';
import {hostPresentationDecision} from './talkcraft-host-context.mjs';
import {fileURLToPath} from 'node:url';
import {approvePresentationIntegrity} from './talkcraft-presentation-approval.mjs';
import {discoverMaterialSources} from './talkcraft-material-research.mjs';

export const INTEGRITY_VERSION='presentation-integrity-v1';
export const MEDIA_PRESENTATION_CARDS=['cursor-actor-demo','tilt-3d-page','host-shrink-to-chip'];
export const TWO_PHASE_CARDS=['black-slam-transition','particle-weld-transition','overexpose-flip-transition'];
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const clean=s=>String(s||'').replace(/[\s\p{P}]/gu,'');
const protectedInputs=['source-run.json','input.txt','aligned-sentences.json','audio/full.mp3','remotion/shots.json','remotion/native-presentation.json','remotion/word-reveal-plan.json','material-research-plan.json'];
const rulesSha=()=>hash(['talkcraft-presentation-integrity.mjs','talkcraft-presentation-upgrade-source.mjs','talkcraft-presentation-runtime.tsx','talkcraft-presentation-approval.mjs','talkcraft-host-context.mjs','talkcraft-color-contrast.mjs','talkcraft-title-presentation.mjs'].map(n=>fs.readFileSync(new URL(n,import.meta.url))).reduce((a,b)=>Buffer.concat([a,b]),Buffer.alloc(0)));
export function integrityInputs(project){return Object.fromEntries(protectedInputs.map(n=>[n,hash(fs.readFileSync(path.join(project,n)))]));}
export function insidePublic(project,name){
 if(typeof name!=='string'||/^(?:[a-z]+:|[/\\])/iu.test(name))throw Error('素材必须是当前工程内相对路径');
 const root=fs.realpathSync(path.join(project,'remotion/public')),file=fs.realpathSync(path.resolve(root,name.replace(/^remotion\/public\//u,''))),rel=path.relative(root,file);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(file).isFile())throw Error('素材越界');return file;
}
export function attentionRegions({labels,metadata,imageWidth,imageHeight,slot={w:600,h:396}}){
 const clip=metadata.detailBounds;
 if(!clip||![clip.x,clip.y,clip.width,clip.height,imageWidth,imageHeight].every(Number.isFinite)||
   Math.abs(clip.width*(metadata.deviceScaleFactor||1)-imageWidth)>2||Math.abs(clip.height*(metadata.deviceScaleFactor||1)-imageHeight)>2)
  return {mode:'document-context',regions:[],reason:'缺少与当前截图尺寸一致的定位坐标，说明与资料分开展示'};
 const scale=Math.min(slot.w/imageWidth,slot.h/imageHeight),dx=(slot.w-imageWidth*scale)/2,dy=(slot.h-imageHeight*scale)/2;
 const regions=[];
 for(const [index,label]of labels.entries()){
  const text=clean(label),matches=(metadata.headings||[]).filter(h=>text.length>=2&&clean(h.text).includes(text));
  if(matches.length!==1)continue;
  const h=matches[0],x=(h.x-clip.x)*(metadata.deviceScaleFactor||1)*scale+dx,y=(h.y-clip.y)*(metadata.deviceScaleFactor||1)*scale+dy;
  const w=h.width*(metadata.deviceScaleFactor||1)*scale,height=h.height*(metadata.deviceScaleFactor||1)*scale;
  // A clipped paragraph is not a valid quotation target. Never clamp invented
  // coordinates into the image and call that source localization.
  if([x,y,w,height].every(Number.isFinite)&&x>=0&&y>=0&&w>=4&&height>=4&&x+w<=slot.w&&y+height<=slot.h)
   regions.push({index,x,y,w,h:height,quote:h.text,label,method:'unique-literal-dom-region'});
 }
 return {mode:regions.length===labels.length?'source-annotation':'document-context',regions,
  reason:regions.length===labels.length?'逐项唯一原文与可见DOM区域对应':'口播说明不等于资料原文；未匹配项不画引用框、不计为原文命中'};
}
export function transitionContinuity(shot,events){
 const rows=events.filter(e=>e.beatId===shot.id),a=rows.filter(e=>e.field==='textA'),b=rows.filter(e=>e.field==='textB');
 if(!a.length||!b.length||[...a,...b].some(e=>!Number.isInteger(e.localFrame)||e.deferredTo))throw Error(`${shot.id} 对句缺少当前有效字级事件`);
 return {firstFrame:Math.min(...a.map(e=>e.localFrame)),secondFrame:Math.max(...b.map(e=>e.localFrame)),
  strategy:'retain-spoken-outgoing-text-until-incoming-anchor',changesSpeechClock:false};
}
export function auditIntegrityPlan(plan,{project=null}={}){
 const issues=[];
 if(plan?.schema!==INTEGRITY_VERSION||plan.userAcceptance!==false||plan.paidCalls!==0||!Array.isArray(plan.shots))return {passed:false,issues:[{code:'PRESENTATION_INTEGRITY_PLAN_REQUIRED'}]};
 if(project&&(JSON.stringify(plan.inputs)!==JSON.stringify(integrityInputs(project))||plan.rulesSha256!==rulesSha()))issues.push({code:'PRESENTATION_INTEGRITY_STALE'});
 if(project){const shots=read(path.join(project,'remotion/shots.json'));if(shots.length!==plan.shots.length||shots.some(s=>plan.shots.filter(r=>r.shotId===s.id&&r.cardId===s.shotCard).length!==1))issues.push({code:'PRESENTATION_SHOT_COVERAGE'});}
 for(const row of plan.shots){
  if(project&&row.cardId==='behind-text-title'){
   const shot=read(path.join(project,'remotion/shots.json')).find(s=>s.id===row.shotId);
   const expected=titleFocus(shot,read(path.join(project,'aligned-sentences.json')));
   if(JSON.stringify(row.titleFocus)!==JSON.stringify(expected))issues.push({shotId:row.shotId,code:'TITLE_HIERARCHY_UNPROVEN'});
  }
  if(row.mediaRequired&&(!row.media||!row.media.sourceVerified||!row.media.licenseVerified||!row.media.license||!row.media.licenseUrl))issues.push({shotId:row.shotId,code:'PRESENTATION_REAL_MEDIA_REQUIRED'});
  if(project&&row.media)try{if(hash(fs.readFileSync(insidePublic(project,row.media.localPath)))!==row.media.sha256)throw Error('hash');}catch{issues.push({shotId:row.shotId,code:'PRESENTATION_MEDIA_CHANGED'});}
  if(row.attention){
   if(!['source-annotation','document-context'].includes(row.attention.mode))issues.push({shotId:row.shotId,code:'ATTENTION_MODE_INVALID'});
   for(const r of row.attention.regions)if(r.x<0||r.y<0||r.w<4||r.h<4||r.x+r.w>600||r.y+r.h>396||!clean(r.quote).includes(clean(r.label))||r.method!=='unique-literal-dom-region')issues.push({shotId:row.shotId,code:'ATTENTION_REGION_UNPROVEN'});
   if(project)try{
    const image=fs.readFileSync(insidePublic(project,row.attention.sourceImage)),meta=fs.readFileSync(insidePublic(project,row.attention.sourceCoordinates));
    if(hash(image)!==row.attention.imageSha256||hash(meta)!==row.attention.metadataSha256)throw Error('changed');
   }catch{issues.push({shotId:row.shotId,code:'ATTENTION_SOURCE_CHANGED'});}
  }
  if(row.continuity&&row.continuity.secondFrame<row.continuity.firstFrame)issues.push({shotId:row.shotId,code:'TRANSITION_WORD_ORDER_INVALID'});
 }
 return {passed:!issues.length,issues};
}
const pngSize=bytes=>{if(bytes.subarray(1,4).toString()!=='PNG')throw Error('定位图不是PNG');return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};};
const concepts=text=>['政策','信心','预期','消费','储蓄','利率','货币','资金','银行','市场','经济'].filter(t=>text.includes(t));
// Only source records already verified in THIS run can be reused. A search
// candidate never creates authorization, identity evidence or a data claim.
export async function buildIntegrityPlan(project,{fetchImpl=fetch,discover=discoverMaterialSources,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')}={}){
 const shots=read(path.join(project,'remotion/shots.json')),research=read(path.join(project,'material-research-plan.json'));
 const wordFile=path.join(project,'remotion/word-reveals.json');
 const events=read(fs.existsSync(wordFile)?wordFile:path.join(project,'remotion/word-reveal-plan.json')).events;
 const records=research.shots.flatMap(r=>(r.bindings||[]).map(b=>({...b,ownerShotId:r.shotId}))),searches=[],rows=[];
 const cacheFile=path.join(project,'qa/presentation-source-search-cache.json'),cache=fs.existsSync(cacheFile)?read(cacheFile):{};
 for(const shot of shots){
  const p=shot.templateParams?.cardProps||{},row={shotId:shot.id,cardId:shot.shotCard};
  if(shot.shotCard==='behind-text-title')row.titleFocus=titleFocus(shot,read(path.join(project,'aligned-sentences.json')));
  if(shot.subject==='person')row.host=hostPresentationDecision(shot.shotCard);
  if(TWO_PHASE_CARDS.includes(shot.shotCard)){
   row.continuity=transitionContinuity(shot,events);
   row.colors={a:chooseReadableText(p.labelColor||'#8a8a8a',[p.bgA||'#ffffff']),b:chooseReadableText(p.labelColor||'#8a8a8a',[p.bgB||'#f1f1f4'])};
  }
  if(shot.shotCard==='scanline-annotate'){
   const record=records.find(b=>b.ownerShotId===shot.id&&b.field==='src'&&b.localPath===p.src.replace(/^remotion\/public\//u,''));
   if(!record?.sourceCoordinates||!record.sourceVerified||!record.licenseVerified)throw Error(`${shot.id} 缺少当前资料定位来源`);
   const image=fs.readFileSync(insidePublic(project,p.src)),size=pngSize(image),metaFile=insidePublic(project,record.sourceCoordinates),metadata=read(metaFile);
   if(hash(image)!==record.sha256||metadata.url!==record.sourceUrl)throw Error(`${shot.id} 资料原件不一致`);
   row.attention={...attentionRegions({labels:String(p.labels).split('\n').filter(Boolean).map(s=>s.split('|').join('')),metadata,imageWidth:size.width,imageHeight:size.height}),
    imageSha256:record.sha256,sourceImage:p.src,metadataSha256:hash(fs.readFileSync(metaFile)),sourceCoordinates:record.sourceCoordinates};
  }
  if(MEDIA_PRESENTATION_CARDS.includes(shot.shotCard)){
   row.mediaRequired=true;
   const text=Object.values(p).filter(v=>typeof v==='string').join(' '),terms=concepts(text);
   const query=terms.length?terms.join(' ')+' 中文 官方资料':text;
   const key=hash(query),search=cache[key]||{query,onlineFirst:true};
   if(!cache[key]){
    try{const result=await discover(query,{fetchImpl,timeoutMs:10000,queryZh:query});search.discovery={candidates:result.candidates?.length||0,errors:result.errors||[]};}catch(e){search.discovery={candidates:0,error:String(e.message)};}
   }
   // Re-check the original URL of a relevant, authorized online document
   // before falling back to the independent local collection.
   const candidates=records.filter(b=>b.sourceVerified===true&&b.licenseVerified===true&&b.license&&b.licenseUrl&&b.sourceCoordinates).flatMap(b=>{
    try{const meta=read(insidePublic(project,b.sourceCoordinates));const matched=terms.filter(t=>String(meta.text||'').includes(t));
     if(!matched.length||meta.url!==b.sourceUrl||hash(fs.readFileSync(insidePublic(project,b.localPath)))!==b.sha256)return [];
     return [{...b,matched,language: b.contentLanguage==='zh-CN'?1:0}];}catch{return [];}
   }).sort((a,b)=>b.language-a.language||b.matched.length-a.matched.length||a.sourceUrl.localeCompare(b.sourceUrl));
   const seen=new Set();
   for(const c of candidates){
    if(seen.has(c.sourceUrl))continue;seen.add(c.sourceUrl);
    try{
     const response=await fetchImpl(c.sourceUrl,{signal:AbortSignal.timeout(10000)});
     if(!response.ok||new URL(response.url||c.sourceUrl).hostname!==new URL(c.sourceUrl).hostname)continue;
     const current=await response.text();if(!c.matched.some(t=>current.includes(t)))continue;
     row.media={...c,role:'context',onlineVerified:true,verifiedAt:new Date().toISOString(),notEvidenceForNarration:true};break;
    }catch{}
   }
   if(!row.media){
    search.localFallback=true;
    const indexFile=path.join(root,'materials/_index.json'),index=fs.existsSync(indexFile)?read(indexFile):[];
    search.localEntries=index.length;
    // Missing licence metadata cannot be inferred from possession of a file.
    const candidate=index.filter(m=>m.sourceVerified===true&&m.licenseVerified===true&&m.license&&m.licenseUrl&&terms.some(t=>(m.tags||[]).includes(t)))
     .sort((a,b)=>String(a.path).localeCompare(String(b.path)))[0];
    if(candidate){
     const libRoot=fs.realpathSync(path.join(root,'materials/_scenes')),file=fs.realpathSync(path.resolve(libRoot,candidate.path)),rel=path.relative(libRoot,file);
     if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('独立素材库路径越界');
     if(/\.(png|jpe?g|webp)$/iu.test(file)){
      const name=`presentation-media/${hash(fs.readFileSync(file))}${path.extname(file).toLowerCase()}`,target=path.join(project,'remotion/public',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
      row.media={...candidate,localPath:name,sha256:hash(fs.readFileSync(file)),role:'context',notEvidenceForNarration:true,origin:'local-library'};
     }
    }
   }
   search.result=row.media?{localPath:row.media.localPath,sourceUrl:row.media.sourceUrl,role:'context'}:null;
   cache[key]=search;searches.push({...search,shotId:shot.id});
   fs.writeFileSync(cacheFile,JSON.stringify(cache,null,2));
  }
  rows.push(row);
 }
 const source=read(path.join(project,'source-run.json'));
 const plan={schema:INTEGRITY_VERSION,runId:source.runId,inputs:integrityInputs(project),rulesSha256:rulesSha(),shots:rows,searches,paidCalls:0,userAcceptance:false};
 const audit=auditIntegrityPlan(plan,{project});
 return {...plan,audit};
}
export async function preparePresentationIntegrity(project,options={}){
 fs.mkdirSync(path.join(project,'qa'),{recursive:true});
 try{const current=assertPresentationIntegrity(project);return {...current,reused:true,paidCalls:0};}catch{}
 const proposed=await buildIntegrityPlan(project,options);
 // The centre approves the actual run identity, unchanged business inputs,
 // validated source records and zero-billing plan, not a status string.
 if(proposed.runId!==read(path.join(project,'source-run.json')).runId||!auditIntegrityPlan(proposed,{project}).passed) {
  fs.writeFileSync(path.join(project,'qa/presentation-integrity-failure.json'),JSON.stringify(proposed,null,2));
  throw Error('展示修正方案尚未满足原资料与许可约束：'+JSON.stringify(proposed.audit.issues));
 }
 const approval=approvePresentationIntegrity(proposed,{inputs:integrityInputs(project),rulesSha256:rulesSha(),audit:auditIntegrityPlan(proposed,{project})});
 fs.writeFileSync(path.join(project,'remotion/presentation-integrity.json'),JSON.stringify(proposed,null,2));
 fs.writeFileSync(path.join(project,'qa/presentation-integrity-approval.json'),JSON.stringify(approval,null,2));
 return {shots:proposed.shots.length,approval,searches:proposed.searches,issues:proposed.audit.issues};
}
export function assertPresentationIntegrity(project){
 const plan=read(path.join(project,'remotion/presentation-integrity.json')),approval=read(path.join(project,'qa/presentation-integrity-approval.json'));
 const check=auditIntegrityPlan(plan,{project});
 if(!check.passed||approval.runId!==plan.runId||approval.approved!==true||approval.userAcceptance!==false||approval.paidCalls!==0||approval.planSha256!==hash(JSON.stringify(plan)))throw Error('展示修正合同缺失、过期或未通过治理中心审批');
 return {passed:true,shots:plan.shots.length,planSha256:approval.planSha256,userAcceptance:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.log(JSON.stringify(await preparePresentationIntegrity(path.resolve(process.argv[2])),null,2));
}
