import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const reportFile='template/out/card-business-data-batch014-current-long-20261003/compatibility.json';
const admissionFile='director/numeric-card-current-long-admission.json';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const report=JSON.parse(fs.readFileSync(path.join(root,reportFile),'utf8'));
if(report.schema!=='numeric-card-current-long-compatibility-v1' || report.cases.length!==4 ||
   report.localVisualReview!=='passed-current-runtime-180-frame') throw new Error('当前长版数值证据未完成');
if(report.cases.some(item=>!item.fullDecodePassed || item.frames!==180 || item.fps!==30 ||
    !item.selectedProps?.shotCard || !item.adapterProps?.value)) throw new Error('当前长版数值证据不完整');
const sourceHashes={...report.sourceHashes,'director/numeric-card-admission.mjs':hash('director/numeric-card-admission.mjs')};
const record={schema:'numeric-card-production-admission-v1',version:1,
  cards:[...new Set(report.cards)],localReview:'passed',
  report:reportFile,reportSha256:hash(reportFile),
  scope:'2张数值卡，4条当前源码下的真实横竖180帧/30fps视频；实际selectComposition、编导结构化参数、精确适配器props、完整解码和样帧通过；收费模型、生产执行及用户验收仍待完成',
  sourceHashes,evidence:report.cases.map(item=>({card:item.card,aspect:item.aspect,file:item.video,sha256:item.sha256,
    stream:item.stream,fullDecodePassed:item.fullDecodePassed,review:item.samples})),
  actualModelValidated:false,userAcceptance:'pending',productionAdmission:'not-recorded',
  createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,admissionFile),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({output:admissionFile,cards:record.cards.length,evidence:record.evidence.length}));
