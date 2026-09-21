/**
 * 色彩参数扫描器：扫描 demos 下所有组件，提取颜色使用情况
 * 输出: 每个组件的颜色来源、硬编码颜色、语义分类
 */
const fs = require('fs');
const path = require('path');

const demosDir = path.join(process.cwd(), 'demos');
const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (f.endsWith('.tsx') && !full.includes('_fixtures')) files.push(full);
  }
}
walk(demosDir);

// 颜色值模式
const HEX = /#[0-9a-fA-F]{3,8}/g;
const RGBA = /rgba?\([^)]+\)/g;
const HSL = /hsl\([^)]+\)/g;
const OKLCH = /oklch\([^)]+\)/g;

// 语义分类规则
function classifyColor(raw, context) {
  const c = raw.toLowerCase();
  // 透明/遮罩
  if (c.includes('transparent') || /rgba?\([^)]*0(?:\.0+)?\)/.test(c) && !c.includes('0.') ) return '透明/遮罩';
  // 强调色（高饱和/亮色）
  if (c.includes('gradient')) return '渐变';
  // 黑白
  if (c === '#fff' || c === '#ffffff') return '白色';
  if (c === '#000' || c === '#000000') return '黑色';
  // 深背景
  if (/^#(0[0-9a-f]|1[0-9a-f])[0-9a-f]{4}$/.test(c.slice(0,7))) return '深背景';
  // 浅背景
  if (/^#([e-f][0-9a-f]|f[0-9a-f])[0-9a-f]{4}$/.test(c.slice(0,7))) return '浅背景';
  // rgba 有透明度
  if (c.startsWith('rgba')) {
    const m = c.match(/rgba?\(([^,]+),([^,]+),([^,]+),([^)]+)\)/);
    if (m) {
      const a = parseFloat(m[4]);
      if (a < 0.15) return '透明/遮罩';
      if (a < 0.5) return '半透明层';
      return '实色';
    }
  }
  return '中间色';
}

// 上下文关键词分类
function contextOf(line) {
  const l = line.toLowerCase();
  if (/background|bg\s*:/.test(l)) return '背景';
  if (/color\s*:/.test(l)) return '文字';
  if (/border|outline/.test(l)) return '边框';
  if (/shadow|box-shadow/.test(l)) return '阴影';
  if (/fill|stroke/.test(l)) return '图形';
  return '元素';
}

const results = [];
for (const f of files) {
  const rel = path.relative(demosDir, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf-8');
  const lines = content.split('\n');
  
  const colors = { 背景: new Set(), 文字: new Set(), 边框: new Set(), 阴影: new Set(), 图形: new Set(), 元素: new Set(), 渐变: new Set(), 透明: new Set() };
  let useG = false, useDesignStage = false;
  let hexCount = 0, rgbaCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/import.*Fixtures|from '\.\.\/\.\.\/_fixtures/.test(line) || /G\./.test(line)) useG = true;
    if (/DesignStage/.test(line)) useDesignStage = true;
    
    const ctx = contextOf(line);
    const matches = [];
    for (const re of [HEX, RGBA, HSL, OKLCH]) {
      const m = line.match(re);
      if (m) { matches.push(...m); }
    }
    for (const m of matches) {
      const cat = classifyColor(m, line);
      // 归入语义类
      let key = ctx;
      if (cat === '透明/遮罩') key = '透明';
      else if (cat === '渐变') key = '渐变';
      else if (ctx === '背景' && (cat === '深背景' || cat === '浅背景')) key = '背景';
      else if (ctx === '文字') key = '文字';
      colors[key] && colors[key].add(m.toLowerCase());
      if (m.startsWith('#')) hexCount++;
      if (m.startsWith('rgba')) rgbaCount++;
    }
  }
  
  results.push({
    path: rel,
    useG,
    useDesignStage,
    hexCount,
    rgbaCount,
    colors: Object.fromEntries(Object.entries(colors).filter(([k,v]) => v.size > 0).map(([k,v]) => [k, [...v].slice(0,8)])),
  });
}

// 输出 JSON
fs.writeFileSync(path.join(process.cwd(), 'director', 'color-scan.json'), JSON.stringify(results, null, 2));

// 汇总统计
const stats = {
  total: results.length,
  useG: results.filter(r => r.useG).length,
  useDesignStage: results.filter(r => r.useDesignStage).length,
  hardcodedOnly: results.filter(r => !r.useG && !r.useDesignStage).length,
  totalHex: results.reduce((s, r) => s + r.hexCount, 0),
  totalRgba: results.reduce((s, r) => s + r.rgbaCount, 0),
};
console.log('=== 扫描汇总 ===');
console.log(`总组件: ${stats.total}`);
console.log(`引用 G 调色板: ${stats.useG} (${(stats.useG/stats.total*100).toFixed(0)}%)`);
console.log(`使用 DesignStage: ${stats.useDesignStage} (${(stats.useDesignStage/stats.total*100).toFixed(0)}%)`);
console.log(`完全不引用共享调色板(纯硬编码): ${stats.hardcodedOnly}`);
console.log(`硬编码 hex 总数: ${stats.totalHex}`);
console.log(`rgba 总数: ${stats.totalRgba}`);

// 全库颜色词频
const allColors = new Map();
for (const r of results) {
  for (const [cat, vals] of Object.entries(r.colors)) {
    for (const v of vals) {
      allColors.set(v, (allColors.get(v) || 0) + 1);
    }
  }
}
console.log('\n=== 颜色词频 Top 40 ===');
[...allColors.entries()].sort((a,b) => b[1]-a[1]).slice(0,40).forEach(([c,n]) => console.log(`${String(n).padStart(4)}x  ${c}`));
