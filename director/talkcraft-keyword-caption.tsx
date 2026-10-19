import React from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from 'remotion';
import emphasis from '../caption-emphasis.json';
import {captionEmphasisForLine} from './talkcraft-caption-emphasis.mjs';
import {B_CAPTION_STYLE,captionTheme,captionPop,captionOutlineStyle} from './talkcraft-caption-style.mjs';
import {THEME} from './theme';
import {SHOTS} from './shots';
import {backgroundCaptionTheme} from './talkcraft-background-presentation.mjs';

export const KeywordCaption:React.FC<{line:{text:string;start:number;end:number}}>=({line})=>{
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
 const now=frame/fps;
 const shot=SHOTS.find(s=>now>=s.startSec&&now<s.startSec+s.durationSec);
 const colors=captionTheme(backgroundCaptionTheme(shot,THEME));
 const keyword=captionEmphasisForLine(line,emphasis.events),motion=captionPop(frame/fps-(keyword?.start??Infinity));
 return <AbsoluteFill data-caption-style={B_CAPTION_STYLE.id} style={{justifyContent:'flex-end',alignItems:'center',pointerEvents:'none'}}>
  <div style={{maxWidth:'88%',marginBottom:height*.06,padding:'8px 18px',textAlign:'center',
   fontFamily:'var(--sc-font-family)',fontWeight:600,fontSize:Math.min(width/960,height/540)*34,
   lineHeight:1.4,color:colors.text,overflowWrap:'anywhere',...(captionOutlineStyle(Math.min(width/960,height/540),colors.text) as React.CSSProperties)}}>
   {keyword?<>{keyword.before}<span style={{display:'inline-block',position:'relative',zIndex:0,margin:`0 ${Math.max(.36,keyword.keyword.length*.65/2)}em`,padding:'.04em .18em',fontWeight:800,
    color:motion.active?colors.keyword:colors.text,
    textShadow:captionOutlineStyle(Math.min(width/960,height/540),motion.active?colors.keyword:colors.text).textShadow,
    transformOrigin:'50% 80%',transform:`rotate(${motion.rotate}deg) scale(${motion.scale})`}}><span aria-hidden="true" style={{position:'absolute',inset:0,zIndex:-1,
     background:motion.active?colors.panel:'transparent',borderRadius:'.14em',transform:'skewX(-6deg)'}}/>{keyword.keyword}</span>{keyword.after}</>:line.text}
  </div>
 </AbsoluteFill>;
};
