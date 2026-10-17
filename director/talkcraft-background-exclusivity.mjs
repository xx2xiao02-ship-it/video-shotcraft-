import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const isBackgroundRole = value => ['background', '背景素材'].includes(String(value || '').trim().toLowerCase());
export function assertExclusiveBackgrounds(project, shots) {
  const identities=new Map(), hashes=new Map();
  for(const shot of shots){
    const p=shot.templateParams||{};
    if(!isBackgroundRole(p.materialRole))continue;
    if(!p.materialSrc)throw new Error(`${shot.id} 背景尚未匹配或采集，禁止用重复背景补位`);
    if(!p.materialSourceId&&!p.materialSourceUrl)throw new Error(`${shot.id} 背景缺少原始素材身份，无法确认裁切或转码前的来源`);
    const file=path.resolve(project,'remotion/public',p.materialSrc);
    if(!fs.existsSync(file))throw new Error(`${shot.id} 背景文件缺失：${p.materialSrc}`);
    const identity=String(p.materialSourceId||p.materialSourceUrl||file).toLowerCase();
    const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const previous=identities.get(identity)||hashes.get(hash);
    if(previous)throw new Error(`背景素材必须全片唯一排他：${previous} 与 ${shot.id} 复用了同一源素材，须重新匹配或采集`);
    identities.set(identity,shot.id);hashes.set(hash,shot.id);
  }
  return {backgrounds:identities.size,exclusive:true};
}
