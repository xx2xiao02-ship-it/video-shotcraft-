import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, staticFile, useVideoConfig} from 'remotion';
import type {Shot} from '../shots';
import {renderTalkcraftTemplate} from '../talkcraft-template-adapter';
import {THEME} from '../theme';
import {cardStageLayout} from '../talkcraft-presentation-skin.mjs';
export const TemplateScene: React.FC<{shot:Shot}> = ({shot}) => {
  const {width,height,fps} = useVideoConfig();
  const p = shot.templateParams || {};
  const material = typeof p.materialSrc === 'string' ? p.materialSrc : null;
  const image = material && /\.(png|jpe?g|webp)$/iu.test(material);
  const materialPlaybackRate = Number.isFinite(Number(p.materialPlaybackRate)) && Number(p.materialPlaybackRate) > 0
    ? Number(p.materialPlaybackRate) : 1;
  if (material && !['background','subject','evidence'].includes(String(p.materialRole))) throw new Error(`镜头 ${shot.id} 未声明素材职责，禁止自动画成小窗`);
  const skin = {bg:THEME.background,text:THEME.text,muted:THEME.textMuted,accent:THEME.accentPrimary,surface:THEME.surface,fontFamily:THEME.fontFamily,transparentBackground:false};
  const copy = {title:String(p.title || ''),body:String(p.body || ''),labels:Array.isArray(p.labels)?p.labels.map(String):[]};
  if (p.subtitlePolicy === 'visual-only') throw new Error(`镜头 ${shot.id} 使用了废弃的隐藏文字策略，请修改脚本内容或选择合适模板`);
  // Approved cardProps are the sole business content source. Narration timing
  // remains in the caption system and cannot rewrite card content at render time.
  const card = renderTalkcraftTemplate({shot,copy,skin,durationInFrames:Math.round(shot.durationSec*fps)});
  const layout=cardStageLayout(width,height,{separateMaterial:Boolean(material && p.materialRole !== 'background')});
  const {scale}=layout;
  const portrait = height>width;
  return <AbsoluteFill style={{background:skin.bg,overflow:'hidden'}}>
    {material && p.materialRole === 'background' && <>
      {image ? <Img src={staticFile(material)} style={{width:'100%',height:'100%',objectFit:'contain'}} /> : <OffthreadVideo src={staticFile(material)} muted playbackRate={materialPlaybackRate} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} />}
      <AbsoluteFill style={{background:'rgba(0,0,0,.42)'}} />
    </>}
    {material && p.materialRole !== 'background' && <div style={{position:'absolute',inset:'8% 8% 45%',overflow:'hidden',border:'2px solid #1a4a8a',borderRadius:12}}>
      {image ? <Img src={staticFile(material)} style={{width:'100%',height:'100%',objectFit:'contain'}} /> : <OffthreadVideo src={staticFile(material)} muted playbackRate={materialPlaybackRate} style={{width:'100%',height:'100%',objectFit:'cover'}} />}
    </div>}
    {typeof p.materialCredit === 'string' && <div style={{position:'absolute',left:'8%',top:'53%',color:'#ccd2dc',fontSize:18}}>{p.materialCredit}</div>}
    <div className="talkcraft-card" data-card={shot.shotCard} style={{position:'absolute',width:960,height:540,left:layout.left,top:layout.top,transform:`scale(${scale})`,transformOrigin:'top left'}}>
      {card}
    </div>
  </AbsoluteFill>;
};
