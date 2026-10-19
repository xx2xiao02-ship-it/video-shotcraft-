import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MATERIAL_POLICY_VERSION,MATERIAL_POLICY_RULES,checkMaterialPolicy} from './talkcraft-material-policy.mjs';
import {CORE_PERSON_RULES,CORE_PERSON_SELECTION_RULES,checkCorePersonDisplays} from './talkcraft-core-person.mjs';
import {auditTextVideoFiles} from './talkcraft-text-video-audit.mjs';
import {graphicCandidateIds,isTextDominant} from './talkcraft-visual-content-contract.mjs';
import {textVideoRequirement} from './talkcraft-text-video.mjs';

const materialResearchRules = (output,selection=false) => '选卡前先按每句need和entities规划真实素材：身份对应本人照片、官方人物页或采访；量化对应原发布机构、报告日期及原始图表；证据对应真实来源页。通用背景仅承接语境，不能充当人物身份或事实证据。为纯文字、低变化镜头比较相关背景视频与图形表达，不机械给每镜铺视频；使用原卡公开能力或经源码核对的text-video-v1受控透明底适配；原布局与动效不变，实色遮挡不能放行，不缩卡。背景按已定黑色遮罩压暗。'+output+(selection?'；已登记资料的检索身份只读，按本次引用保留；只有新增规划才填写具体检索词。':'；检索词具体到人名、事件或机构。')+'视频检索另给2至3个英文视觉概念词。搜索结果只是候选：本人身份、来源真实性、素材授权和本地媒体须核验，不能仅有URL或搜索词就标为已采集；缺项明确列出，不调用付费服务自动补齐。'+(selection?CORE_PERSON_SELECTION_RULES:CORE_PERSON_RULES)+MATERIAL_POLICY_RULES;
export const MATERIAL_RESEARCH_RULES=materialResearchRules('返回顶层materialResearch={shots:[{shotId,backgroundQuery,backgroundDecision:"compare|use|omit",backgroundConcepts:["中文本地库标签"],backgroundReason,research:[{kind:"identity|evidence|data",query,entityType:"person|other",entityName,identityContext,queryZh,reason}],graphicIntent,graphicAlternatives:[{cardId,reason}],pureTextReason}]}，逐镜完整覆盖');
export const MATERIAL_RESEARCH_SELECTION_RULES=materialResearchRules('只返回materialResearchUpdates，恰好覆盖materialShotIds。逐行按responseContract的mode、requiredFields、researchResponseKeys和bindingResponseKeys返回：已有research引用researchRef且可编辑镜填写新reason；锁定资料行仅换槽，不回抄背景、检索身份和来源事实；新增资料才填写完整规划。不得返回顶层materialResearch或改写锁定行',true);

