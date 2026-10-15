import {chooseReadableText,compositeColor} from './talkcraft-color-contrast.mjs';

// The 960x540 card retains its aspect ratio and native coordinate system.
// Reserve a separate caption band instead of shrinking every card to 64%.
export function cardStageLayout(width,height,{separateMaterial=false}={}){
  if(!(width>0&&height>0))throw Error('画幅尺寸无效');
  const portrait=height>width;
  const top=separateMaterial?height*.55:portrait?height*.20:height*.06;
  const bottom=portrait?height*.73:height*.82;
  const scale=Math.min(width*.90/960,(bottom-top)/540);
  return {scale,left:(width-960*scale)/2,top:top+(bottom-top-540*scale)/2};
}

export function nativeCardSkin({shotId,cardId,humanLayout,cardProps={},keywordEventId}){
  const root=`[data-word-reveal-root=${JSON.stringify(shotId)}]`;
  // Upstream shared.tsx explicitly identifies this as demo context, not motion.
  let css=`${root} .wb-host-silhouette{display:none!important;}`;
  if(cardId==='keyword-pop-highlight'){
    if(humanLayout==='none')
      css+=`${root}>div>div>div:last-child{bottom:auto!important;top:50%;transform:translateY(-50%);}`;
    if(keywordEventId){
      // Reserve the original 1.65 peak scale without modifying its transform,
      // easing, delay, hold, font size or the approved business copy.
      const font=Number(cardProps.fontSize)||34;
      const margin=font*(.36+[...String(cardProps.keyword||'')].length*.65/2);
      css+=`${root} span:has(>[data-word-reveal=${JSON.stringify(keywordEventId)}]){margin-inline:${margin}px!important;}`;
    }
  }
  return css;
}

// A 76% plate can cover footage ranging from black to white. Pick against
// both extremes, retaining the selected colour whenever it is readable.
export function subtitleSkin(theme){
  const surface=theme.surface||'#ffffff';
  const backgrounds=['#000000','#ffffff',theme.background||surface].map(bg=>compositeColor(surface,bg,.76));
  const selected=theme.captionColor||theme.text||'#1a1a1a';
  const pick=chooseReadableText(selected,backgrounds);
  return {color:pick.color,background:pick.backgroundColor||`color-mix(in srgb, ${surface} 76%, transparent)`};
}
