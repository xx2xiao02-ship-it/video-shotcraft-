import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import backplate from './agent-stream.jpg';
import { skinBackground, type TemplateSkin } from '../../_fixtures/TemplateSkin';

type StreamRow = {title: string; meta: string};
const DEFAULT_ROWS: StreamRow[] = [
  {title: 'Indexed the workspace', meta: '128 files'},
  {title: 'Mapped the authentication flow', meta: '12 modules'},
  {title: 'Checked recent error traces', meta: 'No blockers'},
  {title: 'Matched API contracts to handlers', meta: '24 routes'},
  {title: 'Verified permission boundaries', meta: '6 roles'},
  {title: 'Cross-checked release notes', meta: '3 changes'},
  {title: 'Prepared an implementation plan', meta: 'Ready'},
];

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.bezier(0.2, 0.75, 0.25, 1);

const CheckIcon: React.FC<{progress: number}> = ({progress}) => {
  const ringOpacity = interpolate(progress, [0, 0.45, 0.75], [0.36, 1, 0], clamp);
  const checkOpacity = interpolate(progress, [0.62, 1], [0, 1], clamp);
  const checkScale = interpolate(progress, [0.62, 1], [0.72, 1], {...clamp, easing: ease});

  return (
    <div style={{position: 'relative', width: 27, height: 27, flex: '0 0 auto'}}>
      <div
        style={{
          position: 'absolute', inset: 2, borderRadius: 99,
          border: '2px solid rgba(183, 190, 199, .6)',
          borderTopColor: '#d4ff77', opacity: ringOpacity,
          transform: `rotate(${progress * 100}deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 1, borderRadius: 99,
          background: '#b8f36a', opacity: checkOpacity,
          transform: `scale(${checkScale})`,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 0 16px rgba(184,243,106,.18)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3.4 8.3 6.6 11l6-6" stroke="#15200d" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
};

const EvidenceRow: React.FC<{cue: number; title: string; meta: string; index: number}> = ({cue, title, meta, index}) => {
  const frame = useCurrentFrame();
  const body = interpolate(frame, [cue, cue + 12], [0, 1], {...clamp, easing: ease});
  const status = interpolate(frame, [cue + 3, cue + 11], [0, 1], {...clamp, easing: ease});
  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, top: index * 68,
        height: 58, borderRadius: 13,
        border: '1px solid rgba(255,255,255,.065)',
        background: 'rgba(255,255,255,.025)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 15,
        opacity: body,
        transform: `translateY(${18 * (1 - body)}px)`,
        filter: `blur(${6 * (1 - body)}px)`,
      }}
    >
      <CheckIcon progress={status}/>
      <div style={{fontSize: 21, color: '#e8eaed', letterSpacing: '-0.015em', flex: 1}}>{title}</div>
      <div style={{fontSize: 16, color: status > 0.78 ? '#a9c77f' : '#777f89', fontVariantNumeric: 'tabular-nums'}}>{meta}</div>
    </div>
  );
};

export const StreamResponse: React.FC<{
  summary?: string;
  rows?: StreamRow[];
  backplate?: string;
  durationInFrames?: number;
  skin?: TemplateSkin;
}> = ({summary: summaryInput, rows: rowsInput, backplate: backplateInput, durationInFrames = 120, skin}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const portrait = height > width;
  const canvasScale = portrait ? Math.min(0.82, (width - 96) / 1232) : 1;
  const canvasLeft = portrait ? (width - 1920 * canvasScale) / 2 : 0;
  const canvasTop = portrait ? (height - 1080 * canvasScale) / 2 : 0;
  const duration = Math.max(1, durationInFrames);
  const at = (ratio: number) => Math.round((duration - 1) * ratio);
  const rows = rowsInput?.length ? rowsInput : DEFAULT_ROWS;
  const summaryText = summaryInput || 'The codebase is ready for a focused, low-risk implementation.';
  const imageSrc = backplateInput ? staticFile(backplateInput) : backplate;
  const panelIn = interpolate(frame, [0, at(0.12)], [0, 1], {...clamp, easing: ease});
  const summary = interpolate(frame, [at(0.14), at(0.25)], [0, 1], {...clamp, easing: ease});
  const camera = interpolate(frame, [0, at(0.82)], [1.04, 1], {...clamp, easing: ease});
  const pulse = interpolate(frame, [at(0.84), at(0.89), at(0.96)], [0.25, 0.55, 0.25], clamp);
  const complete = interpolate(frame, [at(0.84), at(0.96)], [0, 1], {...clamp, easing: ease});
  const rowCues = rows.map((_, index) => at(0.3 + (0.46 * index) / Math.max(1, rows.length - 1)));

  return (
    <AbsoluteFill style={{background: skinBackground(skin, '#07090a'), fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `scale(${camera})`}}>
        <Img src={imageSrc} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.58) saturate(.76) blur(1px)', opacity: .7}}/>
        <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 44%, rgba(6,9,10,.08) 10%, rgba(4,6,7,.72) 92%)'}}/>
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: canvasLeft, top: canvasTop, width: 1920, height: 1080, transform: `scale(${canvasScale})`, transformOrigin: '0 0' }}>
        <div
          style={{
            position: 'absolute', left: 344, top: 72, width: 1232, height: 936,
            borderRadius: 29, overflow: 'hidden',
            background: 'linear-gradient(145deg, rgba(25,29,32,.985), rgba(12,15,17,.99))',
            border: `1px solid rgba(184,243,106,${pulse})`,
            boxShadow: '0 46px 100px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.06)',
            opacity: panelIn,
            transform: `translateY(${12 * (1 - panelIn)}px) scale(${.985 + .015 * panelIn})`,
          }}
        >
        <div style={{height: 76, display: 'flex', alignItems: 'center', padding: '0 34px', borderBottom: '1px solid rgba(255,255,255,.065)'}}>
          <div style={{width: 29, height: 29, borderRadius: 9, background: '#e9edf0', color: '#15191b', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17}}>A</div>
          <div style={{marginLeft: 13, fontSize: 22, fontWeight: 590, color: '#f1f3f4'}}>Ask Atlas</div>
          <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9, color: '#7d858e', fontSize: 15}}>
            <span style={{width: 7, height: 7, background: '#b8f36a', borderRadius: 99}}/> Workspace agent
          </div>
        </div>

        <div style={{padding: '28px 38px 34px'}}>
          <div style={{height: 48, borderRadius: 12, background: 'rgba(255,255,255,.048)', display: 'flex', alignItems: 'center', padding: '0 18px', color: '#b9bec4', fontSize: 18}}>
            Review this codebase and identify the safest implementation path
          </div>

          <div style={{height: 119, marginTop: 21, borderBottom: '1px solid rgba(255,255,255,.07)', overflow: 'hidden', position: 'relative'}}>
            <div style={{position: 'absolute', inset: 0, opacity: summary, transform: `translateY(${10 * (1 - summary)}px)`, clipPath: `inset(0 ${100 * (1 - summary)}% 0 0)`}}>
              <div style={{color: '#838b94', fontSize: 15, textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 10}}>Result summary</div>
              <div style={{color: '#f3f4f5', fontSize: 26, fontWeight: 510, lineHeight: 1.35, letterSpacing: '-.022em'}}>{summaryText}</div>
            </div>
          </div>

          <div style={{position: 'relative', height: 466, marginTop: 17}}>
            {rows.map((row, index) => <EvidenceRow key={`${row.title}-${index}`} cue={rowCues[index]} title={row.title} meta={row.meta} index={index}/>)}
          </div>

          <div style={{height: 60, marginTop: 2, borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'flex-end'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 11, opacity: complete, transform: `translateY(${5 * (1 - complete)}px)`}}>
              <div style={{width: 24, height: 24, borderRadius: 99, background: '#b8f36a', display: 'grid', placeItems: 'center'}}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.4 8.3 6.6 11l6-6" stroke="#15200d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{color: '#dce7d0', fontSize: 17, fontWeight: 560}}>Analysis complete</span>
              <span style={{color: '#69717a', fontSize: 15}}>7 checks finished · ready to build</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