const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const write=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');};
const allowedKind=new Set(['identity','evidence','data']);
export const CORE_PERSON_MATERIAL_RULES=CORE_PERSON_RULES;
export function materialDemand({shots,semantics,index}) {
  const cards=new Map(index.cards.map(c=>[c.slug,c]));
  return shots.map((shot,position)=>{
    const sentences=(semantics.sentences||[]).filter((s,i)=>s.shot===shot.id||!s.shot&&i>=shot.firstSentence&&i<=shot.lastSentence);
    const needs=[...new Set(sentences.flatMap(s=>s.need||[]))];
    const entities=[...new Set(sentences.flatMap(s=>s.entities||[]))];
    const category=cards.get(shot.shotCard)?.category||'未分类';
    const p=shot.templateParams||{};
    const hasSourceDisplay=['evidence','subject'].includes(p.materialRole)&&!!p.materialSrc||Object.entries(p.cardProps||{}).some(([key,value])=>!/host/i.test(key)&&/(?:src|image|video|poster|photo|media|asset|url)/iu.test(key)&&typeof value==='string'&&/\.(?:png|jpe?g|webp|gif|mp4|webm)(?:$|[?\n])/iu.test(value));
    return {shotId:shot.id,cardId:shot.shotCard,category,text:sentences.map(s=>s.text).join(''),needs,entities,
      researchKinds:[...new Set(needs.flatMap(n=>n==='身份'?['identity']:n==='量化'?['data']:n==='证据'?['evidence']:[]))],
      graphicCardIds:graphicCandidateIds(index),
      considerBackground:isTextDominant(shot,index)&&!hasSourceDisplay,
      textVideo:textVideoRequirement({shot,sentences:semantics.sentences,position,considerBackground:isTextDominant(shot,index)&&!hasSourceDisplay}),
      backgroundBound:shot.templateParams?.materialRole==='background'&&!!shot.templateParams.materialSrc};
  });
}
export function validateResearchPlan(plan,demands) {
  const issues=[];
  if(plan?.schema!=='talkcraft-material-research-v1'||!Array.isArray(plan.shots))return [{code:'MATERIAL_PLAN_REQUIRED',message:'缺少逐镜真实素材与图形表达规划'}];
  if(plan.shots.length!==demands.length||new Set(plan.shots.map(s=>s.shotId)).size!==demands.length)issues.push({code:'SHOT_COVERAGE',message:'素材规划须与全部镜头一一对应'});
  for(const d of demands){
    const row=plan.shots.find(r=>r.shotId===d.shotId);
    if(!row){issues.push({shotId:d.shotId,code:'SHOT_MISSING'});continue;}
    if(!String(row.graphicIntent||row.pureTextReason||'').trim())issues.push({shotId:d.shotId,code:'EXPRESSION_REASON_REQUIRED'});
    if(d.considerBackground&&!String(row.backgroundQuery||row.pureTextReason||'').trim())issues.push({shotId:d.shotId,code:'BACKGROUND_COMPARISON_REQUIRED'});
    if(row.backgroundQuery&&!String(row.backgroundReason||'').trim())issues.push({shotId:d.shotId,code:'BACKGROUND_REASON_REQUIRED'});
    if(row.backgroundDecision!==undefined&&!['compare','use','omit'].includes(row.backgroundDecision))issues.push({shotId:d.shotId,code:'BACKGROUND_DECISION_INVALID'});
    if(row.backgroundDecision==='use'&&!String(row.backgroundQuery||'').trim())issues.push({shotId:d.shotId,code:'BACKGROUND_QUERY_REQUIRED'});
    for(const kind of d.researchKinds)if(!(row.research||[]).some(r=>r.kind===kind&&String(r.query||'').trim()&&String(r.reason||'').trim()))
      issues.push({shotId:d.shotId,code:'RESEARCH_QUERY_REQUIRED',kind,entities:d.entities});
    for(const r of row.research||[])if(!allowedKind.has(r.kind)||!String(r.query||'').trim()||!String(r.reason||'').trim())issues.push({shotId:d.shotId,code:'INVALID_RESEARCH_ENTRY'});
    for(const r of row.research||[])if(r.entityType==='person'&&(!String(r.entityName||'').trim()||!String(r.identityContext||'').trim()))issues.push({shotId:d.shotId,code:'PERSON_CONTEXT_REQUIRED'});
  }
  issues.push(...checkCorePersonDisplays(plan.shots));
  return issues;
}
export function rankLocalBackgrounds(row,shot,index) {
  const concepts=row.backgroundConcepts||[];
  const requiredSeconds=Number(shot.end)-Number(shot.start);
  return index.map(item=>{
    const matched=concepts.filter(c=>(item.tags||[]).includes(c));
    return {path:item.path,sourceId:item.sourceId||item.sourceUrl||item.path,matched,
      durationSeconds:Number(item.duration_sec),width:item.width,height:item.height,fps:item.fps,
      coversShot:Number(item.duration_sec)>=requiredSeconds,status:'candidate-only',identityEvidence:false};
  }).filter(c=>c.matched.length&&c.coversShot&&c.width>=1920&&c.height>=1080)
    .sort((a,b)=>b.matched.length-a.matched.length||a.path.localeCompare(b.path));
}
export function saveEditorialMaterialResearch(project,result) {
  const file=path.join(project,'material-research-plan.json');
  if(fs.existsSync(file))return {saved:false,reason:'保留已有人工素材规划'};
  if(!result?.materialResearch)return {saved:false,reason:'旧响应未包含素材规划，需补齐，不自动重发模型'};
  const shots=read(path.join(project,'remotion/shots.json'));
  const proposed=result.materialResearch;
  const rows=proposed.shots;
  if(!Array.isArray(rows)||rows.length!==shots.length||shots.some(s=>rows.filter(r=>r.shotId===s.id).length!==1))throw Error('编导素材规划未逐镜完整覆盖');
  fs.writeFileSync(file,JSON.stringify({schema:'talkcraft-material-research-v1',editorialPolicy:MATERIAL_POLICY_VERSION,shots:rows},null,2)+'\n',{flag:'wx'});
  return {saved:true,shots:rows.length};
}

