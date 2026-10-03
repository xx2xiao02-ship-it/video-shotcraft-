export function resolveRuntimeCardId(card, runtimeIds, {legacyDirectoryFallback=false}={}) {
  if (!card) return null;
  if (runtimeIds.includes(card)) return card;
  const candidates=runtimeIds.filter(id=>id.startsWith(card+'/'));
  if (legacyDirectoryFallback) return candidates[0] || null;
  if (candidates.length) throw new Error(`镜头卡 ${card} 必须指定完整变体ID：${candidates.join('、')}`);
  throw new Error(`镜头卡 ${card} 没有精确运行注册，已阻止占位回退`);
}
