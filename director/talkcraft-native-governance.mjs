import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeVisibleText as clean} from './talkcraft-text-occurrences.mjs';
import {READABILITY_LAYOUT} from './talkcraft-presentation-skin.mjs';
export {nativeFrameAt} from './talkcraft-native-time-map.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// DSL-backed text fields (for example cursor-actor-demo.rows) contain
// separators that are structural, not visible copy. Normalize them before
// comparing word events with rendered content so the governance check does
// not demand that a literal `|` appear on screen.
const files=['remotion/shots.json','remotion/native-presentation.json','remotion/word-reveal-plan.json','audio/full.mp3'];

export function isNativePresentation(project) {
  // Explicit older card calls use a separate renderer and fingerprint.
  const calls=path.join(project,'qa/card-calls.json');
  if(fs.existsSync(calls)&&!fs.existsSync(path.join(project,'qa/formal-bindings.json'))){
    try{if(read(calls).schema==='talkcraft-card-calls-v1')return false;}catch{}
  }
  const shared=path.join(project,'remotion/src/scenes/scene-shared.tsx');
  return fs.existsSync(path.join(project,'qa/formal-bindings.json'))||fs.existsSync(shared)&&/renderTalkcraftTemplate/u.test(fs.readFileSync(shared,'utf8'));
}
export function nativeRevealUnits(project) {
  const shots=read(path.join(project,'remotion/shots.json'));
  return shots.map(s=>({id:s.id,card:s.shotCard,startFrame:Math.round(s.start*30),endFrame:Math.round(s.end*30),props:s.templateParams?.cardProps||{}}));
}
export function nativeGovernanceBinding(project) {
  return Object.fromEntries(files.map(file=>[file,fs.existsSync(path.join(project,file))?sha(path.join(project,file)):null]));
}

