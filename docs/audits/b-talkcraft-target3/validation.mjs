import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {validateDsl,crossFieldChecks} from './dsl-validation.mjs';
import {replacementSchedule} from './schedule.mjs';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const object=v=>!!v && typeof v==='object' && !Array.isArray(v);
export function evidenceCode(card,f,value) {
  const r=card.policy.dsl[f.key];
  const claimText=typeof value==='string' ? value.split('\n').map(row=>{
    const parts=row.split('|');
    if(['timed-log','anchored-words'].includes(r?.syntax))return [parts[0],...parts.slice(2)].join('|');
    if(r?.syntax==='messages')return parts.slice(1).join('|');
    if(r?.syntax==='chapter')return parts[1] ?? '';
    if(r?.syntax==='steps')return parts.length>1?parts.slice(1).join('|'):row;
    return row;
  }).join('\n') : value;
  const claim=f.role==='numeric-content' || r?.numeric || (card.policy.numericClaims.includes(f.key) &&
    typeof claimText==='string' && /\d|[零一二三四五六七八九十百千万亿]{2,}|[零一二三四五六七八九十百千万亿]+(?:成|倍|元|个|年|月|项|%|％)/u.test(claimText));
  return f.role==='anchor-geometry'?'ANCHOR_EVIDENCE_REQUIRED':claim?'NUMERIC_EVIDENCE_REQUIRED':null;
}
export function localFile(root,relative) {
  if(typeof relative!=='string' || !relative || path.isAbsolute(relative) || /^[a-z]+:|^[/\\]/i.test(relative))
    throw Error('Expected project-relative local file');
  const base=fs.realpathSync(root),full=path.resolve(base,relative);
  const within=f=>{const r=path.relative(base,f);return r && r!=='..' && !r.startsWith('..'+path.sep) && !path.isAbsolute(r);};
  if(!within(full)) throw Error('Path escapes project root');
  const real=fs.realpathSync(full);
  if(!within(real) || !fs.statSync(real).isFile()) throw Error('Not a contained regular file');
  return real;
}
export function probeMedia(file) {
  const result=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],
    {encoding:'utf8',windowsHide:true,maxBuffer:1024*1024,timeout:15000});
  if(result.status!==0) throw Error(result.error?.message || result.stderr || 'ffprobe failed');
  const data=JSON.parse(result.stdout),stream=data.streams?.find(s=>s.codec_type==='video');
  if(!stream || !(stream.width>0 && stream.height>0)) throw Error('No valid visual stream');
  const image=['png','jpg','jpeg','webp','bmp','tiff','gif','avif'].some(ext=>new RegExp('\\.'+ext+'$','i').test(file));
  const video=/\.(mp4|webm|mov|mkv)$/i.test(file);
  if(!image && !video) throw Error('Unsupported media container');
  if(image && !['png','mjpeg','webp','bmp','tiff','gif','av1'].includes(stream.codec_name)) throw Error('Image extension/codec mismatch');
  const durationSeconds=Number(data.format?.duration ?? stream.duration);
  if(video && !(durationSeconds>0)) throw Error('Video duration missing');
  return {kind:image?'image':'video',width:stream.width,height:stream.height,
    codec:stream.codec_name,pixelFormat:stream.pix_fmt,durationSeconds:video?durationSeconds:null,
    sha256:sha256(fs.readFileSync(file)),fullDecodeVerified:false,alphaVerified:false};
}

