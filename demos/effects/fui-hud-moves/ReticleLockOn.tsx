// reticle-lock-on —— 准星咬合（钢铁侠 HUD / 安德的游戏）
// FakeDashboard 静置。四个 L 形角标组成的取景框从画外飞入（大框），
// 超调回弹后收缩贴紧目标卡片四角"咔"地咬合定格；咬合帧卡片微亮 +
// 旁弹一行小标签。画面不冻结，是运动中的捕获。
// f0–14 面板静置；f14–24 飞入；f24–46 收缩（含过冲回弹）；f46 咬合；
// 标签 f46–56 弹出；f56 后真静止 ≥84f（140f 总长）。
import React from 'react';
import { AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, Easing } from 'remotion';
import { G, FakeDashboard } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {skinBackground, type TemplateSkin} from '../../_fixtures/TemplateSkin';
import {BusinessScreen} from '../../_fixtures/BusinessScreen';

// 目标：variant A 网格第 2 张卡（第一行中间）。
// 布局推导：侧栏 220 + padding 36，网格 3 列 gap 28，
// 内容区宽 1700-72=1628 → 卡宽 (1628-56)/3 ≈ 524，卡高 (1080-72-72-28)/2 ≈ 454...
// 实测近似：目标框取第一行中间卡的外接矩形（含少量呼吸边距）。
const CARD_X = 220 + 36 + 524 + 28; // ≈ 808
const CARD_Y = 72 + 36; // 108
const CARD_W = 524;
const CARD_H = 425;
const PAD = 14; // 咬合后角标与卡的呼吸距

const TCX = CARD_X + CARD_W / 2;
const TCY = CARD_Y + CARD_H / 2;

const FLY_IN = 14; // 飞入开始
const FLY_END = 24; // 飞入结束（大框就位）
const LOCK_END = 46; // 咬合帧
const LABEL_END = 56;

const ARM = 56; // L 臂长
const THICK = 10; // L 粗

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

type Screen = {src:string;kind:'image'|'video';width:number;height:number};
type TargetRect = {x:number;y:number;width:number;height:number};