// One original frame per output frame during motion. Added holds have explicit
// content responsibilities; they cannot stretch or accelerate native motion.
export function validateNativeTimeline(row,durationFrames,nativeFrames) {
  const problems=[];
  if(!Array.isArray(row.timeline)||!row.timeline.length)return ['缺少原生动作与驻留计划'];
  let next=0,lastNative=-1;
  for(const segment of row.timeline){
    if(!segment||typeof segment!=='object'){problems.push('片段不是有效对象');continue;}
    const {fromFrame,toFrame,nativeFromFrame,nativeToFrame,kind}=segment;
    if(![fromFrame,toFrame,nativeFromFrame,nativeToFrame].every(Number.isInteger)||fromFrame!==next||toFrame<fromFrame||
      nativeFromFrame<0||nativeToFrame<nativeFromFrame||nativeToFrame>=nativeFrames||nativeFromFrame<lastNative)
      problems.push('片段边界不连续、越界或原生动画回跳');
    if(kind==='motion'){
      if(toFrame-fromFrame!==nativeToFrame-nativeFromFrame)problems.push('禁止截断、加速或拉伸原卡动作');
      if(nativeFromFrame!==lastNative+1)problems.push('遗漏原卡动作帧');
    }else if(kind==='hold'){
      if(nativeFromFrame!==nativeToFrame||nativeFromFrame!==lastNative||!segment.reason)problems.push('驻留必须承接前一动作并说明内容');
    }else problems.push('未知片段类型');
    next=toFrame+1;lastNative=nativeToFrame;
  }
  if(next!==durationFrames)problems.push('时间计划未覆盖完整镜头');
  if(lastNative!==nativeFrames-1)problems.push('原卡动作未完整播放');
  return [...new Set(problems)];
}
export function checkNativeGovernance(project,{catalog,write=false}={}) {
  if(!isNativePresentation(project))return {required:false,passed:true,issues:[]};
  const issues=[],add=(code,shotId,message)=>issues.push({code,shotId,message});
  const units=nativeRevealUnits(project),planFile=path.join(project,'remotion/native-presentation.json'),wordFile=path.join(project,'remotion/word-reveal-plan.json');
  let plan=null,words=null;
  try{if(fs.existsSync(planFile))plan=read(planFile);}catch{add('NATIVE_PLAN_INVALID',null,'原生展示计划不是有效 JSON');}
  try{if(fs.existsSync(wordFile))words=read(wordFile);}catch{add('NATIVE_WORD_PLAN_INVALID',null,'大字落点计划不是有效 JSON');}
  if(!plan||plan.schema!=='talkcraft-native-presentation-v1'||plan.fps!==30||!Array.isArray(plan.shots))
    add('NATIVE_PLAN_REQUIRED',null,'正式模板缺少明确的 30fps 原生展示、驻留与布局计划');
  if(!words||words.scope!=='native-shots'||words.fps!==30||!Array.isArray(words.events))
    add('NATIVE_WORD_PLAN_REQUIRED',null,'正式模板内部大字缺少逐词落点计划，句首节拍不能替代');
  if(Array.isArray(plan?.shots)&&Array.isArray(words?.events)){
    if(plan.shots.some(r=>!r||typeof r!=='object')||words.events.some(e=>!e||typeof e!=='object'))
      add('NATIVE_PLAN_INVALID',null,'镜头或文字事件中含有无效对象');
    plan={...plan,shots:plan.shots.filter(r=>r&&typeof r==='object')};
    words={...words,events:words.events.filter(e=>e&&typeof e==='object')};
    const ids=new Set();
    for(const row of plan.shots){if(ids.has(row.shotId))add('NATIVE_PLAN_DUPLICATE',row.shotId,'镜头展示计划重复');ids.add(row.shotId);}
    for(const unit of units){
      const row=plan.shots.find(r=>r.shotId===unit.id),card=catalog?.cards.find(c=>c.cardId===unit.card);
      if(!row){add('NATIVE_SHOT_PLAN_REQUIRED',unit.id,'镜头缺少展示计划');continue;}
      if(row.cardId!==unit.card||row.startFrame!==unit.startFrame||row.endFrame!==unit.endFrame)
        add('NATIVE_PLAN_BINDING',unit.id,'展示计划与正式主卡或切镜边界不一致');
      if(!Number.isInteger(row.nativeFrames)||row.nativeFrames<=0||card&&row.nativeFrames!==card.duration.frames)
        add('NATIVE_DURATION_MISMATCH',unit.id,'原生帧数与治理目录不一致');
      for(const message of validateNativeTimeline(row,unit.endFrame-unit.startFrame,row.nativeFrames))add('NATIVE_CONTENT_SPAN',unit.id,message);
      if(!['none','person'].includes(row.humanLayout)||!Number.isFinite(row.mobileMinTextPx)||row.mobileMinTextPx<12)
        add('NATIVE_LAYOUT_REQUIRED',unit.id,'必须声明人物布局和至少 12 像素的手机正文目标');
      if(row.readabilityLayout&&row.readabilityLayout!==READABILITY_LAYOUT)
        add('NATIVE_LAYOUT_UNKNOWN',unit.id,'未知可读性蒙皮，必须重新核对声明和实现');
      const events=words.events.filter(e=>e.beatId===unit.id);
      if(!events.length)add('NATIVE_WORD_COVERAGE',unit.id,'镜头没有任何大字落点计划');
      if(!Array.isArray(row.textFields)||!row.textFields.length)add('NATIVE_TEXT_FIELDS_REQUIRED',unit.id,'缺少内容字段与可见性清单');
      if(Array.isArray(row.textFields)&&row.textFields.some(f=>!f||typeof f!=='object'))add('NATIVE_TEXT_FIELD',unit.id,'文字字段含有无效对象');
      const fields=Array.isArray(row.textFields)?row.textFields.filter(f=>f&&typeof f==='object'):[];
      if(new Set(fields.map(f=>f.key)).size!==fields.length)add('NATIVE_TEXT_FIELD_DUPLICATE',unit.id,'内容字段声明重复');
      for(const field of fields){
        if(typeof unit.props[field.key]!=='string') {add('NATIVE_TEXT_FIELD',unit.id,'未知文字字段：'+field.key);continue;}
        if(field.visibility==='hidden'){
          if(!field.reason)add('NATIVE_TEXT_EXCLUSION',unit.id,'隐藏辅助文字必须有编导理由：'+field.key);
        }else if(field.visibility==='visible'){
          const content=clean(unit.props[field.key]),coverage=events.filter(e=>e.field===field.key).map(e=>clean(e.text)).join('');
          if(content&&content!==coverage)add('NATIVE_WORD_COVERAGE',unit.id,'文字落点未完整且按序覆盖内容字段：'+field.key);
        }else add('NATIVE_TEXT_FIELD',unit.id,'文字字段没有明确可见性：'+field.key);
      }
      for(const event of events){
        if(!fields.some(f=>f.key===event.field&&f.visibility==='visible'))add('NATIVE_WORD_FIELD',unit.id,'文字事件未绑定可见内容字段：'+event.id);
        if(!['spoken','context'].includes(event.role)||event.role==='context'&&!event.reason)
          add('NATIVE_WORD_ROLE',unit.id,'大字或背景说明必须声明角色和语义依据：'+event.id);
      }
      if(card)for(const field of card.fields.filter(f=>f.role==='content'&&['text','textarea'].includes(f.type))){
        // DSL arrays/numeric selectors are not visible prose; the runtime audit
        // independently catches any actual visible text omitted here.
        if(field.key==='highlightLines'||!clean(unit.props[field.key]))continue;
        if(!fields.some(f=>f.key===field.key))add('NATIVE_TEXT_FIELD',unit.id,'正式内容字段未声明展示职责：'+field.key);
      }
    }
    for(const id of ids)if(!units.some(u=>u.id===id))add('NATIVE_PLAN_EXTRA',id,'计划中出现未登记镜头');
    const eventIds=new Set();
    for(const event of words.events){
      if(!event.id||eventIds.has(event.id))add('NATIVE_WORD_DUPLICATE',event.beatId,'文字事件缺少或重复 id');
      eventIds.add(event.id);
      if(!units.some(u=>u.id===event.beatId))add('NATIVE_WORD_EXTRA',event.beatId,'文字事件指向未登记镜头');
    }
  }
  const report={schema:'talkcraft-native-governance-v1',required:true,passed:issues.length===0,issues,binding:nativeGovernanceBinding(project),
    checkedAt:new Date().toISOString(),runtimeVerified:false,userAcceptance:false};
  if(write){fs.mkdirSync(path.join(project,'qa'),{recursive:true});fs.writeFileSync(path.join(project,'qa/native-governance.json'),JSON.stringify(report,null,2));}
  return report;
}
export function nativeGovernanceStatus(project) {
  if(!isNativePresentation(project))return {required:false,passed:true,issues:[]};
  const file=path.join(project,'qa/native-governance.json');
  let report;try{report=read(file);}catch{return {required:true,passed:false,issues:[{code:'NATIVE_GOVERNANCE_REQUIRED',message:'正式模板需先检查逐词覆盖、内容驻留和布局计划'}]};}
  const fresh=report.schema==='talkcraft-native-governance-v1'&&JSON.stringify(report.binding)===JSON.stringify(nativeGovernanceBinding(project));
  return fresh?report:{required:true,passed:false,issues:[{code:'NATIVE_GOVERNANCE_STALE',message:'模板、时间计划或配音已改变，请重新检查'}]};
}
