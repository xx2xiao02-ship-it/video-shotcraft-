import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {withMaterialBindingTransaction} from './talkcraft-material-binding-transaction.mjs';
import {TEXT_VIDEO_CARDS,darkBackgroundContrast,hasVideoBackground} from './talkcraft-text-video.mjs';
import {loadLibraryContract,resolveLibrarySource,libraryContractSnapshot} from './talkcraft-library-contract.mjs';
import {inspectSourceContent} from './talkcraft-source-content.mjs';
import {discoverArchiveSources} from './talkcraft-source-archive.mjs';
import {probeMedia} from '../docs/audits/b-talkcraft-target3/validation.mjs';
import {currentEditorialRepairFeedback,editorialMaterialTarget,verifiedCandidateRevisionFeedback} from './talkcraft-editorial-planning-contract.mjs';
import {executeNodeRepair} from './talkcraft-node-repair.mjs';

const LIBRARY_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=x=>createHash('sha256').update(x).digest('hex');
export const SOURCE_DOWNLOAD_BUDGET=Object.freeze({image:100*1024*1024,video:192*1024*1024});
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
 [/学术|academic/iu,['economics professor','university economics','academic lecture'],/academic|lecture|university|professor/iu],
 [/钱|货币|资金|money/iu,['wallet cash payment','money counting','intitle:cash','intitle:wallet','intitle:banknote','banknotes','coin counter'],/banknote|money|currency|coin|wallet|cash payment|现金|钞票|硬币|钱包/iu],
 [/收入|工资|存款|存钱|储蓄/iu,['intitle:ATM','bank ATM','banknotes'],/bank|atm|banknote|savings|银行/iu],
 [/市场|消费|物价|购物|商场|超市|shopping|supermarket|grocery|mall/iu,['China supermarket shopping','Chinese grocery shoppers','street market','shopping market'],/street market|marketplace|shopping|shoppers|supermarket|grocery|retail|\bmall\b|市场|购物|商场|超市|消费/iu],
 [/城市|街景|日常|普通人生活/iu,['city street people'],/city|street|pedestrian|城市|街/iu],
 [/央行|中央银行|中国人民银行/iu,['central bank',"People's Bank of China monetary policy"],/central bank|people.s bank of china|人民银行/iu],
 [/资金.*流动.*示意|money flow|flow of funds/iu,['flow of funds diagram','money flow diagram','monetary transmission diagram','interest rate channel diagram'],/flow of fund(?:s|ing)|money flow|monetary.*transmission|interest rate channel|资金流/iu],
];
export function sourceSearchContract(query,concepts=[],alternatives=[]){
 const text=[query,...concepts].join(' '),groups=vocabulary.filter(([r])=>r.test(text));
 // Named awards/institutions cannot be replaced by generic money footage.
 const diagram=/示意图|diagram/iu.test(query);
 const special=groups.filter(([r])=>r.source.startsWith('诺贝尔')||r.source.startsWith('央行')&&!diagram);
 const flow=diagram?groups.filter(([r])=>r.source.startsWith('资金')):[];
 const required=special.length?special:flow.length?flow:
  /商场|超市|购物|shopping|supermarket|grocery|\bmall\b|物价.{0,20}市场|市场.{0,20}物价/iu.test(query)?groups.filter(([r])=>r.source.startsWith('市场')):
  /收入|工资|存款|存钱|储蓄/u.test(query)&&!/城市|街景/u.test(query)?groups.filter(([r])=>r.source.startsWith('收入')):
  /钱包|口袋|钱/u.test(query)?groups.filter(([r])=>r.source.startsWith('钱')):groups;
 const ceremony=/颁奖|ceremony|award stage/iu.test(text);
 const institution=/中国.*(?:央行|人民银行)|人民银行/u.test(text);
 const economics=/经济学奖|经济学.*诺贝尔|nobel.*economic/iu.test(text);
 const document=/公告.*页面|页面.*截图/u.test(query);
 const incompatible=/(?:burn(?:ing|t)?|fire|subprime|mortgage|crisis|protest|war|military|congress|election|candidate for|politician|police|bodycam|theft|stealing|suspect|cannabis|cocaine|public money.{0,8}public code|software|programming|恐怖|焚烧|火灾|危机)/iu;
 const differentAward=/chemistry|medicine|physiology|literature|peace prize|化学|医学|生理|文学|和平奖/iu;
 const approvedAlternatives=alternatives.filter(a=>a.kind==='declared-academic-context'&&a.query==='经济学 学术现场 讲座 视频'&&a.basis&&a.contextOnly===true).map(a=>sourceSearchContract(a.query,a.concepts));
 const matchesPrimary=value=>required.length>0&&required.some(([,q,r])=>r.test(value))&&
   (!required.some(([r])=>r.source.startsWith('钱'))||/banknote|wallet|cash|currency|coin counter|coins? counting|counting coins?|钞票|纸币|硬币.*(?:消费|支付|计数)|钱包|付款|支付/iu.test(value))&&
   (!incompatible.test(value)||incompatible.test(text))&&
   (!ceremony||/ceremony|presentation|颁奖/iu.test(value))&&
   (!economics||/economic|经济学/iu.test(value))&&
   (!/诺贝尔|nobel/iu.test(text)||! /\big nobel\b/iu.test(value))&&
   (!/诺贝尔|nobel/iu.test(text)||!differentAward.test(value)||differentAward.test(text))&&
   (!diagram||/diagram|schematic|chart|示意|流程图/iu.test(value)&&/flow|transmission|interest rate|资金|传导|利率/iu.test(value))&&
   (!document||/announcement|monetary policy|货币政策|公告/iu.test(value))&&
   (!institution||/people.s bank of china|中国人民银行/iu.test(value));
 // An article mentioning an economics professor is not automatically an
 // academic scene. Require an actual lecture/discussion/presentation context.
 const matchesAlternative=value=>/economic|经济/iu.test(value)&&
   /academic|lecture|seminar|conference|tells|explain|talks|discuss|speaks|presentation|classroom|学术|讲座|课堂|研讨|讲述/iu.test(value)&&
   ! /nobel|诺贝尔|chemistry|medicine|physics|化学|医学|物理/iu.test(value)&&approvedAlternatives.some(a=>a.matches(value));
 return {queries:[...new Set([query,...approvedAlternatives.flatMap(a=>a.queries),...(economics?['Nobel economics ceremony','Nobel economics lecture']:[]),...required.flatMap(([,q])=>q),...groups.flatMap(([,q])=>q),...concepts.filter(c=>/^[a-z\s-]+$/iu.test(c))])].filter(Boolean).slice(0,12),
  matches:value=>matchesPrimary(value)||matchesAlternative(value),
  matched:value=>matchesPrimary(value)?required.filter(([,q,r])=>r.test(value)).flatMap(([,q])=>q):approvedAlternatives.flatMap(a=>a.matches(value)?a.matched(value):[])};
}
export function declaredBackgroundAlternatives(row){
 // Existing director intent is the authority, not a new topic invented by the
 // resolver. Generic academic footage never replaces identity/evidence slots.
 if(!/颁奖或学术|诺奖\/学术/u.test(row.backgroundReason||'')||
  !(row.backgroundConcepts||[]).some(c=>/学术|academic/iu.test(c)))return [];
 return [{kind:'declared-academic-context',query:'经济学 学术现场 讲座 视频',concepts:['economics lecture','academic audience'],
  basis:row.backgroundReason,contextOnly:true}];
}
export function materialCompletionPlan(project,catalog,{root=LIBRARY_ROOT,target=null}={}){
 const shots=read(path.join(project,'remotion/shots.json')),research=read(path.join(project,'material-research-plan.json'));
 const originalText=fs.readFileSync(path.join(project,'input.txt'),'utf8');
 const economicsAward=/诺贝尔经济学奖/u.test(originalText)&&!/诺贝尔(?:物理|化学|生理|医学|文学|和平)/u.test(originalText);
 const needs=[],invalidBindings=auditCompletionBindings(project);
 for(const shot of shots){
  const row=research.shots.find(r=>r.shotId===shot.id),card=catalog.cards.find(c=>c.cardId===shot.shotCard);
  if(!row||!card)continue;
  if(row.backgroundDecision==='use'&&(!hasVideoBackground(shot)||invalidBindings.some(b=>b.shotId===shot.id&&b.field==='@background')))needs.push({shotId:shot.id,cardId:shot.shotCard,
   field:'@background',kind:'video',query:row.backgroundQuery,
   concepts:[...row.backgroundConcepts||[],...(economicsAward&&/诺贝尔|nobel/iu.test(row.backgroundQuery)?['Nobel economics']:[])],reason:row.backgroundReason,
   durationSeconds:Number(shot.end)-Number(shot.start),alternatives:declaredBackgroundAlternatives(row),
   ...(shot.shotCard==='chapter-progress-list'?{presentation:{kind:'theme-wash-v1',cardProps:{bg:'#ffffff00'}}}:{})});
  for(const [field,kind]of Object.entries(card.policy.media)){
   if(/host/iu.test(field)||shot.templateParams?.cardProps?.[field]&&!invalidBindings.some(b=>b.shotId===shot.id&&b.field===field))continue;
   const query=shot.templateParams?.templateMaterialQueries?.[field];
   if(!query||!['image','image-or-video'].includes(kind))continue;
   const protectedNeed=research.shots.some(r=>(r.research||[]).some(n=>(n.displayShotId||r.shotId)===shot.id&&n.displayField===field));
   if(protectedNeed)continue; // identity/data/evidence use reviewed binding only
   needs.push({shotId:shot.id,cardId:shot.shotCard,field,kind:'image',query,concepts:[],durationSeconds:0});
  }
 }
 let providerState;try{providerState=read(path.join(project,'qa/source-discovery/commons-provider-state.json'));}catch{}
 const plan={schema:'talkcraft-material-completion-plan-v1',inputs:inputs(project),needs,invalidBindings,...(target?{target}:{}),
  ...([429,503].includes(providerState?.status)?{transportRetry:{token:digest(providerState),notBefore:providerState.retryAt,failures:providerState.failures||1,maxFailures:3}}:{}),
  policy:'commons-adaptive-source-v2',strategy:{maxQueriesPerNeed:12,maxCandidates:24,downloadBudget:SOURCE_DOWNLOAD_BUDGET,steps:['current-reviewed-source','online-exact','online-keywords','independent-library','local-content-review','transactional-bind','original-gates'],negativeCacheVersion:2},librarySnapshot:libraryContractSnapshot(root),paidCalls:0,productionAdmitted:false};
 return {...plan,planId:digest(plan)};
}
const plain=x=>String(x||'').replace(/<[^>]*>/gu,' ').replace(/&(?:nbsp|amp|quot);/gu,' ').replace(/\s+/gu,' ').trim();
export function commonsCandidate(page,{kind,query,match}){
 const i=page.imageinfo?.[0],e=i?.extmetadata||{};
 if(!i||!/^https:\/\/upload\.wikimedia\.org\//u.test(i.url||'')||
   !/^https:\/\/commons\.wikimedia\.org\/wiki\/File[:%]/u.test(i.descriptionurl||'')||i.size>SOURCE_DOWNLOAD_BUDGET[kind==='video'?'video':'image'])return null;
 const license=plain(e.LicenseShortName?.value),licenseUrl=e.LicenseUrl?.value;
 if(!/^(CC0|CC BY(?:-SA)?(?: [\d.]+)?|Public domain|PD)$/iu.test(license)||
   !/^https?:\/\/(?:creativecommons\.org|commons\.wikimedia\.org)\//u.test(licenseUrl||'')||
   /non.?commercial|no.?derivatives|non.?free/iu.test(plain(e.UsageTerms?.value)))return null;
 const author=plain(e.Artist?.value),description=plain(e.ImageDescription?.value);
 const text=plain(page.title)+' '+description.slice(0,600);
 if(!author||!match.matches(text))return null;
 const originalMediaPath=new URL(i.url).pathname;
 // SVG is never executed locally. Only use the source API's official raster
 // rendition; its title, licence and author still refer to the original work.
 const raster=/\.svg$/iu.test(originalMediaPath)&&kind==='image'&&
   /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//u.test(i.thumburl||'')&&/\.png$/iu.test(new URL(i.thumburl).pathname);
 const mediaUrl=raster?i.thumburl:i.url,mediaPath=new URL(mediaUrl).pathname;
 const video=/\.(?:webm|ogv)$/iu.test(mediaPath),image=/\.(?:png|jpe?g|webp)$/iu.test(mediaPath);
 if(kind==='video'?!video:!image&&!video)return null;
 if(kind==='video'&&(i.width<1280||i.height<720))return null;
 return {sourceId:'commons:'+page.pageid,title:page.title,description,sourceUrl:i.descriptionurl,
  mediaUrl,kind:video?'video':'image',width:raster?i.thumbwidth:i.width,height:raster?i.thumbheight:i.height,size:i.size,
  ...(raster?{originalMediaUrl:i.url,rendition:'source-api-png'}:{}),
  license,licenseUrl,author,query,matchedConcepts:match.matched(text),sourceVerified:true,licenseVerified:true,
  attribution:[page.title,author,license,i.descriptionurl].join(' | ')};
}
export async function discoverCompletionSources(project,need,{fetchImpl=fetch}={}){
 const match=sourceSearchContract(need.query,need.concepts,need.alternatives),rows=[],errors=[];
 const stateFile='qa/source-discovery/commons-provider-state.json';
 let providerState;try{providerState=read(path.join(project,stateFile));}catch{}
 for(const query of match.queries){
  const key=digest({query,kind:need.kind,policy:'commons-adaptive-source-v2'}),file='qa/source-discovery/'+key+'.json';
  let record;
  if(fs.existsSync(path.join(project,file)))record=read(path.join(project,file));
  else{
   // Raw successful legacy responses are evidence, not an obsolete verdict.
   // Re-evaluate them with today's contract before making another request.
   const legacy='qa/source-discovery/'+digest({query,kind:need.kind,policy:'commons-explicit-free-license-v1'})+'.json';
   if(fs.existsSync(path.join(project,legacy))&&read(path.join(project,legacy)).pages?.length){record=read(path.join(project,legacy));save(project,file,{...record,recoveredFrom:legacy});}
  }
  if(!record){
   if(Date.parse(providerState?.retryAt)>Date.now()){errors.push({query,code:'SOURCE_PROVIDER_COOLDOWN',retryAt:providerState.retryAt,message:'来源服务限流；先恢复已存候选，不连续重发'});continue;}
   const u=new URL('https://commons.wikimedia.org/w/api.php');u.search=new URLSearchParams({action:'query',format:'json',
    generator:'search',gsrnamespace:'6',gsrsearch:query+(need.kind==='video'?' filetype:video':''),gsrlimit:'24',
    prop:'imageinfo',iiprop:'url|size|extmetadata'});
   try{const r=await fetchImpl(u,{headers:{'User-Agent':'VideoShotCraft/1.0 (editorial material research)'},signal:AbortSignal.timeout(15000)});
    if(r.status===429||r.status===503){const delay=Number(r.headers?.get?.('retry-after')),failures=(providerState?.failures||0)+1,retryAt=new Date(Date.now()+(Number.isFinite(delay)&&delay>0?Math.min(delay,3600):120*failures)*1000).toISOString();providerState={status:r.status,retryAt,failures};save(project,stateFile,providerState);errors.push({query,code:'SOURCE_PROVIDER_COOLDOWN',retryAt,message:'HTTP_'+r.status});continue;}
    if(!r.ok)throw Error('HTTP_'+r.status);
    const data=await r.json();if(data.error)throw Error('COMMONS_'+data.error.code);
    record={query,apiUrl:u.href,pages:Object.values(data.query?.pages||{}),checkedAt:new Date().toISOString()};save(project,file,record);
   }catch(e){errors.push({query,message:e.message});continue;}
  }
  let evidenceFile=file;
  const svgPages=need.kind==='image'?record.pages.filter(p=>/\.svg(?:\?|$)/iu.test(p.imageinfo?.[0]?.url||'')&&match.matches(plain(p.title)+' '+plain(p.imageinfo?.[0]?.extmetadata?.ImageDescription?.value).slice(0,600))).slice(0,4):[];
  if(svgPages.length){
   const rasterFile=file.replace(/\.json$/u,'-raster.json');
   if(fs.existsSync(path.join(project,rasterFile))){record=read(path.join(project,rasterFile));evidenceFile=rasterFile;}
   else if(!(Date.parse(providerState?.retryAt)>Date.now())){
    const u=new URL('https://commons.wikimedia.org/w/api.php');u.search=new URLSearchParams({action:'query',format:'json',pageids:svgPages.map(p=>p.pageid).join('|'),prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:'1600'});
    try{const r=await fetchImpl(u,{headers:{'User-Agent':'VideoShotCraft/1.0 (editorial material research)'},signal:AbortSignal.timeout(15000)});
     if(r.status===429||r.status===503){const delay=Number(r.headers?.get?.('retry-after')),failures=(providerState?.failures||0)+1;providerState={status:r.status,failures,retryAt:new Date(Date.now()+(Number.isFinite(delay)&&delay>0?Math.min(delay,3600):120*failures)*1000).toISOString()};save(project,stateFile,providerState);throw Error('SOURCE_PROVIDER_COOLDOWN');}
     if(!r.ok)throw Error('HTTP_'+r.status);const d=await r.json();if(d.error)throw Error('COMMONS_'+d.error.code);
     const enriched=Object.values(d.query?.pages||{}),byId=new Map(enriched.map(p=>[p.pageid,p]));
     record={query,apiUrl:u.href,parentEvidence:file,parentSha256:sha(fs.readFileSync(path.join(project,file))),pages:record.pages.map(p=>byId.get(p.pageid)||p),checkedAt:new Date().toISOString()};save(project,rasterFile,record);evidenceFile=rasterFile;
    }catch(e){errors.push({query,message:e.message});}
   }
  }
  for(const p of record.pages){const c=commonsCandidate(p,{...need,query,match});if(c&&!rows.some(x=>x.sourceId===c.sourceId))rows.push({...c,evidence:evidenceFile,evidenceSha256:sha(fs.readFileSync(path.join(project,evidenceFile)))});}
  // Search is bounded and whole-node. Multiple candidates allow exclusivity;
  // one discovered URL is never taken as a completed material binding.
  if(rows.length>=24)break;
 }
 if(need.kind==='video'&&!rows.length){const secondary=await discoverArchiveSources(project,need,match,{fetchImpl});rows.push(...secondary.candidates);errors.push(...secondary.errors);}
 return {candidates:rows,errors};
}
export function discoverLocalCompletionSources(root,need){
 const contract=loadLibraryContract(root),match=sourceSearchContract(need.query,need.concepts,need.alternatives),candidates=[],rejected=[];
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
// Only reuse current-task, same-shot, already verified documents. The actual
// captured text must satisfy the new slot; a query label is never evidence.
export function discoverReviewedCompletionSources(project,need){
 if(need.kind==='video'&&need.field==='@background'){
  const feedback=verifiedCandidateRevisionFeedback(project);if(!feedback?.snapshot)return [];
  const snapshot=path.resolve(project,feedback.snapshot),old=read(path.join(snapshot,'material-research-plan.json'));
  const before=read(path.join(snapshot,'remotion/shots.json')).find(s=>s.id===need.shotId);
  const current=read(path.join(project,'remotion/shots.json')).find(s=>s.id===need.shotId);
  const b=old.shots?.find(r=>r.shotId===need.shotId)?.backgroundBinding;
  if(!b||!before||!current||before.firstSentence!==current.firstSentence||before.lastSentence!==current.lastSentence||
   before.shotCard!==current.shotCard||b.sourceVerified!==true||b.licenseVerified!==true||!b.license||!b.licenseUrl||
   !/^https:\/\//u.test(b.sourceUrl||'')||!/^qa\/source-discovery\/[a-zA-Z0-9.-]+\.json$/u.test(b.evidence||''))return [];
  try{
   const match=sourceSearchContract(need.query,need.concepts,need.alternatives);
   if(!match.matches(b.title+' '+String(b.description||'').slice(0,600)))return [];
   const file=publicFile(project,b.localPath),evidence=path.resolve(project,b.evidence);
   if(fs.realpathSync(evidence)!==evidence||sha(fs.readFileSync(evidence))!==b.evidenceSha256||sha(fs.readFileSync(file))!==b.sha256)return [];
   const meta=probeMedia(file);if(meta.kind!=='video')return [];
   return [{...b,currentProjectSource:true,meta,matchedConcepts:match.matched(b.title+' '+String(b.description||'').slice(0,600))}];
  }catch{return [];}
 }
 if(need.kind!=='image'||!/页面|截图|公告|报告/u.test(need.query))return [];
 const research=read(path.join(project,'material-research-plan.json'));
 const row=research.shots.find(r=>r.shotId===need.shotId),match=sourceSearchContract(need.query,need.concepts);
 const root=fs.realpathSync(path.join(project,'remotion/public')),rows=[];
 const safe=name=>{if(typeof name!=='string'||path.isAbsolute(name))throw Error('来源路径无效');const f=fs.realpathSync(path.join(root,name)),rel=path.relative(root,f);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('来源越界');return f;};
 for(const b of row?.bindings||[]){
  if((b.displayShotId||row.shotId)!==need.shotId||b.sourceVerified!==true||b.licenseVerified!==true||!b.license||!b.licenseUrl||!b.sourceCoordinates||!b.contentLanguage||b.contentLanguage==='und')continue;
  try{
   const file=safe(b.localPath),coordinates=safe(b.sourceCoordinates),data=read(coordinates);
   if(sha(fs.readFileSync(file))!==b.sha256||data.url!==b.sourceUrl||!match.matches(data.title+' '+data.text))continue;
   const meta=probeMedia(file);if(meta.kind!=='image')continue;
   if(rows.some(r=>r.sha256===meta.sha256))continue;
   const evidence='qa/source-discovery/reuse-'+digest({need,b,coordinatesSha256:sha(fs.readFileSync(coordinates))})+'.json';
   save(project,evidence,{need,source:b,coordinatesSha256:sha(fs.readFileSync(coordinates)),scope:'current-task-same-shot-reviewed-document'});
   rows.push({...b,sourceId:b.sourceUrl,currentProjectSource:true,localPath:b.localPath,meta,
    evidence,evidenceSha256:sha(fs.readFileSync(path.join(project,evidence))),title:data.title,
    matchedConcepts:match.matched(data.title+' '+data.text),attribution:[data.title,b.sourceUrl,b.license].join(' | ')});
  }catch{ /* A stale or out-of-scope source cannot be repaired by inference. */ }
 }
 return rows;
}
export function auditCompletionBindings(project){
 const shots=read(path.join(project,'remotion/shots.json')),research=read(path.join(project,'material-research-plan.json')),invalid=[];
 const backgroundSources=new Map();
 for(const row of research.shots){
  const shot=shots.find(s=>s.id===row.shotId);if(!shot)continue;
  const b=row.backgroundBinding;
  if(b?.evidence?.startsWith('qa/source-discovery/')&&b.title&&b.sha256===shot.templateParams?.materialSha256){
   const keys=['hash:'+b.sha256,...(b.originalSha256?['original:'+b.originalSha256]:[]),...(b.sourceId?['identity:'+String(b.sourceId).toLowerCase()]:[])];
   const duplicate=keys.map(k=>backgroundSources.get(k)).find(Boolean);
   for(const key of keys)backgroundSources.set(key,backgroundSources.get(key)||row.shotId);
   if(duplicate){invalid.push({shotId:row.shotId,field:'@background',sha256:b.sha256,sourceId:b.sourceId,reason:'自动背景与'+duplicate+'使用同一来源，须保留首镜并重新采集，不放宽全片排他门禁',binding:b});continue;}
   const match=sourceSearchContract(row.backgroundQuery,row.backgroundConcepts,declaredBackgroundAlternatives(row));
   if(!match.matches(b.title+' '+String(b.description||'').slice(0,600)))invalid.push({shotId:row.shotId,field:'@background',sha256:b.sha256,sourceId:b.sourceId,reason:'来源主体与本镜语境不匹配',binding:b});
  }
  for(const b of row.materialBindings||[]){
   if(!b.sourceEvidence?.startsWith('qa/source-discovery/')||!b.field)continue;
   const query=shot.templateParams?.templateMaterialQueries?.[b.field];
   if(!query)continue;
   const bound=shot.templateParams?.cardProps?.[b.field];
   if(typeof bound!=='string'||!bound.startsWith('remotion/public/'))continue;
   try{if(sha(fs.readFileSync(publicFile(project,bound.slice('remotion/public/'.length))))!==b.sha256)continue;}catch{continue;}
   if(!b.contentLanguage||b.contentLanguage==='und'||! /^(zh(?:-[a-z]+)*|zxx)$/iu.test(b.contentLanguage)&&!b.languageReason){
    invalid.push({shotId:row.shotId,field:b.field,sha256:b.sha256,reason:'自动绑定丢失实际语言核验证据；撤回该槽后从本任务缓存重新核验绑定',binding:b});continue;
   }
   try{
    const evidence=read(path.join(project,b.sourceEvidence));
    if(evidence.scope==='current-task-same-shot-reviewed-document'&&!/页面|截图|公告|报告/u.test(query))invalid.push({shotId:row.shotId,field:b.field,sha256:b.sha256,reason:'文字原件不能代替本槽要求的实景或示意图',binding:b});
   }catch{}
  }
 }
 return invalid;
}
async function downloadSource(project,candidate,{fetchImpl=fetch}={}){
 const allowed=value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='upload.wikimedia.org'||u.hostname==='thumb.wikimedia.org'||u.hostname==='archive.org'||u.hostname.endsWith('.archive.org'));};
 if(!allowed(candidate.mediaUrl))throw Error('素材下载站点不在来源合同内');
 const key=digest({url:candidate.mediaUrl,evidence:candidate.evidenceSha256}),manifest='qa/source-downloads/'+key+'.json';
 if(fs.existsSync(path.join(project,manifest))){const r=read(path.join(project,manifest)),f=publicFile(project,r.localPath);
  if(r.mediaUrl!==candidate.mediaUrl||r.evidenceSha256!==candidate.evidenceSha256||sha(fs.readFileSync(f))!==r.sha256)throw Error('已下载来源文件变化，停止恢复');return r;}
 const commons=['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(candidate.mediaUrl).hostname),stateFile='qa/source-discovery/commons-provider-state.json';
 let state;try{state=read(path.join(project,stateFile));}catch{}
 if(commons&&Date.parse(state?.retryAt)>Date.now())throw Error('SOURCE_PROVIDER_COOLDOWN: '+state.retryAt);
 // Space real downloads across slots and processes. Cached files never wait.
 if(commons&&fetchImpl===fetch){
  await delay(Math.min(2000,Math.max(0,Date.parse(state?.nextDownloadAt)-Date.now()||0)));
  state={...state,nextDownloadAt:new Date(Date.now()+1500).toISOString()};save(project,stateFile,state);
 }
 let targetUrl=candidate.mediaUrl,r;
 for(let redirects=0;redirects<4;redirects++){
  r=await fetchImpl(targetUrl,{signal:AbortSignal.timeout(120000),redirect:'manual'});
  if(![301,302,303,307,308].includes(r.status))break;
  const next=new URL(r.headers.get('location'),targetUrl).href;
  if(!allowed(next)||new URL(next).username||new URL(next).password)throw Error('素材跳转越出来源合同');
  targetUrl=next;
 }
 if(commons&&[429,503].includes(r.status)){
  const failures=(state?.failures||0)+1,delay=Number(r.headers.get('retry-after'));
  const retryAt=new Date(Date.now()+(Number.isFinite(delay)&&delay>0?Math.min(delay,3600):120*failures)*1000).toISOString();
  save(project,stateFile,{status:r.status,failures,retryAt,nextDownloadAt:state?.nextDownloadAt});throw Error('SOURCE_PROVIDER_COOLDOWN: HTTP_'+r.status+' '+retryAt);
 }
 if(!r.ok)throw Error('SOURCE_DOWNLOAD_HTTP_'+r.status);
 const budget=SOURCE_DOWNLOAD_BUDGET[candidate.kind==='video'?'video':'image'];
 if(Number(r.headers.get('content-length'))>budget){await r.body?.cancel?.().catch(()=>{});throw Error('素材超出传输预算');}
 const directory=path.join(project,'remotion/public/verified-sources');fs.mkdirSync(directory,{recursive:true});
 const partial=path.join(directory,'.download-'+randomUUID()+'.part'),hashState=createHash('sha256');
 let bytes=0,fd;
 try{
  fd=fs.openSync(partial,'wx');
  for await(const chunk of r.body){bytes+=chunk.length;if(bytes>budget)throw Error('素材超出传输预算');hashState.update(chunk);let offset=0;while(offset<chunk.length)offset+=fs.writeSync(fd,chunk,offset,chunk.length-offset);}
 }catch(e){if(fd!==undefined){fs.closeSync(fd);fd=undefined;}if(fs.existsSync(partial))fs.unlinkSync(partial);await r.body?.cancel?.().catch(()=>{});throw e;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 const hash=hashState.digest('hex'),ext=path.extname(new URL(candidate.mediaUrl).pathname).toLowerCase();
 const raw='verified-sources/'+hash+ext,full=path.join(project,'remotion/public',raw);
 try{
  if(!fs.existsSync(full))fs.renameSync(partial,full);
  else if(sha(fs.readFileSync(full))!==hash)throw Error('下载文件哈希冲突');
 }finally{if(fs.existsSync(partial))fs.unlinkSync(partial);}
 if(commons)save(project,stateFile,{status:200,failures:0,retryAt:null,nextDownloadAt:state?.nextDownloadAt});
 let localPath=raw;
 if(ext==='.ogv'){
  localPath='verified-sources/'+hash+'.mp4';const target=path.join(project,'remotion/public',localPath);
  if(!fs.existsSync(target))execFileSync('ffmpeg',['-v','error','-i',full,'-an','-c:v','libx264','-preset','fast','-crf','20',target],{windowsHide:true,timeout:180000});
 }
 const meta=probeMedia(path.join(project,'remotion/public',localPath));
 const result={...candidate,originalSha256:hash,localPath,sha256:meta.sha256,meta};save(project,manifest,result);return result;
}
export async function executeMaterialCompletion(project,catalog,{fetchImpl=fetch,root=LIBRARY_ROOT,plan=materialCompletionPlan(project,catalog,{root}),approval,contentReviewer=inspectSourceContent}={}){
 if(!approval||approval.planId!==plan.planId||approval.inputSha256!==digest(plan.inputs)||approval.productionAdmitted!==false)
  throw Error('素材补全必须由中心批准当前具体方案');
 if(digest(materialCompletionPlan(project,catalog,{root,target:plan.target}))!==digest(plan))throw Error('素材补全方案与当前输入不同');
 const report={schema:'talkcraft-material-completion-v1',planId:plan.planId,inputs:plan.inputs,approval,
  operations:[],unresolved:[],slotExecutions:[],paidCalls:0,productionAdmitted:false,userAcceptance:false};
 const saveReport=()=>save(project,'qa/material-completion.json',report);
 if(plan.invalidBindings?.length){
  // Preserve the full rejected objects before removing only the exact
  // automatically bound fields approved in this plan. No files are deleted.
  save(project,'qa/material-quarantine/'+plan.planId+'.json',{invalidBindings:plan.invalidBindings,inputs:plan.inputs});
  withMaterialBindingTransaction(project,tx=>{
   const shots=read(path.join(project,'remotion/shots.json')),research=read(path.join(project,'material-research-plan.json'));
   for(const bad of plan.invalidBindings){
    const shot=shots.find(s=>s.id===bad.shotId),row=research.shots.find(r=>r.shotId===bad.shotId),p=shot.templateParams;
    if(bad.field==='@background'){
     if(p.materialSha256!==bad.sha256)throw Error('待撤回背景发生变化');
     for(const key of ['materialRole','materialSrc','materialSha256','materialSourceId','materialMatchReason','materialDurationSec','materialPlaybackRate','materialFit','backgroundPresentation'])delete p[key];
     delete row.backgroundBinding;
    }else{
     if(row.materialBindings.find(b=>b.field===bad.field)?.sha256!==bad.sha256)throw Error('待撤回资料发生变化');
     delete p.cardProps[bad.field];row.materialBindings=row.materialBindings.filter(b=>b.field!==bad.field);
    }
   }
   tx.commit({'remotion/shots.json':shots,'material-research-plan.json':research});
  });
 }
 const executionInputs=inputs(project);report.executionInputs=executionInputs;
 const original=read(path.join(project,'remotion/shots.json'));
 const used=new Set(original.map(s=>s.templateParams?.materialSourceId).filter(Boolean));
 const hashes=new Set(original.map(s=>s.templateParams?.materialSha256).filter(Boolean));
 for(const need of plan.needs){
  let discovery={candidates:[],errors:[]},operation,local,candidates;
  const execution={shotId:need.shotId,field:need.field,steps:[],status:'running'};report.slotExecutions.push(execution);saveReport();
  // Recover this task first, then exhaust online sources before the library.
  for(let pass=0;pass<3&&!operation;pass++){
  if(pass===0){candidates=discoverReviewedCompletionSources(project,need);execution.steps.push({handler:'current-reviewed-source',candidates:candidates.length});}
  if(pass===1){discovery=await discoverCompletionSources(project,need,{fetchImpl});candidates=discovery.candidates;execution.steps.push({handler:'online-adaptive-search',candidates:candidates.length});}
  if(pass===2){local=discoverLocalCompletionSources(root,need);candidates=local.candidates;execution.steps.push({handler:'independent-library',candidates:candidates.length});}
  saveReport();
  for(const candidate of candidates){
   if(used.has(candidate.sourceId))continue;
   try{
    let downloaded;
    if(candidate.currentProjectSource){
     const verified=discoverReviewedCompletionSources(project,need).find(r=>r.sha256===candidate.sha256&&r.sourceUrl===candidate.sourceUrl);
     if(!verified||verified.evidenceSha256!==candidate.evidenceSha256)throw Error('已有资料在执行前变化');
     const response=await fetchImpl(candidate.sourceUrl,{signal:AbortSignal.timeout(15000)});
     if(!response.ok||new URL(response.url||candidate.sourceUrl).hostname!==new URL(candidate.sourceUrl).hostname)throw Error('已有官方原件当前不可访问');
     const localPath='verified-sources/'+verified.sha256+path.extname(verified.localPath).toLowerCase(),target=path.join(project,'remotion/public',localPath);
     fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target))fs.writeFileSync(target,fs.readFileSync(path.join(project,'remotion/public',verified.localPath)),{flag:'wx'});
     downloaded={...verified,localPath};
    }else if(candidate.sourceFile){
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
    if(need.kind==='video'&&(downloaded.meta.kind!=='video'||downloaded.meta.width<1280||downloaded.meta.height<720||downloaded.meta.durationSeconds+1/30<need.durationSeconds))continue;
    let localPath=downloaded.localPath,meta=downloaded.meta;
    if(need.kind==='image'&&meta.kind==='video'){
     localPath='verified-sources/'+downloaded.sha256+'-frame.jpg';const target=path.join(project,'remotion/public',localPath);
     if(!fs.existsSync(target))execFileSync('ffmpeg',['-v','error','-ss',String(Math.min(1,meta.durationSeconds/2)),'-i',path.join(project,'remotion/public',downloaded.localPath),'-frames:v','1','-q:v','2',target],{windowsHide:true,timeout:30000});
     meta=probeMedia(target);
    }
    // Downloaded metadata does not establish the visible language of an image.
    // Preserve the candidate and cache, but do not create an invalid binding
    // which the existing source-language gate would have to remove later.
    if(need.kind==='image'&&(!downloaded.contentLanguage||downloaded.contentLanguage==='und')){
     const reviewed=contentReviewer(project,{...downloaded,localPath,sha256:meta.sha256});
     if(reviewed)Object.assign(downloaded,reviewed);
    }
    if(need.kind==='image'&&(!downloaded.contentLanguage||downloaded.contentLanguage==='und')){
     discovery.errors.push({sourceId:candidate.sourceId,code:'SOURCE_CONTENT_REVIEW_REQUIRED',
      localPath,sha256:meta.sha256,message:'真实图片已保存；需核验实际内容与语言后才能绑定，不依据网页元数据推定无文字'});
     operation=undefined;continue;
    }
    operation={...need,source:{...downloaded,localPath,sha256:meta.sha256,meta},
     matchReason:'本镜已声明检索：'+need.query+'；来源标题：'+candidate.title+'；元数据匹配：'+candidate.matchedConcepts.join('、')+'。仅作语境素材，不替代身份、数据或事实证据。'};
    used.add(candidate.sourceId);hashes.add(meta.sha256);break;
   }catch(e){discovery.errors.push({sourceId:candidate.sourceId,message:e.message});}
  }
  }
  execution.status=operation?'verified-awaiting-transaction':'alternatives-exhausted';
  if(operation)report.operations.push(operation);
  else report.unresolved.push({...need,code:'SOURCE_COMPLETION_REQUIRED',candidates:discovery.candidates.length,errors:discovery.errors,
    localSearch:{candidates:local?.candidates.length||0,rejected:local?.rejected||[],library:local?.library||null}});
  saveReport();
 }
 if(digest(libraryContractSnapshot(root))!==digest(plan.librarySnapshot))throw Error('素材库索引或来源档案已变化，须重新审批完整方案');
 if(digest(inputs(project))!==digest(executionInputs))throw Error('素材采集期间输入变化，不应用旧方案');
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
    if(chapter){
     const need=plan.needs.find(n=>n.shotId===op.shotId&&n.field===op.field);
     if(digest(need?.presentation??null)!==digest({kind:'theme-wash-v1',cardProps:{bg:'#ffffff00'}}))
      throw Error('章节卡视频底板修正未包含在中心批准的方案中');
     p.cardProps.bg=need.presentation.cardProps.bg;
    }
    for(const key of colors)if((darkBackgroundContrast(p.cardProps[key])??0)<4.5)p.cardProps[key]='#ffffff';
    row.backgroundBinding={...source,matchReason:op.matchReason,contentLanguage:'und',languageReviewRequired:true,contextOnly:true};
   }else{
    if(p.cardProps[op.field])throw Error('不能覆盖既有素材槽');
    p.cardProps[op.field]='remotion/public/'+source.localPath;
    row.materialBindings??=[];row.materialBindings.push({field:op.field,localPath:source.localPath,sha256:source.sha256,
     sourceUrl:source.sourceUrl,sourceVerified:true,licenseVerified:true,license:source.license,licenseUrl:source.licenseUrl,
     identityReason:op.matchReason,contentLanguage:source.contentLanguage||'und',languageReason:source.languageReason,contentReview:source.contentReview,languageReviewRequired:!source.contentLanguage,attribution:source.attribution,sourceEvidence:source.evidence});
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
export async function executeApprovedMaterialCompletion(project,catalog,{stage,root=LIBRARY_ROOT}={}){
 const record=read(path.join(project,'qa/correction-center.json')),proposal=record.proposal,plan=record.materialCompletionPlan;
 if(record.approved!==true||record.action!=='material-completion'||!proposal||
  record.approval?.planSha256!==digest(proposal)||digest(plan)!==digest(proposal.materialCompletionPlan)||
  record.governance?.caseSha256!==digest(read(path.join(project,'qa/governance-case.json')))||
  record.governance?.mapSha256!==digest(read(path.join(project,'qa/governance-template-map.json'))))
  throw Error('素材补全没有当前中心终审方案，不能执行');
 const source=read(path.join(project,'source-run.json'));
 if(source.runId&&source.runId!==record.runId)throw Error('素材修正任务身份不一致');
 const approval={planId:plan.planId,inputSha256:digest(plan.inputs),
  centerPlanSha256:record.approval.planSha256,caseSha256:record.governance.caseSha256,productionAdmitted:false};
 if(!plan.target)return executeMaterialCompletion(project,catalog,{plan,approval,root});
 const resolved=editorialMaterialTarget(project,currentEditorialRepairFeedback(project));
 if(digest(resolved.target)!==digest(plan.target)||record.node!=='storyboard-review'||typeof stage!=='function')
  throw Error('待发布素材方案与当前事务或复检处理器不一致');
 // The centre approves the exact working-copy inputs before entering it. A
 // failed original gate retains bindings here but never publishes the design.
 if(digest(materialCompletionPlan(resolved.project,catalog,{root,target:resolved.target}))!==digest(plan))
  throw Error('待发布素材方案已过期');
 const lock=path.join(project,'editorial-revision.lock'),fd=fs.openSync(lock,'wx');
 try{return await executeNodeRepair({root,runId:record.runId,project,node:record.node,resumeProviderResponse:true,operation:async work=>{
  if(work!==resolved.project)throw Error('素材处理器切换了待发布事务');
  let result,materialFailure;
  try{result=await executeMaterialCompletion(work,catalog,{plan,approval,root});}
  catch(error){
   materialFailure=error;
   save(work,'qa/material-completion-failure.json',{schema:'talkcraft-material-completion-failure-v1',
    planId:plan.planId,target:plan.target,error:error.message,paidCalls:0,productionAdmitted:false});
   console.error('正式素材处理器失败，继续保存原门禁反馈：'+error.message);
  }
  await stage('candidates',record.runId);
  const checked=await stage('planning-check',record.runId);
  if(checked?.passed===false)throw Error('恢复结果未通过本节点规划复检，不发布');
  if(materialFailure)throw materialFailure;
  return result;
 }});}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 execFileSync(process.execPath,[fileURLToPath(new URL('./talkcraft-material-completion-run.mjs',import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
}
