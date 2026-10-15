import React,{useEffect,useState} from 'react';
import {useCurrentFrame,useVideoConfig,delayRender,continueRender} from 'remotion';
export const ContrastAudit:React.FC<{mask?:boolean}>=({mask=false})=>{
 const frame=useCurrentFrame(),{width,height}=useVideoConfig(),[handle]=useState(()=>delayRender('Measure actual text and background'));
 useEffect(()=>{const token=requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const origin=document.querySelector('[data-composition-root]')?.getBoundingClientRect();if(!origin)throw Error('Missing composition origin');
  const nodes=Array.from(document.querySelectorAll<HTMLElement|SVGElement>('[data-word-reveal],[data-readable-caption]'));
  const rows=nodes.flatMap(el=>{
   let opacity=1,brightness=1;const filters:string[]=[];for(let n:Element|null=el;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return [];opacity*=Number(s.opacity);
    if(s.filter!=='none'){filters.push(s.filter);for(const m of s.filter.matchAll(/brightness\(([\d.]+)(%)?\)/g))brightness*=Number(m[1])/(m[2]?100:1);}}
   if(opacity<.05)return [];
   const style=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
   return Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0&&r.right>origin.left&&r.bottom>origin.top&&r.left<origin.right&&r.top<origin.bottom).map(r=>({
    id:el.dataset.wordReveal||'caption',text:el.textContent,color:el.namespaceURI==='http://www.w3.org/2000/svg'?style.fill:style.color,opacity,brightness,filters,
    rect:{left:(r.left-origin.left)*width/origin.width,top:(r.top-origin.top)*height/origin.height,width:r.width*width/origin.width,height:r.height*height/origin.height}}));
  });
  console.log('TALKCRAFT_CONTRAST_AUDIT:'+JSON.stringify({frame,rows}));
  if(mask){const s=document.createElement('style');s.dataset.contrastMask='true';s.textContent='[data-word-reveal],[data-readable-caption]{color:transparent!important;fill:transparent!important;text-shadow:none!important;-webkit-text-stroke-color:transparent!important}';document.head.appendChild(s);}
  requestAnimationFrame(()=>continueRender(handle));
 }));return()=>{cancelAnimationFrame(token);document.querySelectorAll('[data-contrast-mask]').forEach(n=>n.remove());};},[frame,handle,mask]);return null;
};
