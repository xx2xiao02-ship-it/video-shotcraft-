import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {withMaterialBindingTransaction} from './talkcraft-material-binding-transaction.mjs';

function fixture(t){
  const p=fs.mkdtempSync(path.join(os.tmpdir(),'binding-transaction-'));
  t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
  fs.mkdirSync(path.join(p,'remotion'),{recursive:true});fs.mkdirSync(path.join(p,'qa'));
  fs.writeFileSync(path.join(p,'input.txt'),'original input');
  const values={'remotion/shots.json':[{id:'s01',src:'reviewed.png'}],'material-research-plan.json':{bindings:['reviewed.png']}};
  for(const name of Object.keys(values))fs.writeFileSync(path.join(p,name),'{}');
  return {p,values};
}
function killAfterFirstWrite(p,values){
  const moduleUrl=new URL('./talkcraft-material-binding-transaction.mjs',import.meta.url).href;
  const source=`import {withMaterialBindingTransaction as run} from ${JSON.stringify(moduleUrl)};
    run(${JSON.stringify(p)},tx=>tx.commit(${JSON.stringify(values)}),{afterWrite(){process.kill(process.pid,'SIGKILL');}});`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',windowsHide:true});
  assert.ifError(child.error);assert.notEqual(child.status,0,child.stderr);
}
test('真实子进程在首个文件落盘后被终止，重启恢复剩余文件，重复继续不改成功文件',t=>{
  const {p,values}=fixture(t);killAfterFirstWrite(p,values);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'remotion/shots.json'))),values['remotion/shots.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,'material-research-plan.json'))),{});
  const result=withMaterialBindingTransaction(p,tx=>{assert.equal(tx.recovered,true);tx.commit(values);return 'resumed';});
  assert.equal(result,'resumed');
  const files=Object.keys(values),before=files.map(n=>fs.statSync(path.join(p,n)).mtimeMs);
  withMaterialBindingTransaction(p,tx=>{assert.equal(tx.recovered,false);tx.commit(values);});
  for(const [i,n]of files.entries()){
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p,n))),values[n]);
    assert.equal(fs.statSync(path.join(p,n)).mtimeMs,before[i]);
  }
  assert.equal(fs.readdirSync(path.join(p,'qa/material-binding-transactions')).length,1);
});
test('中断后原稿或槽位被其他任务修改时拒绝恢复，不覆盖新文件',t=>{
  for(const name of ['input.txt','material-research-plan.json']){
    const {p,values}=fixture(t);killAfterFirstWrite(p,values);
    fs.writeFileSync(path.join(p,name),'new owner data');
    assert.throws(()=>withMaterialBindingTransaction(p,()=>assert.fail('不得继续')),/变化|并发/);
    assert.equal(fs.readFileSync(path.join(p,name),'utf8'),'new owner data');
  }
});
test('并发继续拒绝第二次绑定，成功退出后执行锁释放',t=>{
  const {p,values}=fixture(t);
  withMaterialBindingTransaction(p,tx=>{
    assert.throws(()=>withMaterialBindingTransaction(p,()=>assert.fail('并发执行')),/已有素材绑定进程/);
    tx.commit(values);
  });
  assert.equal(fs.existsSync(path.join(p,'qa/material-binding.lock')),false);
});
test('损坏执行锁或未知恢复字段保持阻断，不删除现场',t=>{
  const {p}=fixture(t),lock=path.join(p,'qa/material-binding.lock');
  fs.writeFileSync(lock,'bad');assert.throws(()=>withMaterialBindingTransaction(p,()=>{}),/损坏/);
  assert.equal(fs.readFileSync(lock,'utf8'),'bad');fs.unlinkSync(lock);
  assert.throws(()=>withMaterialBindingTransaction(p,tx=>tx.commit({'input.txt':'wrong'})),/范围/);
  assert.equal(fs.readFileSync(path.join(p,'input.txt'),'utf8'),'original input');
});
