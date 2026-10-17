import fs from 'node:fs';
import {createHash} from 'node:crypto';

// The words DSL exposes speech timestamps, not CONFIG animation constants.
// Apply only to this source-verified field; other timed DSLs remain frozen.
export function correctAnchoredSpeechTimes(catalog) {
  const card=catalog.cards.find(c=>c.cardId==='type-contrast-emphasis');
  const field=card?.fields.find(f=>f.key==='words'),rule=card?.policy.dsl.words;
  if(!card||!field||rule?.syntax!=='anchored-words'||rule.role!=='anchored-content'||
     field.writable!==true||JSON.stringify(rule.fixedColumns)!=='[1]')
    throw Error('词级语音时间契约结构变化，停止使用时间字段修正');
  const sha=b=>createHash('sha256').update(b).digest('hex');
  for(const ref of [card.implementation,card.original])
    if(sha(fs.readFileSync(ref.file))!==ref.sha256)throw Error('词级语音时间源码证据失效');
  const source=fs.readFileSync(card.implementation.file,'utf8');
  if(!source.includes('const beat = Number(parts[1]) || 0;')||
     !source.includes('const list = parseWords(words);')||
     !source.includes('startDelay = 0.15')||!field.label.includes('语音时刻'))
    throw Error('原卡词级语音参数解析证据失效');
  // Preserve the previous effective row capacity; only unlock the seconds column.
  const rowCount=field.default.split('\n').length;
  rule.fixedColumns=[];
  rule.minRows=Math.max(rule.minRows??1,rowCount);
  rule.maxRows=Math.min(rule.maxRows??Infinity,rowCount);
  rule.timeBasis='speech-word-anchor-seconds';
  return {cardId:card.cardId,field:'words',column:1,role:'speech-time-anchor',
    source:card.implementation,reason:'公开words参数中的秒数来自本片字级锚点；原卡动效常量及其他门禁保持'};
}
