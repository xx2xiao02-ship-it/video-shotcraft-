import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sourceSearchContract,commonsCandidate,materialCompletionPlan,executeMaterialCompletion,executeApprovedMaterialCompletion,materialInputRecheckRequired,discoverReviewedCompletionSources,discoverCompletionSources,SOURCE_DOWNLOAD_BUDGET} from './talkcraft-material-completion.mjs';
import {planNodeCorrection,approveNodeCorrection} from './talkcraft-correction-center.mjs';
import {dueSourceRetryToken} from './talkcraft-node-correction-plan.mjs';
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
 assert.equal(sourceSearchContract('普通人 存钱 消费 规划未来 生活 实拍视频').matches('客户 银行 办公 实景'),true);
 assert.equal(sourceSearchContract('普通人 存钱 消费 规划未来 生活 实拍视频').matches('banknote fire'),false);
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

test('正式补全优先联网，随后复用旧库与独立许可档案；变更来源合同使旧审批失效',async t=>{
 const {p}=fixture(t),root=path.join(p,'library');
 const write=(n,v)=>{fs.mkdirSync(path.dirname(path.join(root,n)),{recursive:true});fs.writeFileSync(path.join(root,n),typeof v==='string'?v:JSON.stringify(v));};
 const rel='city-street.mp4',source=path.join(root,'materials/_scenes',rel);
 fs.mkdirSync(path.dirname(source),{recursive:true});
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=1280x720:r=30:d=2','-an','-c:v','libx264','-pix_fmt','yuv420p',source],{windowsHide:true,timeout:30000});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 write('materials/_index.json',[{path:rel,tags:['城市街景'],duration_sec:2}]);
 write('materials/rights/grant.txt','offline fixture verified grant');
 const records={schema:'talkcraft-library-sources-v1',records:[{path:rel,sha256:hash(fs.readFileSync(source)),
  sourceUrl:'https://stock.example/city-street',license:'Test grant',licenseUrl:'https://stock.example/terms',licenseVerified:true,
  evidence:[{path:'rights/grant.txt',sha256:hash('offline fixture verified grant')}]}]};
 write('materials/_source-records.json',records);
 const originalIndex=fs.readFileSync(path.join(root,'materials/_index.json'),'utf8');
 const plan=materialCompletionPlan(p,catalog,{root}),approval={planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false};
 let calls=0;const fetchImpl=async url=>{assert.ok(String(url).includes('/w/api.php'));calls++;return new Response(JSON.stringify({query:{pages:{}}}));};
 // A newly changed registry cannot be applied under a previously approved plan.
 records.records[0].author='Updated attribution';write('materials/_source-records.json',records);
 await assert.rejects(executeMaterialCompletion(p,catalog,{root,plan,approval,fetchImpl}),/方案与当前输入不同/);assert.equal(calls,0);
 const current=materialCompletionPlan(p,catalog,{root});
 const report=await executeMaterialCompletion(p,catalog,{root,plan:current,approval:{planId:current.planId,inputSha256:digest(current.inputs),productionAdmitted:false},fetchImpl});
 assert.ok(calls>0);assert.equal(report.operations.length,1);assert.equal(report.unresolved.length,0);assert.equal(report.paidCalls,0);
 assert.equal(report.operations[0].source.sourceTrace.licenseVerified,false); // historical lead makes no rights claim
 assert.equal(report.operations[0].source.licenseEvidence.length,1);
 assert.equal(fs.readFileSync(path.join(root,'materials/_index.json'),'utf8'),originalIndex);
 const shot=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0];
 assert.equal(shot.templateParams.materialSha256,records.records[0].sha256);
});

