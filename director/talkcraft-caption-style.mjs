// B-mode only. Adapt the approved keyword card's typography and pop curve to
// the subtitle layer; do not move the scene, audio or native character clock.
export const B_CAPTION_STYLE={id:'keyword-pop-highlight',name:'关键词色块字幕'};
export function captionTheme(theme){
 // These are the frozen film tokens, never the desktop UI theme or gallery demo.
 return {text:theme.text||'#1a1a1a',keyword:theme.captionColor||theme.surface||'#ffffff',
  panel:theme.accentPrimary||theme.accentSecondary||'#1a4a8a',surface:theme.surface||'#ffffff'};
}
export function captionCardProps(cardId,props,theme){
 if(cardId!=='keyword-pop-highlight')return {...props};
 const t=captionTheme(theme);
 // The approved parameterized card exposes these color fields. No geometry or timing changes.
 return {...props,ink:t.text,kwColor:t.keyword,blockColor:t.panel};
}
const clean=text=>String(text??'').replace(/[\s\p{P}]/gu,'');
export function captionKeyword(line,events){
 const text=clean(line.text);
 for(const e of events||[]){
  const word=clean(e.text);
  if(e.field!=='keyword'||e.role!=='spoken'||!word||!Number.isFinite(e.spokenSec)||e.spokenSec<line.start||e.spokenSec>=line.end)continue;
  const at=text.indexOf(word);
  if(at<0||text.indexOf(word,at+1)>=0)continue;
  return {before:text.slice(0,at),keyword:word,after:text.slice(at+word.length),start:e.spokenSec};
 }
 return null;
}
export function captionPop(elapsed){
 if(elapsed<0)return {scale:1,rotate:0,active:false};
 const p=Math.max(0,Math.min(1,elapsed/.18));
 if(elapsed<.24)return {scale:1+(1.65-1)*(1-Math.pow(1-p,5)),rotate:-8+10*(1-Math.pow(1-p,5)),active:true};
 const q=Math.max(0,Math.min(1,(elapsed-.24)/.22))-1;
 const ease=1+3.5*q*q*q+2.5*q*q;
 return {scale:1.65+(1.15-1.65)*ease,rotate:2*(1-ease),active:true};
}
