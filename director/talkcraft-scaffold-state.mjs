import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const file='qa/scaffold-result.json';
const inputs=['source-run.json','theme.json','semantics.json','SHOTBOOK.md','remotion/shots.json',
  'aligned-sentences.json','audio/timestamps.json','qa/storyboard-approved.json'];
// Full scene coverage belongs after sample approval. These are the sample-stage outputs.
const outputs=['remotion/src/index.ts','remotion/src/Root.tsx','remotion/src/Main.tsx',
  'remotion/src/scenes/s01.tsx','remotion/src/scenes/scene-shared.tsx',
  'remotion/src/cards/index.ts','remotion/src/parameterized-cards/shared.tsx'];
const hash=(project,name)=>createHash('sha256').update(fs.readFileSync(path.join(project,name))).digest('hex');
const inputHash=(project,name)=>name==='theme.json'&&!fs.existsSync(path.join(project,name))?null:hash(project,name);
export function recordScaffoldResult(project,{sourceIntegrityPassed}={}){
  if(sourceIntegrityPassed!==true)throw Error('工程源码保真核验未通过，不能登记工程完成');
  const report={schema:'talkcraft-scaffold-result-v1',passed:true,checkedAt:new Date().toISOString(),
    inputs:Object.fromEntries(inputs.map(name=>[name,inputHash(project,name)])),
    outputs:Object.fromEntries(outputs.map(name=>[name,hash(project,name)]))};
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(path.join(project,file),JSON.stringify(report,null,2));
  return report;
}
export function readScaffoldReady(project,{legacyReady=false}={}){
  if(!fs.existsSync(path.join(project,file)))return legacyReady;
  try{
    const report=JSON.parse(fs.readFileSync(path.join(project,file),'utf8'));
    return report.schema==='talkcraft-scaffold-result-v1'&&report.passed===true&&
      inputs.every(name=>Object.hasOwn(report.inputs||{},name)&&report.inputs[name]===inputHash(project,name))&&
      outputs.every(name=>report.outputs?.[name]===hash(project,name));
  }catch{return false;}
}
