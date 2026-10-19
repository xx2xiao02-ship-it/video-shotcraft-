import {titlePalette} from './talkcraft-title-presentation.mjs';
import {THEME} from './theme';
import {useFilmBackground} from './film-background';
import React,{createContext,useContext} from 'react';
import {Img,staticFile} from 'remotion';
import plan from '../presentation-integrity.json';
import {readableInkOnSingleBackground} from './talkcraft-color-contrast.mjs';
export {crossfadeBackground} from './talkcraft-color-contrast.mjs';

const Runtime=createContext<{frame:number;row:any}>({frame:0,row:null});
export const PresentationRuntimeRoot:React.FC<{shotId:string;frame:number;children:React.ReactNode}>=({shotId,frame,children})=>{
 const row=plan.shots.find(s=>s.shotId===shotId);
 if(!row||plan.audit?.passed!==true)throw Error('缺少当前镜头已审批复检的展示修正合同：'+shotId);
 return <Runtime.Provider value={{row,frame}}>{children}</Runtime.Provider>;
};
export const usePresentationRuntime=()=>useContext(Runtime);
export const readableInk=(ink:string,bg:string|number[])=>readableInkOnSingleBackground(ink,bg);
// This is an explicit, verified media inlet inside the original card. Never
// render a grey fallback or infer permission from a URL at playback time.
export const PresentationMedia:React.FC=()=>{
 const {row}=usePresentationRuntime(),m=row?.media;
 if(!m||!m.sourceVerified||!m.licenseVerified)throw Error('演示素材槽缺少已核验真实素材');
 return <div data-presentation-media={m.sha256} style={{width:'100%',height:'100%',position:'relative',overflow:'hidden',background:'#fff'}}>
  <Img src={staticFile(m.localPath.replace(/^remotion\/public\//u,''))} style={{width:'100%',height:'100%',objectFit:'contain'}} />
 </div>;
};
export const ContinuityText:React.FC<{text:string;cut:number;t:number;fontSize:number;ink:string;background:string|number[]}>=({text,cut,t,fontSize,ink,background})=>{
 const {row,frame}=usePresentationRuntime(),c=row?.continuity;
 if(!c||t<cut||frame<c.firstFrame||frame>=c.secondFrame)return null;
 return <div data-presentation-continuity style={{position:'absolute',inset:0,zIndex:5,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
  <div style={{fontSize,fontWeight:800,letterSpacing:3,color:readableInk(ink,background),maxWidth:'88%',textAlign:'center',overflowWrap:'anywhere'}}>{text}</div>
 </div>;
};

// Palette and hierarchy are shared by every task, while the field/word clocks
// remain those of the original card and word-reveal contract.
export function useTitlePresentation(){
 const {row}=usePresentationRuntime(),background=useFilmBackground();
 const palette=titlePalette(THEME,background);
 return {...palette,promote:row?.titleFocus?.primaryField==='sub'};
}
