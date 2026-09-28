// Conservative B0 scene selection. Do not claim Gallery-scale semantic planning.
const LIST_MARKERS = /(?:第一|第二|第三|首先|其次|最后|一是|二是|三是|[一二三]、|\d+[、.．])/gu;
const VOICE = /(?:(?:声纹).*(?:起伏|跟随|响应|变化)|(?:真实)?配音.*(?:起伏|驱动|同步)|(?:声音|音频).*(?:起伏|驱动|同步|波形)|(?:语音|朗读|音色|TTS))/iu;
const COMPARE = /(?:相比|对比|而是|却|但是|不同|区别|反而|比起|一边.*另一边)/u;
const CLOSE = /(?:总之|因此|所以|最后|记住|归根结底|这就是|综上)/u;
const ROWS = /(?:流程|步骤|顺序|过程)/u;

export function planScenes(segments, timingMethod) {
  return segments.map((segment, index) => {
    const text = segment.text;
    const markers = [...text.matchAll(LIST_MARKERS)];
    let template = 'statement';
    let reason = '一般陈述使用中性字卡，不推断缺失素材';
    let parts = [];
    const listParts = markers.map((marker, i) => text.slice(marker.index, markers[i + 1]?.index ?? text.length).trim());
    const rowParts = text.split(/[:：]/u).slice(1).join('').split(/[，,、]/u).map(part => part.trim().replace(/[。！？!?；;]+$/u, '')).filter(Boolean);
    if (ROWS.test(text) && rowParts.length >= 3 && rowParts.length <= 5 && rowParts.every(part => part.length <= 24)) {
      parts = rowParts;
      template = 'rows'; reason = '明确讲解流程，按 row-embed 的逐行落位节奏呈现';
    } else if (listParts.length >= 2 && listParts.length <= 3 && listParts.every(part => part.length <= 24)) {
      parts = listParts;
      template = 'list'; reason = '含两到三项明确列举，且每项可读，按原文子句制作信息卡';
    } else if (VOICE.test(text)) {
      template = 'waveform'; reason = '原句明确讨论声音，展示真实配音声纹';
    } else if (/[？?]/u.test(text)) {
      template = 'question'; reason = '原句是问句，突出提问';
    } else if (COMPARE.test(text)) {
      template = 'comparison'; reason = '原句含明确对比或转折关系';
    } else if (CLOSE.test(text) && index > 0) {
      template = 'closing'; reason = '原句有明确收束语义';
    } else if (index === 0) {
      template = 'intro'; reason = '首句承担引入，使用人物示意与原文';
    }
    const galleryCard = ({intro:'type-assembly-moves / split-text-stagger', waveform:'voice-waveform-live', rows:'row-embed', list:'list-reveal'})[template] || null;
    return {...segment, template, galleryCard, parts, reason, timingMethod};
  });
}