export function validateCatalogCalls(input,{projectRoot,catalog}) {
  const errors=[],details=[],sourceCache=new Map(),mediaCache=new Map();
  const fail=(code,at,message)=>errors.push({code,at,message});
  const keys=(value,allowed,at)=>{
    if(!object(value)){fail('OBJECT_REQUIRED',at,'Expected object');return false;}
    for(const k of Object.keys(value)) if(!allowed.includes(k)) fail('UNKNOWN_FIELD',at+'.'+k,'Unknown field');
    return true;
  };
  const done=()=>({ok:errors.length===0,errors,details,productionAdmitted:false,
    limitation:'Input/source integrity only; no component execution, layout, fact or production acceptance.'});
  if(!keys(input,['schema','calls'],'input')) return done();
  if(input.schema!=='b-talkcraft-call-v1') fail('VERSION_MISMATCH','schema','Expected b-talkcraft-call-v1');
  if(!Array.isArray(input.calls) || !input.calls.length){fail('CALLS_REQUIRED','calls','Nonempty array required');return done();}
  const ids=new Set();
  for(const [index,call] of input.calls.entries()) {
    const at=`calls[${index}]`,before=errors.length;
    const detail={index,id:call?.id ?? null,cardId:call?.cardId ?? null,ok:false,media:[],productionAdmitted:false};
    details.push(detail);
    if(!keys(call,['id','cardId','implementationSha256','props','evidence'],at)) continue;
    if(typeof call.id!=='string' || !/^[a-z][a-z0-9-]{0,63}$/.test(call.id)) fail('INVALID_ID',at+'.id','Stable ID required');
    else if(ids.has(call.id)) fail('DUPLICATE_ID',at+'.id','Duplicate ID');else ids.add(call.id);
    const card=catalog.cards.find(c=>c.cardId===call.cardId);
    if(!card){fail('UNKNOWN_CARD',at+'.cardId','Unknown card');continue;}
    if(call.implementationSha256!==card.implementation.sha256) fail('VERSION_MISMATCH',at,'Implementation hash mismatch');
    for(const source of [card.implementation,card.original,...card.implementation.dependencies ?? []]) {
      if(!sourceCache.has(source.file)) {
        try{sourceCache.set(source.file,sha256(fs.readFileSync(source.file)));}catch{sourceCache.set(source.file,null);}
      }
      if(!sourceCache.get(source.file)) fail('SOURCE_MISSING',at,source.file);
      else if(sourceCache.get(source.file)!==source.sha256) fail('SOURCE_CHANGED',at,source.file);
    }
    if(!keys(call.props,card.fields.map(f=>f.key),at+'.props')) continue;
    const p=card.policy,merged=Object.fromEntries(card.fields.map(f=>[f.key,f.default]));
    Object.assign(merged,call.props);
    for(const key of p.required) {
      const f=card.fields.find(f=>f.key===key),value=call.props[key];
      if(!own(call.props,key) || value===null || (typeof value==='string' && !value.trim() && !(f.blankAllowed && value==='')))
        fail('REQUIRED_PROP',at+'.props.'+key,'Explicit content required; no demo fallback');
    }
    for(const group of p.mediaAlternatives) if(group.filter(k=>typeof call.props[k]==='string' && call.props[k].trim()).length!==1)
      fail('MEDIA_ALTERNATIVE',at+'.props','Exactly one media source required');
    for(const [key,value] of Object.entries(call.props)) {
      const f=card.fields.find(f=>f.key===key);if(!f)continue;
      const where=at+'.props.'+key;
      if(!f.writable){fail('MOTION_FIELD_LOCKED',where,'Timing/motion field is frozen');continue;}
      const expected=['number','slider'].includes(f.type)?'number':f.type==='boolean'?'boolean':'string';
      if(typeof value!==expected || (expected==='number' && !Number.isFinite(value))){fail('PROP_TYPE',where,'Expected '+expected);continue;}
      if(expected==='number') {
        if((f.min!==undefined && value<f.min) || (f.max!==undefined && value>f.max)) fail('PROP_RANGE',where,'Outside source UI range');
        const base=f.min ?? f.default ?? 0;
        if(f.step>0 && Math.abs((value-base)/f.step-Math.round((value-base)/f.step))>1e-7) fail('PROP_STEP',where,'Invalid step from declared min or source default');
      }
      if(f.type==='select' && !f.options?.some(o=>o.value===value)) fail('PROP_OPTION',where,'Unknown option');
      if(f.type==='color' && !/^#[a-f\d]{6}$/i.test(value)) fail('PROP_COLOR',where,'Expected six-digit hex');
      if(p.dsl[key] && !(f.blankAllowed && value==='')) {
        for(const code of validateDsl(key,value,p.dsl[key],f.default)) fail(code,where,'Source DSL constraint');
        if(p.dsl[key].scale && value.split('\n').some(row=>Number(row.split('|')[1])>merged[p.dsl[key].scale])) fail('DATA_RANGE',where,'Exceeds declared scale');
      }
    }
    for(const code of crossFieldChecks(card,merged)) fail(code,at+'.props','Cross-field constraint');
    const bindings=new Set();
    if(!Array.isArray(call.evidence)) fail('EVIDENCE_TYPE',at+'.evidence','Explicit evidence array required');
    else for(const [i,item] of call.evidence.entries()) {
      const ea=at+`.evidence[${i}]`;
      if(!keys(item,['field','path','sha256','sourceUrl'],ea))continue;
      if(!own(call.props,item.field)) fail('EVIDENCE_FIELD',ea,'Must bind supplied prop');
      if(bindings.has(item.field)) fail('DUPLICATE_EVIDENCE',ea,'Duplicate evidence');
      try {
        const bytes=fs.readFileSync(localFile(projectRoot,item.path));
        if(!/^[a-f\d]{64}$/.test(item.sha256??'') || sha256(bytes)!==item.sha256) throw Error('Evidence hash mismatch');
        const doc=JSON.parse(bytes.toString('utf8'));
        if(!keys(doc,['field','value','sourceUrl'],'evidence-file'))throw Error('Invalid evidence document');
        if(doc.field!==item.field || JSON.stringify(doc.value)!==JSON.stringify(call.props[item.field])) throw Error('Evidence value mismatch');
        const url=new URL(item.sourceUrl);
        if(!['https:','http:'].includes(url.protocol) || url.username || url.password || doc.sourceUrl!==item.sourceUrl) throw Error('Invalid source URL');
        bindings.add(item.field);
      }catch(e){fail('EVIDENCE_INVALID',ea,e.message);}
    }
    for(const f of card.fields) if(own(call.props,f.key)) {
      const code=evidenceCode(card,f,call.props[f.key]);
      if(code && !bindings.has(f.key)) fail(code,at+'.props.'+f.key,'Bound local evidence required; binding does not prove factual truth');
    }
    for(const [key,kind] of Object.entries(p.media)) {
      if(p.mediaAlternatives.some(g=>g.includes(key)) && !call.props[key]) continue;
      const values=kind==='image-list' && typeof call.props[key]==='string'?call.props[key].split('\n'):[call.props[key]];
      for(const [i,value] of values.entries()) try {
        const file=localFile(projectRoot,value);
        if(!mediaCache.has(file)) mediaCache.set(file,probeMedia(file));
        const meta=mediaCache.get(file);
        if(card.cardId==='grid-to-hero' && meta.kind==='video' && !/\.(mp4|webm|mov)$/i.test(file))
          throw Error('Source branch treats this extension as image, not video');
        if(kind.startsWith('image') && kind!=='image-or-video' && meta.kind!=='image') throw Error('Image slot rejects video');
        if(kind.includes('video') && kind!=='image-or-video' && meta.kind!=='video') throw Error('Video slot rejects image');
        if(kind==='portrait-video' && meta.width>=meta.height) throw Error('Portrait footage required');
        if(kind==='video-alpha-unverified') {
          const alpha=verifyAlpha(file);
          if(!alpha.ok)fail('ALPHA_UNVERIFIED',at+'.props.'+key,alpha.reason);
          else Object.assign(meta,{alphaVerified:true,alphaEvidence:alpha});
        }
        detail.media.push({field:key,index:i,path:file,...meta});
      }catch(e){fail('MEDIA_INVALID',at+'.props.'+key,e.message);}
    }
    detail.schedule=replacementSchedule(card,merged);
    if(!detail.schedule.ok) fail('SCHEDULE_UNVERIFIED',at+'.props',detail.schedule.reason);
    else if(detail.schedule.frames>card.duration.frames) fail('DURATION_BUDGET',at+'.props','Replacement schedule exceeds registered frames; no automatic retiming');
    detail.ok=errors.length===before;
    detail.component=card.implementation.component;detail.export=card.implementation.export;
  }
  return done();
}

// Decode all frames with the alpha-capable VP9 decoder; inspect the actual alpha plane.
export function verifyAlpha(file) {
  const decode=spawnSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-an','-f','null','-'],
    {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  if(decode.status!==0)return {ok:false,reason:decode.error?.message||decode.stderr||'Alpha decode failed'};
  const plane=spawnSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-vf','alphaextract','-frames:v','1','-f','rawvideo','-pix_fmt','gray','pipe:1'],
    {windowsHide:true,timeout:15000,maxBuffer:32*1024*1024});
  if(plane.status!==0 || !plane.stdout?.length)return {ok:false,reason:plane.error?.message||plane.stderr?.toString()||'No alpha plane'};
  let min=255,max=0;for(const byte of plane.stdout){min=Math.min(min,byte);max=Math.max(max,byte);}
  return min<255 && max>0 ? {ok:true,decoder:'libvpx-vp9',fullDecodeExitCode:decode.status,
    alphaPlaneSha256:sha256(plane.stdout),firstFrameMin:min,firstFrameMax:max,sourceSha256:sha256(fs.readFileSync(file)),
    scope:'full_decode_and_first_frame_nonopaque_alpha_not_all_frame_matte_QA'} : {ok:false,reason:'No visible nonopaque alpha content'};
}
