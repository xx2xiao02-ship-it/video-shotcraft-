// Only audited outer plates are skinned. Original source, geometry and clocks stay intact.
export const TEXT_VIDEO_VERSION='text-video-v1';
export const TEXT_VIDEO_CARDS={
 'line-by-line-slide':{source:'gen/line-by-line-slide.tsx',sha256:'57b55474d521ab5219287bc03a9f06e2461fd1e0c522718ef97e698153db7304',colors:{ink:'#171717'}},
 'per-character-rise':{source:'gen/per-character-rise.tsx',sha256:'3c4e65d8064892dc0a15a2b03c45a4f82d5d3e95201145cbedd4908125f14386',colors:{ink:'#171717'}},
 'quote-bracket-pull':{source:'gen/quote-bracket-pull.tsx',sha256:'683288faf619b72e689fb3a493b3e1d2ef8e0dbcbcc78c90094463014068dbdc',colors:{ink:'#1d1d1f'}},
 'soft-blur-in':{source:'gen/soft-blur-in.tsx',sha256:'ca2c362e43682de035b55d41ab6d8fcc534b6c2e5b6c76daf7e73092cdbf2f96',colors:{textColor:'#171717'}},
 'type-contrast-emphasis':{source:'gen/type-contrast-emphasis.tsx',sha256:'5e1a90977f4003002bb4aa45847782e9f594ae0f93a0c5ed6b11201ffcb605a3',colors:{ink:'#111111',accent:'#e65a3b'}},
};
const luminance=hex=>{if(!/^#[\da-f]{6}$/iu.test(hex||''))return null;const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
export function darkBackgroundContrast(color){const a=luminance(color),b=luminance('#474747');return a===null?null:(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
export function assertTextVideoColors(shot){
 const spec=TEXT_VIDEO_CARDS[shot.shotCard];if(!spec)throw Error('文字背景适配模板未核对');
 for(const [field,fallback]of Object.entries(spec.colors)){const ratio=darkBackgroundContrast(shot.templateParams?.cardProps?.[field]??fallback);if(ratio===null||ratio<4.5)throw Error(`${shot.id} ${field} 必须明确填写与黑压背景对比度足够的浅色`);}
}
export function textVideoSkin(shot){
 if(shot?.templateParams?.backgroundPresentation!==TEXT_VIDEO_VERSION)return '';
 if(!TEXT_VIDEO_CARDS[shot.shotCard])throw Error(`${shot.id} 模板尚未核对视频背景改造能力，请比较其他已审模板`);
 assertTextVideoColors(shot);
 return '[data-talkcraft-text-video="text-video-v1"] > div { background: transparent !important; }';
}
export function hasVideoBackground(shot){
 const p=shot?.templateParams||{};
 return p.materialRole==='background'&&/\.(mp4|webm|mov|m4v)$/iu.test(p.materialSrc||'')&&!/^(?:https?:|data:)/iu.test(p.materialSrc||'')&&
  !!String(p.materialSourceId||'').trim()&&!!String(p.materialMatchReason||'').trim()&&
  (p.backgroundPresentation==='theme-wash-v1'&&shot.shotCard==='chapter-progress-list'&&p.cardProps?.bg==='#ffffff00'||
   p.backgroundPresentation===TEXT_VIDEO_VERSION&&!!TEXT_VIDEO_CARDS[shot.shotCard]);
}
export function checkTextVideoCycle(shots,demands,{openingShotCount=3}={}){
 const issues=[],windows=[];let chain=[];
 const ordered=shots.every(s=>Number.isFinite(Number(s.start??s.startSec)))?[...shots].sort((a,b)=>Number(a.start??a.startSec)-Number(b.start??b.startSec)):shots;
 for(const [position,shot] of ordered.entries()){
  if(position<openingShotCount){chain=[];continue;}
  if(!demands.find(d=>d.shotId===shot.id)?.considerBackground){chain=[];continue;}
  chain.push(shot);if(chain.length<3)continue;
  const group=chain.slice(-3),bound=group.filter(hasVideoBackground).map(s=>s.id);
  windows.push({shotIds:group.map(s=>s.id),videoShotIds:bound});
  if(!bound.length)issues.push({code:'TEXT_VIDEO_CYCLE_REQUIRED',shotId:shot.id,shotIds:group.map(s=>s.id),message:'连续三个纯文字镜头内至少一个须实际绑定真实视频背景；省略理由、图片及检索候选不能替代'});
 }
 return {passed:!issues.length,issues,windows};
}
