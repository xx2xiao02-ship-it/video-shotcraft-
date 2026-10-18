import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const TEMPLATE_PARAM_RELOCATIONS=['templateMaterialQueries','semanticDeviations'];

function normalizeQueries(value,shotId,location,changes,issues){
  if(!Array.isArray(value))return value;
  if(!value.length){changes.push({shotId,operation:'empty-map',from:location,to:location});return {};}
  const mapped={};
  for(const entry of value){
    if(!object(entry)||Object.keys(entry).some(k=>!['field','materialRole','queryZh','materialQuery','reason'].includes(k))||
      typeof entry.field!=='string'||!entry.field.trim()||typeof entry.materialQuery!=='string'||!entry.materialQuery.trim()||
      Object.hasOwn(mapped,entry.field)){
      issues.push({code:'EDITORIAL_STRUCTURE_INVALID',shotId,message:`${shotId} 素材查询列表缺少明确字段、查询或出现重复字段，不能转换`});return value;
    }
    mapped[entry.field]=entry.materialQuery;
  }
  // Keep every original entry in the repair receipt, including language,
  // purpose and reason metadata. No query or target is inferred.
  changes.push({shotId,operation:'explicit-field-map',from:location,to:location,sourceValue:structuredClone(value)});
  return mapped;
}

// Lossless protocol adaptation only. Content, identities and clocks are never
// inferred. The caller still runs the original full selection compiler.
export function repairEditorialStructure(raw,request){
  const response=structuredClone(raw),changes=[],issues=[];
  if(raw?.requestId!==request?.requestId)throw Error('结构修复请求指纹不匹配');
  for(const row of response.repairs||[]){
    if(!object(row)||!request.editableShotIds.includes(row.shotId))continue;
    const fields=row.nativePresentation?.textFields;
    if(Array.isArray(fields)&&fields.some(f=>object(f)&&Object.hasOwn(f,'field'))){
      for(const [i,f]of fields.entries()){
        if(!object(f)||!Object.hasOwn(f,'field'))continue;
        if(typeof f.field!=='string'||!f.field.trim()||
          !Object.hasOwn(row.templateParams?.cardProps||{},f.field)||typeof row.templateParams.cardProps[f.field]!=='string'||
          Object.hasOwn(f,'key')&&f.key!==f.field){
          issues.push({code:'EDITORIAL_STRUCTURE_CONFLICT',shotId:row.shotId,message:`${row.shotId} textFields的field别名不对应本次明确文字参数，或与key冲突，不能修复`});continue;
        }
        const sourceValue=structuredClone(f);f.key=f.field;delete f.field;
        changes.push({shotId:row.shotId,operation:'explicit-text-field-alias',
          from:`nativePresentation.textFields[${i}].field`,to:`nativePresentation.textFields[${i}].key`,sourceValue});
      }
      if(new Set(fields.map(f=>f?.key)).size!==fields.length)
        issues.push({code:'EDITORIAL_STRUCTURE_CONFLICT',shotId:row.shotId,message:`${row.shotId} textFields别名转换后字段重复，不能合并或猜测`});
    }
    if(object(row.templateParams)&&Object.hasOwn(row.templateParams,'templateMaterialQueries'))
      row.templateParams.templateMaterialQueries=normalizeQueries(row.templateParams.templateMaterialQueries,row.shotId,'templateParams.templateMaterialQueries',changes,issues);
    for(const key of TEMPLATE_PARAM_RELOCATIONS){
      if(!Object.hasOwn(row,key))continue;
      // JSON models commonly encode an empty field map as []. No entry is
      // invented or discarded; nonempty arrays remain invalid.
      if(key==='templateMaterialQueries')row[key]=normalizeQueries(row[key],row.shotId,key,changes,issues);
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