test('当前任务已核验资料按真实正文恢复；不把相似检索标签或其他镜资料当证据',t=>{
 const {p,write}=fixture(t);fs.mkdirSync(path.join(p,'remotion/public/pages'),{recursive:true});
 const image=path.join(p,'remotion/public/pages/policy.png');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=1280x720','-frames:v','1',image],{windowsHide:true,timeout:30000});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 write('remotion/public/pages/targets.json',{url:'https://www.pbc.gov.cn/policy',title:'中国人民银行货币政策公告',text:'中国人民银行公布货币政策利率信息'});
 const binding={localPath:'pages/policy.png',sha256:hash(fs.readFileSync(image)),sourceCoordinates:'pages/targets.json',
  sourceUrl:'https://www.pbc.gov.cn/policy',sourceVerified:true,licenseVerified:true,license:'existing scoped permission',licenseUrl:'https://www.pbc.gov.cn/terms',contentLanguage:'zh-CN'};
 write('material-research-plan.json',{shots:[{shotId:'s07',bindings:[binding]}]});
 const need={shotId:'s07',field:'src3',kind:'image',query:'中国人民银行 货币政策 利率 公告 页面 截图'};
 assert.equal(discoverReviewedCompletionSources(p,need).length,1);
 assert.equal(discoverReviewedCompletionSources(p,{...need,shotId:'s08'}).length,0);
 assert.equal(discoverReviewedCompletionSources(p,{...need,query:'央行 资金流动 示意图'}).length,0);
 write('remotion/public/pages/targets.json',{url:binding.sourceUrl,title:'unrelated',text:'unrelated'});
 assert.equal(discoverReviewedCompletionSources(p,need).length,0);
});

test('补全方案包含有界替代策略，钱币和传导图同义检索不放行无关画面',t=>{
 const {p}=fixture(t),plan=materialCompletionPlan(p,catalog);
 assert.equal(plan.strategy.maxQueriesPerNeed,12);
 const money=sourceSearchContract('钱包 钱 消费 经济 生活 实景视频');
 assert.ok(money.queries.includes('coin counter'));
 assert.equal(money.matches('Coin counter working'),true);
 assert.equal(money.matches('Ronald Reagan Centennial National Football Coin Toss'),false);
 assert.equal(money.matches('Congress candidate speaks about money and cash'),false);
 assert.equal(money.matches('Public Money Public Code software'),false);
 const shopping=sourceSearchContract('普通人 消费 刺激 经济 新闻 图片');
 assert.ok(shopping.queries.includes('China supermarket shopping'));
 assert.equal(shopping.matches('Chinese grocery shoppers buying vegetables'),true);
 assert.equal(shopping.matches('Stock market chart in a crisis'),false);
 const diagram=sourceSearchContract('央行 降息 放水 市场 资金 流动 示意图');
 assert.equal(diagram.matches('Monetary transmission mechanism diagram'),true);
 assert.equal(diagram.matches('central bank building photograph'),false);
 const academic=sourceSearchContract('诺贝尔经济学奖 颁奖典礼',['academic audience'],[{kind:'declared-academic-context',query:'经济学 学术现场 讲座 视频',concepts:['economics lecture','academic audience'],basis:'颁奖或学术现场',contextOnly:true}]);
 assert.ok(academic.queries.includes('economics professor'));
 assert.equal(academic.matches('University economics professor explains banking'),true);
 assert.equal(academic.matches('University physics professor explains optics'),false);
 assert.equal(academic.matches('Nobel chemistry professor ceremony'),false);
});

