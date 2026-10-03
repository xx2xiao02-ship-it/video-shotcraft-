import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {skinBackground, type TemplateSkin} from './TemplateSkin';

// Preserve native choreography in its 1920x1080 coordinates in both aspects.
export const BusinessTextStage: React.FC<{skin: TemplateSkin; children: React.ReactNode}> = ({skin, children}) => {
  const {width, height} = useVideoConfig();
  const scale = Math.min(width / 1920, height / 1080);
  return <AbsoluteFill style={{background:skinBackground(skin, skin.bg), overflow:'hidden'}}>
    <div style={{position:'absolute', width:1920, height:1080,
      left:(width-1920*scale)/2, top:(height-1080*scale)/2,
      transform:`scale(${scale})`, transformOrigin:'top left'}}>{children}</div>
  </AbsoluteFill>;
};
