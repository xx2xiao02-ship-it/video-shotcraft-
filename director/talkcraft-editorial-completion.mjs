import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const validationRules=()=>Object.fromEntries(['talkcraft-visual-content-contract.mjs','talkcraft-governed-contract.mjs',
  'talkcraft-editorial-parameter-budget.mjs','talkcraft-editorial-required-props.mjs','talkcraft-ark-editorial.mjs',
  'talkcraft-editorial-material-contract.mjs','talkcraft-material-research.mjs','talkcraft-material-policy.mjs',
  'talkcraft-text-video.mjs','talkcraft-editorial-joint-repair.mjs','talkcraft-editorial-selection.mjs'].map(name=>
  [name,sha(new URL(name,import.meta.url))]));
const inputs=['qa/ark-editorial-response.json','aligned-sentences.json','input.txt'];
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const binding=project=>Object.fromEntries([...inputs,
  ...(fs.existsSync(path.join(project,'qa/storyboard-adjustment-request.json'))?['qa/storyboard-adjustment-request.json']:[])]
  .map(name=>[name,sha(path.join(project,name))]));

// A partially written SHOTBOOK is not a completed node. Later stages may add
// card/material bindings, so bind this checkpoint to the actual editorial input.
export function saveEditorialCompletion(project){
  const report={schema:'talkcraft-editorial-completion-v1',passed:true,binding:binding(project),validationRules:validationRules()};
  fs.writeFileSync(path.join(project,'qa/editorial-completion.json'),JSON.stringify(report,null,2));
  return report;
}

export function saveEditorialFailure(project,error){
  const previousFile=path.join(project,'qa/editorial-completion.json');
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(previousFile,'utf8'));}catch{}
  const report={schema:'talkcraft-editorial-completion-v1',passed:false,
    checkedAt:new Date().toISOString(),message:String(error?.message||error),
    previousPassed:previous?.passed===true, binding:binding(project)};
  fs.writeFileSync(previousFile,JSON.stringify(report,null,2));
  return report;
}

export function editorialCompletionCurrent(project){
  if(!fs.existsSync(path.join(project,'SHOTBOOK.md')))return false;
  const response=path.join(project,inputs[0]);
  // Historical, non-Ark projects have no such checkpoint contract.
  if(!fs.existsSync(response))return null;
  try{
    const file=path.join(project,'qa/editorial-completion.json');
    if(fs.existsSync(file)){
      const report=JSON.parse(fs.readFileSync(file,'utf8'));
      return report.schema==='talkcraft-editorial-completion-v1'&&report.passed===true&&
        JSON.stringify(report.validationRules)===JSON.stringify(validationRules())&&
        JSON.stringify(report.binding)===JSON.stringify(binding(project));
    }
    const sourceFile=path.join(project,'source-run.json');
    if(fs.existsSync(sourceFile)&&JSON.parse(fs.readFileSync(sourceFile)).pipeline==='video-talkcraft')return false;
    // Compatible evidence from successful runs before explicit checkpoints.
    const native=JSON.parse(fs.readFileSync(path.join(project,'qa/native-editorial-plan.json'),'utf8'));
    return native.structuralDraftReady===true&&native.responseSha256===sha(response)&&
      ['remotion/native-presentation.json','remotion/word-reveal-plan.json'].every(name=>fs.existsSync(path.join(project,name)));
  }catch{return false;}
}
