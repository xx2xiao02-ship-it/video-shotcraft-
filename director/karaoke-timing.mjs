export const KARAOKE_CARD='typography/type-rhythm-sync/karaoke-fill-sync';
const normalize=text=>String(text).replace(/[\s，。！？!?,.；;：:、"“”]/gu,'');

export function validateKaraokeTimings(words,lines,frames){
  if(!Number.isInteger(frames)||frames<60||!Array.isArray(lines)||lines.length<1||lines.length>6||lines.some(text=>typeof text!=='string'||!text.trim()||[...text].length>6)||
    !Array.isArray(words)||words.length!==lines.length) throw new Error('卡拉OK需要1至6个完整词组及一一对应的真实语音时间');
  let previous=0;
  for(const [i,word] of words.entries()){
    if(word?.text!==lines[i]||!Number.isInteger(word.start)||!Number.isInteger(word.end)||
      word.start<previous||word.end<=word.start||word.end>frames-20||word.line!==Math.floor(i/3))
      throw new Error('卡拉OK词序、时间区间或至少20帧收尾无效');
    previous=word.end;
  }
  return words.map(word=>({...word}));
}

export function deriveKaraokeTimings(covered,lines,frames){
  const fromFrame=covered[0]?.fromFrame;
  if(!Number.isInteger(fromFrame)) throw new Error('卡拉OK缺少镜头起始帧');
  const source=covered.flatMap(segment=>{
    if(!Array.isArray(segment.words)||!segment.words.length) throw new Error('卡拉OK缺少真实词级时间戳；禁止均分时间');
    return segment.words;
  });
  let previousEnd=-Infinity;
  for(const word of source){
    if(typeof word.text!=='string'||!normalize(word.text)||!Number.isFinite(word.start)||!Number.isFinite(word.end)||
      word.start<0||word.start<previousEnd||word.end<=word.start) throw new Error('卡拉OK语音时间戳无效，单位必须为全片秒');
    previousEnd=word.end;
  }
  if(source.map(word=>normalize(word.text)).join('')!==lines.map(normalize).join(''))
    throw new Error('卡拉OK必须完整消费本镜旁白词表，禁止截词或丢字');
  let cursor=0;
  const words=lines.map((text,i)=>{
    const begin=cursor,target=normalize(text);let joined='';
    while(cursor<source.length&&joined.length<target.length) joined+=normalize(source[cursor++].text);
    if(joined!==target) throw new Error('卡拉OK词组不能切开原时间戳token');
    return {text,start:Math.round(source[begin].start*30)-fromFrame,
      end:Math.round(source[cursor-1].end*30)-fromFrame,line:Math.floor(i/3)};
  });
  return validateKaraokeTimings(words,lines,frames);
}
