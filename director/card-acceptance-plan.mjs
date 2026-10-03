export function cardAcceptancePlan(audit) {
  if (audit.counts.cards!==157 || audit.counts.variants!==214) throw new Error('Unexpected gallery cardinality');
  const ids=new Set(audit.registrations.map(item=>item.id));
  const plan=audit.cards.flatMap(card=>card.variants.map(variant=>{
    if (variant.runtimeId && (!ids.has(variant.runtimeId) || !variant.component)) throw new Error('Variant runtime binding is incomplete');
    return {key:`${card.id}:${variant.key}`,card:card.id,variant:variant.key,label:variant.label,
      runtimeId:variant.runtimeId,component:variant.component,mappingEvidence:variant.mappingEvidence,
      reference:card.source,referenceSha256:card.sourceSha256,candidates:variant.candidateRuntimeIds,
      status:variant.runtimeId ? 'ready-for-frame-smoke' : 'source-unresolved'};
  }));
  if (plan.length!==214 || new Set(plan.map(item=>item.key)).size!==214) throw new Error('Variant plan must retain gallery entries 1:1');
  return plan;
}
