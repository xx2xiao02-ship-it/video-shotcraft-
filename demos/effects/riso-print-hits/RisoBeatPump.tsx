// 套印节拍泵（riso-beat-pump）——beat-punch-in（卡点顿推）× riso-misregistration-hit
// （套印错位）的组合节奏。节拍帧 [30,54,78,102]（每 24f 一拍），每命中帧：
// ① 整画面 scale 一帧瞬跳 1.08（无渐入），14f 内按 exp(-t/3) 指数衰减回 1；
// ② 标题裂成 G.mid/G.ink 双色印版 multiply 错位，初始错位逐拍加码 4/7/11/16px
//    （每版反向 → 总分离 8/14/22/32px），12f 衰减余弦震荡收敛套准；
// ③ 底部对应节拍刻度点闪深并常驻。结构：0–29f hold；30–115f 四拍；116–139f 真静止。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { G, Card, TitleBlock } from '../../_fixtures/Fixtures';
import {BusinessTextStage} from '../../_fixtures/BusinessTextStage';
import {type TemplateSkin} from '../../_fixtures/TemplateSkin';

const HITS = [30, 54, 78, 102]; // 节拍命中帧
const AMP = [4, 7, 11, 16]; // 每拍单版初始错位（px），逐拍加码
const PUMP_WIN = 14; // scale 泵窗口：14f 后精确归 1（保证结尾真静止）
const SPLIT_WIN = 12; // 错位窗口：12f 后精确归 0（余量 <0.4px，硬切套准）

// 与 TitleBlock 同字形的单色印版（错位需要可调色副本）
const Plate: React.FC<{ color: string; dx: number; dy: number;label?:string;skin?:TemplateSkin }> = ({ color, dx, dy,label,skin }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: `translate(${dx}px, ${dy}px)`,
      mixBlendMode: 'multiply',
    }}
  >
    <div
      style={{
        fontFamily: skin?.fontFamily || 'Helvetica, Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        fontWeight: 800,
        fontSize: 160,
        color,
        letterSpacing: label ? 0 : -1,
        whiteSpace: 'nowrap',
      }}
    >
      {label || 'ON THE BEAT'}
    </div>
  </div>
);

export const RisoBeatPump: React.FC<{words?:string[];skin?:TemplateSkin;durationInFrames?:number}> = ({words,skin}) => {
  if(words && (words.length!==7 || !skin || words.some(word=>!word.trim()||[...word].length>6))) throw new Error('RisoBeatPump requires a title and three title/detail pairs');
  const frame = useCurrentFrame();

  // 找最近一次已命中的节拍（24f 间隔 > 14f 窗口，永远只有一拍在作用）
  let beatIdx = -1;
  for (let i = 0; i < HITS.length; i++) {
    if (frame >= HITS[i]) beatIdx = i;
  }
  const t = beatIdx >= 0 ? frame - HITS[beatIdx] : Infinity;

  // ① 整画面泵：命中帧一帧到位 1.08（t=0 即满值，无渐入），指数衰减回 1
  const pump = t < PUMP_WIN ? 1 + 0.08 * Math.exp(-t / 3) : 1;

  // ② 标题错位：衰减余弦震荡（周期 6f 抖两下），窗口外精确 0 = 套准
  const split = t < SPLIT_WIN;
  const m = split ? Math.cos((2 * Math.PI * t) / 6) * Math.exp(-t / 3) : 0;
  const dx = beatIdx >= 0 ? AMP[beatIdx] * m : 0;
  const dy = dx * 0.45; // y 少量，更像没对准版

  const scene = (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: words ? '#f5f6f7' : G.bg,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 整画面容器：scale 泵作用在全部内容上 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${pump * (words ? 0.8 : 1)})`,
          transformOrigin: 'center center',
        }}
      >
        {/* 标题区：正体 / 双版错位互斥切换 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 660 }}>
          {!split && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {words ? <div style={{fontSize:160,fontWeight:800,color:skin?.surface,fontFamily:skin?.fontFamily}}>{words[0]}</div> : <TitleBlock text="ON THE BEAT" size={160} />}
            </div>
          )}
          {split && (
            <>
              <Plate color={words ? skin!.accent : G.mid} dx={-dx} dy={dy} label={words?.[0]} skin={skin} />
              <Plate color={words ? skin!.surface : G.ink} dx={dx} dy={-dy} label={words?.[0]} skin={skin} />
            </>
          )}
        </div>

        {/* 底下一排 3 张小卡 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 660,
            display: 'flex',
            justifyContent: 'center',
            gap: 44,
          }}
        >
          {words ? [0,1,2].map(i=><div key={i} style={{width:330,height:200,boxSizing:'border-box',padding:'30px 24px',background:skin!.surface,border:`2px solid ${skin!.accent}`,borderRadius:8,color:skin!.text,fontFamily:skin!.fontFamily,display:'flex',flexDirection:'column',justifyContent:'center',gap:18}}>
            <div style={{fontSize:42,fontWeight:800}}>{words[1+i*2]}</div><div style={{fontSize:32}}>{words[2+i*2]}</div>
          </div>) : <><Card w={330} h={200} seed={2} /><Card w={330} h={200} seed={5} /><Card w={330} h={200} seed={8} /></>}
        </div>

        {/* 节拍刻度：命中即闪深（8f 缩放脉冲 1.8→1）并常驻深色 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 950,
            display: 'flex',
            justifyContent: 'center',
            gap: 60,
          }}
        >
          {HITS.map((hit, i) => {
            const dt = frame - hit;
            const on = dt >= 0;
            const s = on && dt < 8 ? 1 + 0.8 * (1 - dt / 8) : 1;
            return (
              <div
                key={i}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: on ? skin?.surface || G.ink : G.bar,
                  transform: `scale(${s})`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
  return skin ? <BusinessTextStage skin={skin}>{scene}</BusinessTextStage> : scene;
};