test('来源限流按中心批准方案退避恢复；到期只预留一次，达到上限不循环',()=>{
 const f={now:10000,run:{runId:'run',provenance:{verified:true},nextStage:'candidates',lastFailure:{task:{name:'talkcraft-candidates'}}},
  fingerprint:'current',attempts:[{fingerprint:'current',action:'local-recheck'},{fingerprint:'current',action:'material-completion',materialPlanId:'old'}],
  feedback:{failedChecks:[{shotId:'s04',code:'TEXT_VIDEO_REQUIRED'}]},governance:{caseSha256:'case',mapSha256:'map'},
  sourcePlan:{needs:[{shotId:'s04',field:'@background'}],planId:'retry',transportRetry:{token:'rate-limit-1',notBefore:new Date(20000).toISOString(),failures:1,maxFailures:3}}};
 assert.equal(planNodeCorrection(f).state,'waiting-source-retry');
 assert.equal(dueSourceRetryToken(f.sourcePlan,f.now),null);
 f.now=21000;assert.equal(planNodeCorrection(f).action,'material-completion');
 assert.equal(dueSourceRetryToken(f.sourcePlan,f.now),'rate-limit-1');
 // The same plan may already have run while cooling down to recover cache.
 // That execution must not consume the subsequent network retry.
 f.attempts.push({fingerprint:'current',action:'material-completion',materialPlanId:'retry'});
 assert.equal(planNodeCorrection(f).action,'material-completion');
 f.attempts.push({fingerprint:'current',action:'material-completion',materialPlanId:'retry',sourceRetryToken:'rate-limit-1'});
 assert.equal(planNodeCorrection(f).action,null);
 const reserved=f.attempts.at(-1);
 reserved.status='dispatch-failed';reserved.error='操作台无法启动任务子进程（EPERM）。';reserved.dispatcherPid=process.pid;
 assert.equal(planNodeCorrection(f).state,'waiting-code-reload');
 reserved.dispatcherPid=-1;assert.equal(planNodeCorrection(f).action,'material-completion');
 reserved.status='dispatching';assert.equal(planNodeCorrection(f).action,null);
 f.fingerprint='recovered-input';f.attempts.push({fingerprint:f.fingerprint,action:'local-recheck'},{fingerprint:f.fingerprint,action:'material-completion'});
 assert.equal(planNodeCorrection(f).action,null);
 f.sourcePlan.transportRetry.token='rate-limit-2';f.sourcePlan.transportRetry.failures=2;
 assert.equal(planNodeCorrection(f).action,'material-completion');
 f.sourcePlan.transportRetry.failures=3;f.sourcePlan.planId='third';assert.equal(planNodeCorrection(f).action,null);
});

test('错误自动绑定由中心具体方案撤回并保留证据，不能靠缺槽数量下降冒充成功',async t=>{
 const {p,write}=fixture(t);
 const shots=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json'))),research=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json')));
 research.shots[0].backgroundQuery='钱包 钱 消费 生活视频';
 const b={title:'Alexander Hernandez candidate for Congress interview',description:'The candidate speaks about money and cash',
  sha256:'a'.repeat(64),sourceId:'commons:politics',evidence:'qa/source-discovery/old.json'};
 research.shots[0].backgroundBinding=b;
 Object.assign(shots[0].templateParams,{materialSrc:'verified-sources/'+b.sha256+'.mp4',materialSha256:b.sha256,materialSourceId:b.sourceId,materialRole:'background'});
 write('remotion/shots.json',shots);write('material-research-plan.json',research);
 const plan=materialCompletionPlan(p,catalog);assert.equal(plan.invalidBindings.length,1);assert.equal(plan.needs.length,1);
 const originalText=fs.readFileSync(path.join(p,'input.txt'));
 const fetchImpl=async()=>new Response(JSON.stringify({query:{pages:{}},response:{docs:[]}}));
 const result=await executeMaterialCompletion(p,catalog,{plan,approval:{planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false},fetchImpl});
 assert.equal(result.unresolved.length,1);assert.equal(result.operations.length,0);assert.equal(result.paidCalls,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0].templateParams.materialSrc,undefined);
 assert.deepEqual(fs.readFileSync(path.join(p,'input.txt')),originalText);
 assert.equal(JSON.parse(fs.readFileSync(path.join(p,'qa/material-quarantine/'+plan.planId+'.json'))).invalidBindings[0].binding.title,b.title);
});

