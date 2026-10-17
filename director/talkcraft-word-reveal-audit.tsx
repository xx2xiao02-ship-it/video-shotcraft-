import React,{useEffect,useState} from 'react';
import {useCurrentFrame,useVideoConfig,delayRender,continueRender} from 'remotion';
import reveals from '../word-reveals.json';
import beats from '../reveal-units.json';
import {SHOTS,FPS} from './shots';
export const WordRevealAudit:React.FC=()=>{
 const frame=useCurrentFrame(),{width,height}=useVideoConfig(),[handle]=useState(()=>delayRender('Check spoken text visibility'));
 useEffect(()=>{
  const pending=requestAnimationFrame(()=>requestAnimationFrame(()=>{
   // Narration units retain their raw boundaries; a registered visual pause
   // still belongs to the preceding rendered shot and must also be audited.
   const visual=SHOTS.find(s=>frame>=Math.round(s.startSec*FPS)&&frame<Math.round((s.startSec+s.durationSec)*FPS));
   const beat=beats.find(b=>frame>=b.startFrame&&frame<b.endFrame)||beats.find(b=>b.id===visual?.id);
   const root=document.querySelector('[data-word-reveal-root="'+beat?.id+'"]');
   const visible=(el:Element)=>{for(let n:Element|null=el;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.05)return false;}
    const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<width&&r.bottom>0&&r.top<height;};
   const layoutIssues:{id:string;reason:string;mobilePx?:number}[]=[];
   const minimum=Number((root as HTMLElement)?.dataset.mobileMinText||0);
   if(root)for(const placeholder of root.querySelectorAll('.wb-host-silhouette'))
     if(visible(placeholder))layoutIssues.push({id:String(beat?.id),reason:'演示人物占位未替换'});
   const events=reveals.events.filter(e=>e.beatId===beat?.id).map(e=>{
    const nodes=root?Array.from(root.querySelectorAll('[data-word-reveal="'+e.id+'"]')):[];
    const shown=nodes.filter(visible);
    if(minimum)for(const node of shown){
      const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();
      if(rect.left<0||rect.top<0||rect.right>width||rect.bottom>height)layoutIssues.push({id:e.id,reason:'文字超出视频画幅'});
      // Inspect settled text in final camera coordinates. Entry transitions
      // retain their own motion; their first 0.4s is not a safe-zone hold.
      const safe=64*Math.min(width/1920,height/1080);
      if(frame>=e.globalFrame+12&&(rect.left<safe||rect.top<safe||rect.right>width-safe||rect.bottom>height-safe))
        layoutIssues.push({id:e.id,reason:'停留文字未留足画幅安全边距'});
      for(let p=node.parentElement;p;p=p.parentElement){const style=getComputedStyle(p),clip=p.getBoundingClientRect();
        if(/hidden|clip/.test(style.overflowX)&& (rect.left<clip.left-1||rect.right>clip.right+1)||/hidden|clip/.test(style.overflowY)&&(rect.top<clip.top-1||rect.bottom>clip.bottom+1))layoutIssues.push({id:e.id,reason:'文字被祖先容器裁切'});
      }
      const el=node as HTMLElement,box=el.getBoundingClientRect();
      const svg=node.namespaceURI==='http://www.w3.org/2000/svg'?node as SVGGraphicsElement:null;
      const matrix=svg?.getScreenCTM();
      const scale=matrix?Math.hypot(matrix.c,matrix.d):el.offsetHeight?box.height/el.offsetHeight:1;
      const mobilePx=parseFloat(getComputedStyle(el).fontSize)*scale*390/width;
      if(mobilePx<minimum-.1)layoutIssues.push({id:e.id,reason:'手机正文低于声明的可读字号',mobilePx});
    }
    return {id:e.id,text:e.text,expectedFrame:e.globalFrame,deferred:Boolean(e.deferredTo),found:nodes.length>0,visible:shown.length>0};
   });
   // Check every card, not just the keyword pop: a larger subtitle or a
   // multiline title can also cover a different planned text event. Client
   // rects avoid treating the empty space between separate lines as a glyph.
   if(root){
    const glyphs=Array.from(root!.querySelectorAll<HTMLElement>('[data-word-reveal]')).filter(visible);
    for(let a=0;a<glyphs.length;a++)for(let b=a+1;b<glyphs.length;b++){
     if(glyphs[a].dataset.wordReveal===glyphs[b].dataset.wordReveal)continue;
     if(glyphs[a].contains(glyphs[b])||glyphs[b].contains(glyphs[a]))continue;
     const rects=(el:Element)=>{const r=document.createRange();r.selectNodeContents(el);return Array.from(r.getClientRects());};
     if(rects(glyphs[a]).some(x=>rects(glyphs[b]).some(y=>Math.min(x.right,y.right)-Math.max(x.left,y.left)>3&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>4)))
       layoutIssues.push({id:glyphs[a].dataset.wordReveal+' / '+glyphs[b].dataset.wordReveal,reason:'不同文字事件相互覆盖'});
    }
   }
   const unplanned:string[]=[];
   if(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let n=w.nextNode();n;n=w.nextNode()){
    const el=n.parentElement;if(el&&!el.closest('style,script,[data-word-suppressed],[data-digital-human],[data-word-reveal]')&&(!el.closest('svg')||el.closest('text,tspan'))&&visible(el)&&/[\p{L}\p{N}]/u.test(n.textContent??''))unplanned.push(n.textContent!);
   }}
   console.log('TALKCRAFT_WORD_REVEAL_AUDIT:'+JSON.stringify({frame,beatId:beat?.id,events,unplanned,layoutIssues,native:Boolean(minimum),contentVisible:events.some(e=>e.visible)}));continueRender(handle);
  }));return ()=>cancelAnimationFrame(pending);
 },[frame,handle]);return null;
};
