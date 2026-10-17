import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {materialDemand,validateResearchPlan,discoverMaterialSources,discoverPersonSources,searchBackgroundVideos,auditMaterialResearch,saveEditorialMaterialResearch,rankLocalBackgrounds,researchProject} from './talkcraft-material-research.mjs';
import {visualPreference} from './talkcraft-visual-preference.mjs';
const index={cards:[{slug:'text',category:'字幕花字'},{slug:'graph',category:'数据信息图'}]};
const shots=[{id:'s01',shotCard:'text',firstSentence:0,lastSentence:0,templateParams:{cardProps:{}}}];
const semantics={sentences:[{shot:'s01',text:'霍尔的研究',entities:['霍尔'],need:['身份','证据']}]};
const demand=()=>materialDemand({shots,semantics,index});
const plan=()=>({schema:'talkcraft-material-research-v1',shots:[{shotId:'s01',pureTextReason:'短句过渡保留文字，但需补原始人物出处',research:[{kind:'identity',query:'Robert Hall',reason:'核对姓名及身份'},{kind:'evidence',query:'Hall research',reason:'核对原研究来源'}]}]});
test('真实素材需求来自need/entities，纯文字需比较背景',()=>{assert.deepEqual(demand()[0].researchKinds,['identity','evidence']);assert.deepEqual(demand()[0].entities,['霍尔']);assert.equal(demand()[0].considerBackground,true);});
test('缺计划和遗漏镜头不视为已采集',()=>{assert.equal(validateResearchPlan(null,demand())[0].code,'MATERIAL_PLAN_REQUIRED');const p=plan();p.shots=[];assert.ok(validateResearchPlan(p,demand()).some(i=>i.code==='SHOT_MISSING'));});
test('文字保留理由不豁免真实身份资料',()=>{const p=plan();p.shots[0].research=[];assert.equal(validateResearchPlan(p,demand()).filter(i=>i.code==='RESEARCH_QUERY_REQUIRED').length,2);});
test('完整需求可过结构校验，但不等于素材绑定完成',()=>{assert.deepEqual(validateResearchPlan(plan(),demand()),[]);});
test('图形偏好在语义适合时排序，不删除任何候选',()=>{const r=visualPreference(index.cards,{semantics:['机制']});assert.equal(r[0].cardId,'graph');assert.equal(r.length,2);assert.equal(visualPreference(index.cards,{semantics:['钩子']})[0].cardId,'text');});
test('没真实素材时不能偏好空素材卡',()=>{const c=[...index.cards,{slug:'photo',category:'素材呈现'}];assert.equal(visualPreference(c,{mediaAvailable:false})[0].cardId,'text');assert.equal(visualPreference(c,{mediaAvailable:true})[0].cardId,'photo');});
test('线上搜索只产候选，CC BY肖像不得进入免署名池',async()=>{
 const result=await discoverMaterialSources('Robert Hall',{fetchImpl:async url=>({ok:true,json:async()=>url.includes('commons')?{query:{pages:{1:{title:'File:Hall',imageinfo:[{descriptionurl:'https://commons.wikimedia.org/wiki/File:Hall',url:'https://upload.wikimedia.org/hall.jpg',extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'}}}]}}}}:{query:{pages:{2:{title:'Robert Hall',extlinks:[{'*':'https://www.stanford.edu/'}]}}}}})});
 assert.equal(result.accepted,false);assert.equal(result.candidates.find(c=>c.license).licenseEligible,false);assert.equal(result.candidates.find(c=>c.officialVerified===false).status,'source-lead-only');
});
test('提供方失败不伪造空搜索成功，两个源都留下错误',async()=>{const r=await discoverMaterialSources('Hall',{fetchImpl:async()=>({ok:false,status:403})});assert.equal(r.errors.length,2);assert.equal(r.candidates.length,0);});
test('未配置视频源不发请求，不泄露凭据',async()=>{let calls=0;const r=await searchBackgroundVideos('city',{env:{},fetchImpl:()=>{calls++;}});assert.equal(calls,0);assert.equal(r.errors.length,2);});
test('双源背景搜索筛选实际1080素材，日志没有API key',async()=>{
 const r=await searchBackgroundVideos('city',{env:{PEXELS_API_KEY:'secret-test'},fetchImpl:async()=>({ok:true,json:async()=>({videos:[{id:1,url:'https://pexels.com/video/1',duration:10,video_files:[{width:1920,height:1080,link:'https://videos.pexels.com/1.mp4'}]}]})})});
 assert.equal(r.candidates.length,1);assert.equal(JSON.stringify(r).includes('secret-test'),false);assert.equal(r.accepted,false);
});
function fixture(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'real-media-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));fs.mkdirSync(p+'/remotion/public',{recursive:true});for(const [f,v] of [['remotion/shots.json',shots],['semantics.json',semantics],['material-research-plan.json',plan()]])fs.writeFileSync(p+'/'+f,JSON.stringify(v));return p;}
test('URL和搜索结果不能冒充已绑定真实素材',t=>{const p=fixture(t);const r=auditMaterialResearch(p,index);assert.equal(r.passed,false);assert.equal(r.issues.filter(i=>i.code==='REAL_SOURCE_NOT_BOUND').length,2);});
test('来源必须与实际模板媒体槽位、文件哈希相符',t=>{const p=fixture(t),a=plan();fs.writeFileSync(p+'/remotion/public/hall.jpg','fixture');const sha256=createHash('sha256').update('fixture').digest('hex');a.shots[0].bindings=a.shots[0].research.map(r=>({...r,localPath:'hall.jpg',sourceUrl:'https://stanford.edu/hall',identityReason:'已核对本人',sourceVerified:true,licenseVerified:true,license:'PD',sha256}));fs.writeFileSync(p+'/material-research-plan.json',JSON.stringify(a));assert.ok(auditMaterialResearch(p,index).issues.some(i=>i.code==='REAL_SOURCE_BINDING_INVALID'));const s=structuredClone(shots);s[0].templateParams.cardProps.src='hall.jpg';fs.writeFileSync(p+'/remotion/shots.json',JSON.stringify(s));assert.equal(auditMaterialResearch(p,index).passed,true);fs.writeFileSync(p+'/remotion/public/hall.jpg','stale');assert.equal(auditMaterialResearch(p,index).passed,false);});
test('保留已有编导计划，不自动重发模型',t=>{const p=fixture(t);assert.equal(saveEditorialMaterialResearch(p,{materialResearch:{shots:[]}}).saved,false);});
test('集中来源必须有用户策略确认，且目标镜实际绑定同一文件；配音变化即失效',t=>{
 const p=fixture(t),a=plan(),s=structuredClone(shots),hash=s=>createHash('sha256').update(s).digest('hex');
 fs.mkdirSync(p+'/qa',{recursive:true});fs.mkdirSync(p+'/audio');fs.writeFileSync(p+'/script.txt','script');fs.writeFileSync(p+'/audio/full.mp3','voice');fs.writeFileSync(p+'/remotion/public/source.png','source');
 s.push({id:'s02',shotCard:'graph',firstSentence:1,lastSentence:1,templateParams:{cardProps:{src:'source.png'}}});
 a.shots.push({shotId:'s02',pureTextReason:'真实来源展示',research:[]});a.shots[0].bindings=a.shots[0].research.map(r=>({...r,localPath:'source.png',sha256:hash('source'),sourceUrl:'https://www.federalreserve.gov/source',identityReason:'核对官方来源',sourceVerified:true,licenseVerified:true,license:'Public domain',displayShotId:'s02',displayReason:'用户确认保留短开场，来源集中后续展示'}));
 fs.writeFileSync(p+'/material-research-plan.json',JSON.stringify(a));fs.writeFileSync(p+'/remotion/shots.json',JSON.stringify(s));
 assert.equal(auditMaterialResearch(p,index).passed,false);
 fs.writeFileSync(p+'/qa/material-display-policy-approval.json',JSON.stringify({policy:'concentrated-sources',authorizedBy:'user',sourceShotIds:['s01'],scriptSha256:hash('script'),audioSha256:hash('voice')}));assert.equal(auditMaterialResearch(p,index).passed,true);
 s[1].templateParams.cardProps.src='missing.png';fs.writeFileSync(p+'/remotion/shots.json',JSON.stringify(s));assert.equal(auditMaterialResearch(p,index).passed,false);
 s[1].templateParams.cardProps.src='source.png';fs.writeFileSync(p+'/remotion/shots.json',JSON.stringify(s));fs.writeFileSync(p+'/audio/full.mp3','changed');assert.equal(auditMaterialResearch(p,index).passed,false);
});

test('实际证据层可绑定来源，背景或未渲染路径不能代替',t=>{
 const p=fixture(t),a=plan(),s=structuredClone(shots);fs.writeFileSync(p+'/remotion/public/source.png','real-source-fixture');
 const sha256=createHash('sha256').update('real-source-fixture').digest('hex');
 a.shots[0].bindings=a.shots[0].research.map(r=>({...r,localPath:'source.png',sourceUrl:'https://www.federalreserve.gov/source',identityReason:'已核对原机构页面',sourceVerified:true,licenseVerified:true,license:'Public domain',sha256}));
 fs.writeFileSync(p+'/material-research-plan.json',JSON.stringify(a));
 for(const role of ['background','unused','evidence','subject']){s[0].templateParams={cardProps:{},materialRole:role,materialSrc:'source.png'};fs.writeFileSync(p+'/remotion/shots.json',JSON.stringify(s));assert.equal(auditMaterialResearch(p,index).passed,['evidence','subject'].includes(role));}
 s[0].templateParams.materialSrc='unrendered.png';fs.writeFileSync(p+'/remotion/shots.json',JSON.stringify(s));assert.equal(auditMaterialResearch(p,index).passed,false);
});
test('本地背景仅按明确概念和实际时长画幅给候选，禁止通用兜底冒充匹配',()=>{
 const r=rankLocalBackgrounds({backgroundConcepts:['交通车流']},{start:0,end:5},[
 {path:'city',tags:['交通车流'],duration_sec:8,width:1920,height:1080},
 {path:'office',tags:['商务'],duration_sec:8,width:1920,height:1080},
 {path:'short',tags:['交通车流'],duration_sec:3,width:1920,height:1080}]);assert.deepEqual(r.map(x=>x.path),['city']);assert.equal(r[0].identityEvidence,false);
});
test('同一规划继续执行复用检索记录，显式恢复才重新请求，历史结果保留',async t=>{
 const p=fixture(t);let calls=0;const fetchImpl=async()=>{calls++;return{ok:true,json:async()=>({query:{pages:{}}})};};
 await researchProject(p,index,{fetchImpl});const n=calls;assert.equal((await researchProject(p,index,{fetchImpl})).reused,true);assert.equal(calls,n);
 await researchProject(p,index,{fetchImpl,refresh:true});assert.equal(calls,n*2);assert.ok(fs.readdirSync(p+'/qa').filter(n=>n.startsWith('material-search-')&&n!=='material-search-results.json').length>=2);
});
test('同名人物职业不符时不检索或采用其肖像',async()=>{
 let calls=0;const r=await discoverPersonSources({entityName:'Robert Hall',identityContext:'economist'},{fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({search:[{id:'Qwrong',description:'American singer'}]})};}});
 assert.equal(calls,1);assert.equal(r.candidates.length,0);assert.equal(r.errors[0].code,'NO_CONTEXT_MATCH');
});
test('职业匹配仍核对人类实体，再按P18查精确图片及授权，不能自动接受',async()=>{
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('wbsearchentities')?{search:[{id:'Q1',description:'American economist'}]}:url.includes('wbgetentities')?{entities:{Q1:{id:'Q1',labels:{en:{value:'Robert Hall'}},descriptions:{en:{value:'American economist'}},claims:{P31:[{mainsnak:{datavalue:{value:{id:'Q5'}}}}],P18:[{mainsnak:{datavalue:{value:'Hall.jpg'}}}]}}}}:{query:{pages:{1:{title:'File:Hall.jpg',imageinfo:[{url:'https://upload.wikimedia.org/hall.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Hall.jpg',extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'}}}]}}}}});
 const r=await discoverPersonSources({entityName:'Robert Hall',identityContext:'economist'},{fetchImpl});assert.equal(r.candidates.find(c=>c.mediaUrl).fileTitle,'File:Hall.jpg');assert.equal(r.candidates.find(c=>c.mediaUrl).licenseEligible,false);assert.equal(r.accepted,false);
});
test('比较背景不会强制每个文字镜铺视频，明确选用才校验绑定',t=>{
 const p=fixture(t),v=plan();v.shots[0].research=[];v.shots[0].backgroundQuery='city';v.shots[0].backgroundReason='比较语境';fs.writeFileSync(p+'/material-research-plan.json',JSON.stringify(v));
 assert.equal(auditMaterialResearch(p,index).issues.some(i=>i.code==='BACKGROUND_NOT_BOUND'),false);v.shots[0].backgroundDecision='use';fs.writeFileSync(p+'/material-research-plan.json',JSON.stringify(v));assert.equal(auditMaterialResearch(p,index).issues.some(i=>i.code==='BACKGROUND_NOT_BOUND'),true);
});