test('限流后逐槽共享退避状态，优先免费恢复旧响应，不逐查询连续请求',async t=>{
 const {p}=fixture(t);let calls=0;
 const fetchImpl=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});};
 const need={kind:'image',query:'城市街景',concepts:[]};
 const first=await discoverCompletionSources(p,need,{fetchImpl});assert.equal(calls,1);assert.ok(first.errors.some(e=>e.code==='SOURCE_PROVIDER_COOLDOWN'));
 await discoverCompletionSources(p,need,{fetchImpl});assert.equal(calls,1);
 const query='城市街景',key=digest({query,kind:'image',policy:'commons-explicit-free-license-v1'}),legacy='qa/source-discovery/'+key+'.json';
 const cached=page('File:City street.png');cached.imageinfo[0].url=cached.imageinfo[0].url.replace('.webm','.png');
 fs.writeFileSync(path.join(p,legacy),JSON.stringify({query,pages:[cached]}));
 const recovered=await discoverCompletionSources(p,need,{fetchImpl});assert.equal(recovered.candidates.length,1);assert.equal(calls,1);
});

test('SVG资金流图仅恢复来源API提供的PNG，保留原件和许可，不执行SVG',async t=>{
 const {p}=fixture(t),query='央行 资金 流动 示意图';
 const svg=page('File:Flow of Funds.svg');svg.imageinfo[0].url='https://upload.wikimedia.org/wikipedia/commons/a/a9/Flow_of_Funds.svg';
 svg.imageinfo[0].descriptionurl='https://commons.wikimedia.org/wiki/File:Flow_of_Funds.svg';
 svg.imageinfo[0].extmetadata.ImageDescription.value='A chart showing the flow of funding through the financial system.';
 const need={kind:'image',query,concepts:[]},match=sourceSearchContract(query);
 assert.equal(commonsCandidate(svg,{...need,match}),null);
 const raster=structuredClone(svg);Object.assign(raster.imageinfo[0],{thumburl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Flow_of_Funds.svg/1600px-Flow_of_Funds.svg.png',thumbwidth:1600,thumbheight:1008});
 const candidate=commonsCandidate(raster,{...need,match});assert.equal(candidate.rendition,'source-api-png');assert.equal(candidate.originalMediaUrl,svg.imageinfo[0].url);
 const bad=structuredClone(raster);bad.imageinfo[0].thumburl='https://untrusted.invalid/diagram.png';assert.equal(commonsCandidate(bad,{...need,match}),null);
 delete bad.imageinfo[0].extmetadata.LicenseUrl;bad.imageinfo[0].thumburl=raster.imageinfo[0].thumburl;assert.equal(commonsCandidate(bad,{...need,match}),null);
 let rasterCalls=0;
 const fetchImpl=async value=>{const u=new URL(value);if(u.searchParams.has('pageids')){rasterCalls++;assert.equal(u.searchParams.get('iiurlwidth'),'1600');return new Response(JSON.stringify({query:{pages:{1:raster}}}));}
  return new Response(JSON.stringify({query:{pages:u.searchParams.get('gsrsearch')===query?{1:svg}:{}}}));};
 const found=await discoverCompletionSources(p,need,{fetchImpl});assert.equal(found.candidates.length,1);assert.equal(rasterCalls,1);
 assert.match(found.candidates[0].evidence,/-raster.json$/u);
 fs.writeFileSync(path.join(p,'qa/source-discovery/commons-provider-state.json'),JSON.stringify({retryAt:new Date(Date.now()+60000).toISOString(),failures:1}));
 const cached=await discoverCompletionSources(p,need,{fetchImpl:async()=>{throw Error('缓存恢复不得请求网络');}});
 assert.equal(cached.candidates.length,1);assert.equal(rasterCalls,1);
});

test('语言核验先于事务复制；丢失的自动绑定经中心精确撤回和缓存复检恢复',async t=>{
 const {p,write}=fixture(t),source=path.join(p,'source.png');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=1280x720','-frames:v','1',source],{windowsHide:true,timeout:30000});
 write('remotion/shots.json',[{id:'s07',shotCard:'stack-fan-out',templateParams:{cardProps:{},templateMaterialQueries:{src1:'城市街景'}}}]);
 write('material-research-plan.json',{shots:[{shotId:'s07',backgroundDecision:'omit'}]});
 const originalAudio=fs.readFileSync(path.join(p,'audio/full.mp3'));
 const image=page('File:City street.png');image.imageinfo[0].url=image.imageinfo[0].url.replace('.webm','.png');
 let downloads=0,reviews=0;
 const fetchImpl=async url=>String(url).includes('/w/api.php')?new Response(JSON.stringify({query:{pages:{1:image}}})):(downloads++,new Response(fs.readFileSync(source)));
 const contentReviewer=(_project,s)=>{reviews++;return {contentLanguage:'en',languageReason:'保留经实际核验的英文原件',contentReview:{method:'test-offline-review',mediaSha256:s.sha256,evidence:'qa/review.json',sha256:'f'.repeat(64)}};};
 const apply=async plan=>executeMaterialCompletion(p,catalog,{plan,approval:{planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false},fetchImpl,contentReviewer});
 const first=await apply(materialCompletionPlan(p,catalog));assert.equal(first.operations.length,1);
 const research=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json'))),b=research.shots[0].materialBindings[0];
 assert.equal(b.contentLanguage,'en');assert.equal(b.languageReason,'保留经实际核验的英文原件');
 assert.equal(b.contentReview.mediaSha256,b.sha256);assert.equal(first.operations[0].source.contentReview.mediaSha256,b.sha256);
 assert.equal(materialCompletionPlan(p,catalog).needs.length,0);
 // Reproduce the old copy-order failure in the fixture, never in production data.
 b.contentLanguage='und';delete b.languageReason;delete b.contentReview;write('material-research-plan.json',research);
 const recovery=materialCompletionPlan(p,catalog);assert.equal(recovery.invalidBindings.length,1);assert.equal(recovery.needs.length,1);
 const restored=await apply(recovery);assert.equal(restored.operations.length,1);assert.equal(downloads,1);assert.equal(reviews,2);
 const final=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json'))).shots[0].materialBindings[0];
 assert.equal(final.contentLanguage,'en');assert.equal(final.contentReview.mediaSha256,b.sha256);
 assert.equal(materialCompletionPlan(p,catalog).needs.length,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(p,'qa/material-quarantine/'+recovery.planId+'.json'))).invalidBindings[0].binding.contentLanguage,'und');
 await apply(materialCompletionPlan(p,catalog));assert.equal(downloads,1);assert.equal(reviews,2);
 assert.deepEqual(fs.readFileSync(path.join(p,'audio/full.mp3')),originalAudio);assert.equal(restored.paidCalls,0);
});


