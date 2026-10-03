import fs from 'node:fs';
import path from 'node:path';

const out=path.resolve(import.meta.dirname,'out/card-governance-batch-003-routing');
const report=JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8'));
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const videos=[...report.legacy.short,...report.legacy.numeric];
const stills=[...report.legacy.long,...(report.legacyDirectoryChoice ? [report.legacyDirectoryChoice] : [])];
const samples=videos.flatMap(item=>item.samples).concat(stills);
if(videos.length!==20 || samples.some(sample=>!sample.pixelIdentical) || !report.routingChecks?.every(check=>check.rejected)) throw new Error('Incomplete passing evidence');
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>精确运行选择兼容验收</title><style>body{margin:24px;font:14px/1.6 'Microsoft YaHei';background:#f4f7f8;color:#18272b}h1{font-size:24px}h2{font-size:18px}section{border-top:1px solid #cad5d7;padding:16px 0}video{width:320px;max-width:100%}img{height:180px;max-width:100%;object-fit:contain}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>精确运行选择兼容验收</h1><p>20条既有视频、${samples.length}对冻结源码样帧逐像素一致。六张卡准入数量不增长。收费模型、服务加载、用户验收未验证。</p><p>首次竖屏第98帧有8个边缘像素差异；原失败产物保留，三次重新渲染均逐像素一致。采用重新渲染的精确证据，未放宽标准。</p><p><a href="evidence.json">有效兼容证据</a> · <a href="failed-evidence.json">原失败报告</a> · <a href="repeat-diagnostic.json">三次复核</a></p><h2>A模式真实渲染拒绝</h2><pre>${escape(JSON.stringify(report.routingChecks,null,2))}</pre>${videos.map(item=>`<section><h2>${escape(item.card)} · ${escape(item.aspect)}</h2><video controls preload="metadata" src="${path.basename(item.file)}"></video>${item.samples.map(sample=>`<img src="${path.basename(sample.file)}" alt="${sample.frame}帧">`).join('')}</section>`).join('')}<h2>长图形及历史目录兼容样帧</h2>${stills.map(sample=>`<img src="${path.basename(sample.file)}" alt="${escape(sample.card)}">`).join('')}</html>`);
console.log(JSON.stringify({videos:videos.length,exactSamplePairs:samples.length,output:out}));
