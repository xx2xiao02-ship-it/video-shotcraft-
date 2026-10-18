import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {auditTemplateReuse} from './talkcraft-template-governance.mjs';
import {auditHostContext} from './talkcraft-host-context.mjs';
import {assertCaptionScene} from './talkcraft-caption-layer.mjs';
import {visualPreference} from './talkcraft-visual-preference.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const read=file=>{
  if(!fs.existsSync(file))throw Error('已审模板门禁缺少证据，请重新规划并生成候选：'+file);
  return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/u,''));
};
const digest=value=>createHash('sha256').update(value).digest('hex');
const fileHash=file=>digest(fs.readFileSync(file));
const inside=(base,relative)=>{
  const file=path.resolve(base,relative),rel=path.relative(base,file);
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('模板证据路径越界：'+relative);
  return file;
};

// A reviewed template is a source version with bounded render/layout evidence.
// This never promotes historical technical review to acceptance of a new film.
export function loadReviewedTemplates({skillRoot,registryFile=path.join(directory,'talkcraft-reviewed-templates.json')}={}) {
  const registry=read(registryFile);
  if(registry.schema!=='talkcraft-reviewed-templates-v1'||!registry.cards?.length||!registry.sources)
    throw Error('已审模板登记缺失或格式无效；禁止回退到全目录');
  const cards=new Map();
  for(const card of registry.cards){
    if(cards.has(card.cardId)||card.reviewStatus!=='technical-reviewed'||!card.sourceFiles?.length||
      !card.reviews?.length||card.reviews.some(r=>r.bindingChecked!==true||r.layoutChecked!==true||
        r.fullDecode!==true||!['wide','portrait'].includes(r.orientation)||!/^[a-f0-9]{64}$/u.test(r.mediaSha256)))
      throw Error('模板审查证据不完整：'+card.cardId);
    if(!['wide','portrait'].every(o=>card.reviews.some(r=>r.orientation===o)))throw Error('模板缺少横竖版审查：'+card.cardId);
    for(const relative of card.sourceFiles){
      const expected=registry.sources[relative];
      if(!/^[a-f0-9]{64}$/u.test(expected||''))throw Error('模板缺少源码版本：'+relative);
      if(skillRoot&&fileHash(inside(skillRoot,relative))!==expected)throw Error('已审模板源码版本已变化，须重新审查：'+relative);
    }
    cards.set(card.cardId,card);
  }
  return {registry,cards,sha256:fileHash(registryFile)};
}

export function reviewedTemplateIndex(index,options={}) {
  const approved=loadReviewedTemplates(options);
  const cards=index.cards.filter(card=>approved.cards.has(card.slug));
  if(!cards.length)throw Error('没有同时具备语义索引与审查证据的模板');
  return {...index,cards};
}

// Model output is an editorial proposal, never executable scene source. This
// gate runs before a proposal is promoted to the authoritative shot files.
export function assertTemplateOnlyEditorialProposal(result,options={}) {
  const {cards}=loadReviewedTemplates(options);
  if(!Array.isArray(result?.shots)||!result.shots.length)throw Error('分镜提案缺少镜头');
  const forbidden=new Set(['code','jsx','tsx','html','css','svg','canvas','component','componentSource',
    'customScene','customVisual','visualCode','renderCode','diagramCode','schematic','drawCommands','layers']);
  const check=(value,location)=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      // Original template content can legitimately be named "code" or "html"
      // (a code-example card). Its own schema validates data fields later;
      // those strings are never promoted into a scene implementation here.
      if(key==='cardProps')continue;
      if(forbidden.has(key))throw Error('分镜提案不得携带自绘或可执行实现：'+location+'.'+key);
      check(item,location+'.'+key);
    }
  };
  for(const shot of result.shots){
    if(!cards.has(shot.shotCard))throw Error('编导只能提议已审模板：'+shot.id+' / '+shot.shotCard);
    if(!shot.templateParams?.cardProps||typeof shot.templateParams.cardProps!=='object'||Array.isArray(shot.templateParams.cardProps))
      throw Error('编导须填写模板业务参数，不能用画面描述替代：'+shot.id);
    check(shot,shot.id||'shot');
  }
  return {passed:true,shots:result.shots.length,stage:'proposal-only',candidateAccepted:false};
}