test('视频流式预算不降质量或许可；钱币语境排除盗窃和警务记录',()=>{
 const args={kind:'video',query:'钱包 钱',match:sourceSearchContract('钱包 钱')};
 const p=page('File:Banknotes printing.webm');Object.assign(p.imageinfo[0],{size:130259347});p.imageinfo[0].extmetadata.ImageDescription.value='Banknote production';
 assert.ok(commonsCandidate(p,args));
 p.imageinfo[0].size=SOURCE_DOWNLOAD_BUDGET.video+1;assert.equal(commonsCandidate(p,args),null);
 p.imageinfo[0].size=130259347;p.imageinfo[0].height=480;assert.equal(commonsCandidate(p,args),null);
 const m=args.match;assert.equal(m.matches('Bodycam Catches Deputy Stealing Money From Wallet'),false);
 assert.equal(m.matches('CCTV footage of wallet theft at a shop'),false);
 assert.equal(m.matches('Police Found Cocaine Guns and Cash'),false);
});

test('流式传输中断清理临时分片，保留已有文件，不写失败下载缓存和绑定',async t=>{
 const {p}=fixture(t),preserved=path.join(p,'remotion/public/preserved.txt');fs.writeFileSync(preserved,'successful asset');
 let pulls=0;
 const fetchImpl=async url=>String(url).includes('/w/api.php')?new Response(JSON.stringify({query:{pages:{1:page()}}})):new Response(new ReadableStream({pull(controller){if(pulls++===0)controller.enqueue(new Uint8Array([1,2,3]));else controller.error(new Error('fixture interrupted stream'));}}));
 const plan=materialCompletionPlan(p,catalog),report=await executeMaterialCompletion(p,catalog,{plan,approval:{planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false},fetchImpl});
 assert.equal(report.operations.length,0);assert.equal(report.unresolved.length,1);assert.equal(report.paidCalls,0);
 assert.deepEqual(fs.readdirSync(path.join(p,'remotion/public/verified-sources')),[]);
 assert.equal(fs.readFileSync(preserved,'utf8'),'successful asset');assert.equal(fs.existsSync(path.join(p,'qa/source-downloads')),false);
});

