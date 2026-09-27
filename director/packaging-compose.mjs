// 视频外包装 - 离线封面合成：ffmpeg 一次 filter_complex 完成 裁切 + 渐变遮罩 + 大字标题。
// 纯排版函数（wrap/layout/fragment）导出供测试；合成函数外调 ffmpeg CLI，不 import 仓库内其他模块。
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {extractFrame, ffmpegPath, ffprobePath} from './packaging-media.mjs';

const FONT_CANDIDATES = ['C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc'];

export function titleFontFile() {
  for (const font of FONT_CANDIDATES) if (existsSync(font)) return font;
  throw new Error('未找到微软雅黑字体（msyhbd.ttc / msyh.ttc）');
}

export function outputSize(ratio) {
  return ratio === '9:16' ? [1080, 1920] : [1920, 1080];
}

export function hexToFfColor(hex) {
  const match = /^#([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!match) throw new Error(`非法颜色值: ${hex}`);
  return `0x${match[1].toLowerCase()}`;
}

// ffmpeg filter 选项值里的路径：反斜杠转正斜杠、盘符冒号转义、单引号包裹
export function filterPath(value) {
  return `'${String(value).replace(/\\/g, '/').replace(/:/g, '\\:')}'`;
}

const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\u3000-\u303F]/;