export function prepareReviewedCandidates(project,{skillRoot,...options}={}) {
  const index=reviewedTemplateIndex(read(path.join(skillRoot,'references/cards-index.json')),{skillRoot,...options});
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  const file=path.join(project,'qa/reviewed-template-index.json');
  fs.writeFileSync(file,JSON.stringify(index,null,2)+'\n');
  return file;
}

export function recordReviewedCandidates(project,options={}) {
  const reviewed=loadReviewedTemplates(options);
  const files=['semantics.json','SHOTBOOK.md','qa/card-candidates.json'];
  const result={schema:'talkcraft-reviewed-candidates-v1',registrySha256:reviewed.sha256,
    inputs:Object.fromEntries(files.map(f=>[f,fileHash(path.join(project,f))])),
    selectionPolicy:'reviewed-source; upstream-candidates-or-documented-semantic-deviation',userAcceptance:false};
  fs.writeFileSync(path.join(project,'qa/reviewed-candidate-binding.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}

// Legacy diagnostic retained for historical callers. Production candidates no
// longer invoke this: retain the upstream list and document outside selections.
export function reconcileReviewedSelectionCandidates(project,index,{allowOpeningCard=()=>true}={}) {
  const shots=read(path.join(project,'remotion/shots.json'));
  const semantics=read(path.join(project,'semantics.json'));
  const file=path.join(project,'qa/card-candidates.json');
  const candidates=read(file);
  const cards=new Map((index?.cards||[]).map(card=>[card.slug,card]));
  const shotSemantics=new Map();
  for(const sentence of semantics?.sentences||[]){
    const id=String(sentence?.shot||'').toLowerCase();
    if(!id)continue;
    const set=shotSemantics.get(id)||new Set();
    for(const semantic of sentence?.sem||[])set.add(semantic);
    shotSemantics.set(id,set);
  }
  const added=[];
  for(const shot of shots||[]){
    const id=String(shot?.id||'').toLowerCase(),card=cards.get(shot?.shotCard);
    if(!card||Number(shot?.start??shot?.startSec)<8&&!allowOpeningCard(card.slug))continue;
    const exact=[...(shotSemantics.get(id)||[])].filter(value=>card.semantics?.includes(value));
    if(!exact.length)continue;
    const entry=candidates[id]||candidates[shot.id]||(candidates[id]={media:'文',semantics:[...shotSemantics.get(id)||[]],waived:{},candidates:{}});
    entry.candidates ||= {};
    const already=Object.values(entry.candidates).some(list=>Array.isArray(list)&&list.some(item=>item?.slug===card.slug));
    if(already)continue;
    const semantic=exact[0];
    entry.candidates[semantic] ||= [];
    entry.candidates[semantic].push({slug:card.slug,score:0,energy:card.energy||'中',why:['正式选卡与当前语义精确匹配']});
    added.push({shotId:id,semantic,slug:card.slug});
  }
  if(added.length)fs.writeFileSync(file,JSON.stringify(candidates,null,2)+'\n');
  return {added};
}

export function assertReviewedSelection(project,options={}) {
  const reviewed=loadReviewedTemplates(options),shots=read(path.join(project,'remotion/shots.json'));
  const candidates=read(path.join(project,'qa/card-candidates.json'));
  const binding=read(path.join(project,'qa/reviewed-candidate-binding.json'));
  if(binding.schema!=='talkcraft-reviewed-candidates-v1'||binding.registrySha256!==reviewed.sha256)
    throw Error('候选未绑定当前已审模板登记');
  for(const name of ['semantics.json','SHOTBOOK.md','qa/card-candidates.json'])
    if(binding.inputs?.[name]!==fileHash(path.join(project,name)))throw Error('候选依据已变化，请重新生成候选：'+name);
  if(!Array.isArray(shots)||!shots.length)throw Error('分镜为空，不能验证已审选卡');
  const ids=new Set(),issues=auditHostContext(shots).map(i=>i.message),deviations=[],repairIssues=[];
  for(let i=0;i<shots.length;i++){
    const shot=shots[i],card=reviewed.cards.get(shot.shotCard);
    try{assertCaptionScene(shot);}catch(error){issues.push(error.message);}
    if(ids.has(shot.id))issues.push('镜头编号重复：'+shot.id);ids.add(shot.id);
    if(!card)issues.push('镜头使用未经审查的模板：'+shot.id+' / '+shot.shotCard);
    const entry=candidates[shot.id]||candidates[String(shot.id).toLowerCase()]||{},groups=entry.candidates||{};
    // The short-card eligibility pool is not a semantic recommendation.
    const matched=Object.entries(groups).filter(([name])=>name!=='开场短模板').some(([,list])=>
      Array.isArray(list)&&list.some(c=>c.slug===shot.shotCard));
    // `waived` is produced by upstream shotbook_parse.deviations from this
    // exact hash-bound SHOTBOOK. Do not turn a top-k recommendation into a ban.
    if(!matched){
      const reasons=Object.entries(entry.waived||{}).filter(([semantic,reason])=>
        entry.semantics?.includes(semantic)&&typeof reason==='string'&&[...reason.replace(/\s/gu,'')].length>=4);
      if(!reasons.length){
        const message='正式选卡在推荐候选外，须按原项目在本镜写语义偏离理由（至少4字）：'+shot.id+' / '+shot.shotCard;
        issues.push(message);repairIssues.push({code:'SELECTION_DEVIATION_REQUIRED',shotId:shot.id,cardId:shot.shotCard,
          field:'templateParams.semanticDeviations',allowedSemanticKeys:entry.semantics||[],message});
      }
      else deviations.push({shotId:shot.id,cardId:shot.shotCard,reasons:Object.fromEntries(reasons)});
    }
  }
  issues.push(...auditTemplateReuse(shots).map(i=>'连续30镜内重复使用模板，缺少同一观点承接依据：'+i.shotId+' / '+i.cardId));
  if(issues.length)throw Object.assign(Error(issues.join('\n')),{issues:[...repairIssues,
    ...issues.filter(message=>!repairIssues.some(i=>i.message===message)).map(message=>({code:'REVIEWED_SELECTION_INVALID',message}))]});
  return {passed:true,shots:shots.length,deviations,registrySha256:reviewed.sha256,userAcceptance:false};
}

// Expose retrieval breadth and actual editorial choices without changing the
// upstream ordering, adding synthetic recommendations or claiming visual QA.
export function recordCandidateComparison(project,options={}) {
  const reviewed=loadReviewedTemplates(options),candidates=read(path.join(project,'qa/card-candidates.json'));
  const index=read(path.join(options.skillRoot||process.env.TALKCRAFT_SKILL_ROOT||path.resolve(directory,'../_audit/video-talkcraft'),'references/cards-index.json'));
  const shots=read(path.join(project,'remotion/shots.json'));
  const rows=shots.map((shot,i)=>{
    const entry=candidates[shot.id]||candidates[String(shot.id).toLowerCase()]||{};
    const groups=Object.entries(entry.candidates||{}).filter(([sem])=>sem!=='开场短模板');
    const recommendations=[...new Set(groups.flatMap(([,list])=>list.map(c=>c.slug)))];
    const recent=shots.slice(Math.max(0,i-29),i).map(s=>({shotId:s.id,cardId:s.shotCard}));
    return {shotId:shot.id,selectedCard:shot.shotCard,recommendedCount:recommendations.length,
      perSemantic:Object.fromEntries(groups.map(([sem,list])=>[sem,list.map(c=>c.slug)])),
      recommended:recommendations.includes(shot.shotCard),semanticDeviation:entry.waived||{},
      expressionPreference:visualPreference(recommendations.map(id=>index.cards.find(c=>c.slug===id)).filter(Boolean),
        {semantics:groups.map(([sem])=>sem),mediaAvailable:/V|图|截图/u.test(entry.media||'')}),
      recentWindow:recent,unusedRecommendations:recommendations.filter(id=>!recent.some(s=>s.cardId===id)),
      templateContinuity:shot.templateParams?.templateContinuity||null};
  });
  const report={schema:'talkcraft-candidate-comparison-v1',availableCards:[...reviewed.cards.keys()],
    availableCount:reviewed.cards.size,policy:'all-reviewed-comparable; all-upstream-feasible-recommended; outside-with-upstream-reason',
    rows,userAcceptance:false,visualVerified:false};
  fs.writeFileSync(path.join(project,'qa/card-candidate-comparison.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

// A read-only diagnostic also runs against old projects that have no binding.
// It reports each independent defect; it never creates missing acceptance.
export function auditReviewedTemplates(project,options={}) {
  const checks=[];
  for(const [name,check,remedy] of [
    ['selection',()=>assertReviewedSelection(project,options),'用已审索引重跑上游候选；保留编导选卡，候选外在SHOTBOOK按原版格式写明理由并审核。'],
    ['drawing',()=>assertNoCustomDrawing(project),'撤回定制补画和外层版式覆盖，恢复原卡及其原生参数。'],
    ['runtime',()=>assertReviewedRuntimeSources(project,options),'从登记的同版本源码恢复模板及实际依赖，再重新预检和渲染。'],
  ]){
    try{checks.push({name,passed:true,result:check()});}
    catch(error){checks.push({name,passed:false,reason:error.message,remedy});}
  }
  return {schema:'talkcraft-reviewed-admission-v1',checkedAt:new Date().toISOString(),
    passed:checks.every(c=>c.passed),checks,userAcceptance:false};
}

export function assertNoCustomDrawing(project,{requiredShotIds=null}={}) {
  const src=path.join(project,'remotion/src');
  const shells=['Main.tsx','NativePresentationRoot.tsx','scenes/scene-shared.tsx'];
  for(const name of shells){
    const file=path.join(src,name);if(!fs.existsSync(file))continue;
    const text=fs.readFileSync(file,'utf8');
    if(name==='Main.tsx'&&/const DefaultScene[\s\S]*?<(?:AbsoluteFill|div)\b[\s\S]*?export const Main/u.test(text))
      throw Error('默认场景仍会自动补画，须改为缺场景时明确阻断：'+name);
    if(/NarrativeLead|data-narrative-lead|<svg\b|<canvas\b|DrawPath|DrawIcon|<Plate\b|<Connector\b/u.test(text))
      throw Error('模板外补画禁止进入渲染：'+name);
    if(name==='NativePresentationRoot.tsx'&&/nativeCardSkin|readabilityLayout/u.test(text))
      throw Error('禁止在原卡外覆盖版式，须使用模板已审参数：'+name);
    for(const match of text.matchAll(/from\s*['"](\.[^'"]+)['"]/gu)){
      const target=match[1];
      const allowed=name==='Main.tsx'?new Set(['./shots','./scenes','./sfx','./Subtitles','./Environment','./camera','./theme','./BundledFonts','./timing','./WordRevealAudit','./ContrastAudit','./talkcraft-host-context.mjs']):
        name==='NativePresentationRoot.tsx'?new Set(['./native-time-map.mjs','../native-presentation.json','../shots.json','./shots','./WordRevealRoot']):
          new Set(['../NativePresentationRoot','../shots','../talkcraft-template-adapter','../theme','../talkcraft-presentation-skin.mjs']);
      if(!allowed.has(target))throw Error('渲染壳引入未经登记的扩展：'+name+' → '+target);
    }
  }
  const presentation=path.join(project,'remotion/native-presentation.json');
  if(fs.existsSync(presentation)&&read(presentation).shots?.some(s=>s.readabilityLayout))
    throw Error('展示计划仍含模板外版式覆盖，须改用原卡参数或重新选卡');
  const scenes=path.join(src,'scenes');
  const shotsFile=path.join(project,'remotion/shots.json');
  if(fs.existsSync(shotsFile))for(const shot of read(shotsFile)){
    if(requiredShotIds&&!requiredShotIds.includes(shot.id))continue;
    if(!/^[a-z][a-z0-9_-]*$/iu.test(shot.id)||!fs.existsSync(path.join(scenes,shot.id+'.tsx')))
      throw Error('正式模板场景缺失，禁止回退补画：'+shot.id);
  }
  if(fs.existsSync(scenes))for(const name of fs.readdirSync(scenes).filter(n=>/^s\d+[a-z]?\.tsx$/iu.test(n))){
    const text=fs.readFileSync(path.join(scenes,name),'utf8');
    if(/<svg\b|<canvas\b|DrawPath|DrawIcon|NarrativeLead|<AbsoluteFill|<div\b/u.test(text)||
      !text.includes('<TemplateScene'))throw Error('场景必须调用已审模板，禁止自行补画：'+name);
    for(const match of text.matchAll(/from\s*['"](\.[^'"]+)['"]/gu))
      if(!['../shots','../params','./scene-shared'].includes(match[1]))throw Error('镜头引入库外实现：'+name);
  }
  return {passed:true,policy:'reviewed-templates-only; no custom drawing'};
}

export function assertReviewedRuntimeSources(project,{skillRoot,...options}={}) {
  const {registry,cards}=loadReviewedTemplates({skillRoot,...options});
  const shots=read(path.join(project,'remotion/shots.json')),checked=new Set();
  for(const shot of shots){
    const card=cards.get(shot.shotCard);
    if(!card)throw Error('运行镜头缺少已审模板：'+shot.id);
    for(const relative of card.sourceFiles){
      if(checked.has(relative))continue;checked.add(relative);
      const original=inside(skillRoot,relative),isWorkbench=relative.startsWith('workbench/src/cards/');
      const isTemplate=relative.startsWith('template/cards/');
      if(!isWorkbench&&!isTemplate)throw Error('模板依赖不在已审源码目录：'+relative);
      const dest=inside(path.join(project,'remotion/src'),isWorkbench?
        relative.replace('workbench/src/cards/','parameterized-cards/'):
        relative.replace('template/cards/','cards/'));
      let source=fs.readFileSync(original,'utf8');
      if(relative.startsWith('workbench/src/cards/gen/'))source=source.replace(/(["'])@tpl\//gu,'$1../../cards/');
      if(relative==='workbench/src/cards/shared.tsx'&&fs.existsSync(dest)&&fileHash(dest)!==registry.sources[relative])
        source=source.replace(/export const FONT_STACK\s*=\s*[^;]+;/gu,
          `export const FONT_STACK = 'var(--sc-font-family, "Microsoft YaHei", sans-serif)';`);
      if(!fs.existsSync(dest)||fileHash(dest)!==digest(source))throw Error('运行模板被改写或缺失，不能继承历史审查：'+dest);
    }
  }
  return {passed:true,files:checked.size};
}

export function enforceReviewedTemplateStage(stage,project,options={}) {
  if(['scaffold','implement','implement-scenes','sample','sample-2m','render-all','render-qa','sample-qa','word-reveal-qa','text-contrast','qa','deliver'].includes(stage)){
    const selection=assertReviewedSelection(project,options);
    if(!['scaffold','implement','implement-scenes'].includes(stage)){
      // Upstream requires only the sample scene to be implemented before its
      // approval. Other scenes may be absent, but may never draw a fallback.
      assertNoCustomDrawing(project,{requiredShotIds:['sample','sample-qa'].includes(stage)?['s01']:null});
      assertReviewedRuntimeSources(project,options);
    }
    return selection;
  }
  return null;
}
