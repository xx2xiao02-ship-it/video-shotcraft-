import {approvePresentationCorrection} from './talkcraft-presentation-approval.mjs';
import {upgradePresentationSource} from './talkcraft-presentation-upgrade-source.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
export const PRESENTATION_REPAIR_VERSION='presentation-repair-v4';
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('展示源码修正合同不匹配：'+a.slice(0,70));return s.replace(a,b);};
// Only remove an entire, standalone demo host shell. Never hide a container
// with business siblings, labels, footage or animated content.
export function repairPresentationSource(source,relative,{legacyTitle=false,legacyV1=false,legacyV2=false,legacyV3=false}={}){
 let s=source;
 if(relative.startsWith('gen/'))s=s.replace(/<div className="([\w-]+)"><HostSilhouette \/><\/div>/gu,'{/* production: demo-only host shell removed */}');
 if(relative==='gen/host-shrink-to-chip.tsx'){
  const ring=s.match(/      \{\/\* chip 描边：[\s\S]*?\r?\n      <div style=\{\{[\s\S]*?opacity: ringOp, pointerEvents: "none",\r?\n      \}\} \/>/u)?.[0];
  if(!ring)throw Error('人物缩位演示空圈源码合同不匹配');
  s=once(s,ring,'      {/* production: empty demo avatar ring removed with its silhouette */}');
 }
 if(relative==='gen/behind-text-title.tsx'){
  if(!legacyTitle)s=once(s,'import React from "react";','import React from "react";\nimport {usePresentationHost} from "../../talkcraft-layout-context";');
  s=once(s,'const t = useCurrentFrame() / FPS;',`const t = useCurrentFrame() / FPS;\n  ${legacyTitle?'':'const hasHost=usePresentationHost();\n  '}if([...title].length > 10)throw Error("TEXT_LAYOUT_CAPACITY: behind-text-title");\n  const safeTitleSize = Math.min(fontSize, ${legacyTitle?'864':'(hasHost ? 538 : 864)'} / (Math.min(5, Math.max(1, [...title].length)) * 1.14));`);
  if(!legacyTitle){
   s=once(s,'left: 0, right: 0, top: "5.5%",','left: 0, right: hasHost ? "34%" : 0, top: "5.5%",');
   s=once(s,'left: 0, right: 0, top: `${titleTop}%`,','left: 0, right: hasHost ? "34%" : 0, top: `${titleTop}%`,');
  }
  s=once(s,'fontSize * FIXED.riseFromRatio','safeTitleSize * FIXED.riseFromRatio');
  s=once(s,'textAlign: "center", fontSize, fontWeight: 900, lineHeight: 1,','textAlign: "center", fontSize: safeTitleSize, fontWeight: 900, lineHeight: 1.12,');
  s=once(s,'whiteSpace: "nowrap", color: "#b9b9bf", textShadow: EXTRUDE_SHADOW,','whiteSpace: "normal", overflowWrap: "anywhere", paddingInline: 48, boxSizing: "border-box", color: "#b9b9bf", textShadow: EXTRUDE_SHADOW,');
  // The overlaid gradient face must share the same content box and wrapping.
  s=once(s,'position: "absolute", left: 0, right: 0, top: 0,','position: "absolute", left: 0, right: 0, top: 0, paddingInline: 48, boxSizing: "border-box",');
 }
 if(relative==='source-converge.tsx')s=once(s,'<text className="scv-cap" x={cx} y={372} opacity={capIn * exitK}>{caption}</text>',
  '<text className="scv-cap" x={cx} y={372} opacity={capIn * exitK}>{(caption.match(/.{1,18}/gu)||[]).map((line,i)=><tspan key={i} x={cx} dy={i ? 28 : 0}>{line}</tspan>)}</text>');
 if(relative==='gen/line-by-line-slide.tsx'){
  s=once(s,'import React from "react";','import React from "react";\nimport {usePresentationHost} from "../../talkcraft-layout-context";');
  s=once(s,'const t = useCurrentFrame() / FPS;','const t = useCurrentFrame() / FPS;\n  const hasHost=usePresentationHost();');
  s=once(s,'const distance = Math.round(fontSize * FIXED.distanceRatio);','const safeLineSize = Math.min(fontSize, (hasHost ? 510 : 864) / Math.max(1,...list.map(s=>[...s].length)));\n  if(safeLineSize < 28)throw Error("TEXT_LAYOUT_CAPACITY: line-by-line-slide");\n  const distance = Math.round(safeLineSize * FIXED.distanceRatio);');
  s=once(s,'inset: 0, display: "flex", alignItems: "center", justifyContent: "center"','inset: 0, right: hasHost ? "36%" : 0, display: "flex", alignItems: "center", justifyContent: "center"');
  s=once(s,'fontSize, fontWeight: 600,','fontSize: safeLineSize, fontWeight: 600,');
 }
 return legacyV1?s:upgradePresentationSource(s,relative,{legacyCrossfade:legacyV2,legacyTypography:legacyV3||legacyTitle||legacyV2});
}
export function presentationRepairFiles(skillRoot,src){
 const files=[];
 for(const dir of ['workbench/src/cards/gen','template/cards']){
  for(const name of fs.readdirSync(path.join(skillRoot,dir)).filter(n=>n.endsWith('.tsx'))){
   const relative=(dir.includes('workbench')?'gen/':'')+name;
   const original=fs.readFileSync(path.join(skillRoot,dir,name),'utf8');
   const base=relative.startsWith('gen/')?original.replace(/(["'])@tpl\//g,'$1../../cards/'):original;
   const expected=repairPresentationSource(base,relative);
   if(expected===base)continue;
   const file=path.join(src,relative.startsWith('gen/')?'parameterized-cards':'cards',relative);
   const current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
   const previous=relative==='gen/behind-text-title.tsx'?repairPresentationSource(base,relative,{legacyTitle:true}):null;
   const previousV1=repairPresentationSource(base,relative,{legacyV1:true});
   const previousV2=repairPresentationSource(base,relative,{legacyV2:true});
   const previousV3=repairPresentationSource(base,relative,{legacyV3:true});
   if(current!==base&&current!==expected&&current!==previous&&current!==previousV1&&current!==previousV2&&current!==previousV3)throw Error('自定义运行源码不能被展示修正覆盖：'+file);
   files.push({file,relative,beforeSha256:hash(current),afterSha256:hash(expected),source:expected});
  }
 }
 return files;
}
export function installPresentationCorrections(skillRoot,src){
 const files=presentationRepairFiles(skillRoot,src);
 const readInputs=()=>Object.fromEntries(['source-run.json','input.txt','aligned-sentences.json','audio/full.mp3','remotion/shots.json'].map(n=>{const f=path.resolve(src,'../..',n);return [n,fs.existsSync(f)?hash(fs.readFileSync(f)):null];}));
 const runId=JSON.parse(fs.readFileSync(path.resolve(src,'../../source-run.json'),'utf8')).runId;
 const inputs=readInputs();
 const proposal={schema:'talkcraft-presentation-correction-v1',version:PRESENTATION_REPAIR_VERSION,runId,inputs,
   files:files.map(({source,...r})=>r),externalRequests:0,userAcceptance:false};
 const approval=approvePresentationCorrection(proposal,{...proposal,inputs:readInputs(),files:presentationRepairFiles(skillRoot,src).map(({source,...r})=>r)});
 const project=path.resolve(src,'../..'),qa=path.join(project,'qa/presentation-corrections',approval.planSha256);
 fs.mkdirSync(qa,{recursive:true});
 for(const f of files){
  if(f.beforeSha256===f.afterSha256)continue;
  const snapshot=path.join(qa,'before',f.relative);fs.mkdirSync(path.dirname(snapshot),{recursive:true});
  if(!fs.existsSync(snapshot))fs.copyFileSync(f.file,snapshot);
  fs.writeFileSync(f.file,f.source);
 }
 fs.writeFileSync(path.join(qa,'plan.json'),JSON.stringify({proposal,approval},null,2));
 fs.copyFileSync(new URL('./talkcraft-layout-context.tsx',import.meta.url),path.join(src,'talkcraft-layout-context.tsx'));
 fs.copyFileSync(new URL('./talkcraft-title-presentation.mjs',import.meta.url),path.join(src,'talkcraft-title-presentation.mjs'));
 fs.copyFileSync(new URL('./talkcraft-presentation-runtime.tsx',import.meta.url),path.join(src,'talkcraft-presentation-runtime.tsx'));
 const adapter=path.join(src,'talkcraft-template-adapter.tsx');
 let s=fs.readFileSync(adapter,'utf8');
 if(!s.includes('PresentationHostProvider')){
  s="import {PresentationHostProvider} from './talkcraft-layout-context';\n"+s;
  s=once(s,'  return <>{mask &&',`  return <PresentationHostProvider value={(shot as ShotLike & {subject?:string}).subject==='person'}>{mask &&`);
  s=once(s,': React.createElement(Card,props)}</>;',': React.createElement(Card,props)}</PresentationHostProvider>;');
  fs.writeFileSync(adapter,s);
 }
 return {version:PRESENTATION_REPAIR_VERSION,files:files.map(({source,...r})=>r),externalRequests:0,userAcceptance:false,approval};
}
