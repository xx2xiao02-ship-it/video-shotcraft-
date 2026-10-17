import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareResearchBindings} from './talkcraft-research-binding.mjs';
import {auditMaterialResearch} from './talkcraft-material-research.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const catalog = {cards:[{cardId:'pair',policy:{media:{srcFront:'image',hostSrc:'portrait-video'}}}]};
function fixture(t) {
  const p=fs.mkdtempSync(path.join(os.tmpdir(),'research-binding-'));
  t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
  fs.mkdirSync(path.join(p,'remotion/public'),{recursive:true});
  const write=(name,value)=>fs.writeFileSync(path.join(p,name),JSON.stringify(value));
  fs.writeFileSync(path.join(p,'input.txt'),'unchanged script');
  fs.writeFileSync(path.join(p,'remotion/public/source.png'),'source bytes');
  const entry={shotId:'s01',kind:'identity',query:'Robert Hall economist',field:'srcFront',localPath:'source.png',
    sha256:sha('source bytes'),sourceUrl:'https://institution.example/profile',sourceVerified:true,
    licenseVerified:true,license:'Public domain statement text',licenseUrl:'https://institution.example/terms',
    identityReason:'原机构正文明确列出本人姓名',contentLanguage:'en',languageReason:'保留原机构外文资料，不伪造中文原页'};
  const plan={schema:'talkcraft-material-binding-plan-v1',inputSha256:sha('unchanged script'),bindings:[entry]};
  write('material-binding-plan.json',plan);
  write('remotion/shots.json',[{id:'s01',shotCard:'pair',start:0,end:4,templateParams:{cardProps:{}}}]);
  write('material-research-plan.json',{schema:'talkcraft-material-research-v1',shots:[{shotId:'s01',pureTextReason:'本人机构资料用于识别人物',research:[{kind:entry.kind,query:entry.query,reason:'本人身份核验'}]}]});
  write('semantics.json',{sentences:[{shot:'s01',text:'霍尔',need:['身份']}]});
  return {p,write,plan,entry};
}
test('正式绑定资料到原卡实际槽，继续经过原有来源校验，重复执行不改文件',t=>{
  const {p}=fixture(t);
  assert.equal(auditMaterialResearch(p,{cards:[{slug:'pair',category:'图片'}]}).passed,false);
  assert.equal(prepareResearchBindings(p,catalog).applied.length,1);
  assert.equal(auditMaterialResearch(p,{cards:[{slug:'pair',category:'图片'}]}).passed,true);
  const file=path.join(p,'remotion/shots.json'),stamp=fs.statSync(file).mtimeMs;
  prepareResearchBindings(p,catalog);assert.equal(fs.statSync(file).mtimeMs,stamp);
});
test('正式绑定保存准确槽位；历史缺槽记录只按已核准计划补回，不覆盖来源',t=>{
  const {p,write,plan,entry}=fixture(t);
  const source={...entry};delete source.field;source.reviewNote='保留历史来源核验';
  write('material-research-plan.json',{shots:[{shotId:'s01',research:[{kind:entry.kind,query:entry.query}],bindings:[source]}]});
  assert.equal(prepareResearchBindings(p,catalog).issues.length,0);
  const bound=JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json'))).shots[0].bindings[0];
  assert.equal(bound.field,'srcFront');assert.equal(bound.reviewNote,'保留历史来源核验');
  assert.equal(bound.sha256,entry.sha256);
  const stamp=fs.readFileSync(path.join(p,'material-research-plan.json'),'utf8');
  plan.bindings[0].field='srcBack';write('material-binding-plan.json',plan);
  const dual={cards:[{cardId:'pair',policy:{media:{srcFront:'image',srcBack:'image'}}}]};
  assert.equal(prepareResearchBindings(p,dual).issues.length,1);
  assert.equal(fs.readFileSync(path.join(p,'material-research-plan.json'),'utf8'),stamp);
});
test('搜索候选没有核验授权时不能成为绑定',t=>{
  const {p,write,plan}=fixture(t);plan.bindings[0].licenseVerified=false;write('material-binding-plan.json',plan);
  assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0].templateParams.cardProps,{});
});
test('哈希变动与越界路径均拒绝，不修改原镜头',t=>{
  const {p,write,plan}=fixture(t);for(const localPath of ['source.png','../../input.txt']){
    plan.bindings[0].localPath=localPath;plan.bindings[0].sha256='wrong';write('material-binding-plan.json',plan);
    assert.equal(prepareResearchBindings(p,catalog).applied.length,0);
  }
});
test('不能绑定口型槽、未知字段或覆盖已有不同素材',t=>{
  const {p,write,plan}=fixture(t);for(const field of ['hostSrc','unknown']){
    plan.bindings[0].field=field;write('material-binding-plan.json',plan);assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
  }
  plan.bindings[0].field='srcFront';write('material-binding-plan.json',plan);
  write('remotion/shots.json',[{id:'s01',shotCard:'pair',templateParams:{cardProps:{srcFront:'other.png'}}}]);
  assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
});
test('原稿或逐镜研究需求改变后拒绝复用旧绑定计划',t=>{
  const {p,write,plan}=fixture(t);fs.writeFileSync(path.join(p,'input.txt'),'new script');
  assert.equal(prepareResearchBindings(p,catalog).issues[0].code,'MATERIAL_BINDING_PLAN_STALE');
  fs.writeFileSync(path.join(p,'input.txt'),'unchanged script');plan.bindings[0].query='unrelated';write('material-binding-plan.json',plan);
  assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
});
test('明确背景决策可执行，但伪视频仍被原有文件门禁阻断',t=>{
  const {p,write,plan}=fixture(t);plan.bindings=[];
  write('remotion/shots.json',[{id:'s01',shotCard:'ink-underline',start:0,end:4,templateParams:{cardProps:{ink:'#111111',inkColor:'#112233'}}}]);
  fs.writeFileSync(path.join(p,'remotion/public/city.mp4'),'not a video');
  plan.backgrounds=[{shotId:'s01',cardId:'ink-underline',decision:'use',reason:'群体经济活动的城市背景',colors:{ink:'#ffffff',inkColor:'#b4d6ff'},params:{materialSrc:'city.mp4',materialSourceId:'local-city-source',materialMatchReason:'城市日常经济活动',materialSha256:sha('not a video'),backgroundPresentation:'text-video-v1'}}];
  write('material-binding-plan.json',plan);
  assert.equal(prepareResearchBindings(p,catalog).applied.length,1);
  const audit=auditMaterialResearch(p,{cards:[{slug:'ink-underline',category:'强调标注'}]});
  assert.ok(audit.issues.some(i=>i.code==='TEXT_VIDEO_FILE_INVALID'));
});
test('暗字背景、未知原卡及compare决策拒绝，不能靠准备步骤放宽校验',t=>{
  const {p,write,plan}=fixture(t);plan.bindings=[];
  plan.backgrounds=[{shotId:'s01',cardId:'pair',decision:'compare',reason:'尚未决定'}];
  write('material-binding-plan.json',plan);assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
  plan.backgrounds[0].decision='use';plan.backgrounds[0].params={};write('material-binding-plan.json',plan);
  assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
  write('remotion/shots.json',[{id:'s01',shotCard:'ink-underline',templateParams:{cardProps:{ink:'#111111',inkColor:'#112233'}}}]);
  fs.writeFileSync(path.join(p,'remotion/public/city.mp4'),'video');
  plan.backgrounds=[{shotId:'s01',cardId:'ink-underline',decision:'use',reason:'城市生活',params:{materialSrc:'city.mp4',materialSourceId:'city',materialMatchReason:'城市生活',materialSha256:sha('video'),backgroundPresentation:'text-video-v1'}}];
  write('material-binding-plan.json',plan);assert.equal(prepareResearchBindings(p,catalog).issues.length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json')))[0].templateParams.cardProps.ink,'#111111');
});
