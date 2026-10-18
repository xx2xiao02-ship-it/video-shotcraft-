import {fileURLToPath} from 'node:url';
// Adapter for the upstream Skill's stage ③. It does not plan or repair shots.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {readTalkcraftDigitalHumanStatus} from './talkcraft-digital-human-status.mjs';
import {prepareFilmBackground} from './talkcraft-film-background.mjs';

const adapter=fileURLToPath(new URL('./talkcraft-code-preflight.py',import.meta.url));
const hashes=new Map();
function digest(file) {
  const stat=statSync(file),stamp=`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  let cached=hashes.get(file);
  if(cached?.stamp!==stamp){cached={stamp,hash:createHash('sha256').update(readFileSync(file)).digest('hex')};hashes.set(file,cached);}
  return cached.hash;
}
function mediaInputs(project,scope='preparation') {
  const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
  const deferGeneratedHost=scope==='preparation'&&plannedGeneration(source);
  const files=['source-run.json','audio/full.mp3','audio/full.wav','sources.md','assets/sources.md','research/sources.md'];
  const visit=relative=>{
    // Generated host files are outputs of the later RunningHub node. They must
    // invalidate the generated-host report, never its source-input preparation.
    if(deferGeneratedHost&&['remotion/public/digital-human','remotion/public/dh',
      'public/digital-human','public/dh'].includes(relative))return;
    const dir=path.join(project,relative);if(!existsSync(dir))return;
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const name=relative+'/'+entry.name;
      if(entry.isDirectory()&&!['node_modules','sfx','dh','audio'].includes(entry.name)&&!entry.name.startsWith('.'))visit(name);
      else if(entry.isFile())files.push(name);
    }
  };
  visit('assets');visit('public');visit('remotion/public');
  // Include missing paths so adding the required host invalidates a failure report.
  if(!deferGeneratedHost)files.push('remotion/public/dh/host.webm');
  if(scope==='generated')files.push('remotion/shots.json','digital-human-report.json');
  return Object.fromEntries([...new Set(files)].sort().map(name=>{
    const file=path.join(project,name);
    return [name,existsSync(file)&&statSync(file).isFile()?
      digest(file):null];
  }));
}

const plannedGeneration=source=>source.isDigitalHuman!==false&&['segments','combined'].includes(source.digitalHumanMode);
function currentReport(project,file,scope) {
  try {
    const report=JSON.parse(readFileSync(path.join(project,file),'utf8'));
    if(report.schema!=='talkcraft-media-preflight-v2'||report.scope!==scope||
      report.scriptSha256!==digest(report.script)||report.adapterSha256!==digest(adapter)||
      JSON.stringify(report.inputs)!==JSON.stringify(mediaInputs(project,scope)))return null;
    return report;
  }catch{return null;}
}
export function readMediaPreflightStatus(project) {
  const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
  const managed=plannedGeneration(source);
  const preparation=currentReport(project,'qa/media-preflight-result.json','preparation');
  const full=managed?currentReport(project,'qa/generated-host-preflight-result.json','generated'):preparation;
  return {mediaPreparationCompleted:!!preparation,mediaPreparationPassed:preparation?.exitCode===0,
    mediaPreparationIssues:preparation?.issues||[],mediaPreflightCompleted:!!full,
    mediaPreflightPassed:full?.exitCode===0,mediaPreflightIssues:full?.issues||[],
    digitalHumanGenerationPlanned:managed,digitalHumanGenerationPending:managed&&full?.exitCode!==0};
}

export function runMediaPreflight(project,skill,{python,env,scope='preparation',backgroundRoot}) {
  if(backgroundRoot)prepareFilmBackground(backgroundRoot,project);
  const source=JSON.parse(readFileSync(path.join(project,'source-run.json'),'utf8'));
  const managed=plannedGeneration(source);
  const script=path.join(skill,'scripts/preflight.py');
  const args=['--project',project,'--media-only','--fps',String(source.fps||30)];
  let hosts=[];
  if(managed&&scope==='preparation'){
    const avatars=source.avatarFiles?.length?source.avatarFiles:['avatar.png'];
    for(const name of avatars){
      const file=path.join(project,'assets',path.basename(name));
      if(!existsSync(file)||statSync(file).size===0)throw Error('RunningHub 生成输入缺少角色图：'+path.basename(name));
    }
    const audio=path.join(project,'audio/full.mp3');
    if(!existsSync(audio)||statSync(audio).size===0)throw Error('RunningHub 生成输入缺少主配音');
    // The provider needs the approved person intervals from the storyboard.
    // This pass checks source inputs only; it is never proof of a generated host.
  }else if(managed&&scope==='generated'){
    const state=readTalkcraftDigitalHumanStatus(project);
    if(!state.ready)throw Error('RunningHub 口型视频尚未生成或区间/帧数绑定未通过，不能通过成品素材体检');
    const shots=JSON.parse(readFileSync(path.join(project,'remotion/shots.json'),'utf8'));
    hosts=shots.filter(s=>s.subject==='person').map(s=>`remotion/public/digital-human/${s.id}-transparent.webm`);
    // Per-shot durations have already been checked against the narrated shot
    // windows by the digital-human contract; do not compare one clip to full.mp3.
  }else{
    args.push('--voice',source.workflowPath==='recorded-host'?'audio/full.wav':'audio/full.mp3');
    if(source.isDigitalHuman!==false&&source.digitalHumanMode)hosts=[source.workflowPath==='recorded-host'?'remotion/public/dh/host.mp4':'remotion/public/dh/host.webm'];
  }
  const inputs=mediaInputs(project,scope),calls=[];
  let output='',exitCode=0;
  for(const host of hosts.length?hosts:[null]){
    const callArgs=host?[...args,'--host',host]:args;
    let stdout,status=0;
    try{stdout=execFileSync(python,[adapter,script,...callArgs],{cwd:project,env,encoding:'utf8',maxBuffer:4*1024*1024});}
    catch(error){
      if(!Number.isInteger(error.status))throw error;
      status=error.status;stdout=String(error.stdout||'')+String(error.stderr||'');
    }
    calls.push({args:callArgs,exitCode:status});output+=stdout;exitCode=exitCode||status;
  }
  const issues=output.split(/\r?\n/u).filter(line=>line.includes('FAIL:'));
  const report={schema:'talkcraft-media-preflight-v2',scope,checkedAt:new Date().toISOString(),script,calls,
    hostCheck:managed&&scope==='preparation'?'pending-runninghub':hosts.length?'checked':'not-required',
    deferredReason:managed&&scope==='preparation'?'先确认分镜人物出镜区间，再由 RunningHub 生成；生成后必须另做成品素材体检。':null,
    scriptSha256:digest(script),adapterSha256:digest(adapter),visualReviewer:'human',inputs,exitCode,issues,output};
  mkdirSync(path.join(project,'qa'),{recursive:true});
  writeFileSync(path.join(project,scope==='generated'?'qa/generated-host-preflight-result.json':'qa/media-preflight-result.json'),JSON.stringify(report,null,2));
  if(exitCode!==0)throw Error('原 Skill ③ 素材体检未通过：'+(issues.join('；')||output.trim()));
  return {project,passed:true,status:managed&&scope==='preparation'?'generation_inputs_checked':'media_preflight_passed',
    generatedHostChecked:report.hostCheck==='checked',generationPending:report.hostCheck==='pending-runninghub'};
}
