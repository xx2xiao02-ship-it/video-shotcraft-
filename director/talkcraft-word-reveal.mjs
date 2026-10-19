import {checkPresentationSemantics} from './talkcraft-background-presentation.mjs';
import {assertCaptionEmphasis} from './talkcraft-caption-emphasis-plan.mjs';
import {recordTextEffectDependencies} from './talkcraft-text-effect-dependencies.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {minimumContrast,sampledContrast} from './talkcraft-color-contrast.mjs';
import {normalizeVisibleText,isPictogram} from './talkcraft-text-occurrences.mjs';
import * as nativeTiming from './talkcraft-native-timing.mjs';
import {isNativePresentation,nativeRevealUnits,checkNativeGovernance} from './talkcraft-native-governance.mjs';
import {nativeBridgeAuditPoints} from './talkcraft-native-bridge-audit.mjs';
import {checkContentOnset} from './talkcraft-content-onset.mjs';
import {validateWordRuntime,validateTextBindings} from './talkcraft-word-runtime-validation.mjs';
import {installPresentationSkin} from './talkcraft-presentation-install.mjs';
const wordTimingFile=project=>{
  if(typeof nativeTiming.wordTimingFile==='function')return nativeTiming.wordTimingFile(project);
  // Older application builds do not understand the Seed TTS2 pronunciation
  // provenance fields. Validate those exact raw records locally without changing
  // the older module or accepting its sentence-derived linear timings.
  const file=path.join(project,'audio/timestamps.json'),timing=read(file);
  if(timing.provider!=='volcengine-seed-tts-2.0'){nativeTiming.requireWordTiming(project);return file;}
  const voice=read(path.join(project,'audio/voice-timing.json')),script=read(path.join(project,'script.json'));
  const mandatory=['audio/full.mp3','script.json','audio/voice-timing.json'];
  if(timing.timingSource!=='tts-native'||timing.timingGranularity!=='word'||
    voice.voiceEngine!==timing.provider||voice.timingMethod!=='volcengine-word-timestamps'||
    mandatory.some(f=>!timing.provenance?.[f])||
    Object.entries(timing.provenance??{}).some(([f,h])=>!fs.existsSync(path.join(project,f))||sha(path.join(project,f))!==h))
    throw Error('配音字级时间缺少当前原始记录的哈希证据');
  const words=timing.sentences.flatMap(s=>s.words??[]);
  if(timing.sentences.length!==script.sentences.length||
    timing.sentences.some((s,i)=>s.text!==script.sentences[i]||normalizeText(s.words.map(w=>w.text).join(''))!==normalizeText(s.text))||
    words.length!==voice.words?.length)throw Error('配音字级时间与原稿/原始词记录不符');
  let end=0;for(let i=0;i<words.length;i++){
    const w=words[i],raw=voice.words[i];
    if(normalizeText(w.text)!==normalizeText(raw.word)||!Number.isFinite(w.start)||!Number.isFinite(w.end)||
      Math.abs(w.start-raw.startTime)>.001||Math.abs(w.end-raw.endTime)>.001||w.start<end-.001||w.end<=w.start||w.end>timing.total+.05)
      throw Error('字级时间与供应商原始词记录不一致:'+i);
    end=w.end;
  }
  return file;
};

const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export function wordRenderTimingFile(project){
  const canonical=path.join(project,'remotion/timing.json'),renderCopy=path.join(project,'remotion/src/timing.json');
  if(fs.existsSync(canonical)){
    if(fs.existsSync(renderCopy)&&JSON.stringify(read(canonical))!==JSON.stringify(read(renderCopy)))
      throw Error('规划字级时间轴与渲染副本不一致，须同步同一原始时间轴，禁止改配音时钟');
    return canonical;
  }
  return renderCopy; // Legacy projects without a planning timing artifact.
}
export const normalizeText=s=>String(s).replace(/[\s*・，。！？：；、,.!?;:「」《》“”‘’]/gu,'');
// Some native cards use pipes/newlines as layout delimiters (for example
// `rows: "前提|结果"`). They are not visible text, so the binding check
// must compare the spoken phrase with the rendered labels rather than with
// the DSL separators themselves.
export const normalizeCardText=normalizeVisibleText;
export function wordRevealUnits(project){
  return isNativePresentation(project)?nativeRevealUnits(project):read(path.join(project,'remotion/visual-beats.json'));
}

