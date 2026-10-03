import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

export function renderConcurrency({requested=5, cpus=os.availableParallelism(), freeBytes=os.freemem()}={}) {
  const value = Number(requested);
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('渲染并发数必须为1至5的整数');
  // Reserve 2 GiB for the OS; budget 1.5 GiB per browser worker.
  const memoryLimit = Math.max(1, Math.floor((freeBytes - 2 * 2**30) / (1.5 * 2**30)));
  return {requested:value, effective:Math.min(value, Math.max(1,cpus), memoryLimit), freeBytes};
}

export function parseRenderProgress(text) {
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');
  const matches = [...clean.matchAll(/(Rendered|Encoded)\s+(\d+)\s*\/\s*(\d+)(?:[^\r\n]*?time remaining:\s*([^\r\n]+))?/g)];
  const match = matches.at(-1);
  if (!match || Number(match[3]) <= 0) return null;
  return {stage:match[1] === 'Rendered' ? 'frames' : 'encoding', completed:Number(match[2]), total:Number(match[3]), remaining:match[4]?.trim() || null};
}

export function writeRenderProgress(dir, progress) {
  const file = path.join(dir,'render-progress.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify({...progress, updatedAt:Date.now()}));
  fs.renameSync(file + '.tmp',file);
}

export function readRenderProgress(dir, startedAt=0) {
  try {
    const progress = JSON.parse(fs.readFileSync(path.join(dir,'render-progress.json'),'utf8'));
    return progress.startedAt >= startedAt ? progress : null;
  } catch { return null; }
}

export async function runRenderCommand(command, {cwd, onProgress=()=>{}}) {
  await new Promise((resolve,reject) => {
    const child = spawn(command,{cwd,shell:true,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const consume = output => {
      let pending = '';
      return chunk => {
        output.write(chunk);
        pending += chunk.toString();
        const lines = pending.split(/[\r\n]/);
        pending = lines.pop();
        const progress = parseRenderProgress(lines.join('\n'));
        if (progress) onProgress(progress);
      };
    };
    child.stdout.on('data',consume(process.stdout));
    child.stderr.on('data',consume(process.stderr));
    child.on('error',reject);
    child.on('close',code => code === 0 ? resolve() : reject(new Error(`渲染进程退出码 ${code}`)));
  });
}
