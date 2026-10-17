import {chooseReadableText,compositeColor} from './talkcraft-color-contrast.mjs';

// The 960x540 card retains its aspect ratio and native coordinate system.
// Default full-scene cards use the entire canvas; never shrink for captions.
export function cardStageLayout(width,height,{separateMaterial=false}={}){
  if(!(width>0&&height>0))throw Error('画幅尺寸无效');
  if(!separateMaterial){
    const scale=Math.min(width/960,height/540);
    return {scale,left:(width-960*scale)/2,top:(height-540*scale)/2};
  }
  const portrait=height>width;
  const top=separateMaterial?height*.55:portrait?height*.20:height*.06;
  const bottom=portrait?height*.73:height*.82;
  const scale=Math.min(width*.90/960,(bottom-top)/540);
  return {scale,left:(width-960*scale)/2,top:top+(bottom-top-540*scale)/2};
}

// Explicit storyboard skin variant. It never rewrites card props or motion.
// Default scenes retain their approved layout until a revised plan opts in.
export const READABILITY_LAYOUT='mobile-readable-v1';
export function nativeCardSkin({shotId,cardId,humanLayout,cardProps={},keywordEventId,readabilityLayout}){
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
  if(readabilityLayout){
    if(readabilityLayout!==READABILITY_LAYOUT)throw Error('未知原卡可读性蒙皮：'+readabilityLayout);
    const field=(name)=>`${root} :is(div,span,small,text):has(>[data-word-field=${JSON.stringify(name)}])`;
    const rules={
      'logo-enter':`${root} div:has(>div>[data-word-field="brand"]){padding:4px 4px 4px 24px;} ${field('brand')}{line-height:1.4!important;} ${field('tag')}{font-size:42px!important;letter-spacing:0!important;line-height:1.4!important;white-space:normal!important;max-width:650px;}`,
      'numbered-step-stack':`${root} .nss-no,${root} .nss-txt{font-size:42px!important;line-height:1.3!important;}`,
      'black-slam-transition':`${field('tag')}{font-size:42px!important;line-height:1.3!important;}`,
      'chevron-lower-third':`${field('chipText')}{font-size:42px!important;line-height:1.3!important;} ${root} div:has(>${'span'}>[data-word-field="chipText"]){height:64px!important;}`,
      'info-term-card':`${root} .itc-card{gap:18px!important;} ${root} .itc-term{font-size:44px!important;line-height:1.3!important;} ${root} .itc-term small{display:block;font-size:42px!important;margin-left:0!important;line-height:1.3!important;} ${root} .itc-desc{font-size:42px!important;line-height:1.35!important;white-space:pre-line;overflow-wrap:anywhere;} ${root} .itc-icon{width:64px;height:64px;font-size:42px;}`,
      'behind-text-title':`${field('sub')}{font-size:42px!important;letter-spacing:1px!important;}`,
      'split-60-40-story':`${root} .s64-ttl{font-size:42px!important;line-height:1.3!important;} ${root} .s64-chip{font-size:42px!important;}`,
      'step-timeline-vertical':`${root} .stv-wrap{width:800px!important;} ${root} .stv-text{width:760px!important;} ${root} .stv-kicker,${root} .stv-title{font-size:42px!important;line-height:1.3!important;}`,
      'source-converge':`${root} .scv-ttl,${root} .scv-node text,${root} .scv-hub text,${root} .scv-cap{font-size:42px!important;}`,
      'line-by-line-slide':humanLayout==='person'?`${root} div:has(>span>span>[data-word-field="lines"]){right:40%!important;}`:'',
      'quote-card':`${field('source')}{font-size:42px!important;line-height:1.3!important;letter-spacing:1px!important;} ${humanLayout==='person'?`${root} div:has(>div>[data-word-field="lines"]){right:38%!important;padding:0 18px!important;}`:''}`,
    };
    css+=rules[cardId]||'';
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

// This upstream card already owns the spoken caption. Suppress only an exact
// duplicate external caption, never unrelated narration or missing card text.
export function cardOwnsNarrationCaption(shot,text,phrases=[]){
  if(shot?.shotCard!=='keyword-pop-highlight')return false;
  const p=shot.templateParams?.cardProps||{};
  const normalize=s=>String(s??'').replace(/[\s\p{P}]/gu,'');
  const card=normalize(String(p.textBefore??'')+String(p.keyword??'')+String(p.textAfter??''));
  const current=normalize(text);
  if(!card||!current)return false;
  if(card===current)return true;
  // Multi-phrase captions may be suppressed only when the card carries the
  // complete shot narration. A substring alone is not proof of ownership.
  if(!Number.isFinite(shot.startSec)||!Number.isFinite(shot.durationSec))return false;
  // Character timestamps use milliseconds; cut bounds retain sample precision.
  const startMs=Math.round(shot.startSec*1000),endMs=Math.round((shot.startSec+shot.durationSec)*1000);
  const lines=phrases.filter(p=>Math.round(p.start*1000)>=startMs&&Math.round(p.start*1000)<endMs);
  return lines.some(p=>normalize(p.text)===current)&&
    card===lines.map(p=>normalize(p.text)).join('');
}
