import {buildCatalog, validateCalls, CONTRACT_VERSION} from '../docs/audits/b-talkcraft-target3/current-contract.mjs';

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
  const indexed = new Set(index.cards.map(card => card.slug));
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
      fields:card.fields.map(({key,type,role,writable,min,max,step,options,blankAllowed})=>
        ({key,type,role,writable,min,max,step,options,blankAllowed})),
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