export const ReticleLockOn: React.FC<{screen?:Screen;targetRect?:TargetRect;
  focusLabel?:string;skin?:TemplateSkin;durationInFrames?:number}> = ({screen,targetRect,focusLabel,skin}) => {
  const frame = useCurrentFrame();
  const {width,height}=useVideoConfig();
  const business=Boolean(screen || targetRect || focusLabel);
  if(business && (!screen || !targetRect || !focusLabel || !skin)) {
    throw new Error('Reticle business input requires screen, targetRect, focusLabel and skin.');
  }
  if(screen && (!screen.src || !['image','video'].includes(screen.kind) || screen.width!==1920 || screen.height!==1080)) {
    throw new Error('Reticle screen must use real 1920x1080 media.');
  }
  if(targetRect && (!Object.values(targetRect).every(Number.isFinite) || targetRect.x<0 || targetRect.y<0 ||
    targetRect.width<40 || targetRect.height<40 || targetRect.x+targetRect.width>1920 ||
    targetRect.y+targetRect.height>1080)) throw new Error('Reticle target must fit the actual screen.');
  if(focusLabel && [...focusLabel].length>12) throw new Error('Reticle label exceeds 12 characters.');
  const card=targetRect || {x:CARD_X,y:CARD_Y,width:CARD_W,height:CARD_H};
  const cx=card.x+card.width/2;
  const cy=card.y+card.height/2;
  const ink=skin?.accent || G.ink;

  // 飞入：整框从右下画外冲进来，同时是个放大 2.2× 的大框
  const flyT = interpolate(frame, [FLY_IN, FLY_END], [0, 1], {
    easing: Easing.out(Easing.cubic),
    ...clamp,
  });
  const flyDX = (1 - flyT) * 1100;
  const flyDY = (1 - flyT) * 620;

  // 收缩咬合：半宽/半高从 2.2× 收到贴紧，带超调（收过头 6% 再弹回）
  const shrink = interpolate(
    frame,
    [FLY_END, LOCK_END - 8, LOCK_END - 3, LOCK_END],
    [2.2, 1.06, 0.94, 1],
    { easing: Easing.inOut(Easing.cubic), ...clamp },
  );
  const hw = (card.width / 2 + PAD) * shrink;
  const hh = (card.height / 2 + PAD) * shrink;

  // 咬合帧：卡片微亮（一层白色 overlay 快闪后停在 0.28）
  const glow = interpolate(frame, [LOCK_END, LOCK_END + 3, LOCK_END + 10], [0, 0.55, 0.28], clamp);

  // 标签：咬合后从角标右上弹出（scaleX 展开 + 淡入）
  const labelT = interpolate(frame, [LOCK_END + 2, LABEL_END], [0, 1], {
    easing: Easing.out(Easing.back(1.8)),
    ...clamp,
  });

  const showReticle = frame >= FLY_IN;
  const locked = frame >= LOCK_END;

  // 四个 L 角：位置 = 中心 ± (hw, hh)，各自镜像
  const corners = [
    { x: cx - hw, y: cy - hh, sx: 1, sy: 1 },
    { x: cx + hw, y: cy - hh, sx: -1, sy: 1 },
    { x: cx - hw, y: cy + hh, sx: 1, sy: -1 },
    { x: cx + hw, y: cy + hh, sx: -1, sy: -1 },
  ];

  const scene=(
    <div style={{ width: 1920, height: 1080, background: skinBackground(skin,G.bg), overflow: 'hidden', position: 'relative' }}>
      {screen ? <BusinessScreen screen={screen} width={1920} height={1080}/> : <FakeDashboard variant="A" />}
      {/* 咬合微亮层：条件渲染，锁定前不存在 */}
      {locked && (
        <div
          style={{
            position: 'absolute',
            left: card.x,
            top: card.y,
            width: card.width,
            height: card.height,
            borderRadius: 14,
            background: '#ffffff',
            opacity: glow,
            pointerEvents: 'none',
          }}
        />
      )}
      {showReticle && (
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${flyDX}px, ${flyDY}px)` }}>
          {corners.map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: c.x,
                top: c.y,
                transform: `scale(${c.sx}, ${c.sy})`,
                transformOrigin: '0 0',
              }}
            >
              {/* L 形角标：横臂 + 竖臂 */}
              <div style={{ position: 'absolute', left: 0, top: 0, width: ARM, height: THICK, background: ink }} />
              <div style={{ position: 'absolute', left: 0, top: 0, width: THICK, height: ARM, background: ink }} />
            </div>
          ))}
          {/* 小标签：右上角标外侧弹出 */}
          {frame >= LOCK_END + 2 && (
            <div
              style={{
                position: 'absolute',
                left: business ? Math.min(cx+hw+18,1920-36-((focusLabel?.length || 0)*26+36)) : TCX+hw+18,
                top: business ? Math.max(36,cy-hh-68) : TCY-hh-6,
                transform: `scale(${labelT})`,
                transformOrigin: '0 50%',
                background: ink,
                color: skin?.text || 'var(--text)',
                fontFamily: skin?.fontFamily || 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
                fontWeight: 700,
                fontSize: 26,
                padding: '10px 18px',
                borderRadius: 8,
                whiteSpace: 'nowrap',
                opacity: Math.min(1, labelT * 1.5),
              }}
            >
              {focusLabel || 'TARGET · CARD_02'}
            </div>
          )}
        </div>
      )}
    </div>
  );
  if(business && skin && height>width) {
    const scale=height/1080;
    const halfWidth=width/scale/2;
    const center=Math.max(halfWidth,Math.min(1920-halfWidth,cx));
    return <AbsoluteFill style={{background:skinBackground(skin,skin.bg),overflow:'hidden'}}>
      <div style={{position:'absolute',width:1920,height:1080,left:width/2-center*scale,
        top:0,transform:`scale(${scale})`,transformOrigin:'top left'}}>{scene}</div>
    </AbsoluteFill>;
  }
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
