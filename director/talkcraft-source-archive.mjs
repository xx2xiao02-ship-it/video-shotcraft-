import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const text=x=>Array.isArray(x)?x.join(' '):String(x||'');
export function archiveCandidates(identifier,data,need,match){
 if(!/^[a-z0-9][a-z0-9_.-]{0,100}$/iu.test(identifier))return [];
 const m=data.metadata||{},licenseUrl=text(m.licenseurl);
 const grant=licenseUrl.match(/^https?:\/\/creativecommons\.org\/(?:licenses\/(by|by-sa)\/(\d\.\d)|publicdomain\/(zero|mark)\/1\.0)\/?$/iu);
 const title=text(m.title),description=text(m.description).replace(/<[^>]*>/gu,' '),author=text(m.creator);
 if(!grant||!author||!match.matches(title+' '+description))return [];
 const license=grant[1]?'CC '+grant[1].toUpperCase()+' '+grant[2]:grant[3]==='zero'?'CC0':'Public domain';
 return (data.files||[]).filter(f=>f.source==='original'&&/\.(mp4|webm|ogv)$/iu.test(f.name||'')&&Number(f.size)>0&&Number(f.size)<=100*1024*1024).slice(0,2).map(f=>({
  sourceId:'archive:'+identifier+':'+f.name,title,description,author,sourceUrl:'https://archive.org/details/'+identifier,
  mediaUrl:'https://archive.org/download/'+identifier+'/'+encodeURIComponent(f.name),license,licenseUrl,
  size:Number(f.size),kind:'video',sourceVerified:true,licenseVerified:true,
  matchedConcepts:match.matched(title+' '+description),attribution:[title,author,license,'https://archive.org/details/'+identifier].join(' | ')}));
}
export async function discoverArchiveSources(project,need,match,{fetchImpl=fetch}={}){
 if(need.kind!=='video')return {candidates:[],errors:[]};
 const candidates=[],errors=[];
 const request=async url=>{
  const name='qa/source-discovery/archive-'+sha(url)+'.json',file=path.join(project,name);
  if(fs.existsSync(file))return {data:JSON.parse(fs.readFileSync(file)),evidence:name,evidenceSha256:sha(fs.readFileSync(file))};
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('ARCHIVE_HTTP_'+r.status);
  const data=await r.json();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data),{flag:'wx'});
  return {data,evidence:name,evidenceSha256:sha(fs.readFileSync(file))};
 };
 // Separate provider, separate bounded budget. Only explicit per-item free
 // licences qualify; public availability or an archive collection does not.
 const queries=match.queries.filter(q=>/^[a-z\s-]+$/iu.test(q)).slice(0,3);
 for(const query of queries){
  try{
   const url='https://archive.org/advancedsearch.php?'+new URLSearchParams({q:'mediatype:movies AND ('+query+') AND licenseurl:*',output:'json',rows:'4','fl[]':'identifier'});
   const search=await request(url);
   for(const row of search.data.response?.docs||[]){
    if(!/^[a-z0-9][a-z0-9_.-]{0,100}$/iu.test(row.identifier||''))continue;
    const metadata=await request('https://archive.org/metadata/'+row.identifier);
    for(const c of archiveCandidates(row.identifier,metadata.data,need,match))if(!candidates.some(x=>x.sourceId===c.sourceId))candidates.push({...c,evidence:metadata.evidence,evidenceSha256:metadata.evidenceSha256});
   }
  }catch(e){errors.push({provider:'archive',query,message:e.message});}
 }
 return {candidates,errors};
}
