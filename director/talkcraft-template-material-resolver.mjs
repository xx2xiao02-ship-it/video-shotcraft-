import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolveTalkcraftSkillRoot} from './talkcraft-skill-root.mjs';
import {canonicalCardId,loadTalkcraftGovernedCatalog} from './talkcraft-governed-contract.mjs';
import {probeMedia} from '../docs/audits/b-talkcraft-target3/validation.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside=(base,relative)=>{
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||/^[a-z]+:|^[/\\]/iu.test(relative))throw Error('素材路径必须为库内相对路径');
  const full=fs.realpathSync(path.resolve(base,relative));
  const rel=path.relative(fs.realpathSync(base),full);
  if(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel)||!fs.statSync(full).isFile())throw Error('素材路径越界或不是文件');
  return full;
};
const publicFile=(project,value)=>inside(project,String(value).startsWith('remotion/public/')?value:'remotion/public/'+String(value).replace(/^\/+/,''));
const duration=shot=>Number(shot.durationSec ?? (Number(shot.end ?? shot.endSec)-Number(shot.start ?? shot.startSec)));
const styleOnlyTags=new Set(['商务','科技','未来感','写实实拍','全景构图','日间','夜间','精选','高端品质','积极向上','智慧','空镜','有人物','精英人物']);
function fits(meta,kind,requiredSec){
  if(kind==='image-list'||kind==='image')return meta.kind==='image';
  if(kind==='image-or-video')return meta.kind==='image'||meta.durationSeconds>=requiredSec;
  return meta.kind==='video'&&meta.durationSeconds>=requiredSec&&(kind!=='portrait-video'||meta.height>meta.width);
}

