import React from 'react';
import {AbsoluteFill,Img,OffthreadVideo,staticFile,useVideoConfig} from 'remotion';
import type {TemplateSkin} from './TemplateSkin';
import {skinBackground} from './TemplateSkin';

export type BusinessScreenSource={src:string;kind:'image'|'video';width:number;height:number};
export function assertScreenCardInput(screen:BusinessScreenSource|undefined,words:string[]|undefined,skin:TemplateSkin|undefined) {
  if((screen || words) && (!screen || !skin || !words || words.length!==1 ||
    !words[0].trim() || [...words[0]].length>12)) throw new Error('Screen card requires actual media, a complete title and theme.');
}
export const BusinessScreen:React.FC<{screen:BusinessScreenSource;width:number;height:number;fit?:'cover'|'contain'}>=
  ({screen,width,height,fit='cover'})=>{
    if(!screen?.src || !['image','video'].includes(screen.kind) ||
      !Number.isFinite(screen.width) || !Number.isFinite(screen.height) || screen.width<=0 || screen.height<=0) {
      throw new Error('Business screen needs actual media and finite positive dimensions.');
    }
    const style:React.CSSProperties={display:'block',width,height,objectFit:fit};
    const src=/^(?:https?:|data:|blob:|\/)/.test(screen.src) ? screen.src : staticFile(screen.src);
    return screen.kind==='image' ? <Img src={src} style={style}/> :
      <OffthreadVideo src={src} muted style={style}/>;
  };

export const glowColor=(color:string,alpha:number)=>{
  if(!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Screen theme accent needs a six digit hex color.');
  const rgb=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16));
  return `rgba(${rgb.join(',')},${alpha})`;
};

// Retain native motion while filling portrait with a crop, rather than shrinking the whole scene.
export const BusinessScreenStage:React.FC<{skin:TemplateSkin;label?:string;children:React.ReactNode}>=({skin,label,children})=>{
  const {width,height}=useVideoConfig();
  const scale=Math.max(width/1920,height/1080);
  return <AbsoluteFill style={{background:skinBackground(skin,skin.bg),overflow:'hidden'}}>
    <div style={{position:'absolute',width:1920,height:1080,left:(width-1920*scale)/2,
      top:(height-1080*scale)/2,transform:`scale(${scale})`,transformOrigin:'top left'}}>{children}</div>
    {label && <div style={{position:'absolute',left:40,top:36,padding:'8px 16px',
      background:skin.surface,color:skin.text,fontFamily:skin.fontFamily,fontSize:32}}>{label}</div>}
  </AbsoluteFill>;
};
