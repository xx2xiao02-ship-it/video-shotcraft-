import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const memo=new Map();
function hash(file){
  const s=fs.statSync(file),stamp=`${s.size}:${s.mtimeMs}:${s.ctimeMs}`,old=memo.get(file);
  if(old?.stamp===stamp)return old.hash;
  const value=createHash('sha256').update(fs.readFileSync(file)).digest('hex');memo.set(file,{stamp,hash:value});return value;
}
const manifest=project=>path.join(project,'qa/shot-preview-manifest.json');
// Bind the actual render source, timing, all supplied public assets and voice.
// Changing any of them invalidates old previews instead of showing a gallery demo.
export function shotPreviewFingerprint(project){
  const files=[];
  const visit=relative=>{
    const dir=path.join(project,relative);if(!fs.existsSync(dir))return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=`${relative}/${entry.name}`;
      if(entry.isDirectory())visit(name);else if(entry.isFile())files.push([name,hash(path.join(project,name))]);
    }
  };
  visit('remotion/src');visit('remotion/public');
  for(const dir of ['remotion','audio'])if(fs.existsSync(path.join(project,dir)))
    for(const name of fs.readdirSync(path.join(project,dir)).sort())
      if((dir==='remotion'&&/\.json$/u.test(name)&&!/^package/u.test(name))||dir==='audio'&&name==='full.mp3')files.push([`${dir}/${name}`,hash(path.join(project,dir,name))]);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
export function recordShotPreviews(project,outputs){
  const fingerprint=shotPreviewFingerprint(project),shots=read(path.join(project,'remotion/shots.json'));
  let old={};try{old=read(manifest(project));}catch{}
  const rows=old.fingerprint===fingerprint?old.shots||{}:{};
  for(const [shotId,relative]of Object.entries(outputs)){
    const shot=shots.find(s=>s.id===shotId),file=path.resolve(project,relative);
    if(!shot||!file.startsWith(path.resolve(project,'remotion/out')+path.sep)||!fs.existsSync(file))throw Error('正式预览输出无效：'+shotId);
    rows[shotId]={cardId:shot.shotCard,file:path.relative(project,file).replaceAll('\\','/'),sha256:hash(file)};
  }
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  fs.writeFileSync(manifest(project),JSON.stringify({schema:'talkcraft-shot-preview-v1',fingerprint,shots:rows},null,2));
}
export function shotPreviewVersion(project){
  try{return `${hash(manifest(project))}:${shotPreviewFingerprint(project)}`;}catch{return null;}
}
export function readShotPreview(project,shotId){
  if(!/^s\d+[a-z]?$/iu.test(shotId||''))throw Error('镜头编号无效');
  try{
    const report=read(manifest(project)),row=report.shots?.[shotId];
    const shot=read(path.join(project,'remotion/shots.json')).find(s=>s.id===shotId);
    if(report.schema!=='talkcraft-shot-preview-v1'||!row||!shot||row.cardId!==shot.shotCard||report.fingerprint!==shotPreviewFingerprint(project))return {ready:false,reason:'本镜实际预览尚未生成或输入已改变'};
    const file=path.resolve(project,row.file);
    if(!file.startsWith(path.resolve(project,'remotion/out')+path.sep)||!fs.existsSync(file)||hash(file)!==row.sha256)return {ready:false,reason:'预览文件缺失或校验不一致'};
    return {ready:true,cardId:row.cardId,sha256:row.sha256,file};
  }catch{return {ready:false,reason:'本镜实际预览尚未生成'};}
}
