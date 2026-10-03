import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {renderConcurrency,parseRenderProgress,writeRenderProgress,readRenderProgress,runRenderCommand} from './render-runtime.mjs';

test('render defaults to five and respects CPU and memory limits', () => {
  assert.equal(renderConcurrency({cpus:16,freeBytes:16*2**30}).effective,5);
  assert.equal(renderConcurrency({cpus:16,freeBytes:5*2**30}).effective,2);
  assert.equal(renderConcurrency({cpus:2,freeBytes:32*2**30}).effective,2);
  assert.equal(renderConcurrency({cpus:16,freeBytes:1*2**30}).effective,1);
  assert.equal(renderConcurrency({requested:1,cpus:16,freeBytes:32*2**30}).effective,1);
  for (const requested of [0,6,1.5,'bad']) assert.throws(()=>renderConcurrency({requested}));
});

test('progress parses latest frames and encoding without claiming full completion', () => {
  assert.deepEqual(parseRenderProgress('Rendered 1/10\r\x1b[32mRendered 6/10, time remaining: 3s\x1b[0m'),
    {stage:'frames',completed:6,total:10,remaining:'3s'});
  assert.equal(parseRenderProgress('Encoded 10/10').stage,'encoding');
  assert.equal(parseRenderProgress('Bundled 100%'),null);
  assert.equal(parseRenderProgress('Rendered 0/0'),null);
});

test('progress is atomically persisted and previous render cannot leak into new task', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shotcraft-render-progress-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  writeRenderProgress(dir,{startedAt:100,stage:'frames',completed:2,total:10});
  assert.equal(readRenderProgress(dir,100).completed,2);
  assert.equal(readRenderProgress(dir,101),null);
  assert.equal(fs.existsSync(path.join(dir,'render-progress.json.tmp')),false);
});

test('render command streams real child progress before exit and propagates failure', async () => {
  const events=[];
  await runRenderCommand('node -e "console.log(\'Rendered 3/10\'); setTimeout(()=>console.log(\'Rendered 10/10\'),100)"',
    {cwd:process.cwd(),onProgress:p=>events.push(p.completed)});
  assert.deepEqual(events,[3,10]);
  await assert.rejects(runRenderCommand('node -e "process.exit(7)"',{cwd:process.cwd()}),/7/);
});
