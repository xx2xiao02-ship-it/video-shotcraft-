// ring-diagram-annotation-reveal — 全屏主体收束成同心环图解，再左移让出注释栏。
// 保留原 motion-blocking 的圆窗收缩、分段外环、向心箭头、旋转、错峰标签与收尾 hold。
import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { DesignStage } from '../../_fixtures/Motion';
import {type TemplateSkin} from '../../_fixtures/TemplateSkin';

export const RING_DIAGRAM_ANNOTATION_REVEAL_DURATION = 190;

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const p = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, Math.max(start + 1, end)], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const TitleBlock: React.FC<{ frame: number; start: number; shade: string; index: number;label?:string;skin?:TemplateSkin }> = ({
  frame,
  start,
  shade,
  index,
  label,
  skin,
}) => {
  const k = p(frame, start, start + 8);
  const echo = interpolate(frame, [start - 1, start, start + 2, start + 8], [0, 0.32, 0.32, 0], CLAMP);
  return (
    <div style={{ position: 'relative', width: 26, height: 34 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#a7a7a4',
          opacity: echo,
          transform: `translateY(${interpolate(k, [0, 1], [8, -4])}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: skin?.surface || shade,
          ...(skin ? {border:`1px solid ${skin.accent}`,boxSizing:'border-box' as const} : {}),
          opacity: k,
          clipPath: `inset(${interpolate(k, [0, 1], [100, 0])}% 0 0 0)`,
          transform: `translateY(${interpolate(k, [0, 1], [9, 0])}px)`,
          display: 'grid',
          placeItems: 'center',
          color: skin?.text || '#1a1d24',
          fontFamily: skin?.fontFamily || 'Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: label ? 12 : 8,
          fontWeight: 800,
        }}
      >
        {label || index + 1}
      </div>
    </div>
  );
};

export const RingDiagramAnnotationReveal: React.FC<{words?:string[];skin?:TemplateSkin;durationInFrames?:number}> = ({words,skin}) => {
  const currentFrame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  if(words && (words.length!==8 || words.slice(0,2).some(word=>[...word].length>4) || words.slice(2,6).some(word=>[...word].length>2) || [...words[6]].length>8 || [...words[7]].length>6))
    throw new Error('RingDiagram requires two subject labels, four short title blocks and two annotations');
  const revealEnd = Math.max(1,durationInFrames-30);
  const frame = words ? currentFrame<=revealEnd ? currentFrame*160/revealEnd : 160+currentFrame-revealEnd : currentFrame;
  const aperture = p(frame, 11, 50);
  const ringIn = p(frame, 18, 60);
  const coilsIn = p(frame, 30, 50);
  const arrowsIn = p(frame, 35, 50);
  const layout = p(frame, 90, 134);
  const label = p(frame, 114, 160);
  const definition = p(frame, 137, 143);
  const centerX = interpolate(layout, [0, 1], [240, 154]);
  const scale = interpolate(layout, [0, 1], [1, 0.84]);
  const rotate = interpolate(frame, [29, 187], [0, 44.2], CLAMP);
  const apertureRadius = interpolate(aperture, [0, 1], [540, 61]);

  const arrows = Array.from({ length: 12 }, (_, i) => {
    const a = ((-90 + i * 30) * Math.PI) / 180;
    const outer = 97;
    const inner = 72;
    return {
      x1: 240 + Math.cos(a) * outer,
      y1: 123 + Math.sin(a) * outer,
      x2: 240 + Math.cos(a) * inner,
      y2: 123 + Math.sin(a) * inner,
    };
  });

  return (
    <DesignStage bg={skin?.bg || '#1a1d24'} raster="zoom">
      <div style={{ position: 'absolute', ...(words ? {left:0,top:'50%',width:480,height:270,transform:'translateY(-50%)'} : {inset:0}), overflow: 'hidden', fontFamily: skin?.fontFamily || 'Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: skin?.surface || '#c7c7c4',
            clipPath: `circle(${apertureRadius * scale}px at ${centerX}px 123px)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: centerX,
            top: 123,
            width: 220,
            height: 220,
            transform: `translate(-50%,-50%) scale(${scale})`,
            transformOrigin: '50% 50%',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 36,
              top: 36,
              width: 148,
              height: 148,
              borderRadius: '50%',
              border: `1px solid ${skin?.muted || '#8a8a87'}`,
              opacity: ringIn,
              transform: `scale(${interpolate(ringIn, [0, 1], [3.8, 1])})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              width: 204,
              height: 204,
              borderRadius: '50%',
              border: `7px dashed ${skin?.muted || '#999995'}`,
              boxSizing: 'border-box',
              opacity: coilsIn,
              transform: `rotate(${rotate}deg) scale(${interpolate(coilsIn, [0, 1], [1.08, 1])})`,
            }}
          />
          <svg viewBox="0 0 480 270" style={{ position: 'absolute', left: -130, top: -12, width: 480, height: 270 }}>
            <defs>
              <marker id="ring-arrow-head" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 Z" fill={skin?.accent || '#303032'} />
              </marker>
            </defs>
            <g stroke={skin?.accent || '#454548'} strokeWidth="0.75" markerEnd="url(#ring-arrow-head)" opacity={arrowsIn}>
              {arrows.map(({ x1, y1, x2, y2 }) => (
                <line
                  key={`${x1}-${y1}`}
                  x1={x1}
                  y1={y1}
                  x2={interpolate(arrowsIn, [0, 1], [x1, x2])}
                  y2={interpolate(arrowsIn, [0, 1], [y1, y2])}
                />
              ))}
            </g>
          </svg>
          <div
            style={{
              position: 'absolute',
              left: 57,
              top: 57,
              width: 106,
              height: 106,
              borderRadius: '50%',
              background: skin?.surface || '#c7c7c4',
              display: 'grid',
              placeItems: 'start center',
              paddingTop: words ? 8 : 28,
              boxSizing: 'border-box',
              color: skin?.text || '#57575a',
              fontSize: words ? 12 : 8,
              fontWeight: 800,
              letterSpacing: words ? 0 : 0.5,
            }}
          >
            {words?.[0] || 'CONTENT'}
          </div>
          <div
            style={{
              position: 'absolute',
              left: 79,
              top: 79,
              width: 62,
              height: 62,
              borderRadius: '50%',
              background: skin?.accent || '#5b5b5e',
              display: 'grid',
              placeItems: 'center',
              color: skin?.bg || 'var(--text)',
              fontSize: words ? 12 : 8,
              fontWeight: 800,
            }}
          >
            {words?.[1] || 'SUBJECT'}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 321, top: 93, display: 'flex', gap: 1.5 }}>
          {['#59595c', '#69696c', '#858588', '#a7a7aa'].map((shade, i) => (
            <TitleBlock key={shade} frame={frame} start={112 + i * 3} shade={shade} index={i} label={words?.[i+2]} skin={skin} />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 310,
            top: 132,
            width: 122,
            height: 16,
            background: skin?.surface || '#929295',
            transformOrigin: 'left center',
            transform: `scaleX(${label})`,
            opacity: label,
            display: 'grid',
            placeItems: 'center',
            color: skin?.text || '#f9f9f7',
            fontSize: words ? 12 : 8,
            fontWeight: 800,
            letterSpacing: words ? 0 : 0.8,
          }}
        >
          {words?.[6] || 'EXPLANATION'}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 325,
            top: 154,
            width: 92,
            height: 15,
            background: skin?.surface || '#d0d0cd',
            opacity: definition,
            transform: `translateY(${interpolate(definition, [0, 1], [5, 0])}px)`,
            display: 'grid',
            placeItems: 'center',
            color: skin?.text || '#626265',
            fontSize: words ? 12 : 8,
            fontWeight: 700,
          }}
        >
          {words?.[7] || 'SUPPORTING DETAIL'}
        </div>
      </div>
    </DesignStage>
  );
};