function charUnits(ch) {
  if (CJK.test(ch)) return 1;
  if (/[A-Z0-9@#%&]/.test(ch)) return 0.7;
  if (/\s/.test(ch)) return 0.35;
  return 0.55;
}

// 按视觉宽度贪心断行：中文逐字成块，ASCII 单词保持完整；封面最多 4 行
export function wrapTitleLines(title, maxUnits = 12) {
  const text = String(title || '').trim();
  if (!text) return [];
  const tokens = [];
  let buffer = '';
  for (const ch of text) {
    if (/\s/.test(ch)) {
      if (buffer) { tokens.push(buffer); buffer = ''; }
      continue;
    }
    buffer += ch;
    if (CJK.test(ch)) { tokens.push(buffer); buffer = ''; }
  }
  if (buffer) tokens.push(buffer);
  const lines = [];
  let line = '';
  let units = 0;
  for (const token of tokens) {
    const width = [...token].reduce((sum, ch) => sum + charUnits(ch), 0);
    if (line && units + width > maxUnits) { lines.push(line); line = token; units = width; }
    else { line += token; units += width; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function maxCharsForWidth(width, fontSize) {
  return Math.max(4, Math.floor((width * 0.86) / Math.max(1, fontSize)));
}

// 计算标题块排版：返回字号与绘制操作序列（标题行 → 主题色强调条 → 副标题）
export function layoutTitleBlock({lines, subtitle = '', width, height, mode = 'cover'}) {
  const fontSize = Math.round(Math.min(width, height) * 0.125);
  const lineHeight = Math.round(fontSize * 1.32);
  const subtitleSize = Math.max(18, Math.round(fontSize * 0.4));
  const subtitleGap = Math.round(fontSize * 0.55);
  const barH = Math.max(8, Math.round(fontSize * 0.09));
  const barGap = Math.round(fontSize * 0.5);
  const blockH = (lines.length - 1) * lineHeight + fontSize
    + barGap + barH + (subtitle ? subtitleGap + subtitleSize : 0);
  const bottomY = mode === 'cover'
    ? Math.round(height * 0.86)
    : Math.round(height * 0.44 + blockH / 2);
  let cursor = bottomY - blockH;
  const ops = [];
  for (const line of lines) {
    ops.push({kind:'text', text:line, y:cursor, fontSize, role:'title'});
    cursor += lineHeight;
  }
  cursor += barGap;
  ops.push({kind:'bar', y:cursor, h:barH});
  cursor += barH;
  if (subtitle) {
    cursor += subtitleGap;
    ops.push({kind:'text', text:subtitle, y:cursor, fontSize:subtitleSize, role:'subtitle'});
  }
  return {fontSize, ops};
}

// overlay 模式（视频帧上的浅色字）用黑描边+阴影保证可读性；
// card 模式（主题底色上的深色字）去描边，只留轻阴影。
export function drawtextFragment({textFile, fontSize, y, color, fontFile, outline = true}) {
  const edge = outline
    ? `:borderw=${Math.max(3, Math.round(fontSize * 0.045))}`
      + ':bordercolor=0x000000@0.6'
      + `:shadowx=0:shadowy=${Math.max(2, Math.round(fontSize * 0.04))}`
      + ':shadowcolor=0x000000@0.45'
    : `:borderw=0:shadowx=0:shadowy=${Math.max(2, Math.round(fontSize * 0.03))}:shadowcolor=0x000000@0.2`;
  return 'drawtext='
    + `fontfile=${filterPath(fontFile)}`
    + `:textfile=${filterPath(textFile)}`
    + `:fontcolor=${hexToFfColor(color)}`
    + `:fontsize=${fontSize}`
    + ':x=(w-text_w)/2'
    + `:y=${Math.round(y)}`
    + edge;
}

function buildTextOps({lines, subtitle, width, height, mode, titleColor, subtitleColor, accent, textDir}) {
  const {ops} = layoutTitleBlock({lines, subtitle, width, height, mode});
  const fontFile = titleFontFile();
  const parts = [];
  let textIndex = 0;
  for (const op of ops) {
    if (op.kind === 'text') {
      textIndex += 1;
      const file = path.join(textDir, `t${textIndex}.txt`);
      writeFileSync(file, op.text, 'utf8');
      parts.push(drawtextFragment({
        textFile:file, fontSize:op.fontSize, y:op.y,
        color:op.role === 'title' ? titleColor : subtitleColor, fontFile,
        outline:mode === 'cover',
      }));
    } else {
      const barW = Math.round(width * 0.14);
      parts.push(`drawbox=x=(iw-${barW})/2:y=${op.y}:w=${barW}:h=${op.h}:color=${hexToFfColor(accent)}@0.95:t=fill`);
    }
  }
  return parts;
}

// 从视频某一帧合成封面：全分辨率抽帧 → 底部渐变压暗 + 大字标题
export function composeCover({videoFile, timeSeconds, title, subtitle = '', ratio = '16:9',
  overlayStrength = 0.6, theme, titleColor = '#ffffff', subtitleColor = '#f2f2f2', outFile, workDir}) {
  if (!String(title || '').trim()) throw new Error('封面标题不能为空');
  const [width, height] = outputSize(ratio);
  const tokens = theme?.tokens || {};
  const accent = tokens.accentPrimary || '#d4a853';
  const fontSize = Math.round(Math.min(width, height) * 0.125);
  const lines = wrapTitleLines(title, maxCharsForWidth(width, fontSize));
  if (!lines.length) throw new Error('封面标题为空');
  mkdirSync(path.join(workDir, 'text'), {recursive:true});
  const frameFile = path.join(workDir, 'source-frame.png');
  extractFrame(videoFile, timeSeconds, frameFile);
  const drawParts = buildTextOps({lines, subtitle, width, height, mode:'cover',
    titleColor, subtitleColor, accent, textDir:path.join(workDir, 'text')});
  const bottomAlpha = Math.min(0.92, Math.max(0.25, Number(overlayStrength) || 0.6));
  const gradient = `gradients=s=${width}x${height}:c0=0x000000@0:c1=0x000000@${bottomAlpha.toFixed(2)}`
    + `:x0=0:y0=0:x1=0:y1=${height}:duration=1:rate=1`;
  const filter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[bg]`
    + `;[bg][1:v]overlay=0:0:format=auto[base]`
    + `;[base]${drawParts.join(',')}[out]`;
  const args = ['-y','-hide_banner','-loglevel','error','-i',frameFile,'-f','lavfi','-i',gradient,
    '-filter_complex',filter,'-map','[out]','-frames:v','1','-q:v','2',String(outFile)];
  execFileSync(ffmpegPath(), args, {timeout:120000});
  return {file:outFile, lines, width, height};
}

// 纯标题卡：主题底色 + 顶部品牌色氛围渐变 + 大字标题（无视频画面）
export function composeTitleCard({title, subtitle = '', ratio = '16:9', theme, outFile, workDir}) {
  if (!String(title || '').trim()) throw new Error('标题卡标题不能为空');
  const [width, height] = outputSize(ratio);
  const tokens = theme?.tokens || {};
  const background = tokens.background || '#0d0f14';
  const surface = tokens.surface || '#1a1d24';
  const accent = tokens.accentPrimary || '#d4a853';
  const accentSecondary = tokens.accentSecondary || '#b48020';
  const titleColor = tokens.text || '#e8e6e1';
  const subtitleColor = tokens.textMuted || '#8a8680';
  const fontSize = Math.round(Math.min(width, height) * 0.125);
  const lines = wrapTitleLines(title, maxCharsForWidth(width, fontSize));
  if (!lines.length) throw new Error('标题卡标题为空');
  mkdirSync(path.join(workDir, 'text'), {recursive:true});
  const drawParts = buildTextOps({lines, subtitle, width, height, mode:'card',
    titleColor, subtitleColor, accent, textDir:path.join(workDir, 'text')});
  const wash = `gradients=s=${width}x${height}:c0=${hexToFfColor(accentSecondary)}@0.16:c1=${hexToFfColor(surface)}@0.30`
    + `:x0=0:y0=0:x1=0:y1=${height}:duration=1:rate=1`;
  const filter = `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=${hexToFfColor(background)}:t=fill[bg]`
    + `;[bg][1:v]overlay=0:0:format=auto[base]`
    + `;[base]${drawParts.join(',')}[out]`;
  const args = ['-y','-hide_banner','-loglevel','error','-f','lavfi','-i',
    `color=c=${hexToFfColor(background)}:s=${width}x${height}:d=1:r=1`,
    '-f','lavfi','-i',wash,'-filter_complex',filter,'-map','[out]','-frames:v','1',String(outFile)];
  execFileSync(ffmpegPath(), args, {timeout:60000});
  return {file:outFile, lines, width, height};
}

export function probeImage(imageFile) {
  const raw = execFileSync(ffprobePath(), ['-v','error','-show_entries','stream=width,height','-of','json',
    String(imageFile)], {encoding:'utf8', timeout:15000});
  const stream = (JSON.parse(raw).streams || [])[0] || {};
  return {width:Number(stream.width || 0), height:Number(stream.height || 0)};
}
