// timeline-travel —— 时间轴横移（《反恐王国》式）
// 镜头沿水平刻度轴加速横移，v1.0/v2.0/v3.0/Today 四个刻度依次掠过，
// 每过刻度对应 Card 从刻度线 spring 过冲弹立 + 短停，镜头不停；
// 末刻度 4f 急停 + 推近 1.28×。世界层只动 translateX/scale。
// f0–12 初始静置；f118 起真静止 ≥42f（160f 总长）。
import React from 'react';
import { useCurrentFrame, interpolate, Easing, spring } from 'remotion';
import { G, Card, TitleBlock } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {type TemplateSkin} from '../../_fixtures/TemplateSkin';

const W = 1920;
const AXIS_Y = 700;
const TICK_GAP = 1400; // 刻度间距（世界坐标）
const TICKS = [
  { label: 'v1.0', x: 960 },
  { label: 'v2.0', x: 960 + TICK_GAP },
  { label: 'v3.0', x: 960 + TICK_GAP * 2 },
  { label: 'Today', x: 960 + TICK_GAP * 3 },
];
const WORLD_W = 960 + TICK_GAP * 3 + 960;

const TRAVEL_START = 12;
const TRAVEL_END = 104; // 急停帧
const ZOOM_END = 114;

// 相机 X：in-out 但前段慢后段快（poly(3) in 为主，末端 out 急收）
// 用两段拼：0–0.82 加速段（Easing.in(poly(2.2))），0.82–1 急刹段
const camXAt = (f: number): number => {
  const total = TICKS[3].x - 960; // 需要位移的世界距离
  const t = interpolate(f, [TRAVEL_START, TRAVEL_END], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 加速→巡航→急刹：分段缓动，前 15% 缓起，中段近匀加速冲刺，末 12% 急收
  const eased = interpolate(t, [0, 0.15, 0.88, 1], [0, 0.055, 0.9, 1], {
    easing: Easing.inOut(Easing.quad),
  });
  return eased * total;
};

// 每张卡的弹立帧：相机中心扫过该刻度的时刻（数值上预先求好，避免逐帧求逆）
// 通过 camXAt 反查：找到 camX == tick.x - 960 的帧
const popFrameOf = (tickX: number): number => {
  for (let f = TRAVEL_START; f <= TRAVEL_END; f++) {
    if (camXAt(f) >= tickX - 960) return f;
  }
  return TRAVEL_END;
};

const CARD_W = 360;
const CARD_H = 240;

const TickStop: React.FC<{ i: number; frame: number;words?:string[];skin?:TemplateSkin }> = ({ i, frame,words,skin }) => {
  const tick = TICKS[i];
  const pop = popFrameOf(tick.x) - (words && i>0 ? 18 : 6);
  const s = spring({
    frame: frame - pop,
    fps: 30,
    config: { damping: 11, stiffness: 160, mass: 0.9 }, // 明显过冲
    durationInFrames: 26,
  });
  const appeared = frame >= pop;

  return (
    <div style={{ position: 'absolute', left: tick.x, top: 0 }}>
      {/* 刻度竖线 */}
      <div style={{ position: 'absolute', left: -3, top: AXIS_Y - 28, width: 6, height: 56, background: skin?.accent || G.ink, borderRadius: 3 }} />
      {/* 刻度标签 */}
      <div style={{ position: 'absolute', left: -80, top: AXIS_Y + 44, width: 160, textAlign: 'center', fontFamily: skin?.fontFamily || 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif', fontWeight: 800, fontSize: words ? 32 : 40, color: skin?.text || G.ink }}>
        {words?.[1+i*2] || tick.label}
      </div>
      {/* 卡片从刻度线弹立：以底边为轴 scaleY 0→1（带过冲），伴随上移 */}
      {appeared && (
        <div
          style={{
            position: 'absolute',
            left: -CARD_W / 2,
            top: AXIS_Y - 36 - CARD_H,
            transform: `scaleY(${s}) scaleX(${0.6 + 0.4 * s})`,
            transformOrigin: '50% 100%',
            opacity: Math.min(1, s * 2),
          }}
        >
          {words ? <div style={{width:CARD_W,height:CARD_H,boxSizing:'border-box',padding:'38px 26px',background:skin?.surface,border:`2px solid ${skin?.accent}`,borderRadius:8,color:skin?.text,fontFamily:skin?.fontFamily,display:'flex',flexDirection:'column',justifyContent:'center',gap:20}}>
            <div style={{fontSize:42,fontWeight:800}}>{words[1+i*2]}</div>
            <div style={{fontSize:34,lineHeight:1.4}}>{words[2+i*2]}</div>
          </div> : <Card w={CARD_W} h={CARD_H} seed={i + 2} />}
        </div>
      )}
    </div>
  );
};

export const TimelineTravel: React.FC<{words?:string[];skin?:TemplateSkin;durationInFrames?:number}> = ({words,skin}) => {
  if(words && (words.length!==9 || !skin || words.some((word,i)=>!word.trim()||[...word].length>(i===0?8:i%2?4:6)))) throw new Error('TimelineTravel requires a title and four label/detail pairs');
  const frame = useCurrentFrame();
  const motionFrame = words ? interpolate(frame,[0,12,130,140],[0,12,104,114],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',
  }) : frame;
  const camX = camXAt(motionFrame);

  // 急停后推近末刻度：scale 1 → 1.28，中心对准 Today 刻度
  const zoom = interpolate(motionFrame, [TRAVEL_END, ZOOM_END], [1, 1.28], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scene = (
    <div style={{ width: W, height: 1080, background: skin?.bg || G.bg, overflow: 'hidden', position: 'relative' }}>
      <div style={words ? {position:'absolute',inset:0,transform:'scale(0.8)',transformOrigin:'50% 50%'} : {position:'absolute',inset:0}}>
      {/* 推近层：以画面中央偏下（末刻度落点）为原点放大 */}
      <div style={{ width: W, height: 1080, transform: `scale(${zoom})`, transformOrigin: '50% 62%' }}>
        {/* 世界层：唯一横移的容器 */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: WORLD_W, height: 1080, transform: `translateX(${-camX}px)` }}>
          {/* 主轴线 */}
          <div style={{ position: 'absolute', left: 200, top: AXIS_Y - 3, width: WORLD_W - 400, height: 6, background: skin?.muted || G.bar, borderRadius: 3 }} />
          {/* 次刻度（小点，增强速度感） */}
          {Array.from({ length: 22 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: 960 + i * (TICK_GAP / 5) - 2, top: AXIS_Y - 12, width: 4, height: 24, background: skin?.muted || G.bar, borderRadius: 2 }} />
          ))}
          {TICKS.map((_, i) => (
            <TickStop key={i} i={i} frame={motionFrame} words={words} skin={skin} />
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 90, width: '100%', textAlign: 'center' }}>
        {words ? <div style={{fontSize:64,fontWeight:800,fontFamily:skin?.fontFamily,color:skin?.text}}>{words[0]}</div> : <TitleBlock text="TIMELINE TRAVEL" size={64} />}
      </div>
      </div>
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
