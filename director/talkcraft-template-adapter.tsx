import {captionCardProps} from './talkcraft-caption-style.mjs';
import {THEME} from './theme';
import {assertCaptionScene,templateCaptionMask} from './talkcraft-caption-layer.mjs';
import React from 'react';
import {staticFile} from 'remotion';
import {CARD_REGISTRY} from './cards/index';
import {CARD_CONTRACTS} from './card-contracts';

type ShotLike = {
  id: string;
  shotCard: string | null;
  templateParams?: Record<string, unknown>;
};

export type TalkcraftSkin = {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
  fontFamily: string;
  transparentBackground: boolean;
};

export type TalkcraftCopy = {
  title: string;
  body: string;
  labels: string[];
};

type AdapterContext = {
  shot: ShotLike;
  copy: TalkcraftCopy;
  skin: TalkcraftSkin;
  durationInFrames: number;
};

const asText = (value: unknown) => String(value ?? '').trim();

/**
 * B 模式唯一的模板转译入口。
 * 绑定器负责决定 shotCard；这里负责把标准镜头数据转成卡片 props。
 */
export function renderTalkcraftTemplate({shot, copy, skin, durationInFrames}: AdapterContext): React.ReactNode {
  const params = shot.templateParams || {};
  assertCaptionScene(shot);
  const Card = CARD_REGISTRY[shot.shotCard || ''];
  const contract = CARD_CONTRACTS[shot.shotCard || ''];
  if (!Card || !contract) throw new Error(`镜头 ${shot.id} 的正式卡片或契约不存在：${shot.shotCard}`);
  if (!params.cardProps || typeof params.cardProps !== 'object' || Array.isArray(params.cardProps))
    throw new Error(`镜头 ${shot.id} 缺少 ${shot.shotCard} 的业务参数，禁止渲染默认演示文案`);
  const props = captionCardProps(shot.shotCard,params.cardProps as Record<string,unknown>,THEME);
  for (const key of Object.keys(props)) {
    if (!contract.fields.includes(key)) throw new Error(`镜头 ${shot.id} 的 ${shot.shotCard} 不支持参数 ${key}`);
    if (contract.locked.includes(key)) throw new Error(`镜头 ${shot.id} 不得修改运动参数 ${key}`);
  }
  for (const key of contract.required) {
    const value=props[key];
    if (value == null || (typeof value==='string' && !value.trim() && !contract.blankAllowed.includes(key)))
      throw new Error(`镜头 ${shot.id} 缺少模板内容 ${key}`);
  }
  // Only resolve declared media fields. Never insert generic srcs/hostSrc or
  // change DSL strings into arrays expected by a different implementation.
  const resolveMedia=(value:string)=>staticFile(value.replace(/^remotion\/public\//u,'').replace(/^\/+/,''));
  for (const [key,kind] of Object.entries(contract.media)) {
    if (typeof props[key] !== 'string' || !props[key]) continue;
    props[key]=kind==='image-list' ? (props[key] as string).split('\n').map(resolveMedia).join('\n') : resolveMedia(props[key] as string);
  }
  const mask=templateCaptionMask(shot.shotCard);
  // Only the original outer stage is transparent; nested diagrams/panels keep their fill.
  // No scale/position/camera/word timing changes. Real shot video backgrounds win.
  return <>{mask && <style data-template-caption-mask>{mask}</style>}{skin.transparentBackground
    ? <div data-film-background-card style={{display:'contents'}}><style>{'[data-film-background-card] > div {background:transparent!important;}'}</style>{React.createElement(Card,props)}</div>
    : React.createElement(Card,props)}</>;
}
