import React from 'react';
import {AbsoluteFill} from 'remotion';
import {COMPONENT_MAP} from './DynamicVideo';
import {translateShot} from './TemplateAdapter';

export const CardAcceptance: React.FC<{card:string; injected?:boolean; lines?:string[]; templateParams?:Record<string,unknown>}> = ({card,injected,lines = ['业务验收文案'],templateParams}) => {
  const Component = COMPONENT_MAP[card];
  if (!Component) throw new Error(`没有准确组件映射：${card}`);
  const props = injected ? translateShot(card,{text:lines.join('\n'),lines,durationInFrames:180,templateParams,
    skin:{bg:'#101820',text:'#ffffff',muted:'#c4ced5',accent:'#ff9855',surface:'#202c35',fontFamily:'Microsoft YaHei',transparentBackground:false}}) : {};
  if (injected && !props) throw new Error(`没有业务参数契约：${card}`);
  return <AbsoluteFill style={{background:'#101820',['--bg' as any]:'#101820',['--surface' as any]:'#202c35',
    ['--text' as any]:'#ffffff',['--text-dim' as any]:'#c4ced5',['--accent' as any]:'#ff9855',['--accent2' as any]:'#66d2cc',
    ['--danger' as any]:'#f15d62'}}><Component {...props} /></AbsoluteFill>;
};
