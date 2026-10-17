import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const BUNDLED_PAPER=fileURLToPath(new URL('../assets/backgrounds/warm-paper-folds-v3.png',import.meta.url));
const configFile=root=>path.join(root,'director/film-background-settings.json');
export const DEFAULT_FILM_BACKGROUND=Object.freeze({schema:'talkcraft-film-background-v1',kind:'paper',color:'#d6cebf',fit:'cover'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function normalizeFilmBackground(value={}){
  const kind=value.kind??'paper',color=value.color??'#d6cebf',fit=value.fit??'cover';
  if(!['paper','image','solid'].includes(kind))throw Error('背景类型无效');
  if(!/^#[0-9a-f]{6}$/iu.test(color))throw Error('背景底色必须为六位颜色值');
  if(!['cover','contain'].includes(fit))throw Error('背景铺放方式无效');
  if(kind==='image'&&!/^[0-9a-f]{64}\.(png|jpg|webp)$/u.test(value.asset||''))throw Error('请先选择并上传背景图片');
  return {...DEFAULT_FILM_BACKGROUND,kind,color,fit,...(kind==='image'?{asset:value.asset}:{})};
}
export function readFilmBackground(root){
  return existsSync(configFile(root))?normalizeFilmBackground(JSON.parse(readFileSync(configFile(root),'utf8'))):{...DEFAULT_FILM_BACKGROUND};
}
export function filmBackgroundFile(root,settings=readFilmBackground(root)){
  const value=normalizeFilmBackground(settings);
  if(value.kind==='solid')return null;
  const file=value.kind==='paper'?BUNDLED_PAPER:path.join(root,'director/background-assets',value.asset);
  if(!existsSync(file))throw Error('背景图片缺失，请重新选择');
  if(value.kind==='image'&&sha(readFileSync(file))!==value.asset.split('.')[0])throw Error('背景图片哈希不匹配');
  return file;
}
export function saveFilmBackground(root,body){
  let value={...body};
  if(body.imageDataUrl){
    const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(body.imageDataUrl);
    if(!match)throw Error('仅支持PNG、JPG、WebP背景图片');
    const bytes=Buffer.from(match[2],'base64');
    if(!bytes.length||bytes.length>7*1024*1024)throw Error('背景图片不能超过7MB');
    const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216?'jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
    if(!type||type!==({png:'png',jpeg:'jpg',webp:'webp'})[match[1]])throw Error('背景图片内容与类型不符');
    const asset=sha(bytes)+'.'+type,folder=path.join(root,'director/background-assets');
    mkdirSync(folder,{recursive:true});
    const file=path.join(folder,asset);
    if(!existsSync(file))writeFileSync(file,bytes,{flag:'wx'});
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8'})).streams?.[0];
    if(!probe||probe.width<16||probe.height<16||probe.width*probe.height>36000000)throw Error('背景图片尺寸无效或过大');
    value={...value,kind:'image',asset};
  }
  value=normalizeFilmBackground(value);
  filmBackgroundFile(root,value);
  mkdirSync(path.dirname(configFile(root)),{recursive:true});
  writeFileSync(configFile(root),JSON.stringify(value,null,2));
  return value;
}
export function snapshotFilmBackground(root,project,settings=readFilmBackground(root)){
  const value=normalizeFilmBackground(settings),file=filmBackgroundFile(root,value);
  if(!file)return value;
  const bytes=readFileSync(file),hash=sha(bytes),relative=`backgrounds/film-${hash}${path.extname(file)}`;
  const target=path.join(project,'remotion/public',relative);
  mkdirSync(path.dirname(target),{recursive:true});
  if(existsSync(target)){if(sha(readFileSync(target))!==hash)throw Error('任务背景快照哈希冲突');}
  else copyFileSync(file,target);
  return {...value,src:relative,sha256:hash};
}
export function assertFilmBackgroundSnapshot(project,snapshot){
  normalizeFilmBackground(snapshot);
  if(snapshot.kind==='solid')return snapshot;
  if(!/^backgrounds\/film-[0-9a-f]{64}\.(png|jpg|webp)$/u.test(snapshot.src||''))throw Error('任务背景路径无效');
  const file=path.join(project,'remotion/public',snapshot.src);
  if(!existsSync(file)||sha(readFileSync(file))!==snapshot.sha256)throw Error('任务背景快照缺失或已改变');
  return snapshot;
}