// Queries never upload audio, host footage, credentials or entire scripts.
// Wikimedia is a discovery source, not proof of identity or reusable licensing.
export async function discoverMaterialSources(query,{fetchImpl=fetch,timeoutMs=12000,queryZh=query}={}) {
  const request=async(url)=>{
    const r=await fetchImpl(url,{headers:{'User-Agent':'VideoShotCraft/1.0 (editorial material research)'},signal:AbortSignal.timeout(timeoutMs)});
    if(!r.ok)throw Error(`HTTP_${r.status}`);
    const data=await r.json();if(data.error)throw Error(String(data.error.code||'API_ERROR'));return data;
  };
  const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:query,gsrlimit:'5',prop:'extlinks',ellimit:'20'});
  const commons=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'5',prop:'imageinfo',iiprop:'url|size|extmetadata'});
  const chineseParams=new URLSearchParams(params);chineseParams.set('gsrsearch',queryZh);
  // Chinese discovery comes first. Linked source language stays unknown until capture.
  const chinese=await Promise.allSettled([request('https://zh.wikipedia.org/w/api.php?'+chineseParams)]);
  const englishAndCommons=await Promise.allSettled([request('https://en.wikipedia.org/w/api.php?'+params),request('https://commons.wikimedia.org/w/api.php?'+commons)]);
  const results=[...chinese,...englishAndCommons];
  const candidates=[],errors=[];
  results.forEach((r,i)=>{
    const provider=i===2?'wikimedia-commons':i===0?'wikipedia-zh-discovery':'wikipedia-discovery';
    if(r.status==='rejected'){errors.push({provider,code:String(r.reason?.message||'NETWORK_ERROR').replace(/https?:\/\/\S+/gu,'[url]')});return;}
    for(const p of Object.values(r.value.query?.pages||{})){
      if(i===2){for(const info of p.imageinfo||[]){
        const license=String(info.extmetadata?.LicenseShortName?.value||'').replace(/<[^>]*>/gu,'');
        candidates.push({provider,title:p.title,url:info.descriptionurl,mediaUrl:info.url,width:info.width,height:info.height,
          license,licenseEligible:/^(?:CC0|Public domain|PDM)$/iu.test(license),identityVerified:false,status:'candidate-only'});
      }}else for(const link of p.extlinks||[]){
        const url=link['*'];if(typeof url==='string'&&/^https:\/\//u.test(url))candidates.push({provider,title:p.title,url,discoveryLanguage:i===0?'zh-CN':'en',contentLanguage:'und',status:'source-lead-only',officialVerified:false});
      }
    }
  });
  return {query,candidates,errors,accepted:false};
}

