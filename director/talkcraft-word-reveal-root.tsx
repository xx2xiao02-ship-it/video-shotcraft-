import React,{useLayoutEffect,useRef} from 'react';
import {useCurrentFrame} from 'remotion';
import reveals from '../word-reveals.json';
import readability from '../text-readability.json';
import {textOccurrences} from './text-occurrences.mjs';

const clean=(s:string)=>s.replace(/[\s*・，。！？：；、,.!?;:「」《》“”‘’]/gu,'');
const SVG_NS='http://www.w3.org/2000/svg';
const wrapText=(node:Text)=>node.parentElement?.namespaceURI===SVG_NS
  ? document.createElementNS(SVG_NS,'tspan') : document.createElement('span');
// Wrap only text nodes. Inline spans retain the card's geometry, native animation and media.
// The original text node remains intact, so React can still update it on frame seeks.
export const WordRevealRoot:React.FC<{beatId:string;hiddenTexts?:string[];mobileMinTextPx?:number;cardId?:string;children:React.ReactNode}>=({beatId,hiddenTexts=[],mobileMinTextPx,cardId,children})=>{
  const root=useRef<HTMLDivElement>(null),frame=useCurrentFrame();
  useLayoutEffect(()=>{
    const container=root.current;if(!container)return;
    const events=reveals.events.filter(e=>e.beatId===beatId);
    {
      const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
      const chars:{node:Text;offset:number;ch:string}[]=[];
      const literalChars:{node:Text;offset:number;ch:string}[]=[];
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        const text=node as Text;if(text.parentElement?.closest('style,script,[data-digital-human],[data-word-reveal],[data-word-suppressed]'))continue;
        if(text.parentElement?.closest('svg')&&!text.parentElement.closest('text,tspan'))continue;
        if(hiddenTexts.some(s=>clean(s)===clean(text.data))){const span=wrapText(text);span.dataset.wordSuppressed='true';span.style.visibility='hidden';text.parentNode!.insertBefore(span,text);span.appendChild(text);continue;}
        // DOM splitText offsets are UTF-16 positions, including surrogate pairs.
        for(let offset=0;offset<text.data.length;){const ch=String.fromCodePoint(text.data.codePointAt(offset)!);for(let i=0;i<ch.length;i++){
          const entry={node:text,offset:offset+i,ch:ch[i]};
          if(clean(ch))chars.push(entry);
          if(!/\s/u.test(ch))literalChars.push(entry);
        }offset+=ch.length;}
      }
      const content=chars.map(c=>c.ch).join(''),assign=new Map<Text,Map<number,string>>();
      // Longest phrases claim their characters first (e.g. replacement value vs its old substring).
      for(const e of [...events].sort((a,b)=>clean(b.text).length-clean(a.text).length)){
        const normalized=clean(e.text),text=normalized||e.text.replace(/\s/gu,''),searchChars=normalized?chars:literalChars;
        const searchContent=normalized?content:searchChars.map(c=>c.ch).join('');let found=false;
        for(const at of textOccurrences(searchContent,text)){
          const match=searchChars.slice(at,at+text.length);
          if(match.some(c=>assign.get(c.node)?.has(c.offset)))continue;
          for(const c of match){if(!assign.has(c.node))assign.set(c.node,new Map());assign.get(c.node)!.set(c.offset,e.id);}found=true;
        }
        if(!found&&!container.querySelector('[data-word-reveal="'+e.id+'"]'))container.setAttribute('data-missing-'+e.id,'true');
      }
      for(const [node,positions] of assign){
        // Split in reverse so each original offset still refers to its original text segment.
        let end=node.length;for(let at=node.length-1;at>=0;){
          const id=positions.get(at);let start=at;while(start>0&&positions.get(start-1)===id)start--;
          if(id){if(end<node.length)node.splitText(end);const piece=start>0?node.splitText(start):node;
            const span=wrapText(piece);span.dataset.wordReveal=id;span.style.visibility='hidden';span.style.position='relative';span.style.zIndex='1';
            piece.parentNode!.insertBefore(span,piece);span.appendChild(piece);}
          end=start;at=start-1;
        }
      }
    }
    for(const el of container.querySelectorAll<HTMLElement|SVGElement>('[data-word-reveal]')){
      const event=events.find(e=>e.id===el.dataset.wordReveal)!;
      const style=(readability.byEvent as Record<string,{color?:string;backgroundColor?:string}>)[event.id];
      if(style?.color){el.style.color=style.color;if(el.namespaceURI===SVG_NS)el.style.fill=style.color;}
      if(style?.backgroundColor){el.style.backgroundColor=style.backgroundColor;el.style.boxDecorationBreak='clone';}
      el.style.visibility=frame>=event.localFrame&&!event.deferredTo?'inherit':'hidden';
      el.dataset.expectedFrame=String(event.localFrame);
    }
  },[beatId,frame,hiddenTexts]);
  return <div ref={root} data-word-reveal-root={beatId} data-native-card={cardId} data-mobile-min-text={mobileMinTextPx} style={{position:'absolute',inset:0}}>{children}</div>;
};
