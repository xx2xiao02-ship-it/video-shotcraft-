// sakuga-timing-shift —— 一拍三转一拍一（作画打拍切换）
// 0–48f：驱动帧 q = floor(f/3)*3，卡从左侧顿挫横移到右侧（10fps 手翻书感），
// 每步 ≈74px + rotate 摆动 = 一拍三的钝感；48f 切换点后改用原始 f 连续驱动，
// 48–75f 丝滑冲刺折返中央（out-poly(4) 高初速 + 运动拉伸 scaleX + 残影），
// 过冲 36px 后 3f 回弹落位。左上角标 "on 3s"/"on 1s" 随段切换并带 line-boil
// （boil 在 f=108 后冻结）。收尾真静止 ≥40f。
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { G, Card, TitleBlock } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {type TemplateSkin} from '../../_fixtures/TemplateSkin';

const W = 1920;
const CARD_W = 420;
const CARD_H = 260;
const CARD_Y = (1080 - CARD_H) / 2; // 410

const X_LEFT = 120;
const X_RIGHT = 1380; // 卡左缘，右侧停点
const X_CENTER = (W - CARD_W) / 2; // 750，中央落位
const OVERSHOOT = 36;

const SWITCH = 48; // 打拍切换帧
const ARRIVE = 70; // 冲刺到过冲点
const SETTLE = 75; // 回弹落位完成

// 段一：一拍三。位置函数线性，但只在 q = floor(f/3)*3 上取值。
const pos1 = (t: number): number =>
  interpolate(t, [0, SWITCH], [X_LEFT, X_RIGHT], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

// 段二：一拍一。out-poly(4) 高初速冲刺 → 过冲 → 3f 回弹。
const pos2 = (t: number): number =>
  interpolate(t, [SWITCH, ARRIVE, SETTLE], [X_RIGHT, X_CENTER - OVERSHOOT, X_CENTER], {
    easing: Easing.out(Easing.poly(4)),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const SakugaTimingShift: React.FC<{words?:string[];skin?:TemplateSkin;durationInFrames?:number}> = ({words,skin}) => {
  if(words && (words.length!==6 || !skin || words.some(word=>!word.trim()||[...word].length>6))) throw new Error('SakugaTimingShift requires six business labels of at most six characters');
  const f = useCurrentFrame();
  const onThrees = f < SWITCH;

  // ---- 卡片位置 ----
  const q = Math.floor(f / 3) * 3; // 一拍三驱动帧
  const x = onThrees ? pos1(q) : pos2(f);

  // 顿挫段 rotate 摆动（随 q 冻结，一步一个姿势）
  const rot = onThrees
    ? Math.sin(q * 0.7) * 5
    : interpolate(f, [SWITCH, SWITCH + 8], [Math.sin(SWITCH * 0.7) * 5, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  // 冲刺段速度（位置差分，帧时间解耦）→ 运动拉伸
  const v = onThrees ? 0 : Math.abs(pos2(f) - pos2(f - 1));
  const sFac = Math.min(v / 55, 1);
  const stretchX = 1 + 0.35 * sFac; // 峰值 ≈1.35，横向拉丝
  const stretchY = 1 - 0.12 * sFac;

  // 落位急停回弹：72–78f scaleX 压扁再回 1
  const sqX = interpolate(f, [SETTLE - 3, SETTLE, SETTLE + 3], [1, 0.9, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sqY = interpolate(f, [SETTLE - 3, SETTLE, SETTLE + 3], [1, 1.07, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 冲刺残影：只在段二速度高时挂载（条件挂载，不留 opacity 0 的壳）
  const ghosts =
    !onThrees && f > SWITCH + 1 && f < ARRIVE + 2 && sFac > 0.15
      ? [
          { xg: pos2(f - 2), op: 0.28 * sFac },
          { xg: pos2(f - 4), op: 0.13 * sFac },
        ]
      : [];

  // ---- 角标 "on 3s" / "on 1s"，line-boil，f=108 后冻结 ----
  const h = (n: number) => {
    const s = Math.sin(n * 127.3) * 43758.5453;
    return s - Math.floor(s);
  };
  const qb = Math.min(Math.floor(f / 4) * 4, 108); // boil 驱动帧，108 后冻结
  const bx = (h(qb + 1) - 0.5) * 7;
  const by = (h(qb + 2) - 0.5) * 7;
  const brot = (h(qb + 3) - 0.5) * 3;
  // 切换瞬间角标弹一下
  const pop = interpolate(f, [SWITCH, SWITCH + 3, SWITCH + 9], [1, 1.35, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const titleOp = interpolate(f, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const card = words ? <div style={{width:CARD_W,height:CARD_H,boxSizing:'border-box',padding:32,background:skin?.surface,color:skin?.text,border:`2px solid ${skin?.accent}`,borderRadius:8,fontFamily:skin?.fontFamily,display:'flex',flexDirection:'column',justifyContent:'center',gap:14}}>
    <div style={{fontSize:48,fontWeight:800}}>{words[1]}</div>
    <div style={{fontSize:38,lineHeight:1.3}}>{words[2]}</div>
    <div style={{fontSize:38,lineHeight:1.3}}>{words[3]}</div>
  </div> : <Card w={CARD_W} h={CARD_H} seed={4} />;
  const scene = (
    <div style={{ width: 1920, height: 1080, background: skin?.bg || G.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={words ? {position:'absolute',inset:0,transform:'scale(0.8)',transformOrigin:'50% 50%'} : {position:'absolute',inset:0}}>
      <div style={{ position: 'absolute', top: 90, width: '100%', textAlign: 'center', opacity: titleOp }}>
        {words ? <div style={{fontSize:64,fontWeight:800,fontFamily:skin?.fontFamily,color:skin?.text}}>{words[0]}</div> : <TitleBlock text="SAKUGA TIMING SHIFT" size={64} />}
      </div>

      {/* 轨道基线 + 中央落位虚线槽 */}
      <div
        style={{
          position: 'absolute',
          left: 100,
          right: 100,
          top: CARD_Y + CARD_H + 24,
          height: 3,
          background: skin?.muted || G.line,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: X_CENTER,
          top: CARD_Y,
          width: CARD_W,
          height: CARD_H,
          border: `3px dashed ${skin?.muted || G.bar}`,
          borderRadius: 14,
          boxSizing: 'border-box',
        }}
      />

      {/* 冲刺残影 */}
      {ghosts.map((g, i) => (
        <div
          key={`ghost-${i}`}
          style={{ position: 'absolute', left: 0, top: CARD_Y, opacity: g.op, transform: `translateX(${g.xg}px)` }}
        >
          {card}
        </div>
      ))}

      {/* 主卡 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: CARD_Y,
          transform: `translateX(${x}px) rotate(${rot}deg) scaleX(${stretchX * sqX}) scaleY(${stretchY * sqY})`,
          transformOrigin: '50% 50%',
        }}
      >
        {card}
      </div>

      {/* 角标：on 3s / on 1s */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 160,
          transform: `translate(${bx}px, ${by}px) rotate(${brot}deg) scale(${pop})`,
          transformOrigin: '0% 50%',
          fontFamily: skin?.fontFamily || 'Courier New, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace',
          fontWeight: 700,
          fontSize: words ? 60 : 84,
          color: skin?.text || G.ink,
          borderBottom: `6px solid ${skin?.accent || G.ink}`,
          paddingBottom: 6,
        }}
      >
        {words ? words[onThrees ? 4 : 5] : onThrees ? 'on 3s' : 'on 1s'}
      </div>
      </div>
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
