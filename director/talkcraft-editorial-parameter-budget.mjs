import {validateDsl} from '../docs/audits/b-talkcraft-target3/dsl-validation.mjs';
import {replacementSchedule} from '../docs/audits/b-talkcraft-target3/schedule.mjs';

export function editorialNumericGrid(field){
  if(!['number','slider'].includes(field.type)||!(field.step>0))return null;
  return {base:field.min??field.default??0,step:field.step,
    ...(field.min!==undefined?{min:field.min}:{}),...(field.max!==undefined?{max:field.max}:{}),
    rule:'(value-base)/step must be an integer within 1e-7; never round model output'};
}
export function editorialReplacementBudget(card){
  const defaults=Object.fromEntries(card.fields.map(f=>[f.key,f.default]));
  const schedule=replacementSchedule(card,defaults);
  return {nativeFrames:card.duration.frames,fps:card.duration.fps,unit:'frames',mode:schedule.mode||'unverified',
    rule:'replacementSchedule(card, {...sourceDefaults, ...cardProps}).frames <= nativeFrames; evaluate final content, never truncate, retime or reuse default duration',
    sourceDefinitions:schedule.evidence||[],
    numericSourceDefaults:Object.fromEntries(card.fields.filter(f=>typeof f.default==='number'&&!f.writable).map(f=>[f.key,f.default]))};
}
export function auditEditorialParameterBudget(card,props={},shotId){
  const issues=[];
  for(const [key,value]of Object.entries(props)){
    const f=card.fields.find(f=>f.key===key),grid=f&&editorialNumericGrid(f);
    if(!grid||typeof value!=='number'||!Number.isFinite(value))continue; // Original type/range gates remain authoritative.
    if(Math.abs((value-grid.base)/grid.step-Math.round((value-grid.base)/grid.step))>1e-7)
      issues.push({shotId,field:key,code:'PROP_STEP',message:`${shotId}.${key}=${value}不满足原卡步进：基点${grid.base}、步长${grid.step}，不得自动取整`,base:grid.base,step:grid.step});
  }
  for(const [field,rule]of Object.entries(card.policy?.dsl||{})){
    if(!Object.hasOwn(props,field))continue;
    for(const code of validateDsl(field,props[field],rule,card.fields.find(f=>f.key===field)?.default))
      issues.push({shotId,field,code,message:`${shotId}.${field}不满足原卡${rule.syntax}格式：${code}；不得补造缺失内容或空列绕过`});
  }
  const merged={...Object.fromEntries(card.fields.map(f=>[f.key,f.default])),...props};
  let schedule;
  try{schedule=replacementSchedule(card,merged);}catch(error){schedule={ok:false,reason:error.message};}
  if(!schedule.ok)issues.push({shotId,code:'SCHEDULE_UNVERIFIED',message:`${shotId}替换内容时长无法核验：${schedule.reason}`});
  else if(schedule.frames>card.duration.frames)issues.push({shotId,code:'DURATION_BUDGET',requiredFrames:schedule.frames,availableFrames:card.duration.frames,
    message:`${shotId}替换内容需${schedule.frames}帧，超过原卡${card.duration.frames}帧预算；不能自动删减或改速`});
  return {passed:!issues.length,issues};
}
