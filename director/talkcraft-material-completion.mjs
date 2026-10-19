import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {withMaterialBindingTransaction} from './talkcraft-material-binding-transaction.mjs';
import {TEXT_VIDEO_CARDS,darkBackgroundContrast,hasVideoBackground} from './talkcraft-text-video.mjs';
import {loadLibraryContract,resolveLibrarySource,libraryContractSnapshot} from './talkcraft-library-contract.mjs';
import {probeMedia} from '../docs/audits/b-talkcraft-target3/validation.mjs';

const LIBRARY_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const save=(p,n,v)=>{const f=path.join(p,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(f+'.tmp',f);};
const names=['input.txt','audio/full.mp3','aligned-sentences.json','semantics.json','remotion/shots.json','material-research-plan.json'];
const inputs=p=>Object.fromEntries(names.map(n=>[n,sha(fs.readFileSync(path.join(p,n)))]));
export function materialInputRecheckRequired(state){
 return state.digitalHumanGenerationPlanned===true?state.mediaPreparationPassed!==true:
  state.workflowPath==='recorded-host'&&state.mediaPreflightPassed!==true;
}
const publicFile=(project,name)=>{
 if(typeof name!=='string'||!/^verified-sources\/[a-f0-9]{64}(?:-frame)?\.(?:webm|ogv|mp4|png|jpe?g|webp)$/u.test(name))throw Error('下载缓存路径不合法');
 const root=fs.realpathSync(path.join(project,'remotion/public')),full=fs.realpathSync(path.join(root,name)),rel=path.relative(root,full);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(full).isFile())throw Error('素材缓存路径越界');return full;
};
// Bilingual search vocabulary describes footage, never factual proof. Do not
// map generic style words (business, premium, technology) into subject evidence.
const vocabulary=[
 [/诺贝尔|nobel/iu,['Nobel ceremony','Nobel lecture'],/nobel/iu],
 [/颁奖|award stage/iu,['award ceremony'],/award|ceremony/iu],
 [/学术|academic/iu,['academic lecture'],/academic|lecture|university/iu],
 [/钱|货币|资金|money/iu,['intitle:banknote','money counting','banknotes'],/banknote|money|currency|现金|钞票/iu],
 [/收入|工资|存款|存钱|储蓄/iu,['intitle:ATM','bank ATM','banknotes'],/bank|atm|banknote|savings|银行/iu],
 [/市场|消费|物价|购物/iu,['street market','shopping market'],/street market|marketplace|shopping|retail|市场|购物/iu],
 [/城市|街景|日常|普通人生活/iu,['city street people'],/city|street|pedestrian|城市|街/iu],
 [/央行|中央银行|中国人民银行/iu,['central bank',"People's Bank of China monetary policy"],/central bank|people.s bank of china|人民银行/iu],
 [/资金.*流动.*示意|money flow|flow of funds/iu,['flow of funds diagram','money flow diagram'],/flow of funds|money flow|资金流/iu],
];
export function sourceSearchContract(query,concepts=[]){
 const text=[query,...concepts].join(' '),groups=vocabulary.filter(([r])=>r.test(text));
 // Named awards/institutions cannot be replaced by generic money footage.
 const special=groups.filter(([r])=>r.source.startsWith('诺贝尔')||r.source.startsWith('央行'));
 const required=special.length?special:
  /收入|工资|存款|存钱|储蓄/u.test(query)&&!/城市|街景/u.test(query)?groups.filter(([r])=>r.source.startsWith('收入')):
  /钱包|口袋|钱/u.test(query)?groups.filter(([r])=>r.source.startsWith('钱')):groups;
 const ceremony=/颁奖|ceremony|award stage/iu.test(text);
 const institution=/中国.*(?:央行|人民银行)|人民银行/u.test(text);
 const economics=/经济学奖|经济学.*诺贝尔|nobel.*economic/iu.test(text);
 const diagram=/示意图|diagram/iu.test(query);
 const document=/公告.*页面|页面.*截图/u.test(query);
 const incompatible=/(?:burn(?:ing|t)?|fire|subprime|mortgage|crisis|protest|war|military|恐怖|焚烧|火灾|危机)/iu;
 const differentAward=/chemistry|medicine|physiology|literature|peace prize|化学|医学|生理|文学|和平奖/iu;
 return {queries:[...new Set([query,...(economics?['Nobel economics ceremony','Nobel economics lecture']:[]),...groups.flatMap(([,q])=>q),...concepts.filter(c=>/^[a-z\s-]+$/iu.test(c))])].filter(Boolean).slice(0,7),
  matches:value=>required.length>0&&required.some(([,q,r])=>r.test(value))&&
   (!incompatible.test(value)||incompatible.test(text))&&
   (!ceremony||/ceremony|presentation|颁奖/iu.test(value))&&
   (!economics||/economic|经济学/iu.test(value))&&
   (!/诺贝尔|nobel/iu.test(text)||! /\big nobel\b/iu.test(value))&&
   (!/诺贝尔|nobel/iu.test(text)||!differentAward.test(value)||differentAward.test(text))&&
   (!diagram||/diagram|schematic|示意|流程图/iu.test(value))&&
   (!document||/announcement|monetary policy|货币政策|公告/iu.test(value))&&
   (!institution||/people.s bank of china|中国人民银行/iu.test(value)),
  matched:value=>required.filter(([,q,r])=>r.test(value)).flatMap(([,q])=>q)};
}
export function materialCompletionPlan(project,catalog,{root=LIBRARY_ROOT}={}){
 const shots=read(path.join(project,'remotion/shots.json')),research=read(path.join(project,'material-research-plan.json'));
 const originalText=fs.readFileSync(path.join(project,'input.txt'),'utf8');
 const economicsAward=/诺贝尔经济学奖/u.test(originalText)&&!/诺贝尔(?:物理|化学|生理|医学|文学|和平)/u.test(originalText);
 const needs=[];
 for(const shot of shots){
  const row=research.shots.find(r=>r.shotId===shot.id),card=catalog.cards.find(c=>c.cardId===shot.shotCard);
  if(!row||!card)continue;
  if(row.backgroundDecision==='use'&&!hasVideoBackground(shot))needs.push({shotId:shot.id,cardId:shot.shotCard,
   field:'@background',kind:'video',query:row.backgroundQuery,
   concepts:[...row.backgroundConcepts||[],...(economicsAward&&/诺贝尔|nobel/iu.test(row.backgroundQuery)?['Nobel economics']:[])],reason:row.backgroundReason,
   durationSeconds:Number(shot.end)-Number(shot.start)});
  for(const [field,kind]of Object.entries(card.policy.media)){
   if(/host/iu.test(field)||shot.templateParams?.cardProps?.[field])continue;
   const query=shot.templateParams?.templateMaterialQueries?.[field];
   if(!query||!['image','image-or-video'].includes(kind))continue;
   const protectedNeed=research.shots.some(r=>(r.research||[]).some(n=>(n.displayShotId||r.shotId)===shot.id&&n.displayField===field));
   if(protectedNeed)continue; // identity/data/evidence use reviewed binding only
   needs.push({shotId:shot.id,cardId:shot.shotCard,field,kind:'image',query,concepts:[],durationSeconds:0});
  }
 }
 const plan={schema:'talkcraft-material-completion-plan-v1',inputs:inputs(project),needs,
  policy:'commons-explicit-free-license-v1',librarySnapshot:libraryContractSnapshot(root),paidCalls:0,productionAdmitted:false};
 return {...plan,planId:digest(plan)};
}
const plain=x=>String(x||'').replace(/<[^>]*>/gu,' ').replace(/&(?:nbsp|amp|quot);/gu,' ').replace(/\s+/gu,' ').trim();
export function commonsCandidate(page,{kind,query,match}){
 const i=page.imageinfo?.[0],e=i?.extmetadata||{};
 if(!i||!/^https:\/\/upload\.wikimedia\.org\//u.test(i.url||'')||
   !/^https:\/\/commons\.wikimedia\.org\/wiki\/File[:%]/u.test(i.descriptionurl||'')||i.size>100*1024*1024)return null;
 const license=plain(e.LicenseShortName?.value),licenseUrl=e.LicenseUrl?.value;
 if(!/^(CC0|CC BY(?:-SA)?(?: [\d.]+)?|Public domain|PD)$/iu.test(license)||
   !/^https?:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//u.test(licenseUrl||'')||
   /non.?commercial|no.?derivatives|non.?free/iu.test(plain(e.UsageTerms?.value)))return null;
 const author=plain(e.Artist?.value),description=plain(e.ImageDescription?.value);
 const text=plain(page.title)+' '+description;
 if(!author||!match.matches(text))return null;
 const mediaPath=new URL(i.url).pathname;
 const video=/\.(?:webm|ogv)$/iu.test(mediaPath),image=/\.(?:png|jpe?g|webp)$/iu.test(mediaPath);
 if(kind==='video'?!video:!image&&!video)return null;
 if(kind==='video'&&(i.width<1280||i.height<720))return null;
 return {sourceId:'commons:'+page.pageid,title:page.title,description,sourceUrl:i.descriptionurl,
  mediaUrl:i.url,kind:video?'video':'image',width:i.width,height:i.height,size:i.size,
  license,licenseUrl,author,query,matchedConcepts:match.matched(text),sourceVerified:true,licenseVerified:true,
  attribution:[page.title,author,license,i.descriptionurl].join(' | ')};
}
export async function discoverCompletionSources(project,need,{fetchImpl=fetch}={}){
 const match=sourceSearchContract(need.query,need.concepts),rows=[],errors=[];
 for(const query of match.queries){
  const key=digest({query,kind:need.kind,policy:'commons-explicit-free-license-v1'}),file='qa/source-discovery/'+key+'.json';
  let record;
  if(fs.existsSync(path.join(project,file)))record=read(path.join(project,file));
  else{
   const u=new URL('https://commons.wikimedia.org/w/api.php');u.search=new URLSearchParams({action:'query',format:'json',
    generator:'search',gsrnamespace:'6',gsrsearch:query+(need.kind==='video'?' filetype:video':''),gsrlimit:'8',
    prop:'imageinfo',iiprop:'url|size|extmetadata'});
   try{const r=await fetchImpl(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP_'+r.status);
    const data=await r.json();if(data.error)throw Error('COMMONS_'+data.error.code);
    record={query,apiUrl:u.href,pages:Object.values(data.query?.pages||{}),checkedAt:new Date().toISOString()};save(project,file,record);
   }catch(e){errors.push({query,message:e.message});continue;}
  }
  for(const p of record.pages){const c=commonsCandidate(p,{...need,query,match});if(c&&!rows.some(x=>x.sourceId===c.sourceId))rows.push({...c,evidence:file,evidenceSha256:sha(fs.readFileSync(path.join(project,file)))});}
  // Search is bounded and whole-node. Multiple candidates allow exclusivity;
  // one discovered URL is never taken as a completed material binding.
  if(rows.length>=5)break;
 }
 return {candidates:rows,errors};
}
export function discoverLocalCompletionSources(root,need){
 const contract=loadLibraryContract(root),match=sourceSearchContract(need.query,need.concepts),candidates=[],rejected=[];
 for(const item of contract.items){
  if(!match.matches([item.path,item.category,...item.tags].join(' ')))continue;
  try{
   const resolved=resolveLibrarySource(contract,item,{probeMedia});
   if(!resolved.accepted){rejected.push({path:item.path,code:resolved.code,message:resolved.message,
    sha256:resolved.sha256,trace:resolved.trace});continue;}
   const {meta,rights}=resolved;
   if(need.kind==='video'&&(meta.kind!=='video'||meta.durationSeconds<need.durationSeconds))continue;
   candidates.push({sourceId:rights.sourceId||rights.sourceUrl,sourceFile:resolved.sourceFile,meta,title:item.path,
    sourceUrl:rights.sourceUrl,license:rights.license,licenseUrl:rights.licenseUrl,author:rights.author,
    sha256:meta.sha256,sourceTrace:resolved.trace,licenseEvidence:resolved.evidence,
    sourceKind:rights.sourceKind||'existing-user-library',rightsBasis:rights.rightsBasis||'verified-library-record',
    sourceVerified:true,licenseVerified:true,
    recordsFile:resolved.recordsFile,recordsSha256:resolved.recordsSha256,libraryPath:item.path,
    ...(rights.contentLanguage?{contentLanguage:rights.contentLanguage}:{}),
    attribution:[item.path,rights.author,rights.license,rights.sourceUrl].filter(Boolean).join(' | '),
    matchedConcepts:match.matched([item.path,...item.tags].join(' '))});
  }catch(e){rejected.push({path:item.path,code:'LOCAL_SOURCE_INVALID',message:e.message});}
 }
 return {candidates,rejected,library:{connected:contract.items.length>0,indexed:contract.items.length,
  ...contract.snapshot,matching:candidates.length+rejected.length,rightsVerified:candidates.length}};
}
async function downloadSource(project,candidate,{fetchImpl=fetch}={}){
 if(!/^https:\/\/upload\.wikimedia\.org\//u.test(candidate.mediaUrl))throw Error('素材下载站点不在来源合同内');
 const key=digest({url:candidate.mediaUrl,evidence:candidate.evidenceSha256}),manifest='qa/source-downloads/'+key+'.json';
 if(fs.existsSync(path.join(project,manifest))){const r=read(path.join(project,manifest)),f=publicFile(project,r.localPath);
  if(r.mediaUrl!==candidate.mediaUrl||r.evidenceSha256!==candidate.evidenceSha256||sha(fs.readFileSync(f))!==r.sha256)throw Error('已下载来源文件变化，停止恢复');return r;}
 const r=await fetchImpl(candidate.mediaUrl,{signal:AbortSignal.timeout(120000),redirect:'error'});
 if(!r.ok||Number(r.headers.get('content-length'))>100*1024*1024)throw Error('素材不可下载或超出100MB预算');
 const parts=[];let bytes=0;
 try{for await(const chunk of r.body){bytes+=chunk.length;if(bytes>100*1024*1024)throw Error('素材超出100MB预算');parts.push(chunk);}}
 catch(e){await r.body?.cancel?.().catch(()=>{});throw e;}
 const data=Buffer.concat(parts),hash=sha(data),ext=path.extname(new URL(candidate.mediaUrl).pathname).toLowerCase();
 const raw='verified-sources/'+hash+ext,full=path.join(project,'remotion/public',raw);fs.mkdirSync(path.dirname(full),{recursive:true});
 if(!fs.existsSync(full))fs.writeFileSync(full,data,{flag:'wx'});else if(sha(fs.readFileSync(full))!==hash)throw Error('下载文件哈希冲突');
 let localPath=raw;
 if(ext==='.ogv'){
  localPath='verified-sources/'+hash+'.mp4';const target=path.join(project,'remotion/public',localPath);
  if(!fs.existsSync(target))execFileSync('ffmpeg',['-v','error','-i',full,'-an','-c:v','libx264','-preset','fast','-crf','20',target],{windowsHide:true,timeout:180000});
 }
 const meta=probeMedia(path.join(project,'remotion/public',localPath));
 const result={...candidate,originalSha256:hash,localPath,sha256:meta.sha256,meta};save(project,manifest,result);return result;
}
export async function executeMaterialCompletion(project,catalog,{fetchImpl=fetch,root=LIBRARY_ROOT,plan=materialCompletionPlan(project,catalog,{root}),approval}={}){
 if(!approval||approval.planId!==plan.planId||approval.inputSha256!==digest(plan.inputs)||approval.productionAdmitted!==false)
  throw Error('素材补全必须由中心批准当前具体方案');
 if(digest(materialCompletionPlan(project,catalog,{root}))!==digest(plan))throw Error('素材补全方案与当前输入不同');
 const report={schema:'talkcraft-material-completion-v1',planId:plan.planId,inputs:plan.inputs,approval,
  operations:[],unresolved:[],paidCalls:0,productionAdmitted:false,userAcceptance:false};
 const saveReport=()=>save(project,'qa/material-completion.json',report);
 const original=read(path.join(project,'remotion/shots.json'));
 const used=new Set(original.map(s=>s.templateParams?.materialSourceId).filter(Boolean));
 const hashes=new Set(original.map(s=>s.templateParams?.materialSha256).filter(Boolean));
 for(const need of plan.needs){
  const discovery=await discoverCompletionSources(project,need,{fetchImpl});let operation;
  // Exhaust eligible online sources before consulting the independent library.
  let candidates=discovery.candidates,local;
  for(let pass=0;pass<2&&!operation;pass++){
  if(pass===1){local=discoverLocalCompletionSources(root,need);candidates=local.candidates;}
  for(const candidate of candidates){
   if(used.has(candidate.sourceId))continue;
   try{
    let downloaded;
    if(candidate.sourceFile){
     const currentLibrary=loadLibraryContract(root),item=currentLibrary.items.find(i=>i.path===candidate.libraryPath);
     if(!item)throw Error('本次素材索引项已变化');
     const verified=resolveLibrarySource(currentLibrary,item,{probeMedia});
     if(!verified.accepted||verified.sha256!==candidate.sha256||digest(verified.evidence)!==digest(candidate.licenseEvidence)||
       verified.rights.sourceUrl!==candidate.sourceUrl||verified.rights.license!==candidate.license)throw Error('执行前来源或许可证据变化');
     const bytes=fs.readFileSync(candidate.sourceFile),hash=sha(bytes);if(hash!==candidate.sha256)throw Error('素材库来源变化');
     const localPath='verified-sources/'+hash+path.extname(candidate.sourceFile).toLowerCase(),target=path.join(project,'remotion/public',localPath);
     fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});
     const evidence='qa/source-discovery/local-'+digest(candidate)+'.json';save(project,evidence,candidate);
     downloaded={...candidate,localPath,evidence,evidenceSha256:sha(fs.readFileSync(path.join(project,evidence)))};
    }else downloaded=await downloadSource(project,candidate,{fetchImpl});
    if(hashes.has(downloaded.sha256))continue;
    if(need.kind==='video'&&(downloaded.meta.kind!=='video'||downloaded.meta.durationSeconds+1/30<need.durationSeconds))continue;
    let localPath=downloaded.localPath,meta=downloaded.meta;
    if(need.kind==='image'&&meta.kind==='video'){
     localPath='verified-sources/'+downloaded.sha256+'-frame.jpg';const target=path.join(project,'remotion/public',localPath);
     if(!fs.existsSync(target))execFileSync('ffmpeg',['-v','error','-ss',String(Math.min(1,meta.durationSeconds/2)),'-i',path.join(project,'remotion/public',downloaded.localPath),'-frames:v','1','-q:v','2',target],{windowsHide:true,timeout:30000});
     meta=probeMedia(target);
    }
    operation={...need,source:{...downloaded,localPath,sha256:meta.sha256,meta},
     matchReason:'本镜已声明检索：'+need.query+'；来源标题：'+candidate.title+'；元数据匹配：'+candidate.matchedConcepts.join('、')+'。仅作语境素材，不替代身份、数据或事实证据。'};
    // Downloaded metadata does not establish the visible language of an image.
    // Preserve the candidate and cache, but do not create an invalid binding
    // which the existing source-language gate would have to remove later.
    if(need.kind==='image'&&!downloaded.contentLanguage){
     discovery.errors.push({sourceId:candidate.sourceId,code:'SOURCE_CONTENT_REVIEW_REQUIRED',
      localPath,sha256:meta.sha256,message:'真实图片已保存；需核验实际内容与语言后才能绑定，不依据网页元数据推定无文字'});
     operation=undefined;continue;
    }
    used.add(candidate.sourceId);hashes.add(meta.sha256);break;
   }catch(e){discovery.errors.push({sourceId:candidate.sourceId,message:e.message});}
  }
  }
  if(operation)report.operations.push(operation);
  else report.unresolved.push({...need,code:'SOURCE_COMPLETION_REQUIRED',candidates:discovery.candidates.length,errors:discovery.errors,
    localSearch:{candidates:local?.candidates.length||0,rejected:local?.rejected||[],library:local?.library||null}});
  saveReport();
 }
 if(digest(libraryContractSnapshot(root))!==digest(plan.librarySnapshot))throw Error('素材库索引或来源档案已变化，须重新审批完整方案');
 if(digest(inputs(project))!==digest(plan.inputs))throw Error('素材采集期间输入变化，不应用旧方案');
 withMaterialBindingTransaction(project,tx=>{
  const shots=read(path.join(project,'remotion/shots.json')),research=read(path.join(project,'material-research-plan.json'));
  for(const op of report.operations){
   const shot=shots.find(s=>s.id===op.shotId),row=research.shots.find(s=>s.shotId===op.shotId),source=op.source;
   if(!shot||shot.shotCard!==op.cardId||!row||sha(fs.readFileSync(publicFile(project,source.localPath)))!==source.sha256||
     sha(fs.readFileSync(path.join(project,source.evidence)))!==source.evidenceSha256)throw Error('执行前素材或模板变化');
   const p=shot.templateParams;
   if(op.field==='@background'){
    if(p.materialSrc)throw Error('不能覆盖既有背景，须恢复其来源');
    const chapter=shot.shotCard==='chapter-progress-list';
    if(!chapter&&!TEXT_VIDEO_CARDS[shot.shotCard])throw Error('模板未核对视频底板能力');
    Object.assign(p,{materialRole:'background',materialSrc:source.localPath,materialSha256:source.sha256,materialSourceId:source.sourceId,
     materialMatchReason:op.matchReason,materialDurationSec:source.meta.durationSeconds,materialPlaybackRate:1,materialFit:'cover',
     backgroundPresentation:chapter?'theme-wash-v1':'text-video-v1'});
    const colors=chapter?['accent','dim']:Object.keys(TEXT_VIDEO_CARDS[shot.shotCard].colors);
    if(chapter&&p.cardProps.bg!=='#ffffff00')throw Error('章节卡未使用已核验透明底参数');
    for(const key of colors)if((darkBackgroundContrast(p.cardProps[key])??0)<4.5)p.cardProps[key]='#ffffff';
    row.backgroundBinding={...source,matchReason:op.matchReason,contentLanguage:'und',languageReviewRequired:true,contextOnly:true};
   }else{
    if(p.cardProps[op.field])throw Error('不能覆盖既有素材槽');
    p.cardProps[op.field]='remotion/public/'+source.localPath;
    row.materialBindings??=[];row.materialBindings.push({field:op.field,localPath:source.localPath,sha256:source.sha256,
     sourceUrl:source.sourceUrl,sourceVerified:true,licenseVerified:true,license:source.license,licenseUrl:source.licenseUrl,
     identityReason:op.matchReason,contentLanguage:source.contentLanguage||'und',languageReviewRequired:!source.contentLanguage,attribution:source.attribution,sourceEvidence:source.evidence});
   }
  }
  tx.commit({'remotion/shots.json':shots,'material-research-plan.json':research});
 });
 report.afterInputs=inputs(project);report.status=report.unresolved.length?'requires-further-completion':'bindings-applied-awaiting-original-gates';saveReport();
 // Keep author/URL/licence credits with the project and machine-review evidence.
 save(project,'qa/material-source-credits.json',read(path.join(project,'material-research-plan.json')).shots.flatMap(r=>[
  ...(r.backgroundBinding?[{shotId:r.shotId,attribution:r.backgroundBinding.attribution}]:[]),
  ...(r.materialBindings||[]).filter(b=>b.attribution).map(b=>({shotId:r.shotId,field:b.field,attribution:b.attribution}))]));
 return report;
}
export async function executeApprovedMaterialCompletion(project,catalog){
 const record=read(path.join(project,'qa/correction-center.json')),proposal=record.proposal,plan=record.materialCompletionPlan;
 if(record.approved!==true||record.action!=='material-completion'||!proposal||
  record.approval?.planSha256!==digest(proposal)||digest(plan)!==digest(proposal.materialCompletionPlan)||
  record.governance?.caseSha256!==digest(read(path.join(project,'qa/governance-case.json')))||
  record.governance?.mapSha256!==digest(read(path.join(project,'qa/governance-template-map.json'))))
  throw Error('素材补全没有当前中心终审方案，不能执行');
 const source=read(path.join(project,'source-run.json'));
 if(source.runId&&source.runId!==record.runId)throw Error('素材修正任务身份不一致');
 return executeMaterialCompletion(project,catalog,{plan,approval:{planId:plan.planId,inputSha256:digest(plan.inputs),
  centerPlanSha256:record.approval.planSha256,caseSha256:record.governance.caseSha256,productionAdmitted:false}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const project=path.resolve(process.argv[2]),index=read(path.resolve(process.argv[3]));
 const result=await executeApprovedMaterialCompletion(project,loadTalkcraftGovernedCatalog(index));
 console.log(JSON.stringify({planId:result.planId,applied:result.operations.length,unresolved:result.unresolved.map(n=>({shotId:n.shotId,field:n.field,code:n.code})),paidCalls:0,productionAdmitted:false}));
}
