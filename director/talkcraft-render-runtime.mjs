import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const names=['remotion','@remotion/bundler','@remotion/renderer','@remotion/cli'];
const same=(a,b)=>fs.realpathSync(a).toLowerCase()===fs.realpathSync(b).toLowerCase();

// 渲染临时目录只承载 Chromium/Remotion 的可重建中间文件，不是业务证据。
// 只允许删除项目根下精确命名的 .render-temp，避免清理路径扩大到 run 或素材。
export function cleanupTalkcraftRenderTemp(project){
 const resolvedProject=path.resolve(project),directory=path.join(resolvedProject,'.render-temp');
 if(path.dirname(directory)!==resolvedProject)throw Error('拒绝清理项目外的渲染临时目录');
 let stat;
 try{stat=fs.lstatSync(directory);}catch(error){if(error?.code==='ENOENT')return false;throw error;}
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('渲染临时目录不是普通目录，拒绝递归清理');
 const real=fs.realpathSync.native(directory);
 if(real.toLowerCase()!==path.resolve(directory).toLowerCase())throw Error('渲染临时目录是重解析目录，拒绝递归清理');
 fs.rmSync(directory,{recursive:true,force:true});
 return true;
}

export function talkcraftRenderEnvironment(project, env = process.env) {
 const directory = path.resolve(project, '.render-temp');
 fs.mkdirSync(directory, {recursive:true});
 // Keep Chromium downloads/cache with the writable run, rather than Windows C: temp.
 const probe = path.join(directory, `write-check-${process.pid}`);
 fs.writeFileSync(probe, '');fs.unlinkSync(probe);
 return {...env, TEMP:directory, TMP:directory, TMPDIR:directory};
}

export function inspectTalkcraftRenderRuntime(project,skillRoot){
 const remotion=path.join(project,'remotion'),target=path.join(skillRoot,'runtime/node_modules'),rows=[];
 const require=createRequire(path.join(remotion,'package.json'));
 const expected=JSON.parse(fs.readFileSync(path.join(skillRoot,'runtime/package.json'),'utf8')).dependencies;
 for(const name of names){
  try{const local=path.join(remotion,'node_modules',name,'package.json');
   // Absolute package lookup avoids Node's old parent-path resolution cache
   // after this process creates the previously missing runtime junction.
   const file=require.resolve(fs.existsSync(local)?local:name+'/package.json'),version=JSON.parse(fs.readFileSync(file,'utf8')).version;
   rows.push({name,file,version,expected:expected[name],passed:version===expected[name]&&same(path.dirname(file),path.join(target,name))});
  }catch{rows.push({name,version:null,expected:expected[name],passed:false});}
 }
 return {schema:'talkcraft-render-runtime-v1',passed:rows.every(r=>r.passed),rows,checkedAt:new Date().toISOString()};
}

export function ensureTalkcraftRenderRuntime(project,skillRoot){
 const target=path.resolve(skillRoot,'runtime/node_modules'),remotion=path.join(project,'remotion'),link=path.join(remotion,'node_modules');
 if(!fs.existsSync(target))throw Error('B 模式锁定运行依赖缺失，请修复随包运行环境');
 fs.mkdirSync(remotion,{recursive:true});
 let present=false;try{fs.lstatSync(link);present=true;}catch{}
 if(present){if(!fs.existsSync(link)||!same(link,target))throw Error('B 模式工程已有不同运行依赖，已保留；需核对后迁移，禁止自动覆盖');}
 else fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
 const report=inspectTalkcraftRenderRuntime(project,skillRoot);
 const qa=path.join(project,'qa');fs.mkdirSync(qa,{recursive:true});fs.writeFileSync(path.join(qa,'render-runtime.json'),JSON.stringify(report,null,2));
 if(!report.passed)throw Error('B 模式 Remotion 核心与渲染依赖未统一到上游锁定版本，禁止继续渲染');
 return report;
}
