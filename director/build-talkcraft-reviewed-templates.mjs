import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Explicit migration tool, never called by model generation or rendering.
// It imports only existing, successful historical checks, never creates review.
export async function buildReviewedTemplateRegistry(root,{output=path.join(root,'director/talkcraft-reviewed-templates.json')}={}) {
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/u,''));
  const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const relative=file=>path.relative(root,file).replaceAll('\\','/');
  const base=path.join(root,'docs/audits/b-talkcraft-target3'),skill=path.join(root,'_audit/video-talkcraft');
  const playlistFile=path.join(base,'stage5-review-package/review-playlist.json'),playlist=read(playlistFile);
  const {buildCatalog}=await import(pathToFileURL(path.join(base,'current-contract.mjs')).href);
  const catalog=buildCatalog(),sources={},cards=[],excluded=[];
  for(const card of catalog.cards){
    const entries=playlist.allMedia.filter(m=>m.cardId===card.cardId),reviews=[];
    // Full parameterized implementations need not import the demo original.
    // Lock the actual executed dependency closure; do not invent a missing
    // original-file review requirement for a file absent from that closure.
    const deps=[...new Map(card.implementation.dependencies.map(f=>[f.file,f])).values()];
    try{
      for(const m of entries){
        const batch=path.join(base,m.batch),mediaFile=path.join(batch,'media-validation.json'),browserFile=path.join(batch,'browser-evidence-final.json');
        const media=read(mediaFile),browser=read(browserFile),lock=read(path.join(batch,'source-lock.json'));
        const sample=media.files.find(v=>v.id===m.sceneId+'-'+m.orientation);
        if(!media.ok||!browser.ok||!media.bindingChecked?.includes(m.sceneId)||!media.layoutTextChecked?.includes(m.sceneId)||
          !sample||!Object.values(sample.checks).every(v=>v===true)||sample.sha256!==m.sha256||hash(m.file)!==m.sha256)
          throw Error('历史媒体/布局/参数检查未通过');
        for(const dep of deps){
          const old=lock.files.find(f=>path.resolve(f.file)===path.resolve(dep.file));
          // A dependency not listed in the sample lock cannot inherit review.
          if(!old||old.sha256!==hash(dep.file))throw Error('历史源码锁不匹配：'+dep.file);
        }
        reviews.push({batch:m.batch,sceneId:m.sceneId,orientation:m.orientation,mediaSha256:m.sha256,
          mediaPath:relative(m.file),validation:{file:relative(mediaFile),sha256:hash(mediaFile)},
          browser:{file:relative(browserFile),sha256:hash(browserFile)},
          sourceLock:{file:relative(path.join(batch,'source-lock.json')),sha256:hash(path.join(batch,'source-lock.json'))},
          fullDecode:true,bindingChecked:true,layoutChecked:true});
      }
      if(!['wide','portrait'].every(o=>reviews.some(r=>r.orientation===o)))throw Error('缺少横竖版已检样本');
      const files=deps.map(d=>path.relative(skill,d.file).replaceAll('\\','/'));
      for(let i=0;i<deps.length;i++)sources[files[i]]=hash(deps[i].file);
      cards.push({cardId:card.cardId,reviewStatus:'technical-reviewed',sourceFiles:files,reviews,
        userAestheticAcceptance:false,filmAcceptance:false});
    }catch(error){excluded.push({cardId:card.cardId,reason:error.message});}
  }
  const result={schema:'talkcraft-reviewed-templates-v1',policy:'reviewed-source-only; no custom drawing; no semantic deviation bypass',
    evidenceScope:'Historical bounded template render, binding and layout checks. Does not grant film or user aesthetic acceptance.',
    provenance:{playlist:relative(playlistFile),sha256:hash(playlistFile)},sources,cards,excluded};
  if(!cards.length)throw Error('没有可验证的历史已审模板，未写登记');
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  return {cards:cards.length,sourceFiles:Object.keys(sources).length,excluded,output};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(JSON.stringify(await buildReviewedTemplateRegistry(path.resolve(process.argv[2]||'.')),null,2));
