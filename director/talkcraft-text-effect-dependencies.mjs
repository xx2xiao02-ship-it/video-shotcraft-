import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeFrameAt} from './talkcraft-native-time-map.mjs';
const frames=t=>Math.floor(t*30+1e-7)+1;
const lines=s=>String(s||'').split('\n').filter(Boolean);
const num=(p,k,d)=>Number.isFinite(p[k])?p[k]:d;
export const TEXT_EFFECT_RULES='文字与模板展示窗口必须相容；逐字段/逐条检查真实输出锚点与原卡可读窗口，不能只验首秒或句首。划线、圈注、荧光高亮等强调必须在对应文字实际显现之后完整播放；承载文字的背景允许原卡固有短错峰，不允许等待未来锚词形成空块。文字已被原卡删除、滚出、退场或动效提前播放时返回编导调整公开参数、驻留或重新选卡；禁止提前真实字级锚点、修改口型时钟、覆盖几何、跳过原卡动作或以隐藏装饰冒充时序修复。新参数不得让原卡动作越过最后原生帧。';
// Native times below are audited against the exact parameterized/original source
// fingerprints in talkcraft-text-effect-sources.json, not inferred from card names.
export function textEffectContract(card,p={},nativeFrames=1){
 const texts=[],effects=[],last=nativeFrames-1;
 const text=(field,index=0,begin=0,end=last)=>texts.push({field,index,begin,end:Math.min(last,end)});
 const effect=(id,field,index,at,end,lead=0)=>effects.push({id,field,index,begin:frames(at),end:Math.ceil(end*30),leadFrames:lead});
 const group=(field,n,at=()=>0,end=()=>last)=>{for(let i=0;i<n;i++)text(field,i,frames(at(i)),end(i));};
 const all=(fields,at=0,end=last)=>fields.forEach(f=>text(f,0,at,end));
 switch(card){
 case 'split-text-stagger':{
  text('text',0,frames(.3+.067*Math.max(0,[...String(p.text||'')].length-1)+.5),Math.ceil(4.4*30)-1);
  text('sub',0,frames(1.4),Math.ceil(4.4*30)-1);break;}
 case 'scanline-annotate':{
  const targets=typeof p.targets==='string'?lines(p.targets).map(line=>{const [x,y,w,h]=line.split(/[,，\s]+/u).map(Number);return{x,y,w,h};}):p.targets||[];
  let previous=-Infinity;
  targets.forEach((r,i)=>{const at=Math.max(.5+((r.y+r.h+30)/446)*2.4,previous+.15);previous=at;text('labels',i,frames(at+.17),Math.ceil(5.2*30)-1);});break;}
 case 'doc-park-left-pill-deal':{
  const end=Math.ceil(6.6*30)-1;
  if(!p.docSrc)text('docTitle',0,0,end);
  text('hint',0,frames(1.4),end);
  group('pills',lines(p.pills).length,i=>1.9+i*1.3,()=>end);
  group('notes',lines(p.notes).length,i=>2.2+i*1.3,()=>end);break;}
 case 'rack-focus-pair':
  text('labelFront',0,frames(.28),Math.ceil(6.4*30)-1);
  text('labelBack',0,frames(.2),Math.ceil(6.4*30)-1);break;
 case 'gallery-wall-dolly':
  ['label1','label2','label3'].forEach((f,i)=>text(f,0,0,Math.ceil((7.7+i*.04)*30)-1));break;
 case 'type-contrast-emphasis': group('words',lines(p.words).length,i=>Number(lines(p.words)[i].split('|')[1]||0));break;
 case 'keyword-pop-highlight':
  all(['textBefore','textAfter']);text('keyword',0,frames(num(p,'delay',.55)));
  effect('keyword-carrier','keyword',0,num(p,'delay',.55),num(p,'delay',.55)+.46,1);break;
 case 'highlighter-sweep':
  all(['docHead','keyText']);group('linesBefore',lines(p.linesBefore).length);group('linesAfter',lines(p.linesAfter).length);
  effect('highlight','keyText',0,num(p,'startDelay',.7),num(p,'startDelay',.7)+.6);break;
 case 'per-character-rise':text('text',0,frames(num(p,'lead',.3)));break;
 case 'alt-block-lines':
  for(let i=0;i<2;i++){const at=num(p,'lead',.4)+i*.12;text('line'+(i+1),0,frames(at+.067));effect('line-carrier-'+i,'line'+(i+1),0,at,at+.26,3);}break;
 case 'line-by-line-slide':{
  const n=lines(p.lines).length,lead=num(p,'lead',.3),out=lead+(n-1)*.1333+.9+1.4;
  group('lines',n,i=>lead+i*.1333,i=>Math.ceil((out+i*.0667+.6)*30)-1);break;}
 case 'numbered-step-stack':
  group('stepsDsl',lines(p.stepsDsl).length,i=>num(p,'lead',.4)+i*.11);
  lines(p.stepsDsl).forEach((_,i)=>{let at=num(p,'lead',.4)+i*.11;effect('row-carrier-'+i,'stepsDsl',i,at,at+.24,1);});break;
 case 'title-demote-to-label':{
  const n=lines(p.items).length,out=1.7+(n-1)*.55+2.7+.4;
  text('title',0,frames(.2),Math.ceil(out*30)-1);group('items',n,i=>1.7+i*.55,()=>Math.ceil(out*30)-1);break;}
 case 'info-card-assemble':{
  const end=Math.ceil(6.8*30)-1,F=i=>i*5/60;
  text('caption',0,frames(.2),end);text('title',0,frames(F(4)),end);text('price',0,frames(F(16)),end);
  group('pills',lines(p.pills).length,i=>F(8+2*i),()=>end);group('lines',lines(p.lines).length,i=>F(30+2*i),()=>end);
  String(p.highlightLines??'1,2').split(/[,，\s]+/).filter(Boolean).forEach((v,k)=>effect('line-highlight-'+k,'lines',Number(v)-1,F(34+2*k),F(34+2*k)+.17));break;}
 case 'lower-third-nameplate':
  text('name',0,frames(.4+.3*.7),Math.ceil((.4+.3+2+.08+.3*.7)*30)-1);
  text('title',0,frames(.4+.3*.7+.15),Math.ceil((.4+.3+2+.3*.7)*30)-1);
  effect('nameplate-carrier','name',0,.4,.7,7);break;
 case 'error-retype':{
  text('prefix');
  const a=String(p.first||'').length,b=String(p.second||'').length,del=.7+a*.09+.55,retype=del+a*.06+.12;
  text('first',0,Math.ceil((.7+(a-1)*.09)*30),Math.ceil(del*30)-1);
  text('second',0,Math.ceil((retype+(b-1)*.06)*30),Math.floor((retype+b*.06+.3+2.6)*30));break;}
 case 'word-slot-cycle':{
  const n=lines(p.words).length,swap=i=>1.1+(i-1)*.7,fly=(n>1?swap(n-1):.4)+.7+.35,exit=fly+2.5+.4;
  text('stem',0,frames(.2),Math.ceil(exit*30)-1);
  for(let i=0;i<n;i++)text('words',i,Math.ceil((i?swap(i)+.27:.28)*30),Math.ceil((i<n-1?swap(i+1):fly)*30)-1);
  text('final',0,frames(fly+.12),Math.ceil(exit*30)-1);
  effect('slot-carrier','words',0,.28,.78,1);break;}
 case 'info-term-card':all(['term','termSmall','iconChar'],1,Math.ceil(3.96*30)-1);group('desc',lines(p.desc).length,()=>0,()=>Math.ceil(3.96*30)-1);break;
 case 'step-timeline-vertical':{
  const rows=lines(p.stepsDsl),n=rows.length,lead=num(p,'lead',.4),gap=num(p,'rowGap',110),y0=22,wrap=y0*2+gap*Math.max(0,n-1);
  const inv=x=>x<.5?Math.sqrt(x/2):1-Math.sqrt((1-x)/2);
  rows.forEach((line,i)=>{const at=lead+.6*inv((y0+gap*i)/wrap);line.split(/[|｜]/).filter(Boolean).forEach((_,j)=>text('stepsDsl',i*2+j,frames(at+.067)));});break;}
 case 'ink-underline':
  all(['line1Pre','line1Key','line1Post','line2Pre','line2Key','line2Post']);
  effect('underline-1','line1Key',0,num(p,'startDelay',.55),num(p,'startDelay',.55)+.5);
  effect('underline-2','line2Key',0,num(p,'startDelay',.55)+.5+num(p,'gapBetween',.75),num(p,'startDelay',.55)+.5+num(p,'gapBetween',.75)+.42);break;
 case 'quote-hold-arrow':{
  const lead=num(p,'lead',.4);['line1','line2','lastLine'].forEach((f,i)=>text(f,0,frames(lead+i*.12)));
  const at=lead+.24+.28+.34;effect('quote-highlight','lastLine',0,at,at+.24+.17);break;}
 case 'quote-bracket-pull':{
  const lead=num(p,'lead',.35),at=lead+.16;
  ['line1','line2','line3Head','keyText'].forEach((f,i)=>text(f,0,frames(at+Math.min(i,2)*.09)));
  effect('quote-marker','keyText',0,at+.18+.3+.1,at+.18+.3+.1+.26);break;}
 case 'chapter-progress-list':{
  const n=lines(p.rows).length,lead=num(p,'lead',.35);text('headText',0,frames(lead));group('rows',n,i=>lead+.06+i*.1);
  const i=lines(p.rows).findIndex(r=>r.split('|').includes('current'));
  if(i>=0){let at=lead+.06+(n-1)*.1+.24+.06;effect('current-row-highlight','rows',i,at,at+.3);}break;}
 case 'hand-drawn-ellipse':all(['leadText','ringWord']);effect('ring','ringWord',0,num(p,'startDelay',.42),num(p,'startDelay',.42)+.5+.06+.22);break;
 case 'outline-box-title':
  text('titleText');text('chipText',0,frames(num(p,'lead',.4)+.56));
  effect('title-outline','titleText',0,num(p,'lead',.4),num(p,'lead',.4)+.42);
  effect('chip-carrier','chipText',0,num(p,'lead',.4)+.46,num(p,'lead',.4)+.66,4);break;
 case 'quote-card':{
  const lead=num(p,'lead',.15),out=lead+.95+.3+num(p,'hold',2),end=Math.floor(out*30)-1;
  group('lines',lines(p.lines).length,i=>lead+.2+i*.15,()=>end);text('source',0,frames(lead+.95),end);break;}
 case 'tracking-in':text('text',0,frames(num(p,'lead',.3)));texts.at(-1).wholeField=true;break;
 case 'soft-blur-in':text('text',0,frames(num(p,'lead',.3)));texts.at(-1).wholeField=true;break;
 case 'slab-punch-title':{
  const lead=num(p,'lead',.4);text('line1',0,frames(lead));text('line2',0,Math.ceil((lead+.47)*30));
  effect('slab-carrier','line2',0,lead+.25,lead+.47,7);break;}
 case 'corner-bracket-frame':{
  const lead=num(p,'lead',.4);text('line1',0,frames(lead+.22));text('line2',0,frames(lead+.32));
  effect('corner-carrier','line1',0,lead,lead+.3,7);break;}
 case 'chapter-title-card':{
  const at=num(p,'startAt',.3),wipe=num(p,'wipeDur',.3),end=Math.floor((at+wipe+.4+.35+num(p,'hold',1.2))*30)-1;
  text('num',0,frames(at+wipe),end);text('name',0,frames(at+wipe+.18),end);text('sub',0,frames(at+wipe+.18+.1),end);break;}
 default:return null;
 }
 return {card,texts,effects};
}
export function checkTextEffectDependencies(shots,presentation,reveals){
 const issues=[],checks=[];
 for(const shot of shots){
  const row=presentation.shots.find(r=>r.shotId===shot.id);if(!row){issues.push({code:'TEXT_EFFECT_PLAN_MISSING',shotId:shot.id,message:shot.id+' 缺少正式原生时间计划'});continue;}
  const contract=textEffectContract(shot.shotCard,shot.templateParams?.cardProps||{},row.nativeFrames);
  if(!contract){checks.push({shotId:shot.id,card:shot.shotCard,coverage:'not-audited'});issues.push({code:'TEXT_EFFECT_CONTRACT_REQUIRED',shotId:shot.id,message:shot.id+' 尚无与源码绑定的时序契约，须审计该正式选卡；不缩减108张候选库。'});continue;}
  const events=reveals.events.filter(e=>e.beatId===shot.id&&!e.deferredTo);
  const duration=row.endFrame-row.startFrame,mapping=Array.from({length:duration},(_,i)=>nativeFrameAt(row.timeline,i));
  const resolved=[];
  for(const window of contract.texts.flatMap(w=>w.wholeField ? events.filter(e=>e.field===w.field).map((_,i)=>({...w,index:i})) : [w])){
   const event=events.filter(e=>e.field===window.field)[window.index];if(!event)continue;
   const readable=mapping.map((n,f)=>f>=event.localFrame&&n>=window.begin&&n<=window.end);
   const first=readable.findIndex(Boolean);let longest=0,run=0;
   for(const yes of readable){run=yes?run+1:0;longest=Math.max(longest,run);}
   const item={...window,eventId:event.id,wordFrame:event.localFrame,firstReadableFrame:first,longestReadableFrames:longest};resolved.push(item);
   // A genuine word gate must leave at least three consecutive readable frames.
   // A native entrance may follow the gate; a deleted/rolled-out word cannot.
   if(first<0||longest<3)issues.push({code:'NATIVE_TEXT_WINDOW_MISMATCH',shotId:shot.id,...item,
    message:`${shot.id}「${event.text}」真实锚点第${event.localFrame}帧与原卡展示窗口不相容，不能提前锚词或在已滚出/退场后补字。`});
  }
  const substantive=resolved.filter(t=>String(events.find(e=>e.id===t.eventId)?.text||'').replace(/[\s\p{P}\p{N}]/gu,'').length>=2);
  const firstContent=Math.min(...substantive.filter(t=>t.firstReadableFrame>=0).map(t=>t.firstReadableFrame));
  const props=shot.templateParams?.cardProps||{},hasMaterial=Boolean(shot.templateParams?.materialSrc||Object.entries(props).some(([k,v])=>/^(?:src\d*|docSrc|srcFront|srcBack)$/iu.test(k)&&v));
  if(shot.subject==='other'&&!hasMaterial&&firstContent>30)issues.push({code:'NATIVE_CONTENT_ONSET_GAP',shotId:shot.id,message:shot.id+' 首秒原卡没有实际可见的有效文字承接，不能只凭0帧的文字计划掩盖原卡尚未入场。'});
  const effectChecks=[],constraints=[];
  for(const t of resolved)constraints.push({nativeFrame:Math.max(0,t.end-2),notBeforeFrame:t.wordFrame,kind:'text-window',eventId:t.eventId});
  for(const effect of contract.effects){
   const target=resolved.find(t=>t.field===effect.field&&t.index===effect.index);
   if(!target){if(String(shot.templateParams?.cardProps?.[effect.field]||'').trim())issues.push({code:'TEXT_EFFECT_TARGET_MISSING',shotId:shot.id,effectId:effect.id,message:shot.id+' 装饰依赖文字缺少有效绑定，不能让延期/隐藏文字留下空装饰。'});continue;}
   const begin=mapping.findIndex(n=>n>=effect.begin),end=mapping.findIndex(n=>n>=effect.end);
   const ready=Math.max(target.wordFrame,target.firstReadableFrame);
   constraints.push({nativeFrame:effect.begin,notBeforeFrame:target.wordFrame-effect.leadFrames+(effect.leadFrames===0?1:0),kind:'decoration',effectId:effect.id});
   const early=begin>=0&&begin<ready-effect.leadFrames+(effect.leadFrames===0?1:0);
   if(early||begin<0||end<0)issues.push({code:early?'TEXT_EFFECT_DEPENDENCY_EARLY':'TEXT_EFFECT_INCOMPLETE',shotId:shot.id,effectId:effect.id,
    targetEventId:target.eventId,effectFrame:begin,textReadyFrame:ready,allowedCarrierLeadFrames:effect.leadFrames,
    message:`${shot.id}「${effect.id}」${early?'先于对应文字显现':'未能在原生结束前完整播放'}，须调整公开参数/合法驻留；不得隐藏已播放动效冒充修复。`});
   effectChecks.push({...effect,targetEventId:target.eventId,firstOutputFrame:begin,lastOutputFrame:end,textReadyFrame:ready});
  }
  const lowerBounds=constraints.map(c=>({...c,minimumTotalFrames:c.notBeforeFrame+Math.ceil(Math.max(0,row.nativeFrames-1-c.nativeFrame)/1.15)+1}));
  const impossible=lowerBounds.filter(c=>c.minimumTotalFrames>duration);
  checks.push({shotId:shot.id,card:shot.shotCard,coverage:'audited',texts:resolved,effects:effectChecks,
    feasibility:{durationFrames:duration,minimumTotalFrames:Math.max(duration,...lowerBounds.map(c=>c.minimumTotalFrames)),
      requiresReplanning:impossible.length>0,impossibleConstraints:impossible}});
 }
 return {schema:'talkcraft-text-effect-dependencies-v1',passed:issues.length===0,issues,checks,runtimeVerified:false,userAcceptance:false};
}
export function recordTextEffectDependencies(project,shots,presentation,reveals,{requireSources=false}={}){
 const report=checkTextEffectDependencies(shots,presentation,reveals);
 const manifest=JSON.parse(fs.readFileSync(new URL('./talkcraft-text-effect-sources.json',import.meta.url),'utf8'));
 report.binding={contract:createHash('sha256').update(fs.readFileSync(new URL('./talkcraft-text-effect-dependencies.mjs',import.meta.url))).digest('hex'),sources:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};report.sourceVerified=true;
 for(const relative of ['shots.json','native-presentation.json','word-reveal-plan.json'])report.binding[relative]=createHash('sha256').update(fs.readFileSync(path.join(project,'remotion',relative))).digest('hex');
 for(const shot of shots){
  const spec=manifest[shot.shotCard];if(!spec){report.sourceVerified=false;report.issues.push({code:'TEXT_EFFECT_SOURCE_CONTRACT_REQUIRED',shotId:shot.id,message:shot.id+' 缺少正式时序契约对应源码指纹，不能冒充已审计'});continue;}
  for(const [relative,expected] of Object.entries(spec)){
   const file=path.join(project,'remotion/src',relative),actual=fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
   report.binding[relative]=actual;
   if(actual===null){report.sourceVerified=false;if(!requireSources)continue;}
   if(actual!==expected){report.sourceVerified=false;report.issues.push({code:'TEXT_EFFECT_SOURCE_CHANGED',shotId:shot.id,message:`${shot.id} 时序契约对应源码已变化：${relative}，须重新核对，不能套旧时间表。`});}
  }
 }
 report.passed=report.issues.length===0;
 fs.mkdirSync(path.join(project,'qa'),{recursive:true});fs.writeFileSync(path.join(project,'qa/text-effect-dependencies.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}

