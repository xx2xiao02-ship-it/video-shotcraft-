import {buildCatalog, validateCalls, CONTRACT_VERSION} from '../docs/audits/b-talkcraft-target3/current-contract.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {correctAnchoredSpeechTimes} from './talkcraft-anchored-time-contract.mjs';

const CARD_ALIASES = Object.freeze({
  'lead-word-zoom-assemble': 'typography/lead-word-zoom-assemble',
  'title-demote-to-label': 'typography/title-demote-to-label',
  'chip-grid-single-select-blackout': 'interaction/chip-grid-single-select-blackout',
});

export function canonicalCardId(value, catalog) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (catalog.cards.some(card => card.cardId === raw)) return raw;
  const alias = CARD_ALIASES[raw];
  if (alias && catalog.cards.some(card => card.cardId === alias)) return alias;
  const runtimeBase = raw.replace(/^(?:typography|interaction)\//u, '');
  return catalog.cards.some(card => card.cardId === runtimeBase) ? runtimeBase : raw;
}

// Reuse the locked B contract; never create a parallel catalog or change admission.
export function loadTalkcraftGovernedCatalog(index) {
  const catalog = buildCatalog();
  const speechTimeCorrection=correctAnchoredSpeechTimes(catalog);
  // Correct a local catalog extraction omission from verified upstream code.
  // Missing price is still forbidden: only an explicitly supplied empty string hides it.
  const info=catalog.cards.find(c=>c.cardId==='info-card-assemble');
  const price=info?.fields.find(f=>f.key==='price');
  if(price){
    const wrapper=fs.readFileSync(info.implementation.file),original=fs.readFileSync(info.original.file);
    const hash=b=>createHash('sha256').update(b).digest('hex');
    if(hash(wrapper)!==info.implementation.sha256||hash(original)!==info.original.sha256||
       !/空\s*=\s*不显示/u.test(price.label)||!wrapper.toString().includes('price={price}')||
       !/\{price\s*\?\s*<span/u.test(original.toString()))
      throw Error('信息卡可空价格行的源码证据失效，停止使用本地契约修正');
    price.blankAllowed=true;
    const highlighted=info.fields.find(f=>f.key==='highlightLines');
    if(!highlighted||!wrapper.toString().includes('highlightLines.split(/[,，\\s]+/)'))
      throw Error('信息卡高亮行号解析证据失效');
    highlighted.valueConstraint={format:'one-based-index-list',delimiter:'comma-or-whitespace',references:'lines'};
    catalog.localCorrections=[{cardId:info.cardId,field:'price',blankAllowed:true,
      reason:'源UI明确空值隐藏，组件显式透传并条件渲染；不得补演示价格',source:info.original}];
  }
  const indexed = new Set(index.cards.map(card => card.slug));
  catalog.localCorrections=[...(catalog.localCorrections||[]),speechTimeCorrection];
  const governed = new Set(catalog.cards.map(card => card.cardId));
  const missing = [...indexed].filter(id => !governed.has(id));
  const extra = [...governed].filter(id => !indexed.has(id));
  if (indexed.size !== index.cards.length || governed.size !== catalog.cards.length || missing.length || extra.length)
    throw new Error(`B 模板索引与治理契约不一致：缺少 ${missing.join('、')}；多出 ${extra.join('、')}`);
  return catalog;
}

export function talkcraftEditorialContract(catalog) {
  return {version:CONTRACT_VERSION,productionAdmitted:false,
    cards:catalog.cards.map(card=>({slug:card.cardId,implementationSha256:card.implementation.sha256,
      duration:{fps:card.duration.fps,frames:card.duration.frames,originalFrames:card.duration.originalFrames,variants:card.duration.variants},
      fields:card.fields.map(({key,type,role,writable,min,max,step,options,blankAllowed,valueConstraint})=>
        ({key,type,role,writable,min,max,step,options,blankAllowed,valueConstraint})),
      required:card.policy.required,media:card.policy.media,
      mediaAlternatives:card.policy.mediaAlternatives,
      capabilities:{nativeMedia:card.policy.capabilities.nativeMedia,
        materialDifference:card.policy.capabilities.materialDifference,
        illustrationOnlyWithoutAdapter:card.policy.capabilities.illustrationOnlyWithoutAdapter},
      // Evidence/parser source remains in the locked contract, not duplicated
      // in every model request. Keep all executable DSL constraints intact.
      dsl:Object.fromEntries(Object.entries(card.policy.dsl).map(([key,{source,sourceParsers,...rules}])=>[key,rules]))}))};
}

export function validateTalkcraftDesignProps(shots,{catalog,projectRoot}) {
  const calls=shots.map(shot=>{ const cardId=canonicalCardId(shot.shotCard,catalog); return {id:shot.id,cardId,
    implementationSha256:catalog.cards.find(card=>card.cardId===cardId)?.implementation.sha256,
    props:shot.templateParams?.cardProps,evidence:[]}; });
  const validation=validateCalls({schema:'b-talkcraft-call-v1',calls},{catalog,projectRoot});
  const errors=[],pending=[];
  for(const [i,call]of calls.entries()){
    const card=catalog.cards.find(c=>c.cardId===call.cardId);
    for(const field of card?.fields||[])if(field.valueConstraint?.format==='one-based-index-list'&&Object.hasOwn(call.props||{},field.key)){
      const value=call.props[field.key],rows=call.props[field.valueConstraint.references];
      const indices=typeof value==='string'?value.trim().split(/[,，\s]+/u).map(Number):[];
      const count=typeof rows==='string'?rows.split('\n').filter(s=>s.trim()).length:0;
      if(typeof value!=='string'||!/^\s*[1-9]\d*(?:[,，\s]+[1-9]\d*)*\s*$/u.test(value)||indices.some(n=>n>count))
        errors.push({code:'INDEX_LIST_FORMAT',shotId:shots[i].id,at:`calls[${i}].props.${field.key}`,message:'源码要求1起的要点行号（逗号或空白分隔），不能填原句文字或越界行号'});
    }
  }
  for(const issue of validation.errors){
    const index=Number(issue.at.match(/^calls\[(\d+)\]/)?.[1]);
    const field=issue.at.match(/\.props\.([^.]+)$/)?.[1];
    const card=catalog.cards.find(card=>card.cardId===calls[index]?.cardId);
    const mediaField=field && Object.hasOwn(card?.policy.media||{},field);
    // Material collection and factual evidence remain explicit pending work.
    const deferred=['MEDIA_INVALID','MEDIA_ALTERNATIVE','NUMERIC_EVIDENCE_REQUIRED','ANCHOR_EVIDENCE_REQUIRED'].includes(issue.code) ||
      (issue.code==='REQUIRED_PROP' && mediaField);
    (deferred?pending:errors).push({...issue,shotId:calls[index]?.id??null});
  }
  return {passed:errors.length===0,errors,pending,productionAdmitted:false,
    limitation:'Design field/source validation only; pending media/evidence requires full validation before rendering.'};
}