import {assertExclusiveBackgrounds} from './talkcraft-background-exclusivity.mjs';
test('重复自动背景经精确撤回后采集不同原始源，并通过真实全片排他门禁',async t=>{
 const {p,write}=fixture(t),firstFile=path.join(p,'first.webm'),secondFile=path.join(p,'second.webm');
 for(const [file,color]of [[firstFile,'blue'],[secondFile,'red']])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c='+color+':s=1280x720:r=30:d=2','-an','-c:v','libvpx-vp9','-b:v','100k',file],{windowsHide:true,timeout:30000});
 const apply=async(plan,fetchImpl)=>executeMaterialCompletion(p,catalog,{plan,approval:{planId:plan.planId,inputSha256:digest(plan.inputs),productionAdmitted:false},fetchImpl});
 await apply(materialCompletionPlan(p,catalog),async url=>String(url).includes('/w/api.php')?new Response(JSON.stringify({query:{pages:{1:page()}}})):new Response(fs.readFileSync(firstFile)));
 const shots=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json'))),research=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json')));
 const first=structuredClone(shots[0]);shots.push({...structuredClone(first),id:'s10',start:2,end:3});
 research.shots.push({...structuredClone(research.shots[0]),shotId:'s10',backgroundQuery:'城市 街景 视频'});
 write('remotion/shots.json',shots);write('material-research-plan.json',research);
 assert.throws(()=>assertExclusiveBackgrounds(p,shots),/全片唯一排他/);
 const plan=materialCompletionPlan(p,catalog);assert.equal(plan.invalidBindings.length,1);assert.equal(plan.invalidBindings[0].shotId,'s10');
 const second=page('File:Different city street.webm');second.pageid=2;second.imageinfo[0].url=second.imageinfo[0].url.replace('City_street','Different_city_street');
 const result=await apply(plan,async url=>String(url).includes('/w/api.php')?new Response(JSON.stringify({query:{pages:{2:second}}})):new Response(fs.readFileSync(secondFile)));
 assert.equal(result.operations.length,1);assert.equal(result.unresolved.length,0);
 const final=JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')));assert.deepEqual(final[0],first);
 assert.notEqual(final[1].templateParams.materialSha256,first.templateParams.materialSha256);
 assert.equal(assertExclusiveBackgrounds(p,final).exclusive,true);
 assert.equal(materialCompletionPlan(p,catalog).invalidBindings.length,0);assert.equal(materialCompletionPlan(p,catalog).needs.length,0);
 const finalResearch=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json')));
 finalResearch.shots[1].backgroundBinding.sourceId=finalResearch.shots[0].backgroundBinding.sourceId;
 final[1].templateParams.materialSourceId=final[0].templateParams.materialSourceId;
 write('remotion/shots.json',final);write('material-research-plan.json',finalResearch);
 assert.equal(materialCompletionPlan(p,catalog).invalidBindings[0].shotId,'s10');
});
