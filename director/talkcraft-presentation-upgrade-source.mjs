const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('展示升级源码合同不匹配：'+a.slice(0,75));return s.replace(a,b);};
export function upgradePresentationSource(source,relative,{legacyCrossfade=false}={}){
 let s=source;
 const imported=names=>{
  const from=relative.startsWith('gen/')?'../../':'../';
  s=once(s,'import React from "react";',`import React from "react";\nimport {${names}} from "${from}talkcraft-presentation-runtime";`);
 };
 if(['gen/black-slam-transition.tsx','gen/particle-weld-transition.tsx','gen/overexpose-flip-transition.tsx'].includes(relative)){
  const blended=relative.includes('particle')&&!legacyCrossfade;
  imported('readableInk,ContinuityText'+(blended?',crossfadeBackground':''));
  if(blended)s=once(s,'  const tagOpacity = tw(t, 0, 0.3, power1Out);','  const visibleBg = crossfadeBackground(bgA,bgB,bOpacity);\n  const tagOpacity = tw(t, 0, 0.3, power1Out);');
  const a=relative.includes('particle')?'<div style={{ ...bigStyle, ...outBig }}>{textA}</div>':'<div style={bigStyle}>{textA}</div>';
  const b=relative.includes('particle')?'<div style={{ ...bigStyle, ...inBig }}>{textB}</div>':'<div style={bigStyle}>{textB}</div>';
  s=once(s,a,a.replace('}}',' , color: readableInk(labelColor,bgA) }}').replace('style={bigStyle}','style={{...bigStyle,color:readableInk(labelColor,bgA)}}'));
  s=once(s,b,b.replace('}}',' , color: readableInk(labelColor,bgB) }}').replace('style={bigStyle}','style={{...bigStyle,color:readableInk(labelColor,bgB)}}'));
  const marker=relative.includes('particle')?'      {/* 粒子层：':'      {/* 转场重音层：';
  s=once(s,marker,`      <ContinuityText text={textA} cut={cut} t={t} fontSize={fontSize} ink={labelColor} background={${blended?'visibleBg':'bgB'}} />\n${marker}`);
  s=once(s,'left: 24, top: 20, fontSize: 17, color: "#8a8a8a",',`left: 24, top: 20, fontSize: 17, color: readableInk("#8a8a8a",${blended?'visibleBg':'t < cut ? bgA : bgB'}),`);
 }
 if(relative==='gen/cursor-actor-demo.tsx'){
  imported('PresentationMedia');
  // These are exactly the source's four static landscape/device thumbnails,
  // including the dragged pick. Cursor geometry and drag clocks are intact.
  const thumbs=s.match(/<svg viewBox="0 0 88 62" aria-hidden="true">[\s\S]*?<\/svg>/gu);
  if(thumbs?.length!==4)throw Error('光标演示素材槽数量变化');
  s=s.replace(/<svg viewBox="0 0 88 62" aria-hidden="true">[\s\S]*?<\/svg>/gu,'<PresentationMedia />');
 }
 if(relative==='gen/host-shrink-to-chip.tsx'&&!legacyCrossfade){
  imported('PresentationMedia');
  const bars=s.match(/        <svg viewBox="0 0 538 178"[\s\S]*?        <\/svg>/u)?.[0];
  if(!bars)throw Error('固定演示柱图源码合同变化');
  s=once(s,bars,'        <div style={{width:538,height:178}}><div style={{height:152}}><PresentationMedia /></div><div style={{display:"flex",gap:12,fontSize:13,color:ink}}>{years.map((yl,i)=><span key={i}>{yl}</span>)}</div></div>');
 }
 if(relative==='gen/tilt-3d-page.tsx'){
  imported('PresentationMedia');
  const panel=s.match(/                <div className="t3p-in">[\s\S]*?                <\/div>\r?\n              <\/div>/u)?.[0];
  if(!panel)throw Error('3D页面资料入口源码变化');
  s=once(s,panel,'                <div className="t3p-in"><PresentationMedia /></div>\n              </div>');
  s=once(s,'<div className="t3p-ico" /><b>{f}</b><i /><i className="t3p-s" />','<b>{f}</b>');
  // Empty mock navigation, purchase buttons and price pill are decoration,
  // not material. Remove complete static nodes rather than tinting them.
  s=s.replace(/            <div className="t3p-nav">[\s\S]*?            <\/div>\r?\n\r?\n/u,'');
  s=s.replace(/                <div className="t3p-btns">[\s\S]*?                <\/div>/u,'');
  s=once(s,'              <div className="t3p-pill" />','');
  if(!legacyCrossfade)s=once(s,'.t3p-feat { flex: 1; border: 1px solid #ececef; border-radius: 9px; padding: 13px 15px; }','.t3p-feat { flex: 1; border: 0; padding: 13px 0; }');
 }
 if(relative==='scanline-annotate.tsx'){
  imported('usePresentationRuntime');
  s=once(s,'  const n = targets.length;',`  const n = targets.length;\n  const {row}=usePresentationRuntime();\n  const attention=row?.attention;\n  if(!attention)throw Error("缺少资料定位证明或明确的非引用展示方案");\n  const actual=targets.map((_,i)=>attention.regions.find((r:any)=>r.index===i));`);
  s=once(s,'objectFit: "cover"','objectFit: "contain"');
  s=once(s,'        const ft = fts[i];','        const ft = fts[i];\n        const region=actual[i];');
  s=once(s,'            <div className="sla-bk" style={{','            {region && <div className="sla-bk" style={{');
  s=once(s,'left: CONFIG.shot.x + tg.x - CONFIG.pad, top: CONFIG.shot.y + tg.y - CONFIG.pad, width: tg.w + 2 * CONFIG.pad, height: tg.h + 2 * CONFIG.pad,','left: CONFIG.shot.x + region.x, top: CONFIG.shot.y + region.y, width: region.w, height: region.h,');
  const close=s.match(/              <b style=\{\{ opacity: Math.max\(0, flash\) \}\} \/>\r?\n            <\/div>/u)?.[0];
  if(!close)throw Error('扫描框闭合合同变化');
  s=once(s,close,close+'}');
  // A context label is explicitly a narration explanation, never a spatial
  // citation. Unmatched metaphors cannot borrow a document's bounding box.
  s=once(s,'top: CONFIG.shot.y + tg.y + tg.h / 2 - 22','top: attention.mode === "document-context" ? 84 + i * 68 : CONFIG.shot.y + region.y + region.h / 2 - 22');
  s=once(s,'{done ? `分析完成 · ${n} 处` : `扫描 · ${fired}/${n}`}','{attention.mode === "document-context" ? "口播说明 · 资料参照" : done ? `原文定位 · ${attention.regions.length} 处` : `扫描 · ${Math.min(fired,attention.regions.length)}/${attention.regions.length}`}');
 }
 return s;
}
