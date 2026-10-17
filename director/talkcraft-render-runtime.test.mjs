import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {cleanupTalkcraftRenderTemp,ensureTalkcraftRenderRuntime,inspectTalkcraftRenderRuntime,talkcraftRenderEnvironment} from './talkcraft-render-runtime.mjs';
const names=['remotion','@remotion/bundler','@remotion/renderer','@remotion/cli'];
test('渲染临时目录位于当前运行且保留调用方配置，不修改系统环境',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/render-temp-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const caller={TEMP:'C:/old-temp',KEEP:'preserved'};
 const env=talkcraftRenderEnvironment(root,caller);
 assert.equal(env.TEMP,path.join(root,'.render-temp'));assert.equal(env.TMP,env.TEMP);assert.equal(env.TMPDIR,env.TEMP);
 assert.equal(env.KEEP,'preserved');assert.equal(caller.TEMP,'C:/old-temp');
 assert.deepEqual(fs.readdirSync(env.TEMP),[]);
});
test('只清理精确的渲染临时目录，不触碰成片输出',t=>{
 const root=fs.mkdtempSync(path.resolve('tmp/render-temp-cleanup-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'.render-temp','nested'),{recursive:true});
 fs.writeFileSync(path.join(root,'.render-temp','nested','transient.mp4'),'temporary');
 fs.mkdirSync(path.join(root,'remotion','out'),{recursive:true});
 fs.writeFileSync(path.join(root,'remotion','out','final.mp4'),'keep');
 assert.equal(cleanupTalkcraftRenderTemp(root),true);
 assert.equal(fs.existsSync(path.join(root,'.render-temp')),false);
 assert.equal(fs.readFileSync(path.join(root,'remotion','out','final.mp4'),'utf8'),'keep');
 assert.equal(cleanupTalkcraftRenderTemp(root),false);
});
function fixture(t){const root=fs.mkdtempSync(path.resolve('tmp/render-runtime-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const skill=path.join(root,'skill'),project=path.join(root,'project');fs.mkdirSync(path.join(project,'remotion'),{recursive:true});
 for(const name of names){const dir=path.join(skill,'runtime/node_modules',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,version:'4.0.519'}));}
 fs.writeFileSync(path.join(skill,'runtime/package.json'),JSON.stringify({dependencies:Object.fromEntries(names.map(name=>[name,'4.0.519']))}));
 return {root,skill,project};}
test('B 工程显式绑定同一锁定依赖，不能从父目录误取另一版本',t=>{
 const f=fixture(t),parent=path.join(f.root,'node_modules/remotion');fs.mkdirSync(parent,{recursive:true});fs.writeFileSync(path.join(parent,'package.json'),JSON.stringify({name:'remotion',version:'4.0.526'}));
 assert.equal(inspectTalkcraftRenderRuntime(f.project,f.skill).passed,false);
 const report=ensureTalkcraftRenderRuntime(f.project,f.skill);assert.equal(report.passed,true);
 assert.ok(report.rows.every(r=>r.version==='4.0.519'));assert.equal(inspectTalkcraftRenderRuntime(f.project,f.skill).passed,true);
});
test('不同的既有依赖目录保持完整并阻断自动覆盖',t=>{
 const f=fixture(t),dir=path.join(f.project,'remotion/node_modules');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'keep.txt'),'preserved');
 assert.throws(()=>ensureTalkcraftRenderRuntime(f.project,f.skill),/禁止自动覆盖/);assert.equal(fs.readFileSync(path.join(dir,'keep.txt'),'utf8'),'preserved');
});
test('核心和渲染器不同版本时，即使路径已统一仍拒绝',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.skill,'runtime/node_modules/@remotion/renderer/package.json'),JSON.stringify({name:'@remotion/renderer',version:'4.0.526'}));
 assert.throws(()=>ensureTalkcraftRenderRuntime(f.project,f.skill),/禁止继续渲染/);
});