// Populate only media fields declared by the same locked B contract used by
// the director and renderer. Never use a background file as a missing slot.
export function templateMaterialLibraryRoot({root=ROOT}={}){return path.resolve(root);}
export function resolveTalkcraftTemplateMaterials(project,{root=templateMaterialLibraryRoot(),catalog=null,deferGeneratedHost=false}={}){
  catalog ??= loadTalkcraftGovernedCatalog(read(path.join(resolveTalkcraftSkillRoot(ROOT),'references/cards-index.json')));
  const shotsFile=path.join(project,'remotion/shots.json'),shots=read(shotsFile);
  const researchFile=path.join(project,'material-research-plan.json');
  const researchRows=fs.existsSync(researchFile)?read(researchFile).shots||[]:[];
  const library=path.join(root,'materials/_scenes'),indexFile=path.join(root,'materials/_index.json');
  const index=fs.existsSync(indexFile)?read(indexFile):[];
  const backgroundIds=new Set(shots.filter(s=>s.templateParams?.materialRole==='background').map(s=>String(s.templateParams.materialSourceId||'').toLowerCase()).filter(Boolean));
  const backgroundHashes=new Set();
  for(const shot of shots)if(shot.templateParams?.materialRole==='background'&&shot.templateParams.materialSrc){
    try{backgroundHashes.add(hash(publicFile(project,shot.templateParams.materialSrc)));}catch{}
  }
  const cache=new Map(),bindings=[],searches=[],unresolved=[],adjustments=[];
  const metaFor=file=>{
    if(!cache.has(file))cache.set(file,probeMedia(file));
    return cache.get(file);
  };
  const next=shots.map(shot=>{
    const card=catalog.cards.find(c=>c.cardId===canonicalCardId(shot.shotCard,catalog));
    if(!card){unresolved.push({shotId:shot.id,code:'unknown_template',message:'模板不在已治理 B 目录'});return shot;}
    if(!Object.keys(card.policy.media).length)return shot;
    const params={...shot.templateParams},original=params.cardProps;
    if(!original||typeof original!=='object'||Array.isArray(original)){
      unresolved.push({shotId:shot.id,code:'missing_business_props',message:'先补齐编导业务参数，不能用演示内容代替'});return shot;
    }
    const props={...original},skip=new Set();
    for(const group of card.policy.mediaAlternatives){
      const supplied=group.filter(key=>typeof props[key]==='string'&&props[key].trim());
      if(supplied.length>1){unresolved.push({shotId:shot.id,code:'ambiguous_media_alternative',message:`${group.join('/')} 只能选择一个素材入口`});group.forEach(key=>skip.add(key));}
      else {const chosen=supplied[0]||(shot.subject==='person'&&group.includes('hostSrc')?'hostSrc':group.find(key=>key!=='hostSrc'));group.filter(key=>key!==chosen).forEach(key=>skip.add(key));}
    }
    for(const [field,kind] of Object.entries(card.policy.media)){
      if(skip.has(field))continue;
      const requiredSec=Math.max(0,duration(shot)||0);
      let supplied=props[field];
      if(field==='hostSrc'&&!supplied&&typeof params.templateHostSrc==='string')supplied=params.templateHostSrc;
      if(Array.isArray(supplied)&&kind==='image-list'&&supplied.every(v=>typeof v==='string')){
        supplied=supplied.join('\n');adjustments.push(`${shot.id}.${field}：按真实契约将素材数组转换为换行字符串，保留顺序`);
      }
      if(typeof supplied==='string'&&supplied.trim()){
        const values=kind==='image-list'?supplied.split('\n'): [supplied];
        try{
          const resolved=values.map(value=>{
            const file=publicFile(project,value.trim()),meta=metaFor(file);
            if(!fits(meta,kind,requiredSec))throw Error('素材类型、画幅或时长不满足该槽位');
            if(backgroundHashes.has(meta.sha256))throw Error('背景源不能充当内部素材缺省填充');
            return {file,meta};
          });
          props[field]=resolved.map(({file})=>path.relative(project,file).replaceAll('\\','/')).join('\n');
          resolved.forEach(({file,meta},slot)=>bindings.push({shotId:shot.id,field,slot,origin:'explicit',path:path.relative(project,file).replaceAll('\\','/'),sha256:meta.sha256,kind:meta.kind}));
        }catch(error){
          if(/EPERM/u.test(error.message))throw error;
          unresolved.push({shotId:shot.id,field,code:'invalid_explicit_material',message:error.message});
        }
        continue;
      }
      if(field==='hostSrc'){
        // B 模式数字人由 Main 作为顶层图层按镜头时间范围绑定；它不是
        // 模板内部素材槽位。生成后的逐镜 MP4 必须先通过真实媒体探测。
        if (shot.subject === 'person') {
          const transparent = path.join(project, 'remotion', 'public', 'digital-human', `${shot.id}-transparent.webm`);
          const digitalHuman = fs.existsSync(transparent) ? transparent : path.join(project, 'remotion', 'public', 'digital-human', `${shot.id}.mp4`);
          if (fs.existsSync(digitalHuman)) {
            const meta = metaFor(digitalHuman);
            if (!fits(meta, 'video', requiredSec)) {
              unresolved.push({shotId:shot.id,field,code:'digital_human_duration_mismatch',message:'数字人镜头文件存在，但帧数或时长与本镜不一致'});
            } else {
              bindings.push({shotId:shot.id,field,slot:0,origin:'digital-human-runtime',path:path.relative(project,digitalHuman).replaceAll('\\','/'),sha256:meta.sha256,kind:meta.kind,transparent:meta.kind === 'video' && digitalHuman.endsWith('-transparent.webm')});
              adjustments.push(`${shot.id}.${field}：已绑定对应时间范围的数字人顶层图层`);
              continue;
            }
          } else {
            if(deferGeneratedHost){
              adjustments.push(`${shot.id}.${field}：分镜规划阶段登记，待审核后由 RunningHub 生成；未完成素材验收`);
              continue;
            }
            unresolved.push({shotId:shot.id,field,code:'digital_human_binding_required',message:'需要先生成本镜时间范围对应的数字人素材，不能从背景库选人物视频'});
          }
          continue;
        }
        unresolved.push({shotId:shot.id,field,code:'digital_human_binding_required',message:'需要绑定本镜时间范围对应的成功数字人素材，不能从背景库选人物视频'});continue;
      }
      const protectedSource=/官方|原始(?:报告|图表|数据)|人物(?:页|资料)|\b(?:official|profile|research paper)\b/iu.test(params.templateMaterialQueries?.[field]||'')||
        researchRows.some(row=>(row.materialBindings||[]).some(b=>row.shotId===shot.id&&b.field===field)||
        (row.research||[]).some(need=>{
          const target=need.displayShotId||row.shotId;
          const fields=Object.keys(card.policy.media).filter(k=>k!=='hostSrc'&&!skip.has(k));
          return target===shot.id&&(need.displayField===field||!need.displayField&&fields.length===1&&fields[0]===field);
        }));
      if(protectedSource){
        unresolved.push({shotId:shot.id,field,code:'reviewed_source_binding_required',
          message:'该槽有明确真实资料需求或已声明文件；须先核验并恢复对应来源，禁止用本地语境素材替填'});
        continue;
      }
      const needed=kind==='image-list'&&typeof props.labels==='string'?props.labels.split('\n').length:kind==='image-list'?0:1;
      if(!needed){unresolved.push({shotId:shot.id,field,code:'material_cardinality_unknown',message:'缺少与图片列表一一对应的标签，不能猜测图片数量'});continue;}
      const explicitQuery=params.templateMaterialQueries?.[field];
      // Background description and style adjectives are not an internal-slot
      // subject query. Preserve field-specific demand when the director supplied it.
      const query=(typeof explicitQuery==='string'&&explicitQuery.trim()?explicitQuery:
        [shot.intent,typeof props.labels==='string'?props.labels:''].filter(Boolean).join(' ')).toLowerCase();
      const rows=index.map(item=>{
        const tags=(Array.isArray(item.tags)?item.tags:[]).map(v=>String(v).trim().toLowerCase()).filter(v=>v.length>=2&&!styleOnlyTags.has(v));
        const hits=tags.filter(tag=>query.includes(tag));
        return {item,hits,score:hits.length};
      }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||String(a.item.path).localeCompare(String(b.item.path)));
      const selected=[],seen=new Set(),rejected=[];
      for(const row of rows){
        try{
          if(backgroundIds.has(String(row.item.sourceId||'').toLowerCase()))throw Error('已作为背景源使用');
          const file=inside(library,row.item.path),meta=metaFor(file);
          if(backgroundHashes.has(meta.sha256))throw Error('与背景源内容相同');
          const extractImage=(kind==='image'||kind==='image-list')&&meta.kind==='video';
          if(!extractImage&&!fits(meta,kind,requiredSec))throw Error('类型、画幅或时长不匹配');
          if(seen.has(meta.sha256))throw Error('改名重复素材不能填多个不同槽位');
          seen.add(meta.sha256);selected.push({file,meta,item:row.item,hits:row.hits,extractImage});
          if(selected.length===needed)break;
        }catch(error){if(/EPERM/u.test(error.message))throw error;rejected.push({path:row.item.path,reason:error.message});}
      }
      searches.push({shotId:shot.id,field,query,kind,needed,matched:selected.length,libraryEntries:index.length,positiveTagMatches:rows.length,rejected});
      if(selected.length<needed){unresolved.push({shotId:shot.id,field,code:'local_material_unmatched',needed,matched:selected.length,message:`本地库仅匹配 ${selected.length}/${needed} 个 ${kind} 素材；需要按语义继续检索补充`});continue;}
      const values=selected.map(({file,meta,item,hits,extractImage},slot)=>{
        const atSeconds=extractImage?Math.max(0,Math.min(meta.durationSeconds/2,meta.durationSeconds-1/30)):null;
        const relative=extractImage?`remotion/public/template-materials/${meta.sha256}-frame-${atSeconds.toFixed(3)}.jpg`:
          `remotion/public/template-materials/${meta.sha256}${path.extname(file).toLowerCase()}`;
        const target=path.join(project,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
        if(!fs.existsSync(target)){
          if(extractImage)execFileSync('ffmpeg',['-v','error','-ss',String(atSeconds),'-i',file,'-frames:v','1','-q:v','3',target],{windowsHide:true,encoding:'utf8',timeout:30000});
          else fs.copyFileSync(file,target);
        }
        const boundMeta=extractImage?metaFor(target):meta;
        if(!extractImage&&hash(target)!==meta.sha256)throw Error('既有绑定文件与来源哈希不符，已保留文件并停止');
        if(!fits(boundMeta,kind,requiredSec))throw Error('输出素材不符合模板槽位类型');
        bindings.push({shotId:shot.id,field,slot,origin:'local_library',sourceId:item.sourceId||item.path,
          sourceFile:file,sourceSha256:meta.sha256,path:relative,sha256:boundMeta.sha256,kind:boundMeta.kind,
          preparation:extractImage?'semantic_video_frame':'unchanged_copy',atSeconds,matchedTags:hits});
        return relative;
      });
      props[field]=values.join('\n');adjustments.push(`${shot.id}.${field}：按模板契约从本地库绑定 ${values.length} 个素材`);
    }
    return {...shot,templateParams:{...params,cardProps:props}};
  });
  fs.mkdirSync(path.join(project,'qa'),{recursive:true});
  const reportFile=path.join(project,'qa/template-material-bindings.json');
  fs.writeFileSync(reportFile,JSON.stringify({schema:'talkcraft-template-material-bindings-v1',productionAdmitted:false,bindings,searches,unresolved},null,2));
  // Read-only checks must preserve the byte fingerprint approved by the user.
  // Write only when an actual material binding changed, never just to format JSON.
  if(JSON.stringify(next)!==JSON.stringify(shots))
    fs.writeFileSync(shotsFile,JSON.stringify(next,null,2)+'\n');
  return {shots:next.length,adjustments,unresolved,file:shotsFile,reportFile};
}
