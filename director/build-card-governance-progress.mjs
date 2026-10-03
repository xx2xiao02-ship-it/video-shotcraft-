import fs from 'node:fs';
import path from 'node:path';
import {buildSourceAudit} from './card-source-audit.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'template/out/card-governance-progress');
fs.mkdirSync(out,{recursive:true});
const report=buildSourceAudit(root);
const variants=report.cards.flatMap(card=>card.variants);
const counters={cards:report.counts.cards,variants:variants.length,sourceResolved:variants.filter(v=>v.component).length,
  adapterDeclared:variants.filter(v=>v.status.implemented).length,
  currentLocallyAdmitted:variants.filter(v=>v.status.locallyTested).length,
  longFormLocallyAdmitted:variants.filter(v=>v.status.longVersionAdmitted).length,
  shortFormLocallyAdmitted:variants.filter(v=>v.status.shortVersionAdmitted).length,
  fullyLocallyAdmittedCards:report.cards.filter(card=>card.variants.every(v=>v.status.locallyTested)).length,
  remainingCards:report.cards.filter(card=>card.variants.some(v=>!v.status.locallyTested)).length,
  pendingSourceReconciliation:variants.filter(v=>!v.component).map(v=>v.key)};
fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({counts:counters,cards:report.cards},null,2)+'\n');
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={
  'variant-source-reconciliation-required':'预览与多实现关系待核对',
  'business-adapter-missing-or-disabled':'业务适配器缺失或关闭',
  'theme-and-backdrop-not-parameterized':'主题与透底尚未参数化',
  'gallery-preview-missing':'本地画廊预览缺失',
};
const userStage=stage=>({passed:'通过',pending:'待验收','not-admitted':'未准入'}[stage] || '待验收');
const userReview=variant=>`用户长版：${userStage(variant.status.longUserAcceptance)}<br>用户短版：${userStage(variant.status.shortUserAcceptance)}`;
const batch002Link='<section><a href="../card-governance-batch-002-integration/index.html">第二批里程表业务合成验收</a> · <a href="../card-variant-smoke-batch003-v2/index.html">修正后的214变体样帧审计</a> · <a href="../card-business-text-batch004/index.html">第四批八张文字卡业务验收</a></section>';
const header=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>157张镜头卡治理进度</title><style>body{margin:0;font:14px/1.6 'Microsoft YaHei',sans-serif;background:#f4f7f8;color:#18272b}main{max-width:1400px;margin:auto;padding:24px}h1{font-size:24px}h2{font-size:18px}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #cad5d7;padding:8px;overflow-wrap:anywhere}details{border-top:1px solid #cad5d7;padding:10px 0}summary{cursor:pointer;font-weight:700}a{color:#116e79}.controls{display:flex;gap:16px;margin:20px 0;flex-wrap:wrap}input[type=search]{padding:8px;border:1px solid #7d9398;max-width:100%;width:360px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}section{padding:16px 0}@media(max-width:650px){main{padding:16px}table{font-size:12px}td,th{padding:5px}.table-wrap{overflow:auto}}</style><main><h1>157张镜头卡治理进度</h1><p>画廊变体 ${counters.variants} · 精确源码映射 ${counters.sourceResolved} · 适配器声明 ${counters.adapterDeclared} · 当前源码本地准入 ${counters.currentLocallyAdmitted}</p><p>适配器声明不等于替换生效或生产验收。模型实际调用与用户验收单独记录。</p><div class="controls"><input type="search" id="search" placeholder="搜索卡名、用途、源码" aria-label="搜索卡片"><label><input type="checkbox" id="gaps">仅显示缺口</label></div><section><a href="../card-governance-batch-001-v2/index.html">第一批独立数字卡验收视频</a> · <a href="../card-governance-batch-001-v2/integration/evidence.json">生产入口合成与旧卡回归证据</a> · <a href="progress.json">完整进度数据</a></section>`;
const rows=report.cards.map((card,index)=>`<details data-gaps="${card.variants.some(v=>v.blockers.length || !v.status.locallyTested)}"><summary>${index+1}. ${escape(card.id)} · ${card.variants.length} 变体</summary><p>${escape(card.semanticUse)}</p><p>源时长说明：${escape(card.durationStatement)}。短版独立验收，不能截短替代。</p><div class="table-wrap"><table><thead><tr><th>画廊变体</th><th>实际源码 / 运行ID</th><th>参数与媒体槽</th><th>阶段与缺口</th></tr></thead><tbody>${card.variants.map(variant=>`<tr><td>${escape(variant.key)}<br>${escape(variant.label)}</td><td>${variant.component ? `${escape(variant.component.file)}<br>export ${escape(variant.component.export)}<br>${escape(variant.runtimeId)}` : '未指定单一实现'}<details><summary>候选实现</summary>${variant.candidateRuntimeIds.map(escape).join('<br>')}</details></td><td>${variant.component?.props.map(prop=>`${escape(prop.name)}: ${escape(prop.type)}`).join('<br>') || '未声明业务参数'}${variant.structuredDataContract ? `<pre>${escape(JSON.stringify(variant.structuredDataContract.fields,null,2))}</pre>` : ''}<br>真实媒体依赖：${escape(variant.component?.staticMediaReferences.join(' / ') || '待逐项核验')}<br>构图、阅读停留：待验证</td><td>适配器：${variant.status.implemented ? '已声明' : '未接入'}<br>本地准入：${variant.status.locallyTested ? '当前源码有效' : '未通过'}<br>模型：未实测<br>${userReview(variant)}<br>短版：${variant.shortShot.status==='accepted' ? variant.shortShot.acceptedFrames.map(f=>f/30+'秒').join(' / ') : '未开放'}<br>${variant.blockers.map(blocker=>escape(names[blocker] || blocker)).join('<br>')}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
const familyCounts=`<p>当前有效卡 ${counters.fullyLocallyAdmittedCards}/${counters.cards} · 剩余卡 ${counters.remainingCards} · 有效变体 ${counters.currentLocallyAdmitted}/${counters.variants}</p>`;
const batch005Link='<section><a href="../card-business-text-batch005/index.html">第五批八类卡、十二变体与基线复验</a></section>';
const batch006Link='<section><a href="../card-business-text-batch006-v2/index.html">第六批八类卡、九个新增变体与二十个基线变体复验</a></section>';
const batch007Link='<section><a href="../card-business-text-batch007-v3/index.html">第七批八张界面与动效卡业务验收</a></section>';
const batch008Link='<section><a href="../card-business-text-batch008-v2/index.html">第八批八张交互与开场卡、九个变体业务验收</a></section>';
const batch009Link='<section><a href="../card-business-text-batch009-v3/index.html">第九批八张开场、交互与光效卡业务验收</a></section>';
const batch010Link='<section><a href="../card-business-text-batch010/index.html">第十批十变体、五个完整卡族与两个部分卡族业务验收</a></section>';
const batch011Link='<section><a href="../card-business-text-batch011-v5/index.html">第十一批十二变体横竖业务视频证据</a></section>';
const batch012Link='<section><a href="../card-business-text-batch012-v6/index.html">第十二批：字重脉冲、残像分身、顿挫转丝滑</a> · <a href="../card-business-text-batch012-v7/index.html">环图、节拍列表、Riso；旧时间轴未准入</a> · <a href="../card-business-text-batch012-v8/index.html">时间轴修正版</a> · <a href="../card-business-text-batch012-v9/index.html">完整257帧循环节点卡</a> · <a href="../card-business-text-batch012-v11/index.html">真实旁白词级卡拉OK；试听待验</a> · <a href="../card-duration-compatibility-20261002/compatibility.json">83个旧变体时长复验</a> · <a href="../card-karaoke-compatibility-20261002/compatibility.json">84个旧变体、168份实际参数复验</a></section>';
const batch013Link='<section><a href="../card-business-text-batch013-v2/index.html">第十三批文字卡业务视频证据</a></section>';
const batch014Link='<section><a href="../card-business-data-batch014-v1/index.html">第十四批数据与图形卡业务视频证据</a></section>';
const batch015Link='<section><a href="../../../.isolated/card-governance-batch-015-worktree/template/out/card-business-data-batch015-v3/index.html">第十五批数据与图形卡业务视频证据（隔离证据）</a></section>';
const batch016Link='<section><a href="../card-business-data-batch016-v3/index.html">第十六批业务数据卡真实横竖视频证据</a></section>';
const batch017Link='<section><a href="../card-business-text-batch017-v2/index.html">第十七批四张 UI 陈列卡真实横竖视频证据</a></section>';
const batch018Link='<section><a href="../card-business-text-batch018-v3/index.html">第十八批八张文字卡真实横竖视频证据复验</a></section>';
const batch019Link='<section><a href="../card-business-data-batch014-current-long-20261003/compatibility.json">第十九批共享适配器变更后两张数值卡当前源码复验</a></section>';
fs.writeFileSync(path.join(out,'index.html'),header.replace('</h1>','</h1>'+familyCounts).replaceAll('card-governance-batch-001-v2/','card-governance-batch-001-v3/')+batch002Link+batch005Link+batch006Link+batch007Link+batch008Link+batch009Link+batch010Link+batch011Link+batch012Link+batch013Link+batch014Link+batch015Link+batch016Link+batch017Link+batch018Link+batch019Link+rows+`</main><script>const search=document.querySelector('#search'),gaps=document.querySelector('#gaps');function filter(){const term=search.value.trim().toLowerCase();for(const row of document.querySelectorAll('main>details'))row.hidden=Boolean(term&&!row.textContent.toLowerCase().includes(term)) || (gaps.checked&&row.dataset.gaps!=='true');}search.addEventListener('input',filter);gaps.addEventListener('change',filter);</script></html>`);
console.log(JSON.stringify(counters));
