// tape-scroll-fixed-pointer —— 滚带定针
// 取景窗+琥珀三角指针钉死在画面正中，竖向长刻度带（0–500，每 50 一大格）
// 从窗后滚过："世界动、针不动"。先慢速爬（f12–55 读数 60→140 缓涨），
// 然后一次大跳变：刻度带冲刺 ~23f（峰值 ~50px/f）冲过 420 到 442，
// spring 刹车回摆一次（442→415→420）落定。窗内读数同步。f96 后真静止 44f。
// 帧确定性：value(frame) 纯分段 interpolate 全 clamp，带偏移 = value 线性映射。
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { G, TitleBlock } from '../../_fixtures/Fixtures';
import {BusinessDataStage} from '../../_fixtures/BusinessDataStage';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';

const AMBER = '#d4a853';

const PXU = 3; // px per unit：500 量程 → 1500px 长带
const CENTER_Y = 590; // 取景窗中线（屏幕坐标）
const TAPE_X = 830; // 刻度带左缘
const TAPE_W = 260;

// 读数时间线：静置→慢爬→冲刺(过冲到442)→回摆(415)→落定420→真静止
const valueAt = (frame: number,startValue=60,endValue=420): number => {
  if(startValue!==60 || endValue!==420){
    const delta=endValue-startValue;
    const slowEnd=startValue+delta*0.2;
    const over=endValue+delta*0.16;
    const beforeSettle=endValue-delta*0.04;
    if(frame<=12)return startValue;
    if(frame<=55)return interpolate(frame,[12,55],[startValue,slowEnd]);
    if(frame<=78)return interpolate(frame,[55,78],[slowEnd,over],{easing:Easing.inOut(Easing.cubic)});
    if(frame<=88)return interpolate(frame,[78,88],[over,beforeSettle],{easing:Easing.out(Easing.cubic)});
    return interpolate(frame,[88,96],[beforeSettle,endValue],{easing:Easing.out(Easing.cubic),extrapolateRight:'clamp'});
  }
  if (frame <= 12) return 60;
  if (frame <= 55) {
    return interpolate(frame, [12, 55], [60, 140]); // 慢爬 ~5.6px/f
  }
  if (frame <= 78) {
    return interpolate(frame, [55, 78], [140, 442], {
      easing: Easing.inOut(Easing.cubic), // 冲刺段，峰值 ~50px/f
    });
  }
  if (frame <= 88) {
    return interpolate(frame, [78, 88], [442, 415], {
      easing: Easing.out(Easing.cubic), // 刹车回摆：甩过头再拉回
    });
  }
  return interpolate(frame, [88, 96], [415, 420], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: 'clamp',
  });
};

type BusinessRow={label:string;value:number;evidence:string};
type TapeProps={rows?:BusinessRow[];unit?:string;axisMax?:number;title?:string;skin?:TemplateSkin;durationInFrames?:number};

export const TapeScrollFixedPointer: React.FC<TapeProps> = ({rows,unit='',axisMax=500,title,skin}) => {
  const frame = useCurrentFrame();
  const business=Boolean(rows?.length);
  const startValue=business?rows![0].value:60;
  const endValue=business?rows![1].value:420;
  const maxTick=Math.ceil(axisMax/10)*10;
  const v=valueAt(frame,startValue,endValue);
  const ink=skin?.text || G.ink;
  const muted=skin?.muted || G.mid;
  const accent=skin?.accent || AMBER;

  // 刻度带：数值大在上。单位 u 的屏幕 y = CENTER_Y + (v - u) * PXU
  const yOf = (u: number): number => CENTER_Y + (v - u) * PXU;

  const ticks: React.ReactNode[] = [];
  for (let u = 0; u <= (business?maxTick:500); u += 10) {
    const y = yOf(u);
    if (y < 180 || y > 1010) continue; // 视野外裁剪
    const major = u % 50 === 0;
    ticks.push(
      <div key={u} style={{
        position: 'absolute', top: y - 2, right: 0,
        width: major ? 92 : 46, height: major ? 5 : 3,
        background: major ? G.ink : G.mid, borderRadius: 2,
      }} />
    );
    if (major) {
      ticks.push(
        <div key={`n${u}`} style={{
          position: 'absolute', top: y - 22, right: 110,
          fontFamily: 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif', fontWeight: 700,
          fontSize: 38, color: G.mid, textAlign: 'right', width: 90,
        }}>
          {business?`${u}${unit}`:u}
        </div>
      );
    }
  }

  const scene=(
    <div style={{ width: 1920, height: 1080, background: skinBackground(skin,G.bg), position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 90, width: '100%', textAlign: 'center' }}>
        <TitleBlock text={title || 'TAPE SCROLL · FIXED POINTER'} size={68} />
      </div>

      {/* 刻度带容器（世界层：整体在动） */}
      <div style={{
        position: 'absolute', left: TAPE_X, top: 180, width: TAPE_W, height: 830,
        background: G.panel, border: `2px solid ${G.border}`, borderRadius: 12,
        overflow: 'hidden', boxSizing: 'border-box',
      }}>
        <div style={{ position: 'absolute', inset: 0 }}>{
          // 内层坐标 = 屏幕 y - 180
          <div style={{ position: 'absolute', left: 0, right: 14, top: -180, height: 1080 + 400 }}>
            {ticks}
          </div>
        }</div>
      </div>

      {/* 固定层：取景窗 + 琥珀三角指针 + 读数（针不动） */}
      <div style={{
        position: 'absolute', left: TAPE_X - 10, top: CENTER_Y - 46,
        width: TAPE_W + 20, height: 92,
        border: `5px solid ${accent}`, borderRadius: 10,
        boxShadow: '0 4px 14px rgba(0,0,0,0.14)', boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.14)',
      }} />
      <svg width={60} height={64} style={{ position: 'absolute', left: TAPE_X - 66, top: CENTER_Y - 32 }}>
        <polygon points="4,4 56,32 4,60" fill={accent} />
      </svg>

      {/* 同步读数窗 */}
      <div style={{
        position: 'absolute', left: TAPE_X + TAPE_W + 70, top: CENTER_Y - 84,
        width: 380, height: 168, background: G.card,
        border: `2px solid ${G.border}`, borderRadius: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 36px', boxSizing: 'border-box',
      }}>
        {business && <div style={{fontFamily:skin?.fontFamily,fontSize:20,fontWeight:700,color:muted,marginBottom:8}}>{rows![0].label} → {rows![1].label}</div>}
        {!business && <div style={{ height: 12, width: 150, background: G.line, borderRadius: 6, marginBottom: 12 }} />}
        <div style={{ fontFamily: 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif', fontWeight: 800, fontSize: 96, color: accent, letterSpacing: -2, lineHeight: 1 }}>
          {Math.round(v)}{business?unit:''}
        </div>
      </div>
    </div>
  );
  return skin ? <BusinessDataStage skin={skin}>{scene}</BusinessDataStage> : scene;
};
