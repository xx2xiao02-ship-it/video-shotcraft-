import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const normalized=value=>String(value||'').replaceAll('\\','/');
function confined(base,relative){
 if(!relative||path.isAbsolute(relative)||/^[a-z]+:|^[/\\]/iu.test(relative))throw Error('素材证据必须使用库内相对路径');
 const root=fs.realpathSync(base),file=fs.realpathSync(path.resolve(root,normalized(relative))),rel=path.relative(root,file);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||!fs.statSync(file).isFile())throw Error('素材文件或证据越界');
 return file;
}
// Both formats were documented by the original library. Keep every original
// field; normalization is a read adapter, never a rewrite of the 3396 entries.
export function normalizeLibraryIndex(value){
 const rows=Array.isArray(value)?value:Array.isArray(value?.items)?value.items:
  value&&typeof value==='object'?Object.entries(value).map(([name,item])=>({path:name,...item})):null;
 if(!rows)throw Error('无法识别原素材索引合同');
 return rows.map(item=>{
  if(!item||typeof item.path!=='string')throw Error('素材索引缺少原文件路径');
  return {...item,path:normalized(item.path),tags:Array.isArray(item.tags)?item.tags:[],
   duration_sec:item.duration_sec??item.durationSeconds??0};
 });
}
export function libraryContractSnapshot(root){
 return Object.fromEntries(['_index.json','_source-records.json'].map(name=>{const file=path.join(root,'materials',name);return [name,fs.existsSync(file)?hash(file):null];}));
}
export function loadLibraryContract(root){
 const file=path.join(root,'materials/_index.json'),recordsFile=path.join(root,'materials/_source-records.json');
 const data=fs.existsSync(file)?read(file):[],records=fs.existsSync(recordsFile)?read(recordsFile):null;
 if(records&&(records.schema!=='talkcraft-library-sources-v1'||!Array.isArray(records.records)))throw Error('素材来源档案合同无效');
 return {root,items:normalizeLibraryIndex(data),records:records?.records||[],
  snapshot:{indexSha256:fs.existsSync(file)?hash(file):null,recordsSha256:records?hash(recordsFile):null},
  recordsFile:records?'materials/_source-records.json':null};
}
// This is only a historical path lead. A Scene filename does not prove that
// bytes were derived from the presumed original, nor grant any usage rights.
export function traceLegacyLibrarySource(root,item){
 const scripts=['director/scripts/batch-scene-split.py','director/batch-scene-split.py'];
 const script=scripts.find(n=>fs.existsSync(path.join(root,n)));
 const text=script?fs.readFileSync(path.join(root,script),'utf8'):'';
 const declared=text.match(/^INPUT_ROOT\s*=\s*r?["']([^"']+)["']/mu)?.[1];
 const trace={indexPath:normalized(item.path),importScript:script||null,originalRoot:declared||null,
  derivationVerified:false,licenseVerified:false,originalCandidates:[],notices:[]};
 if(!declared||!fs.existsSync(declared))return trace;
 const rel=normalized(item.path),stem=rel.replace(/-Scene-\d+\.[^.]+$/iu,'');
 for(const ext of ['.mp4','.mov','.webm']){
  try{const file=confined(declared,stem+ext);trace.originalCandidates.push({file,bytes:fs.statSync(file).size});}catch{}
 }
 let directory=path.dirname(path.resolve(declared,rel)),base=fs.realpathSync(declared);
 for(let depth=0;depth<5;depth++){
  const relative=path.relative(base,directory);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))break;
  if(fs.existsSync(directory))for(const entry of fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isFile()&&/\.(txt|url|pdf|md)$/iu.test(e.name)).slice(0,20)){
   try{const file=confined(base,path.relative(base,path.join(directory,entry.name)));
    trace.notices.push({file,sha256:hash(file),purpose:'source-lead-only; not a usage grant'});
   }catch{}
  }
  if(directory===base)break;directory=path.dirname(directory);
 }
 return trace;
}
export function resolveLibrarySource(contract,item,{probeMedia}){
 const sourceFile=confined(path.join(contract.root,'materials/_scenes'),item.path),meta=probeMedia(sourceFile);
 const matches=contract.records.filter(r=>normalized(r.path)===normalized(item.path));
 if(matches.length>1)throw Error('同一素材有多条来源档案，不能择一放行');
 let rights=item,evidence=[],userConfirmed=false;
 if(matches.length){
  const record=matches[0];
  if(record.sha256!==meta.sha256)throw Error('来源档案与当前素材哈希冲突');
  if(!Array.isArray(record.evidence)||!record.evidence.length)throw Error('来源档案缺少许可证据文件');
  evidence=record.evidence.map(e=>{
   const file=confined(path.join(contract.root,'materials'),e.path);
   if(e.sha256!==hash(file))throw Error('许可证据文件哈希冲突');
   if(record.rightsBasis==='user-confirmed-existing-library'){
    const declaration=read(file);
    if(declaration.schema!=='talkcraft-library-rights-confirmation-v1'||declaration.confirmedBy!=='user'||
      typeof declaration.statement!=='string'||!declaration.statement.trim()||
      !Array.isArray(declaration.files)||!declaration.files.some(f=>normalized(f.path)===normalized(item.path)&&f.sha256===meta.sha256))
     throw Error('用户使用权声明不覆盖当前文件及哈希');
    userConfirmed=true;
   }
   return {path:e.path,sha256:e.sha256};
  });
  for(const key of ['sourceUrl','license','licenseUrl','sha256'])if(item[key]&&record[key]&&item[key]!==record[key])throw Error('新旧来源声明冲突');
  rights={...item,...record};
 }
 const trace=traceLegacyLibrarySource(contract.root,item);
 if(rights.licenseVerified!==true||!rights.license||(!userConfirmed&&!rights.licenseUrl)||
   (!/^https:\/\//u.test(rights.sourceUrl||'')&&!(userConfirmed&&rights.sourceUrl===pathToFileURL(sourceFile).href))||!rights.sha256)
  return {accepted:false,code:'LOCAL_RIGHTS_UNVERIFIED',sourceFile,sha256:meta.sha256,meta,trace,
   message:'旧库已接入且文件可读取；未发现与本文件对应的完整使用许可记录。来源线索不等于授权。'};
 if(rights.sha256!==meta.sha256)throw Error('素材库文件与已核验授权哈希不一致');
 return {accepted:true,sourceFile,meta,sha256:meta.sha256,trace,rights,evidence,
  recordsFile:contract.recordsFile,recordsSha256:contract.snapshot.recordsSha256};
}
