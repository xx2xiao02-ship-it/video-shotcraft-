import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertTextVideoColors, TEXT_VIDEO_CARDS} from './talkcraft-text-video.mjs';
import {withMaterialBindingTransaction} from './talkcraft-material-binding-transaction.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

// This is an execution plan for explicitly reviewed sources, not a search-result
// admission path. It cannot choose a template, infer a licence, or mark QA passed.
export function prepareResearchBindings(project, catalog) {
  return withMaterialBindingTransaction(project,transaction=>prepareBindings(project,catalog,transaction));
}
function prepareBindings(project,catalog,transaction) {
  const file = path.join(project, 'material-binding-plan.json');
  const pendingPlan=!fs.existsSync(file);
  const plan = pendingPlan?{bindings:[],backgrounds:[]}:read(file), shotsFile = path.join(project, 'remotion/shots.json');
  const researchFile = path.join(project, 'material-research-plan.json');
  const shots = read(shotsFile), research = read(researchFile), applied = [], issues = [];
  const publicRoot = fs.realpathSync(path.join(project, 'remotion/public'));
  const inputFile = path.join(project, 'input.txt');
  if (!pendingPlan&&(plan.schema !== 'talkcraft-material-binding-plan-v1' || !Array.isArray(plan.bindings) ||
      !fs.existsSync(inputFile) || plan.inputSha256 !== hash(inputFile))) {
    return {applied, issues: [{code: 'MATERIAL_BINDING_PLAN_STALE', message: '素材绑定计划未绑定当前原稿'}]};
  }
  const entries=plan.bindings.map(entry=>({...entry,internal:!entry.kind}));
  // Current explicit records are still executable after a revision archives its
  // old plan. Never choose an image by filename, search score or first slot.
  for(const row of research.shots||[]){
    for(const binding of row.bindings||[])if(binding.field&&!binding.displayShotId&&
      row.research?.some(r=>r.kind===binding.kind&&r.query===binding.query)&&
      !entries.some(e=>e.shotId===row.shotId&&e.kind===binding.kind&&e.query===binding.query))
      entries.push({...binding,shotId:row.shotId,internal:false});
    for(const binding of row.materialBindings||[])if(!entries.some(e=>e.internal&&e.shotId===row.shotId&&e.field===binding.field))
      entries.push({...binding,shotId:row.shotId,sourceUrl:binding.sourceUrl||binding.url,
        identityReason:binding.identityReason||binding.reason||binding.matchReason,internal:true});
  }
  for (const entry of entries) {
    try {
      const shot = shots.find(s => s.id === entry.shotId);
      const row = research.shots.find(s => s.shotId === entry.shotId);
      const card = catalog.cards.find(c => c.cardId === shot?.shotCard);
      const needs=(row?.research||[]).filter(r=>r.kind===entry.kind&&r.query===entry.query);
      const need=needs[0];
      if (!shot || !row || !entry.internal&&needs.length!==1)
        throw Error('绑定需求与当前镜头素材规划不对应');
      if(entry.internal&&!(row.materialBindings||[]).some(b=>b.field===entry.field&&b.localPath===entry.localPath&&
        b.sha256===entry.sha256&&(b.sourceUrl||b.url)===entry.sourceUrl))
        throw Error('内部资料须与当前编导已明确的文件、槽位、来源和哈希完全对应');
      if(!entry.internal&&(need.displayField&&need.displayField!==entry.field||need.displayShotId&&need.displayShotId!==shot.id))
        throw Error('当前资料规划已明确不同展示槽位，不能自动改绑');
      if (!card?.policy?.media?.[entry.field] || /host/iu.test(entry.field))
        throw Error('只能绑定当前已审卡公开的非人物口型素材槽');
      if (!['image', 'image-or-video'].includes(card.policy.media[entry.field]))
        throw Error('资料绑定仅接受单图片素材槽，视频及列表须走对应处理器');
      if (!entry.localPath || path.isAbsolute(entry.localPath) || /^(?:[a-z]+:|[/\\])/iu.test(entry.localPath))
        throw Error('资料必须是当前工程素材目录内的相对路径');
      const full = fs.realpathSync(path.resolve(publicRoot, entry.localPath));
      const relative = path.relative(publicRoot, full);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(full).isFile())
        throw Error('资料路径越界或不是文件');
      if (!/\.(png|jpe?g|webp)$/iu.test(full) || hash(full) !== entry.sha256)
        throw Error('本地资料类型或SHA-256与核验记录不符');
      if (!/^https:\/\//u.test(entry.sourceUrl || '') || entry.sourceVerified !== true ||
          entry.licenseVerified !== true || !entry.license || !entry.licenseUrl || !entry.identityReason)
        throw Error('缺少已核验的真实来源、身份或授权依据');
      if (!entry.contentLanguage || entry.contentLanguage === 'und' ||
          !/^(zh(?:-[a-z]+)*|zxx)$/iu.test(entry.contentLanguage) && !entry.languageReason)
        throw Error('缺少实际资料语言或采用外文原件的理由');
      const props = shot.templateParams?.cardProps;
      if (!props) throw Error('镜头缺少原卡业务参数');
      const existing = props[entry.field]?.replace(/^remotion\/public\//u, '');
      if (existing && existing !== entry.localPath) throw Error('素材槽已有不同绑定，保留原绑定并返回编导审核');
      const previous = entry.internal?(row.materialBindings||[]).filter(b=>b.field===entry.field):
        (row.bindings || []).filter(b => b.kind === entry.kind && b.query === entry.query);
      if (previous.some(b => b.localPath !== entry.localPath || b.sha256 !== entry.sha256))
        throw Error('已有来源记录冲突，不能自动覆盖');
      if (previous.some(b => b.field && b.field !== entry.field))
        throw Error('已有明确资料槽冲突，不能自动改绑');
      const displays=!entry.internal&&need.entityType==='person'?
        (row.personDisplays||[]).filter(d=>d.entityName===need.entityName):[];
      if(displays.length>1||displays[0]?.role==='core'&&(!displays[0].labelText||
        !String(props[displays[0].labelField]||'').split('\n').includes(displays[0].labelText)))
        throw Error('核心人物资料没有唯一的原卡姓名标签，不能恢复');
      const binding = Object.fromEntries(['kind','query','field','localPath','sha256','sourceUrl','sourceVerified',
        'licenseVerified','license','licenseUrl','identityReason','contentLanguage','languageReason',
        'sourceCoordinates'].filter(k => entry[k] !== undefined).map(k => [k, entry[k]]));
      if(!existing)props[entry.field] = entry.localPath;
      if(!entry.internal){
        row.bindings ??= [];
        if (!previous.length) row.bindings.push(binding);
        else for (const old of previous) old.field = entry.field;
        if(displays.length===1)displays[0].bindingQuery=need.query;
      }else{
        for(const old of previous)Object.assign(old,binding);
      }
      applied.push({shotId: shot.id, field: entry.field, localPath: entry.localPath, sha256: entry.sha256});
    } catch (error) {
      issues.push({shotId: entry.shotId, field: entry.field, code: 'REVIEWED_SOURCE_BINDING_REJECTED', message: error.message});
    }
  }
  for (const entry of plan.backgrounds || []) {
    try {
      const shot=shots.find(s=>s.id===entry.shotId), row=research.shots.find(s=>s.shotId===entry.shotId);
      if (!shot || !row || shot.shotCard!==entry.cardId || !entry.reason)
        throw Error('背景决策必须对应当前原卡并提供具体编导理由');
      if (entry.decision==='omit') {
        if (shot.templateParams?.materialRole==='background') throw Error('不能自动撤销既有真实背景绑定');
        row.backgroundDecision='omit';row.pureTextReason=entry.reason;
      } else if (entry.decision==='use') {
        if (!TEXT_VIDEO_CARDS[shot.shotCard]) throw Error('原卡尚未核对视频底板适配能力，返回编导重选');
        const p=entry.params || {}, full=fs.realpathSync(path.resolve(publicRoot,p.materialSrc || ''));
        const relative=path.relative(publicRoot,full);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) ||
            !/\.(mp4|webm)$/iu.test(full) || !fs.statSync(full).isFile() || hash(full)!==p.materialSha256 ||
            !p.materialSourceId || !p.materialMatchReason || p.backgroundPresentation!=='text-video-v1')
          throw Error('背景缺少当前工程内的真实视频、原来源或匹配哈希');
        if (shot.templateParams.materialSrc && shot.templateParams.materialSrc!==p.materialSrc)
          throw Error('不能自动覆盖既有不同背景');
        const next={...shot.templateParams,materialRole:'background'};
        for(const key of ['materialSrc','materialSha256','materialSourceId','materialMatchReason',
          'materialDurationSec','materialPlaybackRate','materialFit','backgroundPresentation'])next[key]=p[key];
        next.cardProps={...next.cardProps};
        for(const key of Object.keys(TEXT_VIDEO_CARDS[shot.shotCard].colors)) {
          if(entry.colors?.[key]!==undefined)next.cardProps[key]=entry.colors[key];
        }
        assertTextVideoColors({...shot,templateParams:next});
        shot.templateParams=next;row.backgroundDecision='use';row.backgroundReason=entry.reason;
      } else throw Error('正式背景决策只能是use或omit');
      applied.push({shotId:entry.shotId,backgroundDecision:entry.decision});
    }catch(error){issues.push({shotId:entry.shotId,code:'BACKGROUND_PREPARATION_REJECTED',message:error.message});}
  }
  // Preserve successful units, report each rejected unit, and always run the
  // original material/file/source/identity audit afterwards in candidates.
  if (applied.length) {
    const backup=path.join(project,'qa/material-binding-inputs',pendingPlan?'current-explicit-records':hash(file));
    fs.mkdirSync(backup,{recursive:true});
    for(const source of [shotsFile,researchFile]) {
      const target=path.join(backup,path.basename(source));
      if(!fs.existsSync(target))fs.copyFileSync(source,target);
    }
    transaction.commit({'remotion/shots.json':shots,'material-research-plan.json':research});
  }
  fs.mkdirSync(path.join(project, 'qa'), {recursive: true});
  const result = {schema: 'talkcraft-research-binding-v1', applied, issues,pendingPlan,recovered:transaction.recovered, paidCalls: 0, userAcceptance: false};
  write(path.join(project, 'qa/research-binding-result.json'), result);
  return result;
}
