import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {resolveTalkcraftTemplateMaterials,templateMaterialLibraryRoot} from './talkcraft-template-material-resolver.mjs';
import {allocateUniqueBackgrounds} from './talkcraft-background-allocation.mjs';
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'source-slot-guard-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 fs.mkdirSync(path.join(p,'remotion/public'),{recursive:true});fs.mkdirSync(path.join(p,'materials/_scenes'),{recursive:true});
 const write=(n,v)=>fs.writeFileSync(path.join(p,n),JSON.stringify(v));
 const shots=[{id:'s19',start:0,end:4,shotCard:'pair',templateParams:{cardProps:{srcBefore:'',srcAfter:''},templateMaterialQueries:{srcBefore:'央行',srcAfter:'生活'}}}];
 write('remotion/shots.json',shots);
 write('materials/_index.json',[{path:'not-a-source.mp4',tags:['央行','生活']}]);
 const catalog={cards:[{cardId:'pair',policy:{media:{srcBefore:'image',srcAfter:'image'},mediaAlternatives:[]}}]};
 return {p,write,shots,catalog};
}
test('未恢复明确双图来源前不转向本地泛素材，不挪用其他镜头编号',t=>{
 const {p,write,shots,catalog}=fixture(t);
 write('material-research-plan.json',{shots:[{shotId:'s19',materialBindings:[{field:'srcBefore',localPath:'reviewed.png'}],research:[{kind:'identity',query:'央行官方',displayField:'srcAfter'}]}]});
 const result=resolveTalkcraftTemplateMaterials(p,{root:p,catalog});
 assert.deepEqual(result.unresolved.map(i=>[i.field,i.code]),[['srcBefore','reviewed_source_binding_required'],['srcAfter','reviewed_source_binding_required']]);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json'))),shots);
 assert.equal(JSON.parse(fs.readFileSync(result.reportFile)).searches.length,0);
});
test('跨镜指定来源与单媒体槽的身份需求也不能由通用背景填充',t=>{
 const {p,write,catalog}=fixture(t);catalog.cards[0].policy.media={srcBefore:'image'};
 write('material-research-plan.json',{shots:[{shotId:'s01',research:[{kind:'evidence',query:'原始报告',displayShotId:'s19'}]}]});
 const result=resolveTalkcraftTemplateMaterials(p,{root:p,catalog});
 assert.equal(result.unresolved[0].code,'reviewed_source_binding_required');
});
test('重复背景检查不因JSON格式不同改写分镜，保留审批指纹和修改时间',t=>{
 const {p}=fixture(t),file=path.join(p,'remotion/shots.json');
 const bytes=fs.readFileSync(file,'utf8')+'\n';fs.writeFileSync(file,bytes);
 const mtime=fs.statSync(file).mtimeMs;
 allocateUniqueBackgrounds(p,p);allocateUniqueBackgrounds(p,p);
 assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.statSync(file).mtimeMs,mtime);
});
test('同卡辅助槽的官方资料查询也受保护，不能仅主资料槽核验后就用语境库凑辅图',t=>{
 const {p,write,shots,catalog}=fixture(t);
 shots[0].templateParams.templateMaterialQueries={srcBefore:'伍德福德 官方研究资料',srcAfter:'Columbia official profile'};
 write('remotion/shots.json',shots);
 const result=resolveTalkcraftTemplateMaterials(p,{root:p,catalog});
 assert.equal(result.unresolved.length,2);
 assert.ok(result.unresolved.every(r=>r.code==='reviewed_source_binding_required'));
 assert.equal(JSON.parse(fs.readFileSync(result.reportFile)).searches.length,0);
});


test('素材库根固定于当前运行代码仓库，不从嵌套修正事务向上猜测；显式隔离根仍生效',t=>{
 const {p,write,shots,catalog}=fixture(t);
 const runtimeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 assert.equal(templateMaterialLibraryRoot(),runtimeRoot);
 assert.equal(templateMaterialLibraryRoot({root:p}),path.resolve(p));
 const work=path.join(p,'run/qa/node-repairs/current/work');fs.mkdirSync(path.join(work,'remotion/public'),{recursive:true});
 fs.writeFileSync(path.join(work,'remotion/shots.json'),JSON.stringify(shots.map(s=>({...s,templateParams:{...s.templateParams,templateMaterialQueries:{srcBefore:'无匹配查询',srcAfter:'无匹配查询'}}}))));
 const r=resolveTalkcraftTemplateMaterials(work,{root:templateMaterialLibraryRoot({root:p}),catalog});
 const report=JSON.parse(fs.readFileSync(r.reportFile));assert.equal(report.searches.length,2);assert.ok(report.searches.every(s=>s.libraryEntries===1));
});
