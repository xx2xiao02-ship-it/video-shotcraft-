import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertScreenCardAssets} from '../director/screen-card-assets.mjs';

const root=path.resolve(import.meta.dirname,'..');
const version=process.argv[2] || 'v1';
if(!/^v\d+$/.test(version)) throw new Error('Expected fixture version vN.');
const origin='template/out/card-business-media-batch013-v6';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const capture=JSON.parse(fs.readFileSync(path.join(root,origin,'capture.json')));
const frozen=name=>{
  const row=capture.captures.find(row=>row.name===name);
  const bytes=fs.readFileSync(path.join(root,origin,row.file));
  if(hash(bytes)!==row.sha256) throw new Error('Frozen capture changed: '+name);
  const src=`card-media/batch013-${name}-${row.sha256.slice(0,12)}.png`;
  const file=path.join(root,'template/public',src);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)) {
    if(hash(fs.readFileSync(file))!==row.sha256) throw new Error('Existing media differs; preserve it.');
  } else fs.writeFileSync(file,bytes);
  return {src,kind:'image',width:row.width,height:row.height,sha256:row.sha256};
};
const all=frozen('all'),gaps=frozen('gaps'),phone=frozen('phone'),detail=frozen('list-detail');
const portraitAll=frozen('all-portrait'),portraitGaps=frozen('gaps-portrait');
const target=name=>({...capture.captures.find(row=>row.name===name).dom.targetRect});
const cards=[
  {id:'effects/fui-hud-moves/reticle-lock-on',lines:['尚未准入'],templateParams:{screen:all,targetRect:target('all')},inspectFrames:[20,46,56,100,179]},
  {id:'effects/brand-frame-snap',lines:['全部卡片','仅看缺口'],templateParams:{screens:[all,gaps],portraitScreens:[portraitAll,portraitGaps]},inspectFrames:[40,77,78,100,179]},
  ...['glow-wake-sleep-panel','slide-spotlight-pan','corner-spotlight-reveal'].map(key=>({
    id:'effects/spotlight-sweep-moves/'+key,lines:['镜头卡清单'],templateParams:{screen:all},inspectFrames:[20,60,100,132,179]})),
  {id:'effects/radial-ripple-phone-chips',lines:['卡片检索','缺口筛选'],templateParams:{screen:phone},inspectFrames:[0,40,80,140,179],
    skin:{bg:'#f4f7f8',surface:'#ffffff',text:'#18272b',muted:'#cad5d7',accent:'#116e79',fontFamily:'Microsoft YaHei',transparentBackground:true}},
  {id:'outro/edit-hook-moves/logo-sting-button',lines:['镜头卡治理'],templateParams:{screens:[all,detail],targetRect:target('list-detail')},inspectFrames:[10,40,74,82,179]},
].map(card=>({...card,narration:'这是实际镜头卡治理页面，逐项核对本地准入和缺口。模型实测、生产加载及用户验收仍需独立完成。'}));
for(const card of cards) assertScreenCardAssets(root,card.id,card.templateParams);
const file=path.join(root,'template/fixtures/card-business-text-batch013-media-'+version+'.json');
if(fs.existsSync(file)) throw new Error('Prepared fixture already exists; preserve it.');
fs.writeFileSync(file,JSON.stringify({schema:'card-business-text-fixtures-v1',fps:30,durationInFrames:180,
  aspects:['16:9','9:16'],mediaSource:origin+'/capture.json',mediaSourceSha256:hash(fs.readFileSync(path.join(root,origin,'capture.json'))),
  mediaSources:[all,gaps,phone,detail,portraitAll,portraitGaps].map(screen=>'template/public/'+screen.src),cards},null,2)+'\n');
console.log(JSON.stringify({fixture:file,cards:cards.length,actualImages:6,status:'prepared-not-admitted'}));