// Anchors refer to actual provider/alignment character rows, never estimated durations.
export function resolveReveal(timing, beat, event, fps=30) {
  if(!event.id || !event.text || !event.anchor || !event.sentence)throw Error('文字落点缺少 id/text/anchor/sentence');
  const sentence=timing.scenes.find(s=>s.id===event.sentence);
  if(!sentence)throw Error('不存在的配音句:'+event.sentence);
  // Context labels (window titles, button labels, chart units) are static
  // explanatory UI. They belong to the sentence's visual beat but are not
  // necessarily spoken verbatim, so they must not be forced through the
  // spoken-word anchor lookup.
  if(event.role==='context') {
    if(!event.reason)throw Error('背景说明必须登记语义依据：'+event.id);
    const offset=Number.isInteger(event.contextOffsetFrames)?Math.max(0,event.contextOffsetFrames):0;
    if(beat.startFrame+offset>=beat.endFrame)throw Error('背景说明入场偏移超出镜头：'+event.id);
    return {...event,beatId:beat.id,card:beat.card,spokenSec:null,globalFrame:beat.startFrame+offset,
      localFrame:offset,fps};
  }
  const rows=sentence.chars.filter(c=>normalizeText(c.ch));
  const content=rows.map(c=>normalizeText(c.ch)).join(''),query=normalizeText(event.anchor);
  if(!query||!normalizeText(event.text))throw Error('文字或锚词不能只有标点:'+event.id);
  const matches=[];for(let pos=content.indexOf(query);pos>=0;pos=content.indexOf(query,pos+1))matches.push(pos);
  if(!matches.length)throw Error('配音中找不到锚词:'+event.id+'/'+event.anchor);
  if(matches.length>1&&!Number.isInteger(event.occurrence))throw Error('锚词重复，须指定 occurrence:'+event.id);
  const pos=matches[event.occurrence??0];if(pos===undefined)throw Error('锚词序号越界:'+event.id);
  const row=rows[pos];if(!Number.isFinite(row.t)||!Number.isFinite(row.e)||row.e<=row.t)throw Error('锚词无真实发声时间:'+event.id);
  const frame=event.role==='context'?beat.startFrame:Math.round(row.t*fps);
  if(frame<beat.startFrame-1&&!event.carry)throw Error('锚词早于本拍，须明确 carry 理由:'+event.id);
  if(event.carry&&!event.reason)throw Error('carry 必须说明沿用前文的原因:'+event.id);
  if(frame>=beat.endFrame&&!event.deferredTo)throw Error('锚词晚于本拍，须移至后拍:'+event.id);
  if(normalizeText(event.text)!==query&&!event.reason)throw Error('摘要文字须说明对应语义:'+event.id);
  return {...event,beatId:beat.id,card:beat.card,spokenSec:row.t,globalFrame:frame,
    localFrame:Math.max(0,frame-beat.startFrame),fps};
}

