import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadLibraryContract,traceLegacyLibrarySource} from './talkcraft-library-contract.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
// Called only with the actual user's statement. Rights authority remains the
// user; this never labels a vendor as having issued a licence or invents terms.
export function recordLibraryRightsConfirmation(root,{paths,statement,runId,requestId}){
 if(!Array.isArray(paths)||!paths.length||new Set(paths).size!==paths.length||!statement?.trim()||!runId||!requestId)
  throw Error('必须有明确用户声明、当前任务与精确文件范围');
 const base=path.join(root,'materials'),lock=path.join(base,'.source-records.lock'),fd=fs.openSync(lock,'wx');
 try{
  const library=loadLibraryContract(root),scenes=fs.realpathSync(path.join(base,'_scenes'));
  const files=paths.map(value=>{
   const item=library.items.find(i=>i.path===value.replaceAll('\\','/'));
   if(!item)throw Error('用户声明包含未登记素材');
   const source=fs.realpathSync(path.resolve(scenes,item.path)),rel=path.relative(scenes,source);
   if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(source).isFile())throw Error('素材路径越界');
   return {path:item.path,sha256:hash(fs.readFileSync(source)),source,trace:traceLegacyLibrarySource(root,item)};
  });
  const declaration={schema:'talkcraft-library-rights-confirmation-v1',confirmedBy:'user',statement,runId,requestId,
   scope:'only listed existing library files at the recorded SHA-256; not a vendor licence',
   files:files.map(({path,sha256})=>({path,sha256}))};
  const bytes=json(declaration),evidence='rights/user-confirmation-'+hash(bytes)+'.json',file=path.join(base,evidence);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)){if(hash(fs.readFileSync(file))!==hash(bytes))throw Error('用户声明证据冲突');}
  else fs.writeFileSync(file,bytes,{flag:'wx'});
  const records=[...library.records];
  for(const item of files){
   const previous=records.filter(r=>r.path.replaceAll('\\','/')===item.path);
   if(previous.length){
    if(previous.length!==1||previous[0].sha256!==item.sha256||previous[0].rightsBasis!=='user-confirmed-existing-library'||
      previous[0].evidence?.[0]?.sha256!==hash(bytes))throw Error('已有不同来源记录，禁止覆盖');
    continue;
   }
   records.push({path:item.path,sha256:item.sha256,sourceId:'existing-user-library:'+item.path,sourceKind:'existing-user-library',
    sourceUrl:pathToFileURL(item.source).href,rightsBasis:'user-confirmed-existing-library',
    license:'用户确认使用权已解决；非供应商许可证',licenseVerified:true,
    evidence:[{path:evidence,sha256:hash(bytes)}],sourceTrace:item.trace});
  }
  const target=path.join(base,'_source-records.json');
  fs.writeFileSync(target+'.tmp',json({schema:'talkcraft-library-sources-v1',records}));fs.renameSync(target+'.tmp',target);
  return {registered:files.length,recordsFile:target,evidenceFile:file,paidCalls:0};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [projectArg,statement,requestId]=process.argv.slice(2),project=path.resolve(projectArg),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const report=JSON.parse(fs.readFileSync(path.join(project,'qa/material-completion.json'),'utf8'));
 for(const [name,expected] of Object.entries(report.inputs||{}))if(hash(fs.readFileSync(path.join(project,name)))!==expected)throw Error('素材报告已过期，不接受旧范围使用权声明');
 const paths=[...new Set((report.unresolved||[]).flatMap(n=>n.localSearch?.rejected||[]).filter(r=>r.code==='LOCAL_RIGHTS_UNVERIFIED').map(r=>r.path))];
 const run=JSON.parse(fs.readFileSync(path.join(project,'source-run.json'),'utf8'));
 console.log(JSON.stringify(recordLibraryRightsConfirmation(root,{paths,statement,runId:run.runId,requestId})));
}
