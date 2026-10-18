import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));

// SHOTBOOK is a projection of current, probed runtime bindings, not of search queries.
// Do not invent a material layer from arbitrary src-like business text or host footage.
export function syncShotbookMaterials(project){
  const bookFile=path.join(project,'SHOTBOOK.md');
  const reportFile=path.join(project,'qa/template-material-bindings.json');
  if(!fs.existsSync(bookFile)||!fs.existsSync(reportFile))return {changed:false,adjustments:[]};
  const shots=read(path.join(project,'remotion/shots.json')),report=read(reportFile);
  if(report.schema!=='talkcraft-template-material-bindings-v1'||!Array.isArray(report.bindings)||report.unresolved?.length)
    throw Error('素材绑定未完整核验，不能同步SHOTBOOK');
  const byId=new Map(shots.map(s=>[s.id,s])),media=new Map(shots.map(s=>[s.id,[]]));
  for(const row of report.bindings){
    if(row.field==='hostSrc'||row.origin==='digital-human-runtime')continue;
    const shot=byId.get(row.shotId),supplied=shot?.templateParams?.cardProps?.[row.field];
    if(!shot||!['image','video'].includes(row.kind)||typeof row.path!=='string'||
      typeof supplied!=='string'||!supplied.split('\n').includes(row.path))
      throw Error(`素材绑定与当前槽位不一致：${row.shotId}.${row.field}`);
    const file=path.resolve(project,row.path),relative=path.relative(path.resolve(project),file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||hash(fs.readFileSync(file))!==row.sha256)
      throw Error(`素材绑定文件或哈希失效：${row.shotId}.${row.field}`);
    if(/[\s()（）,，、]/u.test(row.path))throw Error('素材路径不能被上游SHOTBOOK路径语法无损表达');
    media.get(row.shotId).push(`${row.kind==='image'?'图':'V'}(${row.path})`);
  }
  const original=fs.readFileSync(bookFile,'utf8'),changes=[];
  let id=null;
  const result=original.split(/\r?\n/u).map(line=>{
    const heading=/^(#{1,6})\s+([^\s]+)/u.exec(line);
    if(heading)id=/^s\d+[a-z0-9_']*$/iu.test(heading[2])?heading[2]:null;
    if(!id||!media.has(id)||!/^\s*[-*]?\s*\**素材\**\s*[:：]/u.test(line))return line;
    const values=[...new Set(media.get(id))];
    if(!values.length)return line;
    const target=`- 素材：${values.join('、')}`;
    if(line===target)return line;
    // Preserve a separately authored material declaration until reconciled.
    if(!/^\s*[-*]?\s*素材\s*[:：]\s*(?:文|待采集与核验)\s*$/u.test(line))
      throw Error(`SHOTBOOK已有不同素材声明，需核对当前绑定：${id}`);
    changes.push({shotId:id,before:line,after:target});return target;
  }).join('\n');
  if(!changes.length)return {changed:false,adjustments:[]};
  const beforeSha256=hash(Buffer.from(original)),backup=path.join(project,'qa/shotbook-material-history',`${beforeSha256}.md`);
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
  if(hash(fs.readFileSync(backup))!==beforeSha256)throw Error('SHOTBOOK素材同步备份不一致');
  fs.writeFileSync(bookFile,result);
  fs.writeFileSync(path.join(project,'qa/shotbook-material-sync.json'),JSON.stringify({
    schema:'talkcraft-shotbook-material-sync-v1',beforeSha256,afterSha256:hash(Buffer.from(result)),
    bindingsSha256:hash(fs.readFileSync(reportFile)),changes,externalRequests:0,productionAdmitted:false},null,2));
  return {changed:true,adjustments:changes.map(c=>`${c.shotId}：按当前已核验模板槽位同步SHOTBOOK素材声明`)};
}
