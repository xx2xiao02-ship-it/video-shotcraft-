import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTalkcraftStatusReader} from './talkcraft-status-reader.mjs';

async function fixture(t){
  const dir=mkdtempSync(path.join(tmpdir(),'talkcraft-status-reader-'));
  const module=path.join(dir,'checks.mjs');
  writeFileSync(module,`let count=0;export function readTalkcraftStatus(root,id){
    if(id==='crash')process.exit(2);
    const end=Date.now()+150;while(Date.now()<end){}
    if(id==='invalid')throw Error('原校验拒绝');
    return {root,id,count:++count};
  }`);
  const reader=createTalkcraftStatusReader(dir,{moduleUrl:pathToFileURL(module).href});
  t.after(async()=>{await reader.close();rmSync(dir,{recursive:true,force:true});});
  return reader;
}
test('synchronous validation does not block the stream event loop',async t=>{
  const reader=await fixture(t);
  let ticked=false;
  const result=reader.read('run');
  await new Promise(resolve=>setTimeout(()=>{ticked=true;resolve();},20));
  assert.equal(ticked,true);
  assert.equal(await Promise.race([result.then(()=>true),Promise.resolve(false)]),false);
  assert.equal((await result).id,'run');
});
test('concurrent reads share only the active check; later reads revalidate',async t=>{
  const reader=await fixture(t);
  const first=reader.read('run'), second=reader.read('run');
  assert.equal(first,second);
  assert.equal((await first).count,1);
  assert.equal((await reader.read('run')).count,2);
});
test('validation errors remain errors, never reuse a previous pass',async t=>{
  const reader=await fixture(t);
  await reader.read('run');
  await assert.rejects(reader.read('invalid'),/原校验拒绝/);
});
test('worker failure rejects requests and a later request can recover',async t=>{
  const reader=await fixture(t);
  await assert.rejects(reader.read('crash'),/状态核验线程退出/);
  assert.equal((await reader.read('run')).count,1);
});
