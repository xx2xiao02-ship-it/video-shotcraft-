import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {trackTalkcraftExecution,readTalkcraftExecutions,updateTalkcraftExecution,talkcraftExecutionView} from './talkcraft-execution.mjs';
function fixture(t){
 mkdirSync('tmp',{recursive:true});const dir=mkdtempSync(path.resolve('tmp/execution-test-'));
 writeFileSync(path.join(dir,'source-run.json'),'{}');t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}
test('同步后台步骤登记活动状态，嵌套调用不生成重复任务',t=>{
 const dir=fixture(t);
 const value=trackTalkcraftExecution(dir,'preflight',()=>{
  assert.equal(readTalkcraftExecutions(dir)[0].status,'running');
  return trackTalkcraftExecution(dir,'candidates',()=>{updateTalkcraftExecution('正在核验模板绑定');return 23;});
 });
 assert.equal(value,23);const rows=readTalkcraftExecutions(dir);
 assert.equal(rows.length,1);assert.equal(rows[0].status,'done');assert.equal(rows[0].stage,'preflight');
});
test('异步执行完成和错误均持久化；失败不冒充通过',async t=>{
 const dir=fixture(t);let release;
 const pending=trackTalkcraftExecution(dir,'editorial',()=>new Promise(resolve=>{release=resolve;}));
 assert.equal(readTalkcraftExecutions(dir)[0].status,'running');release({passed:false});await pending;
 assert.equal(readTalkcraftExecutions(dir)[0].status,'error');
 await assert.rejects(trackTalkcraftExecution(dir,'editorial',async()=>{throw Error('s02 句子重叠');}),/s02/);
 assert.ok(readTalkcraftExecutions(dir).some(row=>row.error==='s02 句子重叠'));
});
test('活动后台步骤优先于历史失败；交付前不编造百分比',()=>{
 const failure={title:'历史失败',cause:'上次错误'};
 const running=talkcraftExecutionView({activeTask:{name:'talkcraft-editorial',status:'running',message:'复用分镜本地校验'},lastFailure:failure});
 assert.equal(running.status,'running');assert.equal(running.label,'复用分镜本地校验');assert.equal(running.progress,null);
 assert.equal(talkcraftExecutionView({lastFailure:failure}).status,'blocked');
 assert.equal(talkcraftExecutionView({waitingFor:'审核分镜'}).status,'waiting');
 assert.equal(talkcraftExecutionView({delivery:true}).progress,100);
});
test('真实独立进程可被读取，异常退出后不残留为运行中',async t=>{
 const dir=fixture(t),moduleUrl=new URL('./talkcraft-execution.mjs',import.meta.url).href;
 const code=`import {trackTalkcraftExecution} from ${JSON.stringify(moduleUrl)};trackTalkcraftExecution(${JSON.stringify(dir)},'preflight',()=>{console.log('ready');process.exit(3);});`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true});
 await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 const rows=readTalkcraftExecutions(dir);assert.equal(rows.length,1);assert.equal(rows[0].status,'interrupted');
 assert.equal(readdirSync(path.join(dir,'qa/executions')).filter(n=>n.endsWith('.json')).length,1);
});
