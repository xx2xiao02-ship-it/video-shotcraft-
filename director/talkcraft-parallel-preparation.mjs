// Local preparation only. This module never submits providers or implements scenes.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {ensureTalkcraftRenderRuntime} from './talkcraft-render-runtime.mjs';
import {prepareNativeCueAssets} from './talkcraft-native-preparation.mjs';
import {loadTalkcraftGovernedCatalog,canonicalCardId} from './talkcraft-governed-contract.mjs';
import {assertTalkcraftDigitalHumanAdmission} from './talkcraft-digital-human-admission.mjs';

const SELF=fileURLToPath(import.meta.url),ROOT=path.resolve(path.dirname(SELF),'..');
const lanes=[['materials','画面素材核对'],['sources','原卡、字体与依赖准备'],['audio','原卡音效准备']];
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hashes=new Map();
function hash(file){const s=fs.statSync(file),stamp=`${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  if(hashes.get(file)?.stamp!==stamp)hashes.set(file,{stamp,value:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
  return hashes.get(file).value;}
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function files(dir){if(!fs.existsSync(dir))throw Error('准备输入缺失：'+dir);
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]).sort();}
function inputFiles(project,skill,root){
  const inputs=['source-run.json','SHOTBOOK.md','semantics.json','remotion/shots.json','audio/full.mp3',
    'qa/storyboard-approved.json','qa/native-production-plan.json'].map(f=>path.join(project,f));
  for(const f of ['sources.md','audio/timestamps.json','remotion/native-presentation.json','remotion/word-reveal-plan.json'])
    if(fs.existsSync(path.join(project,f)))inputs.push(path.join(project,f));
  return [...inputs,...files(path.join(skill,'template/cards')),...files(path.join(skill,'template/motion-systems')),
    ...files(path.join(skill,'workbench/src/cards')),...files(path.join(root,'template/public/fonts')),
    ...['demos/_lib/sfx-map.js','demos/_lib/sfx-samples.js','demos/_lib/sfx.js','runtime/package.json'].map(f=>path.join(skill,f)),
    ...['BundledFonts.tsx','bundled-font-manifest.json'].map(f=>path.join(root,'template/src',f))];
}
function fingerprint(project,skill,root){return Object.fromEntries(inputFiles(project,skill,root).map(file=>[file,hash(file)]));}
const bindingOf=inputs=>createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
function atomic(file,record){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(record,null,2));fs.renameSync(file+'.tmp',file);}

export function readParallelPreparation(project){
  const file=path.join(project,'qa/parallel-preparation.json');if(!fs.existsSync(file))return null;
  let report;
  try{report=json(file);if(report.schema!=='talkcraft-parallel-preparation-v1')throw Error('准备报告版本不正确');
    const current=Object.entries(report.inputs).every(([f,h])=>fs.existsSync(f)&&hash(f)===h);
    if(!current)return {...report,status:'stale',error:'输入或上游源码已变化，准备结果需要重新核验'};
    if(report.status==='running'&&!alive(report.pid))return {...report,status:'interrupted',error:'本地准备进程已结束但未记录结果；保留成果，未自动重试'};
    if(report.status==='done')for(const lane of report.lanes)for(const asset of lane.assets||[])
      if(!fs.existsSync(asset.file)||hash(asset.file)!==asset.sha256)throw Error('准备资产缺失或变化：'+asset.file);
    return report;
  }catch(e){return {...report,status:'failed',error:e.message,lanes:report?.lanes||[]};}
}
export function assertParallelPreparationJoined(project){
  const report=readParallelPreparation(project);
  if(report&&report.status!=='done')throw Error('并行准备尚未通过：'+(report.error||report.status));
  return report;
}
export function createPreparedTalkcraftResolver(project){
  const report=readParallelPreparation(project);if(!report)return source=>source;
  if(report.status!=='done')throw Error('并行准备尚未通过，不能消费准备资产');
  const assets=new Map(report.lanes.flatMap(l=>l.assets||[]).map(a=>[a.source,a]));
  return source=>{
    const item=assets.get(source);if(!item)return source;
    if(hash(item.file)!==item.sha256||report.inputs[source]&&hash(source)!==report.inputs[source])throw Error('准备资产在使用期间发生变化：'+source);
    return item.file;
  };
}
export function preparedTalkcraftFile(project,source){
  return createPreparedTalkcraftResolver(project)(source);
}

// Bounded, independent operations. A failed lane does not cancel the paid task.
export async function runPreparationLanes(rows,execute,onUpdate,{concurrency=2}={}){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw Error('本地准备并发必须为1至3');
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,rows.length)},async()=>{
    while(cursor<rows.length){const row=rows[cursor++];Object.assign(row,{status:'running',startedAt:Date.now()});onUpdate();
      try{Object.assign(row,await execute(row),{status:'done',finishedAt:Date.now()});}
      catch(e){Object.assign(row,{status:'failed',error:e.message,finishedAt:Date.now()});}
      onUpdate();
    }
  }));
  return rows.every(r=>r.status==='done');
}

function runChild(args){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[SELF,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';
  child.stdout.resume();child.stderr.on('data',b=>{errors=(errors+b).slice(-2000);});
  child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(errors||`准备子进程退出 ${code}`)));
});}
export async function prepareTalkcraftParallel(root,runId,{retryFailed=false}={}){
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId))throw Error('Invalid TalkCraft run ID');
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft');
  assertTalkcraftDigitalHumanAdmission(root,runId);
  const previous=readParallelPreparation(project);
  if(previous?.status==='done')return previous;
  const newVersion=previous?.status==='stale';
  if(newVersion&&!previous.finishedAt&&alive(previous.pid))throw Error('旧版准备仍在执行，保留锁并等待退出');
  if(previous&&!newVersion&&(!retryFailed||!['failed','interrupted'].includes(previous.status)))throw Error('已有准备记录，保留结果且不自动重复执行：'+previous.status);
  const skill=resolveTalkcraftSkillRoot(root),inputs=fingerprint(project,skill,root),binding=bindingOf(inputs);
  if(previous&&!newVersion&&previous.binding!==binding)throw Error('准备版本已变化，不能复用旧结果重试');
  const file=path.join(project,'qa/parallel-preparation.json'),lock=file+'.lock';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const fd=fs.openSync(lock,'wx');
  const attempt=(previous?.attempt||0)+1;
  const folder=path.join(project,'qa/parallel-preparation',binding+'-'+attempt);
  const report={schema:'talkcraft-parallel-preparation-v1',runId,pid:process.pid,status:'running',startedAt:Date.now(),
    attempt,
    approvalSha256:hash(path.join(project,'qa/storyboard-approved.json')),inputs,binding,
    scope:'仅本地准备，不代表口型验收、全量预检或用户审核',concurrency:2,
    lanes:lanes.map(([id,label])=>({id,label,status:'pending'}))};
  try{
    if(previous){
      fs.copyFileSync(file,file+'.attempt-'+(attempt-1)+'.json',fs.constants.COPYFILE_EXCL);
      for(const row of newVersion?[]:report.lanes){const old=previous.lanes.find(l=>l.id===row.id);
        if(old?.status==='done'&&(old.assets||[]).every(a=>fs.existsSync(a.file)&&hash(a.file)===a.sha256))Object.assign(row,old);
      }
    }
    atomic(file,report);
    const pending=report.lanes.filter(r=>r.status!=='done');
    const passed=await runPreparationLanes(pending,async row=>{
      await runChild(['--worker',root,runId,folder,row.id]);
      return json(path.join(folder,row.id,'manifest.json'));
    },()=>atomic(file,report));
    if(bindingOf(fingerprint(project,skill,root))!==binding)throw Error('准备期间输入发生变化，停止汇合');
    report.status=passed?'done':'failed';report.finishedAt=Date.now();atomic(file,report);
    if(!passed)throw Error('并行准备存在失败项，已保留具体原因');
    return report;
  }catch(e){report.status='failed';report.error=e.message;report.finishedAt=Date.now();atomic(file,report);throw e;}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}

function worker(root,runId,folder,lane){
  if(!lanes.some(([id])=>id===lane))throw Error('不允许的准备分支');
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(runId))throw Error('Invalid TalkCraft run ID');
  const project=path.join(root,'director/b-mode-runs',runId,'talkcraft'),skill=resolveTalkcraftSkillRoot(root);
  if(path.dirname(path.resolve(folder))!==path.join(project,'qa/parallel-preparation'))throw Error('准备目录超出当前任务');
  const dest=path.join(folder,lane),assets=[];fs.mkdirSync(dest,{recursive:true});
  const copy=(source,index)=>{const file=path.join(dest,String(index)+'-'+path.basename(source));
    fs.copyFileSync(source,file,fs.constants.COPYFILE_EXCL);assets.push({source,file,sha256:hash(file)});};
  let detail;
  if(lane==='sources'){
    const candidates=inputFiles(project,skill,root).filter(f=>f.startsWith(skill+path.sep)||f.startsWith(path.join(root,'template')+path.sep));
    candidates.forEach(copy);
    // Validate the shared installed packages through an isolated staging project;
    // the official project's runtime link is created only after full preflight.
    const runtime=ensureTalkcraftRenderRuntime(path.join(dest,'runtime-project'),skill);
    if(!runtime.passed)throw Error('上游锁定渲染依赖不完整或版本不一致');
    detail={files:assets.length,runtime};
  }else if(lane==='audio'){
    const prepared=prepareNativeCueAssets(project,skill,path.join(dest,'sfx'));
    for(const file of files(path.join(dest,'sfx')))assets.push({source:path.join(project,'remotion/public/sfx',path.basename(file)),file,sha256:hash(file)});
    detail={cues:prepared.runtime.length,files:assets.length};
  }else{
    const catalog=loadTalkcraftGovernedCatalog(json(path.join(skill,'references/cards-index.json')));
    const shots=json(path.join(project,'remotion/shots.json')),inventory=[];
    const publicRoot=path.resolve(project,'remotion/public');
    for(const shot of shots){
      const card=catalog.cards.find(c=>c.cardId===canonicalCardId(shot.shotCard,catalog));
      for(const key of Object.keys(card?.policy.media||{})){
        const value=shot.templateParams?.cardProps?.[key];
        for(const src of Array.isArray(value)?value:[value]){
          if(!src)continue;
          if(typeof src!=='string'||/^https?:/iu.test(src))throw Error(`素材尚未冻结为本地文件：${shot.id}.${key}`);
          const local=src.replaceAll('\\','/').replace(/^\/?(?:remotion\/)?public\//u,'').replace(/^\//u,'');
          const file=path.resolve(publicRoot,local);
          if(!file.startsWith(publicRoot+path.sep)||!fs.statSync(file).isFile())throw Error('画面素材路径不合法：'+src);
          inventory.push({shotId:shot.id,field:key,file,sha256:hash(file)});
        }
      }
    }
    // Record material hashes as verified read-only assets; never change selected paths.
    for(const row of inventory)assets.push({source:row.file,file:row.file,sha256:row.sha256});
    detail={inventory,files:inventory.length};
  }
  atomic(path.join(dest,'manifest.json'),{assets,detail});
}

if(process.argv[1]&&path.resolve(process.argv[1])===SELF){
  try{if(process.argv[2]==='--worker')worker(...process.argv.slice(3,8));
    else await prepareTalkcraftParallel(ROOT,process.argv[2]||'',{retryFailed:process.argv.includes('--retry-failed')});
  }catch(e){console.error(e.message);process.exitCode=1;}
}
