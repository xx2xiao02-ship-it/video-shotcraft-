import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Normalize the provider representation against the existing locked catalog.
// This does not relax validateCalls or change a card implementation.
export const EDITORIAL_PARAM_RULES = 'materialRole、materialQuery、templateMaterialQueries 只属于 templateParams，禁止放进 cardProps。cardProps 只能使用该卡登记字段。lockedDsl 给出源码锁定的行数与固定列，必须保留；anchored-words 可使用每行“词|normal”或“词|color/serif”，通用 emphasis 表示唯一强调色 color，由后端填入源码固定语音节拍列；不能自行编造秒数。文字字段的 wordEvents.text 与 cardProps 使用同一表示，实际出场仍须通过字级锚词及实帧检查。';

export function editorialDslLocks(card) {
  return Object.fromEntries(Object.entries(card.policy.dsl || {}).flatMap(([key,rule]) => {
    const value=card.fields.find(f=>f.key===key)?.default;
    if (!rule.fixedColumns?.length || typeof value!=='string') return [];
    return [[key,{syntax:rule.syntax,rows:value.split('\n').map(row=>{
      const parts=row.split('|').map(s=>s.trim());
      return Object.fromEntries(rule.fixedColumns.map(i=>[i,parts[i]]));
    })}]];
  }));
}

export function normalizeEditorialParams(input,catalog) {
  const result=structuredClone(input), repairs=[];
  for (const shot of result?.shots || []) {
    const params=shot?.templateParams, props=params?.cardProps;
    const card=catalog.cards.find(c=>c.cardId===shot.shotCard);
    if (!props || typeof props!=='object' || !card) continue;
    const fields=new Set(card.fields.map(f=>f.key));
    for (const key of ['materialRole','materialQuery','templateMaterialQueries']) {
      if (!Object.hasOwn(props,key) || fields.has(key)) continue;
      const value=props[key], canonical=Object.hasOwn(params,key);
      if (!canonical) params[key]=value;
      delete props[key];
      repairs.push({shotId:shot.id,field:`cardProps.${key}`,from:value,
        toField:`templateParams.${key}`,to:params[key],
        reason:canonical?'保留正式配置层的值，归档卡片参数中错层的副本':'素材检索配置归回正式层级，不作为卡片业务字段'});
    }
    for (const field of Object.keys(card.policy.media || {})) {
      const value=props[field];
      // A descriptive pending request is not a local filename. Preserve actual
      // paths (including missing ones) so path/provenance errors stay visible.
      if (field==='hostSrc' || typeof value!=='string' ||
          !/^待采集\s*[-:：]/u.test(value) || /[/\\]|\.[a-z0-9]{2,5}(?:$|[?#])/iu.test(value)) continue;
      const query=value.replace(/^待采集\s*[-:：]\s*/u,'').trim();
      if (!query) continue;
      params.templateMaterialQueries ??= {};
      if (typeof params.templateMaterialQueries!=='object' || Array.isArray(params.templateMaterialQueries)) continue;
      if (!params.templateMaterialQueries[field]) params.templateMaterialQueries[field]=query;
      delete props[field];
      repairs.push({shotId:shot.id,field:`cardProps.${field}`,from:value,
        toField:`templateParams.templateMaterialQueries.${field}`,to:params.templateMaterialQueries[field],
        reason:'待采集描述转为素材需求，保持缺素材状态，交由真实采集匹配而非当作文件路径'});
    }
    for (const [key,rule] of Object.entries(card.policy.dsl || {})) {
      // Only the explicit text/style shorthand is compiled. A supplied numeric
      // time remains subject to the original validator; never silently fix it.
      if (rule.syntax!=='anchored-words' || rule.fixedColumns?.join(',')!=='1' || typeof props[key]!=='string') continue;
      const original=card.fields.find(f=>f.key===key)?.default;
      if (typeof original!=='string') continue;
      const rows=props[key].split(/\r?\n/u).map(row=>row.split('|').map(v=>v.trim()));
      const fixed=original.split('\n').map(row=>row.split('|').map(v=>v.trim()));
      const channels={normal:'',emphasis:'color',serif:'serif',color:'color'};
      if (rows.length!==fixed.length || rows.some(p=>p.length!==2 || !p[0] || !Object.hasOwn(channels,p[1])) ||
          fixed.some(p=>!p[1] || !Number.isFinite(Number(p[1])))) continue;
      const from=props[key];
      props[key]=rows.map((p,i)=>[p[0],fixed[i][1],...(channels[p[1]]?[channels[p[1]]]:[])].join('|')).join('\n');
      repairs.push({shotId:shot.id,field:`cardProps.${key}`,from,to:props[key],
        implementationSha256:card.implementation.sha256,
        reason:'保留每行文字及强调意图，从已锁定源码读取固定节拍列，不修改模板动作'});
      for (const [i,e] of (shot.nativePresentation?.wordEvents || []).entries()) {
        if (e.field!==key || e.text!==from) continue;
        e.text=props[key];
        repairs.push({shotId:shot.id,field:`nativePresentation.wordEvents[${i}].text`,from,to:e.text,
          reason:'同步同一字段的表示；句序、锚词及角色保持原值'});
      }
    }
  }
  return {result,repairs};
}

// Existing partial runs take editorial-check rather than re-submit editorial.
// Normalize both saved views independently; never replace a real media binding
// in shots.json with an earlier model proposal.
export function normalizeSavedEditorialParams(project,catalog) {
  const records=[];
  for (const name of ['qa/ark-editorial-response.json','remotion/shots.json']) {
    const file=path.join(project,name);
    if (!fs.existsSync(file)) continue;
    const bytes=fs.readFileSync(file), parsed=JSON.parse(bytes);
    const normalized=normalizeEditorialParams(Array.isArray(parsed)?{shots:parsed}:parsed,catalog);
    if (!normalized.repairs.length) continue;
    const dir=path.join(project,'qa/editorial-params-before');fs.mkdirSync(dir,{recursive:true});
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const backup=path.join(dir,`${path.basename(file)}-${sha256}.json`);
    if (!fs.existsSync(backup))fs.writeFileSync(backup,bytes,{flag:'wx'});
    fs.writeFileSync(file,JSON.stringify(Array.isArray(parsed)?normalized.result.shots:normalized.result,null,2));
    records.push(...normalized.repairs.map(r=>({file:name,inputSha256:sha256,...r})));
  }
  if (records.length) {
    const file=path.join(project,'qa/ark-parameter-repairs.json');
    const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).repairs:[];
    fs.writeFileSync(file,JSON.stringify({schema:'talkcraft-ark-parameter-repairs-v1',repairs:[...previous,...records]},null,2));
  }
  return records;
}