export function compileWordReveals(project,{write=true}={}) {
  const remotion=path.join(project,'remotion'),planFile=path.join(remotion,'word-reveal-plan.json'),native=isNativePresentation(project);
  if(!fs.existsSync(planFile)){if(native)throw Error('NATIVE_WORD_PLAN_REQUIRED：正式模板缺少逐词落点计划');return {enabled:false};}
  const plan=read(planFile),timingFile=wordRenderTimingFile(project),beatsFile=path.join(remotion,native?'shots.json':'visual-beats.json');
  if(native){const gate=checkNativeGovernance(project);if(!gate.passed)throw Error(gate.issues.map(i=>`${i.shotId||'全局'}：[${i.code}] ${i.message}`).join('\n'));}
  if(plan.fps!==30)throw Error('字级校对目前要求明确的 30fps；秒与帧不得混用');
  const evidenceFile=wordTimingFile(project);
  const timing=read(timingFile),beats=wordRevealUnits(project),ids=new Set();
  const evidence=read(evidenceFile);
  for(let i=0;i<timing.scenes.length;i++){
    const actual=evidence.sentences[i];if(!actual)throw Error('渲染字级数据与原始配音句数不符');
    for(const ch of timing.scenes[i].chars.filter(c=>normalizeText(c.ch)))
      if(!actual.words.some(w=>normalizeText(w.text).includes(normalizeText(ch.ch))&&ch.t>=w.start-.001&&ch.e<=w.end+.001))
        throw Error('渲染字符缺少真实配音时间证据:'+i+'/'+ch.ch);
  }
  const eventIssues=[];
  const events=plan.events.map(e=>{try{
    if(ids.has(e.id))throw Error('文字落点 id 重复:'+e.id);ids.add(e.id);
    const b=beats.find(x=>x.id===e.beatId);if(!b)throw Error('不存在的拍:'+e.beatId);
    const result=resolveReveal(timing,b,e,plan.fps??30);
    const business=normalizeCardText(Object.values(b.props).filter(v=>typeof v==='string').join(''));
    if(!business.includes(normalizeCardText(e.text)))throw Error('文字与当前卡片参数不符:'+e.id+'/'+e.text);
    return result;
  }catch(error){eventIssues.push({code:'NATIVE_WORD_ANCHOR_INVALID',shotId:e.beatId,eventId:e.id,field:e.field,
    sentence:e.sentence,message:error.message});return null;}
  });
  if(eventIssues.length)throw Object.assign(Error(eventIssues.map(i=>i.message).join('；')),{issues:eventIssues});
  for(const b of beats)if(!events.some(e=>e.beatId===b.id))throw Error('本拍没有文字落点计划:'+b.id);
  for(const e of events.filter(e=>e.deferredTo)){
    const follow=events.find(x=>x.id===e.deferredTo);
    if(!follow||normalizeText(follow.text)!==normalizeText(e.text)||follow.globalFrame!==e.globalFrame)throw Error('延期文字必须在后拍同锚词展示:'+e.id);
  }
  if(native){
    const onset=checkContentOnset(read(beatsFile),{fps:plan.fps,events},{project});
    if(write){fs.mkdirSync(path.join(project,'qa'),{recursive:true});fs.writeFileSync(path.join(project,'qa/content-onset-check.json'),JSON.stringify(onset,null,2)+'\n');}
    if(!onset.passed){const error=new Error(onset.issues.map(i=>`[${i.code}] ${i.message}`).join('\n'));error.code='CONTENT_ONSET_GAP';error.issues=onset.issues;throw error;}
  }
  const binding={plan:sha(planFile),timing:sha(timingFile),...(native?{nativeShots:sha(beatsFile),presentation:sha(path.join(remotion,'native-presentation.json'))}:{visualBeats:sha(beatsFile)}),
    audio:sha(path.join(project,'audio/full.mp3')),wordEvidence:sha(evidenceFile)};
  const result={enabled:true,schemaVersion:1,fps:plan.fps??30,toleranceSec:.1,binding,events};
  if(write){fs.writeFileSync(path.join(remotion,'word-reveals.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(remotion,'reveal-units.json'),JSON.stringify(beats,null,2)+'\n');
    fs.mkdirSync(path.join(project,'qa'),{recursive:true});fs.writeFileSync(path.join(project,'qa/word-reveal-plan-check.json'),JSON.stringify({passed:true,eventCount:events.length,binding,userAcceptance:false},null,2)+'\n');}
  return result;
}

export function assertWordReveals(project) {
  if(fs.existsSync(path.join(project,'remotion/timing.json')))assertCaptionEmphasis(project);
  const presentation=checkPresentationSemantics(read(path.join(project,'remotion/shots.json')));
  fs.writeFileSync(path.join(project,'qa/presentation-semantics.json'),JSON.stringify(presentation,null,2)+'\n');
  if(!presentation.passed)throw Error('背景及编号绑定未通过：'+JSON.stringify(presentation.issues));
  const current=compileWordReveals(project,{write:false});if(!current.enabled)return current;
  const saved=read(path.join(project,'remotion/word-reveals.json'));
  if(JSON.stringify(current)!==JSON.stringify(saved))throw Error('文字落点绑定已过期，请重新运行 word-reveal');
  const native=isNativePresentation(project);
  const visual=fs.readFileSync(path.join(project,native?'remotion/src/scenes/scene-shared.tsx':'remotion/src/scenes/visual-scene.tsx'),'utf8');
  if(!visual.includes(native?'<NativePresentationRoot':'<WordRevealRoot'))throw Error('文字落点未接入实际画面卡片');
  if(native){const dependencies=recordTextEffectDependencies(project,read(path.join(project,'remotion/shots.json')),read(path.join(project,'remotion/native-presentation.json')),current,{requireSources:true});
    if(!dependencies.passed){const error=Error('TEXT_EFFECT_DEPENDENCY_FAILED：'+dependencies.issues.map(i=>i.message).join('\n'));error.issues=dependencies.issues;throw error;}}
  return current;
}
// Preparation stage writes consumed timing parameters before rendering; render code
// receives precisely these saved props. No hidden render-time replacement is allowed.
export function applyWordRevealTiming(project){
  const plan=compileWordReveals(project,{write:false});if(!plan.enabled)throw Error('缺少大字卡落点计划');
  if(isNativePresentation(project))return compileWordReveals(project);
  const file=path.join(project,'remotion/visual-beats.json'),beats=read(file),changes=[];
  for(const b of beats){
    const events=plan.events.filter(e=>e.beatId===b.id);
    const onset=text=>{const e=events.find(e=>e.text===text);if(!e)throw Error('原动画缺少字级锚点:'+b.id+'/'+text);return e.localFrame/plan.fps;};
    const patch={};
    if(b.card==='strike-and-replace')patch.lead=onset(b.props.to)-.25;
    if(b.card==='quote-hold-arrow')patch.lead=onset(b.props.line1)-.1;
    if(b.card==='soft-blur-in')patch.lead=-.3;
    if(b.card==='quote-bracket-pull')patch.lead=onset(b.props.line1)-.3;
    if(b.card==='keyword-pop-highlight')patch.delay=onset(b.props.keyword)-.05;
    if(b.card==='quote-card'){patch.lead=-.3;patch.hold=(b.endFrame-b.startFrame)/plan.fps;}
    for(const [key,value] of Object.entries(patch)){if(b.props[key]!==value)changes.push({beatId:b.id,key,before:b.props[key]??null,after:value,unit:'seconds'});b.props[key]=value;}
  }
  if(changes.length){
    const backup=path.join(project,'qa/word-reveal-preparation-'+Date.now()+'.json');fs.writeFileSync(backup,fs.readFileSync(file));
    fs.writeFileSync(file,JSON.stringify(beats,null,2)+'\n');
    fs.writeFileSync(path.join(project,'qa/word-reveal-timing-parameters.json'),JSON.stringify({changes,userAcceptance:false},null,2)+'\n');
  }
  return compileWordReveals(project);
}
export function installWordRevealRuntime(project){
  const director=path.dirname(fileURLToPath(import.meta.url)),src=path.join(project,'remotion/src');
  const native=isNativePresentation(project);
  if(native)installPresentationSkin(project);
  const visual=path.join(src,native?'scenes/scene-shared.tsx':'scenes/visual-scene.tsx');if(!fs.existsSync(visual))throw Error('当前模板尚未提供可绑定的视觉卡片入口');
  let code=fs.readFileSync(visual,'utf8');
  if(native&&!code.includes('<NativePresentationRoot')){
    if(!code.includes('{card}'))throw Error('正式模板缺少已登记的卡片入口');
    code="import {NativePresentationRoot} from '../NativePresentationRoot';\n"+code;
    code=code.replace('{card}','<NativePresentationRoot shotId={shot.id} cardProps={shot.templateParams?.cardProps}>{card}</NativePresentationRoot>');
    fs.writeFileSync(visual,code);
  }else if(!native&&!code.includes('<WordRevealRoot')){
    const original='<div data-talkcraft-card={b.card}><Card {...p}/></div>';
    if(!code.includes(original))throw Error('当前画面卡入口不受支持，禁止猜测性接入');
    code="import {WordRevealRoot} from '../WordRevealRoot';\n"+code;
    code=code.replace(original,'<div data-talkcraft-card={b.card}><WordRevealRoot beatId={b.id}><Card {...p}/></WordRevealRoot></div>');
    fs.writeFileSync(visual,code);
  }
  for(const [source,target] of [['talkcraft-text-occurrences.mjs','text-occurrences.mjs'],['talkcraft-word-reveal-root.tsx','WordRevealRoot.tsx'],['talkcraft-word-reveal-audit.tsx','WordRevealAudit.tsx'],['talkcraft-contrast-audit.tsx','ContrastAudit.tsx']])fs.copyFileSync(path.join(director,source),path.join(src,target));
  if(native)for(const [source,target] of [['talkcraft-native-presentation-root.tsx','NativePresentationRoot.tsx'],['talkcraft-native-time-map.mjs','native-time-map.mjs']])fs.copyFileSync(path.join(director,source),path.join(src,target));
  const readability=path.join(project,'remotion/text-readability.json');
  if(!fs.existsSync(readability))fs.writeFileSync(readability,JSON.stringify({schemaVersion:1,enabled:false,byEvent:{}},null,2)+'\n');
  const main=path.join(src,'Main.tsx');let text=fs.readFileSync(main,'utf8');
  const addMainDefaults=(code,defaults)=>{const at=code.indexOf('export const Main: React.FC<{');
    const mainSource=code.slice(at);if(at<0||!mainSource.includes('= ({'))throw Error('Main 参数入口不受支持');
    return code.slice(0,at)+mainSource.replace('= ({','= ({'+defaults);};
  if(!text.includes('data-composition-root')){
    if(!text.includes('=> <AbsoluteFill style='))throw Error('当前 Main 缺少可校验的画幅根节点');
    text=text.replace('=> <AbsoluteFill style=','=> <AbsoluteFill data-composition-root style=');
  }
  if(!text.includes('<WordRevealAudit')){
    if(!text.includes('export const Main: React.FC<{')||!text.includes('= ({')||!text.includes('<Overlays />'))throw Error('当前 Main 入口不受支持，禁止跳过实际画面校验');
    text="import {WordRevealAudit} from './WordRevealAudit';\n"+text;
    text=text.replace('export const Main: React.FC<{','export const Main: React.FC<{auditWordReveal?:boolean;');
    text=addMainDefaults(text,'auditWordReveal=false,');
    text=text.replace('<Overlays />','{auditWordReveal && <WordRevealAudit/>}<Overlays />');
  }
  fs.writeFileSync(main,text);
  text=fs.readFileSync(main,'utf8');
  if(!text.includes('<ContrastAudit')){
    if(!text.includes('export const Main: React.FC<{')||!text.includes('= ({')||!text.includes('<Overlays />'))throw Error('当前 Main 不支持实际颜色检查');
    text="import {ContrastAudit} from './ContrastAudit';\n"+text;
    text=text.replace('export const Main: React.FC<{','export const Main: React.FC<{auditContrast?:boolean;contrastMask?:boolean;');
    text=addMainDefaults(text,'auditContrast=false,contrastMask=false,');
    text=text.replace('<Overlays />','{auditContrast && <ContrastAudit mask={contrastMask}/>}<Overlays />');fs.writeFileSync(main,text);
  }
}
export function wordRevealSourceBinding(project){
  const remotion=path.resolve(project,'remotion'),files=[];
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())walk(f);else if(/\.(tsx?|mjs|json)$/.test(f))files.push(f);}};
  walk(path.join(remotion,'src'));
  const bridgeProof=path.join(project,'qa/visual-timeline-bridges.json');
  if(fs.existsSync(bridgeProof))files.push(bridgeProof);
  for(const name of ['presentation-integrity.json','caption-emphasis-plan.json','caption-emphasis.json','word-reveals.json','word-reveal-plan.json','reveal-units.json','visual-beats.json','native-presentation.json','shots.json','overrides.json','qa-repair-props.json','text-readability.json'])if(fs.existsSync(path.join(remotion,name)))files.push(path.join(remotion,name));
  // Background/media file replacement at the same path must invalidate color proof.
  const assets=new Set(),collect=value=>{if(value&&typeof value==='object'){if(typeof value.src==='string')assets.add(value.src);for(const child of Object.values(value))collect(child);}};
  const beatFile=path.join(remotion,'visual-beats.json');
  if(fs.existsSync(beatFile))for(const b of read(beatFile)){collect(b.background);collect(b.materials);for(const [key,value] of Object.entries(b.props??{}))if(/^src/i.test(key)&&typeof value==='string')for(const s of value.split('\n').filter(Boolean))assets.add(s);}
  if(isNativePresentation(project))for(const shot of read(path.join(remotion,'shots.json'))){
    if(shot.templateParams?.materialSrc)assets.add(shot.templateParams.materialSrc);
    for(const [key,value] of Object.entries(shot.templateParams?.cardProps||{}))if(/^src|src$/iu.test(key)&&typeof value==='string')
      for(const s of value.split('\n').filter(Boolean))assets.add(s.replace(/^remotion\/public\//u,''));
  }
  const integrity=path.join(remotion,'presentation-integrity.json');
  if(fs.existsSync(integrity))for(const row of read(integrity).shots||[])if(row.media?.localPath)assets.add(row.media.localPath);
  for(const asset of assets){const f=path.resolve(remotion,'public',asset),relative=path.relative(path.join(remotion,'public'),f);if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(f))throw Error('背景/素材绑定失效：'+asset);files.push(f);}
  return Object.fromEntries(files.sort().map(f=>[path.relative(remotion,f).replaceAll('\\','/'),sha(f)]));
}
export function assertTextBindingProof(project,{only}={}){
 const suffix=only?'-'+[...only].sort().join('-'):'',file=path.join(project,'qa/text-binding-runtime'+suffix+'.json');
 if(!fs.existsSync(file))throw Error('TEXT_BINDING_REQUIRED：镜头实现后须先核对全部计划文字与实际画面的绑定');
 const report=read(file),events=assertWordReveals(project).events.filter(e=>!only||only.includes(e.beatId));
 if(report.schema!=='talkcraft-text-binding-v1'||!report.passed||report.events!==events.length||
   JSON.stringify(report.scope??null)!==JSON.stringify(only?[...only].sort():null)||
   JSON.stringify(report.binding)!==JSON.stringify(wordRevealSourceBinding(project))||
   !Array.isArray(report.rows)||report.rows.length!==report.frames||
   validateTextBindings({frames:report.rows.map(r=>r.frame),rows:report.rows,events}).length)
   throw Error('TEXT_BINDING_STALE：文字绑定检查未通过或源码/参数已变化，不能进入颜色校验及整片编码');
 return report;
}
export function assertWordRevealProof(project,{only}={}){
  if(!isNativePresentation(project)&&!fs.existsSync(path.join(project,'remotion/visual-beats.json')))return {enabled:false};
  const plan=assertWordReveals(project);if(!plan.enabled)throw Error('WORD_REVEAL_PLAN_REQUIRED：大字卡缺少字级落点计划，禁止渲染/导出');
  const selected=only?plan.events.filter(e=>only.includes(e.beatId)):plan.events;
  const suffix=only?'-'+[...only].sort().join('-'):'';
  const file=path.join(project,'qa/word-reveal-runtime'+suffix+'.json');
  if(!fs.existsSync(file))throw Error('WORD_REVEAL_QA_REQUIRED：请运行 word-reveal-qa 核验实际文字出现帧');
  const report=read(file);
  if(JSON.stringify(report.scope??null)!==JSON.stringify(only?[...only].sort():null))throw Error('文字校对范围不符：局部样板不能替代全片校对');
  if(isNativePresentation(project)&&(report.schema!=='talkcraft-word-runtime-v2'||report.native!==true))throw Error('正式模板缺少当前原生运行时审计');
  if(!report.passed||report.events!==selected.length||JSON.stringify(report.planBinding)!==JSON.stringify(plan.binding)||
    JSON.stringify(report.binding)!==JSON.stringify(wordRevealSourceBinding(project)))
    throw Error('WORD_REVEAL_QA_STALE：大字卡校验失败或源码/参数已变化，禁止渲染/导出');
  const beats=wordRevealUnits(project);
  const rows=report.rows;if(!Array.isArray(rows))throw Error('字级校对缺少实际画面记录');
  // Recheck the captured rows using the same rules as the actual frame audit.
  // A context heading follows native entrance; spoken text must be present at
  // its voice anchor. Dynamic cards need not contain a word before it is typed.
  const recordedFailures=validateWordRuntime({frames:rows.map(r=>r.frame),rows,events:selected,beats,native:isNativePresentation(project)});
  if(recordedFailures.length)throw Error('实帧证据未通过当前文字规则：'+recordedFailures[0].reason);
  if(isNativePresentation(project))for(const point of nativeBridgeAuditPoints(project).filter(p=>!only||only.includes(p.shotId)))
    if(!rows.some(r=>r.frame===point.frame&&r.beatId===point.shotId&&Array.isArray(r.layoutIssues)))
      throw Error('缺少视觉停顿桥接实帧检查：'+point.shotId+'/'+point.frame);
  if(rows.some(r=>r.layoutIssues?.length))throw Error('运行时文字裁切或手机可读字号检查未通过');
  if(isNativePresentation(project))for(const beat of beats.filter(b=>!only||only.includes(b.id))){
    const beatRows=rows.filter(r=>r.beatId===beat.id);
    const firstVisible=beatRows.find(r=>r.contentVisible)?.frame;
    for(let frame=beat.startFrame+15;frame<beat.endFrame-15;frame+=30){
      const row=rows.find(r=>r.beatId===beat.id&&r.frame===frame);
      if(!row||!Array.isArray(row.layoutIssues))throw Error('缺少原生长镜头内容与版式抽查记录：'+beat.id+'/'+frame);
      if(firstVisible!==undefined&&frame>firstVisible&&frame<beat.endFrame-15&&!row.contentVisible)throw Error('原生卡片提前退出造成空幕：'+beat.id+'/'+frame);
    }
  }
  for(const event of selected){
    const beat=beats.find(b=>b.id===event.beatId);
    const before=Math.max(beat.startFrame,event.globalFrame-1),after=Math.min(beat.endFrame-1,Math.max(beat.startFrame,event.globalFrame)+3);
    const relevant=rows.filter(r=>r.beatId===event.beatId);
    for(const row of relevant){const actual=row.events?.find(e=>e.id===event.id);
      if(!actual||row.unplanned?.length||actual.visible&&(event.deferredTo||row.frame<event.globalFrame))throw Error('实际画面出现提前/未绑定文字:'+event.id);
    }
    if(!event.deferredTo){
      if(!relevant.some(r=>r.frame===before))throw Error('缺少出现前一帧记录:'+event.id);
      if(!relevant.some(r=>r.frame===after))throw Error('缺少出现后检查记录:'+event.id);
      if(event.role!=='context'&&!relevant.some(r=>r.frame===after&&r.events.some(e=>e.id===event.id&&e.found&&e.visible)))throw Error('缺少按时出现记录:'+event.id);
    }else if(!relevant.length)throw Error('缺少延期文字的隐藏记录:'+event.id);
  }
  assertTextContrastProof(project,{only});
  return report;
}
export function assertTextContrastProof(project,{only}={}){
 const suffix=only?'-'+[...only].sort().join('-'):'';
 const policy=path.join(project,'remotion/text-readability.json'),file=path.join(project,'qa/text-contrast-runtime'+suffix+'.json');
 if(!fs.existsSync(policy)||read(policy).enabled!==true||!fs.existsSync(file))throw Error('TEXT_CONTRAST_REQUIRED：须先采集实际背景并校验文字对比度');
 const report=read(file),events=assertWordReveals(project).events.filter(e=>!e.deferredTo&&(!only||only.includes(e.beatId)));
 if(JSON.stringify(report.scope??null)!==JSON.stringify(only?[...only].sort():null))throw Error('颜色校对范围不符：局部样板不能替代全片校对');
 if(!report.passed||report.events!==events.length||JSON.stringify(report.binding)!==JSON.stringify(wordRevealSourceBinding(project)))throw Error('TEXT_CONTRAST_STALE：颜色检查失败或背景/字色/源码已改变');
 for(const e of events){const rows=report.samples?.filter(r=>r.id===e.id);if(!rows?.length||rows.some(r=>
   (r.glyphKind==='pictogram')!==isPictogram(e.text)||sampledContrast(r)<4.5))throw Error('实际背景对比度不足或缺少文字记录：'+e.id);}
 return report;
}
export function bindWordRevealVideo(project,video){
  const proof=assertWordRevealProof(project);if(proof.enabled===false)return;
  fs.writeFileSync(path.join(project,'qa/word-reveal-video.json'),JSON.stringify({video:path.relative(project,video).replaceAll('\\','/'),sha256:sha(video),proofSha256:sha(path.join(project,'qa/word-reveal-runtime.json')),contrastProofSha256:sha(path.join(project,'qa/text-contrast-runtime.json')),userAcceptance:false},null,2)+'\n');
}
export function assertWordRevealVideo(project,video){
  const proof=assertWordRevealProof(project);if(proof.enabled===false)return;
  const file=path.join(project,'qa/word-reveal-video.json');if(!fs.existsSync(file))throw Error('成片缺少字级校验绑定，禁止导出');
  const report=read(file);if(report.sha256!==sha(video)||report.proofSha256!==sha(path.join(project,'qa/word-reveal-runtime.json'))||report.contrastProofSha256!==sha(path.join(project,'qa/text-contrast-runtime.json')))throw Error('成片与字级/颜色校验绑定不符，禁止导出');
}
export function repairVideoForReview(project){
  const machineFile=path.join(project,'qa/machine-video-binding.json');
  if(fs.existsSync(machineFile)){
    const machine=read(machineFile);
    if(/^remotion\/out\/repair-[a-zA-Z0-9-]+\/final\.mp4$/.test(machine.video??'')){
      if(machine.schema!=='talkcraft-machine-video-binding-v1'||machine.policy!=='code-rules-and-human-visual-v1'||
        !/^[a-f\d]{64}$/i.test(machine.finalSha256??'')||machine.visualVerified!==false||machine.userAcceptance!==false)
        throw Error('修正版机器绑定无效');
      const video=path.join(project,machine.video);
      if(!fs.existsSync(video)||sha(video)!==machine.finalSha256)throw Error('修正版视频与机器绑定不符');
      const binding=wordRevealSourceBinding(project);
      for(const name of ['source-run.json','audio/full.mp3']){
        const file=path.join(project,name);if(fs.existsSync(file))binding[name]=sha(file);
      }
      if(JSON.stringify(binding)!==JSON.stringify(machine.binding))throw Error('修正版源码或素材绑定已过期');
      return video;
    }
  }
  const file=path.join(project,'qa/word-reveal-video.json');
  if(!fs.existsSync(file))throw Error('修正版视频尚未绑定');
  const record=read(file);
  if(!/^remotion\/out\/repair-[a-zA-Z0-9-]+\/final\.mp4$/.test(record.video??'')||
    !['sha256','proofSha256','contrastProofSha256'].every(k=>/^[a-f\d]{64}$/i.test(record[k]??'')))
    throw Error('修正版路径或校验绑定无效');
  return path.join(project,record.video);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(compileWordReveals(path.resolve(process.argv[2])),null,2));
}
