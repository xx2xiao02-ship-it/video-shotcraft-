import {chooseReadableText,minimumContrast} from './talkcraft-color-contrast.mjs';
const clean=s=>String(s??'').replace(/[\s\p{P}]/gu,'');
// Only a literal contrast/correction pair already spoken in this same shot can
// promote an existing subtitle. No new words, field swaps or anchor changes.
export function titleFocus(shot,sentences=[]){
 const p=shot.templateParams?.cardProps||{};
 if(shot.shotCard!=='behind-text-title')return null;
 const spoken=clean(sentences.slice(shot.firstSentence,shot.lastSentence+1).map(s=>s.text??'').join(''));
 const title=clean(p.title),sub=clean(p.sub);
 const correction=title.includes('不是')&&sub.includes('才是')&&title&&sub&&spoken.includes(title)&&spoken.includes(sub);
 return {primaryField:correction?'sub':'title',secondaryField:correction?'title':'sub',
  reason:correction?'same-shot-literal-contrast-and-correction':'declared-title',changesText:false,changesAnchors:false};
}
export function titlePalette(theme,background){
 const unknown=background?.kind==='image';
 const backgrounds=unknown?['#ffffff']:background?.kind==='paper'?['#afa99f','#f6f3ed']:[background?.color||theme.background];
 const accent=[theme.accentPrimary,theme.accentSecondary].find(c=>c&&minimumContrast(c,backgrounds)>=4.5);
 const face=chooseReadableText(accent||theme.text,backgrounds);
 const secondary=chooseReadableText(theme.text,backgrounds);
 return {face:face.color,secondary:secondary.color,plate:unknown?'#ffffff':face.backgroundColor||secondary.backgroundColor,
  minimum:4.5,backgrounds};
}
