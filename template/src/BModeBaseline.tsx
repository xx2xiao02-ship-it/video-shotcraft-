import React from 'react';
import {AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';

export type BaselineScene = {
  text: string;
  subtitle?: string;
  visualText?: string;
  subject: 'person' | 'graphics' | 'material';
  fromFrame: number;
  durationInFrames: number;
  video?: string | null;
  videoDurationFrames?: number;
  digitalHumanVideo?: string;
  digitalHumanStartFrame?: number;
};

export type BModeBaselineProps = {
  avatar: string;
  audio: string;
  totalFrames: number;
  scenes: BaselineScene[];
};

const font = '"Microsoft YaHei", "Noto Sans SC", sans-serif';

const displayText = (text: string) => text
  .replace(/[^\S\n]+/gu, ' ')
  .replace(/"\s*([^"\n]*?)\s*"/gu, '“$1”')
  .replace(/\s*——\s*/gu, '——')
  .trim();

const fittedFontSize = (text: string, width: number, maxLines: number, min: number, max: number) => {
  const length = Math.max(1, Array.from(text.replace(/\s/gu, '')).length);
  return Math.max(min, Math.min(max, Math.floor(width * maxLines / length * 0.86)));
};

const presentationLines = (text: string) => {
  const explicit = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 3);
  const clauses = text.split(/(?<=[，,。！？!?；;：:])/u).map(line => line.trim()).filter(Boolean);
  if (clauses.length <= 3) return clauses.length ? clauses : [text];
  const groups: string[] = [];
  for (let group = 0; group < 3; group += 1) {
    const start = Math.round(group * clauses.length / 3);
    const end = Math.round((group + 1) * clauses.length / 3);
    if (end > start) groups.push(clauses.slice(start, end).join(''));
  }
  return groups;
};

const TextStack: React.FC<{lines: string[]; subtitle?: string; subject: BaselineScene['subject']; width: number; compact?: boolean}> = ({lines, subtitle, subject, width, compact = false}) => {
  const accent = subject === 'person' ? '#9ed8bd' : '#e7b874';
  const min = subject === 'material' ? 22 : subject === 'person' ? 26 : 24;
  const max = subject === 'material' ? 34 : subject === 'person' ? (compact ? 32 : 46) : 56;
  return <div>
    {subtitle && <div style={{fontSize:21,fontWeight:700,color:accent,marginBottom:20,letterSpacing:1}}>{subtitle}</div>}
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {lines.map((line,index) => <div key={`${index}-${line}`} style={{fontSize:fittedFontSize(line,width - 24,1,min,max),fontWeight:800,lineHeight:1.25,wordBreak:'normal',overflowWrap:'break-word',whiteSpace:compact ? 'nowrap' : 'normal',borderLeft:index === lines.length - 1 ? '5px solid #78c5ab' : '5px solid transparent',paddingLeft:14}}>{line}</div>)}
    </div>
  </div>;
};

const Shot: React.FC<{scene: BaselineScene; avatar: string; index: number; count: number}> = ({scene, avatar, index, count}) => {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 12], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const text = displayText(scene.visualText || scene.text);
  const lines = presentationLines(text);
  const subtitle = scene.subtitle?.trim();
  return <AbsoluteFill style={{background:scene.subject === 'person' ? '#172b2b' : '#233039', color:'#f4f7f4', fontFamily:font}}>
    {scene.video && scene.videoDurationFrames && <AbsoluteFill>
      <Loop durationInFrames={scene.videoDurationFrames}><OffthreadVideo src={staticFile(scene.video)} muted style={{width:'100%',height:'100%',objectFit:'cover'}} /></Loop>
      <AbsoluteFill style={{background:'#08232180'}} />
    </AbsoluteFill>}
    <div style={{position:'absolute',left:62,right:62,top:36,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:17,color:'#b8d6cb'}}>
      <strong style={{fontWeight:750}}>视频草稿</strong><span>{String(index + 1).padStart(2,'0')} / {String(count).padStart(2,'0')}</span>
    </div>
    <div style={{position:'absolute',left:62,right:62,top:84,height:1,background:'#b7d3c755'}} />
    {scene.subject === 'person' ? <>
      <div style={{position:'absolute',left:64,top:126,width:470,height:474,background:'#f5f7f2',borderRadius:6,overflow:'hidden',opacity:entrance}}>
        {scene.digitalHumanVideo
          ? <OffthreadVideo src={staticFile(scene.digitalHumanVideo)} startFrom={scene.digitalHumanStartFrame || 0} muted style={{width:'100%',height:'100%',objectFit:'contain'}} />
          : <Img src={staticFile(avatar)} style={{width:'100%',height:'100%',objectFit:'contain'}} />}
        {!scene.digitalHumanVideo && <div style={{position:'absolute',left:14,bottom:14,padding:'7px 10px',borderRadius:4,background:'#f8faf3',color:'#35514a',fontSize:16,fontWeight:700}}>静态角色图</div>}
      </div>
      <div style={{position:'absolute',left:590,top:154,width:620,opacity:entrance,transform:`translateY(${(1-entrance)*22}px)`}}>
        <TextStack lines={lines} subtitle={subtitle} subject="person" width={620} compact={Boolean(scene.visualText)} />
      </div>
    </> : scene.subject === 'graphics' ? <>
      <div style={{position:'absolute',left:90,top:178,width:1060,opacity:entrance,transform:`translateY(${(1-entrance)*25}px)`}}>
        <TextStack lines={lines} subtitle={subtitle} subject="graphics" width={1000} />
        <div style={{width:190,height:6,background:'#78c5ab',borderRadius:3,marginTop:47}} />
      </div>
    </> : <>
      <div style={{position:'absolute',left:690,top:158,width:520,padding:'18px 20px',background:'#071c1ccc',borderLeft:'4px solid #78c5ab',borderRadius:4,opacity:entrance}}>
        <TextStack lines={lines} subtitle={subtitle} subject="material" width={480} />
      </div>
    </>}
    <div style={{position:'absolute',left:62,right:62,bottom:29,color:'#b3c7bc',display:'flex',justifyContent:'space-between',fontSize:17}}>
      <span>{scene.digitalHumanVideo ? '数字人口播' : '图片占位预览 · 尚未生成数字人口型'}</span>
    </div>
    <div style={{position:'absolute',left:0,right:0,bottom:0,height:6,background:'#ffffff22'}}><div style={{height:'100%',width:`${Math.min(100,frame / Math.max(1,scene.durationInFrames) * 100)}%`,background:'#8bd8ba'}} /></div>
  </AbsoluteFill>;
};

export const BModeBaseline: React.FC<BModeBaselineProps> = ({avatar,audio,scenes}) => <AbsoluteFill>
  {scenes.map((scene,index) => <Sequence key={index} from={scene.fromFrame} durationInFrames={scene.durationInFrames}><Shot scene={scene} avatar={avatar} index={index} count={scenes.length} /></Sequence>)}
  <Audio src={staticFile(audio)} volume={1} />
</AbsoluteFill>;
