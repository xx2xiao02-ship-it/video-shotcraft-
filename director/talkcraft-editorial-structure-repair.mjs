import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const TEMPLATE_PARAM_RELOCATIONS=['templateMaterialQueries','semanticDeviations'];

// Lossless protocol adaptation only. Content, identities and clocks are never
// inferred. The caller still runs the original full selection compiler.
export function repairEditorialStructure(raw,request){
  const response=structuredClone(raw),changes=[],issues=[];
  if(raw?.requestId!==request?.requestId)throw Error('结构修复请求指纹不匹配');
  for(const row of response.repairs||[]){
    if(!object(row)||!request.editableShotIds.includes(row.shotId))continue;
    for(const key of TEMPLATE_PARAM_RELOCATIONS){
      if(!Object.hasOwn(row,key))continue;
      // JSON models commonly encode an empty field map as []. No entry is
      // invented or discarded; nonempty arrays remain invalid.
      if(key==='templateMaterialQueries'&&Array.isArray(row[key])&&row[key].length===0){
        row[key]={};
        changes.push({shotId:row.shotId,operation:'empty-map',from:key,to:key});
      }
      if(!object(row.templateParams)||!object(row[key])){
        issues.push({code:'EDITORIAL_STRUCTURE_INVALID',shotId:row.shotId,message:`${row.shotId} ${key}或templateParams不是对象，不能修复`});continue;
      }
      const duplicate=Object.hasOwn(row.templateParams,key);
      if(duplicate&&!isDeepStrictEqual(row.templateParams[key],row[key])){
        issues.push({code:'EDITORIAL_STRUCTURE_CONFLICT',shotId:row.shotId,message:`${row.shotId} ${key}两层内容冲突，不能自动覆盖`});continue;
      }
      if(!duplicate)row.templateParams[key]=row[key];
      delete row[key];
      changes.push({shotId:row.shotId,operation:duplicate?'deduplicate-identical':'relocate',from:key,to:`templateParams.${key}`});
    }
  }
  return {response:issues.length?structuredClone(raw):response,report:{schema:'talkcraft-editorial-structure-repair-v1',
    requestId:request.requestId,passed:!issues.length,changes:issues.length?[]:changes,issues,
    rawSha256:hash(raw),normalizedSha256:hash(issues.length?raw:response),externalRequests:0,productionAdmitted:false}};
}
