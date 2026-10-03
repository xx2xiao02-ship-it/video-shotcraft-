import crypto from 'node:crypto';

export function restoreBaselineSource(file,source,expected) {
  const newline=source.includes('\r\n') ? '\r\n' : '\n';
  let restored=source;
  if(file.endsWith('DynamicVideo.tsx')) restored=restored.replace(/            narration: shot\.text,\r?\n/,'');
  if(file.endsWith('TemplateAdapter.tsx')) {
    restored=restored.replace(/import \{NUMERIC_CARD_CONTRACTS,validateNumericCardParams,assertNumericCardDuration\} from '..\/..\/director\/numeric-card-contracts\.mjs';\r?\n/,'')
      .replace(/  narration\?: string;\r?\n/,'');
    const start=restored.indexOf('  if (NUMERIC_CARD_CONTRACTS[shotCard]) {');
    const end=restored.indexOf('  const graphic = GRAPHIC_CONTRACTS[shotCard];',start);
    if(start<0 || end<0) throw new Error('Missing added numeric adapter block');
    restored=restored.slice(0,start)+restored.slice(end);
    const current=["    propsMap: { text: 'title', durationInFrames: 'durationInFrames' },","    textAs: 'raw',",
      "    note: '业务数值、单位与标签由结构化参数提供；原文证据和长版阅读停留必须通过校验',"].join(newline);
    const previous=["    propsMap: { text: 'value', durationInFrames: 'durationInFrames' },",
      '    enabled: false, // 数据牌组件：保留演示数字，文案走字幕浮层',"    note: '数据展示型，暂不注入整句',"].join(newline);
    if(!restored.includes(current))throw new Error('Missing changed numeric contract');
    restored=restored.replace(current,previous);
  }
  if(crypto.createHash('sha256').update(restored).digest('hex')!==expected)
    throw new Error(`Reconstructed baseline hash mismatch: ${file}`);
  return restored;
}
