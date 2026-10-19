import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sourceSearchContract,commonsCandidate,materialCompletionPlan,executeMaterialCompletion,executeApprovedMaterialCompletion,materialInputRecheckRequired} from './talkcraft-material-completion.mjs';
import {planNodeCorrection,approveNodeCorrection} from './talkcraft-correction-center.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('素材指纹复检读取正式原始状态，不能依赖仅HTTP控制层存在的nextStage',()=>{
 assert.equal(materialInputRecheckRequired({digitalHumanGenerationPlanned:true,mediaPreparationPassed:false}),true);
 assert.equal(materialInputRecheckRequired({digitalHumanGenerationPlanned:true,mediaPreparationPassed:true,mediaPreflightPassed:false}),false);
 assert.equal(materialInputRecheckRequired({workflowPath:'recorded-host',mediaPreflightPassed:false}),true);
 assert.equal(materialInputRecheckRequired({workflowPath:'recorded-host',mediaPreflightPassed:true}),false);
 assert.equal(materialInputRecheckRequired({workflowPath:'legacy'}),false);
});
const catalog={cards:[{cardId:'tracking-in',policy:{media:{}}},{cardId:'stack-fan-out',policy:{media:{src1:'image',src2:'image'}}}]};
const page=(title='File:City street.webm')=>({pageid:1,title,imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/City_street.webm',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:City_street.webm',width:1280,height:720,size:1000,
 extmetadata:{LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'},Artist:{value:'Author'},ImageDescription:{value:'Pedestrians on city street'}}}]});
test('检索合同保留中文优先；奖项与机构不被泛化配图冒充',()=>{
 const c=sourceSearchContract('诺贝尔奖 颁奖典礼',['Nobel ceremony']);assert.equal(c.queries[0],'诺贝尔奖 颁奖典礼');
 assert.equal(c.matches('Autophagy Nobel Prize'),false);assert.equal(c.matches('Nobel prize ceremony'),true);
 const b=sourceSearchContract('中国人民银行 央行');assert.equal(b.matches('Central bank of England'),false);
 assert.equal(b.matches("People's Bank of China central bank"),true);
 const e=sourceSearchContract('诺贝尔经济学奖 颁奖典礼');
 assert.equal(e.matches('Jennifer Doudna Nobel Prize chemistry medal presentation'),false);
 assert.equal(e.matches('Nobel prize economics ceremony'),true);
 assert.equal(sourceSearchContract('央行 资金 流动 示意图').matches('Central bank building photograph'),false);
 assert.equal(sourceSearchContract('中国人民银行 货币政策 利率 公告 页面 截图').matches("People's Bank of China monetary policy announcement"),true);
 assert.equal(c.matches('Ig Nobel prize ceremony'),false);
 assert.equal(c.matches('Nobel chemistry award ceremony'),false);
 assert.equal(sourceSearchContract('个人收入 工资 存款 未来规划 实景视频').matches('The flames of burning paper money in the field'),false);
 assert.equal(sourceSearchContract('钱包 钱 消费 经济 生活 实景视频').matches('Market Street San Francisco'),false);
 assert.equal(sourceSearchContract('央行 资金 流动 示意图').matches('Central bank subprime crisis diagram'),false);
});
test('公开站点候选须逐文件有自由许可、作者和语义；不接受模型或URL充当许可',()=>{
 const args={kind:'video',query:'城市街景',match:sourceSearchContract('城市街景')};
 assert.ok(commonsCandidate(page(),args));
 const tracked=page();tracked.imageinfo[0].url+='?utm_source=commons.wikimedia.org&utm_content=original';
 assert.ok(commonsCandidate(tracked,args));
 for(const mutate of [p=>delete p.imageinfo[0].extmetadata.LicenseUrl,p=>p.imageinfo[0].extmetadata.LicenseShortName.value='CC BY-NC 4.0',
  p=>p.imageinfo[0].url='https://127.0.0.1/secret.webm',p=>p.imageinfo[0].extmetadata.Artist.value='',
  p=>p.imageinfo[0].extmetadata.ImageDescription.value='A laboratory experiment']){
  const p=page('File:Unrelated.webm');mutate(p);assert.equal(commonsCandidate(p,args),null);
 }
});
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'material-complete-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 fs.mkdirSync(path.join(p,'remotion/public'),{recursive:true});fs.mkdirSync(path.join(p,'audio'));
 const write=(n,v)=>fs.writeFileSync(path.join(p,n),JSON.stringify(v));
 for(const n of ['input.txt','audio/full.mp3','aligned-sentences.json','semantics.json'])fs.writeFileSync(path.join(p,n),'[]');
 write('remotion/shots.json',[{id:'s04',shotCard:'tracking-in',start:0,end:1,templateParams:{cardProps:{text:'保持原文',textColor:'#171717'}}}]);
 write('material-research-plan.json',{shots:[{shotId:'s04',backgroundDecision:'use',backgroundQuery:'城市街景',backgroundConcepts:['城市街景'],backgroundReason:'本镜以真实城市语境承接，不作为事实证据'}]});
 return {p,write};
}
test('缺素材完整生成逐槽方案，保护身份资料槽，不按其他镜编号猜绑定',t=>{
 const {p,write}=fixture(t);const shots=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')));
 shots.push({id:'s07',shotCard:'stack-fan-out',templateParams:{cardProps:{},templateMaterialQueries:{src1:'机构身份',src2:'城市实景'}}});write('remotion/shots.json',shots);
 const r=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json')));r.shots.push({shotId:'s07',research:[{kind:'identity',displayField:'src1'}]});write('material-research-plan.json',r);
 const plan=materialCompletionPlan(p,catalog);assert.deepEqual(plan.needs.map(n=>[n.shotId,n.field]),[['s04','@background'],['s07','src2']]);
 assert.equal(plan.paidCalls,0);
});
test('素材处理器由中心按完整逐镜方案调度，不被旧选卡无解提示代替采集',()=>{
 const f={run:{runId:'run',provenance:{verified:true},nextStage:'candidates',lastFailure:{task:{name:'talkcraft-candidates'}}},
  fingerprint:'current',attempts:[{fingerprint:'current',action:'local-recheck'}],feedback:{failedChecks:[{shotId:'s04',code:'TEXT_VIDEO_REQUIRED'},{shotId:'s07',code:'local_material_unmatched'}]},
  governance:{caseSha256:'case',mapSha256:'map'},sourcePlan:{needs:[{shotId:'s04',field:'@background'},{shotId:'s07',field:'src2'}],planId:'complete'},revisionPlanError:'旧选卡范围无解'};
 const p=planNodeCorrection(f);assert.equal(p.action,'material-completion');assert.equal(p.approved,true);assert.equal(p.materialCompletionPlan.needs.length,2);
 const bad=structuredClone(p.proposal);bad.materialCompletionPlan.needs.pop();assert.equal(approveNodeCorrection(bad,f).approved,false);
 f.attempts.push({fingerprint:'current',action:'material-completion'});
 const exhausted=planNodeCorrection(f);assert.equal(exhausted.action,null);assert.equal(exhausted.state,'needs-source-verification');
 assert.equal(exhausted.materialCompletionPlan.needs.length,2);
});
test('真实视频采集、绑定、重复继续复用缓存；不改文案和音频、不直接标节点通过',async t=>{
 const {p}=fixture(t),source=path.join(p,'source.webm');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=1280x720:r=30:d=2','-an','-c:v','libvpx-vp9','-b:v','100k',source],{windowsHide:true,timeout:30000});
 const media=fs.readFileSync(source);let downloads=0;
 const fetchImpl=async url=>String(url).includes('/w/api.php')?new Response(JSON.stringify({query:{pages:{1:page()}}}),{headers:{'Content-Type':'application/json'}}):(++downloads,new Response(media));
 const plan=materialCompletionPlan(p,catalog),approval={planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false};
 await assert.rejects(executeMaterialCompletion(p,catalog,{plan,approval:{...approval,planId:'forged'},fetchImpl}));
 const report=await executeMaterialCompletion(p,catalog,{plan,approval,fetchImpl});assert.equal(report.operations.length,1);assert.equal(report.unresolved.length,0);assert.equal(downloads,1);
 const shot=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0];assert.equal(shot.templateParams.cardProps.text,'保持原文');
 assert.equal(shot.templateParams.backgroundPresentation,'text-video-v1');assert.equal(shot.templateParams.cardProps.textColor,'#ffffff');assert.equal(report.productionAdmitted,false);
 assert.equal(fs.readFileSync(path.join(p,'audio/full.mp3'),'utf8'),'[]');
 const next=materialCompletionPlan(p,catalog);assert.equal(next.needs.length,0);
 await executeMaterialCompletion(p,catalog,{plan:next,approval:{planId:next.planId,inputSha256:digest(next.inputs),productionAdmitted:false},fetchImpl});assert.equal(downloads,1);
 await assert.rejects(executeApprovedMaterialCompletion(p,catalog));
});

test('下载许可合规图片后仍要求真实内容核验；不把未知语言写成已绑定素材',async t=>{
 const {p,write}=fixture(t),source=path.join(p,'source.png');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=1280x720','-frames:v','1',source],{windowsHide:true,timeout:30000});
 write('remotion/shots.json',[{id:'s07',shotCard:'stack-fan-out',start:0,end:2,templateParams:{cardProps:{},templateMaterialQueries:{src2:'城市街景'}}}]);
 write('material-research-plan.json',{shots:[{shotId:'s07',backgroundDecision:'omit'}]});
 const image=page('File:City street.png');image.imageinfo[0].url=image.imageinfo[0].url.replace('.webm','.png');
 const fetchImpl=async url=>String(url).includes('/w/api.php')?new Response(JSON.stringify({query:{pages:{1:image}}})):new Response(fs.readFileSync(source));
 const plan=materialCompletionPlan(p,catalog),approval={planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false};
 const report=await executeMaterialCompletion(p,catalog,{plan,approval,fetchImpl});
 assert.equal(report.operations.length,0);assert.equal(report.unresolved.length,1);
 assert.ok(report.unresolved[0].errors.some(e=>e.code==='SOURCE_CONTENT_REVIEW_REQUIRED'));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0].templateParams.cardProps,{});
});