export async function searchBackgroundVideos(query,{fetchImpl=fetch,env=process.env,timeoutMs=12000}={}) {
  const candidates=[],errors=[];
  const providers=[['pexels',env.PEXELS_API_KEY],['pixabay',env.PIXABAY_API_KEY]];
  await Promise.all(providers.map(async([provider,key])=>{
    if(!key){errors.push({provider,code:'NOT_CONFIGURED'});return;}
    try{
      const url=provider==='pexels'?'https://api.pexels.com/videos/search?'+new URLSearchParams({query,orientation:'landscape',per_page:'8'}):
        'https://pixabay.com/api/videos/?'+new URLSearchParams({key,q:query,per_page:'8',safesearch:'true'});
      const response=await fetchImpl(url,{headers:provider==='pexels'?{Authorization:key}:{},signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw Error('HTTP_'+response.status);
      const data=await response.json();
      for(const row of provider==='pexels'?data.videos||[]:data.hits||[]){
        const files=provider==='pexels'?row.video_files||[]:Object.values(row.videos||{});
        const file=files.filter(f=>f.height>=1080&&f.width>=1920).sort((a,b)=>b.width-a.width)[0];
        if(file)candidates.push({provider,id:String(row.id),sourceUrl:row.url||row.pageURL,
          mediaUrl:file.link||file.url,width:file.width,height:file.height,duration:row.duration,
          query,status:'candidate-only',licenseVerified:false});
      }
    }catch(error){errors.push({provider,code:/^HTTP_\d+$/u.test(error.message)?error.message:'NETWORK_OR_RESPONSE_ERROR'});}
  }));
  return {query,candidates,errors,accepted:false};
}

// Resolve a named person before looking for an image. A filename or matching
// surname is never identity evidence; entity IDs and context remain reviewable.
export async function discoverPersonSources({entityName,identityContext},{fetchImpl=fetch,timeoutMs=12000}={}) {
  if(!String(entityName||'').trim()||!String(identityContext||'').trim())return {query:entityName,candidates:[],errors:[{provider:'wikidata',code:'PERSON_CONTEXT_REQUIRED'}],accepted:false};
  const request=async(params,base='https://www.wikidata.org/w/api.php')=>{
    const r=await fetchImpl(base+'?'+new URLSearchParams({format:'json',...params}),{headers:{'User-Agent':'VideoShotCraft/1.0 (editorial material research)'},signal:AbortSignal.timeout(timeoutMs)});
    if(!r.ok)throw Error('HTTP_'+r.status);const data=await r.json();if(data.error)throw Error(data.error.code||'API_ERROR');return data;
  };
  try{
    const found=await request({action:'wbsearchentities',search:entityName,language:'en',uselang:'en',limit:'5'});
    const matches=(found.search||[]).filter(e=>String(e.description||'').toLowerCase().includes(identityContext.toLowerCase()));
    if(!matches.length)return {query:entityName,candidates:[],errors:[{provider:'wikidata',code:'NO_CONTEXT_MATCH'}],accepted:false};
    const data=await request({action:'wbgetentities',ids:matches.map(e=>e.id).join('|'),props:'claims|labels|descriptions',languages:'en'}),candidates=[];
    for(const e of Object.values(data.entities||{})){
      if(!(e.claims?.P31||[]).some(c=>c.mainsnak?.datavalue?.value?.id==='Q5'))continue;
      const entityId=e.id,description=e.descriptions?.en?.value||'',label=e.labels?.en?.value||entityName;
      candidates.push({provider:'wikidata',entityId,title:label,description,url:'https://www.wikidata.org/wiki/'+entityId,status:'identity-lead-only',identityVerified:false});
      for(const claim of e.claims?.P856||[]){const url=claim.mainsnak?.datavalue?.value;if(/^https:\/\//u.test(url||''))candidates.push({provider:'wikidata',entityId,title:label,description,url,status:'official-site-lead-only',officialVerified:false});}
      const images=(e.claims?.P18||[]).map(c=>c.mainsnak?.datavalue?.value).filter(Boolean).slice(0,2);
      if(images.length){
        const files=await request({action:'query',titles:images.map(i=>'File:'+i).join('|'),prop:'imageinfo',iiprop:'url|size|extmetadata'},'https://commons.wikimedia.org/w/api.php');
        for(const p of Object.values(files.query?.pages||{}))for(const info of p.imageinfo||[]){
          const license=String(info.extmetadata?.LicenseShortName?.value||'').replace(/<[^>]*>/gu,'');
          candidates.push({provider:'wikimedia-commons',entityId,title:label,description,fileTitle:p.title,url:info.descriptionurl,mediaUrl:info.url,width:info.width,height:info.height,license,licenseEligible:/^(?:CC0|Public domain|PDM)$/iu.test(license),identityVerified:false,status:'candidate-only'});
        }
      }
    }
    return {query:entityName,candidates,errors:[],accepted:false};
  }catch(error){return {query:entityName,candidates:[],errors:[{provider:'wikidata',code:/^HTTP_\d+$/u.test(error.message)?error.message:'NETWORK_OR_RESPONSE_ERROR'}],accepted:false};}
}

export function auditMaterialResearch(project,index,{localIndex=[]}={}) {
  const shots=read(path.join(project,'remotion/shots.json')),semantics=read(path.join(project,'semantics.json'));
  const demands=materialDemand({shots,semantics,index}),file=path.join(project,'material-research-plan.json');
  const plan=fs.existsSync(file)?read(file):null,issues=validateResearchPlan(plan,demands);
  issues.push(...checkCorePersonDisplays(plan?.shots,shots));
  let displayApproval=null;
  try{displayApproval=read(path.join(project,'qa/material-display-policy-approval.json'));}catch{}
  for(const row of plan?.shots||[])for(const r of row.research||[]){
    // A contextual background and a word card never resolve factual needs.
    const bindings=(row.bindings||[]).filter(b=>b.kind===r.kind&&b.query===r.query);
    if(!bindings.length){issues.push({shotId:row.shotId,code:'REAL_SOURCE_NOT_BOUND',kind:r.kind,query:r.query});continue;}
    for(const b of bindings){
      const full=path.resolve(project,'remotion/public',String(b.localPath||'')),rel=path.relative(path.join(project,'remotion/public'),full);
      const deferred=b.displayShotId&&b.displayShotId!==row.shotId;
      const displayAllowed=!deferred||Boolean(displayApproval?.policy==='concentrated-sources'&&
        displayApproval.authorizedBy==='user'&&displayApproval.sourceShotIds?.includes(row.shotId)&&
        fs.existsSync(path.join(project,'script.txt'))&&fs.existsSync(path.join(project,'audio/full.mp3'))&&
        displayApproval.scriptSha256===hash(path.join(project,'script.txt'))&&
        displayApproval.audioSha256===hash(path.join(project,'audio/full.mp3'))&&String(b.displayReason||'').trim());
      const shot=shots.find(s=>s.id===(b.displayShotId||row.shotId));
      const p=shot?.templateParams||{};
      // TemplateScene also has an explicit, actually rendered evidence/subject
      // media layer. Context backgrounds cannot satisfy factual source needs.
      const bound=Object.values(p.cardProps||{}).some(v=>typeof v==='string'&&v.split('\n').some(x=>x.replace(/^remotion\/public\//u,'')===b.localPath))||
        (['evidence','subject'].includes(p.materialRole)&&String(p.materialSrc||'').replace(/^remotion\/public\//u,'')===b.localPath);
      if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(full)||!fs.statSync(full).isFile()||
         !/^https:\/\//u.test(b.sourceUrl||'')||!b.identityReason||b.sourceVerified!==true||b.licenseVerified!==true||!b.license||!displayAllowed||!bound||hash(full)!==b.sha256)
        issues.push({shotId:row.shotId,code:'REAL_SOURCE_BINDING_INVALID',kind:r.kind});
    }
  }
  for(const row of plan?.shots||[])if(row.backgroundDecision==='use'){
    const shot=shots.find(s=>s.id===row.shotId),p=shot?.templateParams||{};
    if(p.materialRole!=='background'||!p.materialSrc||!p.materialSourceId||!p.materialMatchReason)
      issues.push({shotId:row.shotId,code:'BACKGROUND_NOT_BOUND',query:row.backgroundQuery});
  }
  const localBackgrounds=(plan?.shots||[]).filter(r=>r.backgroundQuery).map(r=>({shotId:r.shotId,
    candidates:rankLocalBackgrounds(r,shots.find(s=>s.id===r.shotId)||{},localIndex)}));
  const policyReview=checkMaterialPolicy(plan,demands,shots);issues.push(...policyReview.issues);
  const backgroundFiles=auditTextVideoFiles(project,shots);issues.push(...backgroundFiles.issues);
  const result={backgroundFiles,policyReview,schema:'talkcraft-material-research-audit-v1',demands,localBackgrounds,issues,passed:issues.length===0,sourceEvidenceAccepted:false,userAcceptance:false};
  write(path.join(project,'qa/material-research-audit.json'),result);return result;
}
export async function researchProject(project,index,{fetchImpl=fetch,refresh=false,localIndex=[]}={}) {
  const audit=auditMaterialResearch(project,index,{localIndex}),file=path.join(project,'material-research-plan.json');
  const plan=fs.existsSync(file)?read(file):{shots:[]};
  const planSha256=createHash('sha256').update(JSON.stringify({plan,searchPolicy:MATERIAL_POLICY_VERSION})).digest('hex');
  const cache=path.join(project,'qa','material-search-'+planSha256.slice(0,16)+'.json');
  const latestFile=path.join(project,'qa/material-search-results.json');
  if(!refresh&&fs.existsSync(latestFile)&&read(latestFile).planSha256===planSha256&&read(latestFile).completed){
    const previous=read(latestFile);
    return {audit,reused:true,queries:previous.rows.length,candidates:[...previous.rows,...previous.backgrounds].reduce((n,r)=>n+r.candidates.length,0),errors:[...previous.rows,...previous.backgrounds].flatMap(r=>r.errors)};
  }
  if(fs.existsSync(cache)&&!refresh){
    const previous=read(cache);write(path.join(project,'qa/material-search-results.json'),previous);
    return {audit,reused:true,queries:previous.rows.length,candidates:[...previous.rows,...previous.backgrounds].reduce((n,r)=>n+r.candidates.length,0),errors:[...previous.rows,...previous.backgrounds].flatMap(r=>r.errors)};
  }
  const requests=plan.shots.flatMap(s=>s.research||[]);
  const queries=[...new Set(requests.map(r=>r.query))];
  const rows=[];
  // Bounded sequential groups avoid provider bursts and preserve partial progress.
  for(const query of queries){
    const person=requests.find(r=>r.query===query&&r.entityType==='person');
    const discovered=await discoverMaterialSources(query,{fetchImpl,queryZh:requests.find(r=>r.query===query)?.queryZh||query});
    if(person){const identity=await discoverPersonSources(person,{fetchImpl});rows.push({...discovered,query,candidates:[...discovered.candidates,...identity.candidates],errors:[...discovered.errors,...identity.errors]});}
    else rows.push(discovered);
    write(path.join(project,'qa/material-search-results.json'),{schema:'talkcraft-material-search-v1',rows,completed:false});
  }
  const backgrounds=[];
  for(const query of [...new Set(plan.shots.map(s=>s.backgroundQuery).filter(Boolean))])backgrounds.push(await searchBackgroundVideos(query,{fetchImpl}));
  const output={schema:'talkcraft-material-search-v1',planSha256,rows,backgrounds,completed:true,accepted:false};
  // Immutable search attempts avoid accidental repeated requests on continuation.
  fs.mkdirSync(path.dirname(cache),{recursive:true});
  const attemptFile=fs.existsSync(cache)?cache.replace(/\.json$/u,`-${Date.now()}.json`):cache;
  fs.writeFileSync(attemptFile,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  write(path.join(project,'qa/material-search-results.json'),output);
  return {audit,queries:rows.length,candidates:[...rows,...backgrounds].reduce((n,r)=>n+r.candidates.length,0),errors:[...rows,...backgrounds].flatMap(r=>r.errors)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const project=path.resolve(process.argv[2]||''),index=read(path.resolve(process.argv[3]||'_audit/video-talkcraft/references/cards-index.json'));
  if(!fs.existsSync(path.join(project,'semantics.json')))throw Error('用法：node director/talkcraft-material-research.mjs <project> <cards-index.json> [--search]');
  const libraryFile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../materials/_index.json');
  const localIndex=fs.existsSync(libraryFile)?read(libraryFile):[];
  const result=process.argv.includes('--search')?await researchProject(project,index,{refresh:process.argv.includes('--refresh'),localIndex}):auditMaterialResearch(project,index,{localIndex});
  console.log(JSON.stringify(result,null,2));
}
