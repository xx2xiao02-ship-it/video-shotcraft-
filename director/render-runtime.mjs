import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const GIB = 2 ** 30;

export function renderConcurrency({requested='auto', maxConcurrency=8, cpus=os.availableParallelism(),
  freeBytes=os.freemem(), totalBytes=os.totalmem(), workerBytes=1.5 * GIB}={}) {
  const configuredMax = Number(maxConcurrency);
  if (!Number.isInteger(configuredMax) || configuredMax < 1 || configuredMax > 12) {
    throw new Error('渲染并发上限必须为1至12的整数');
  }
  const value = requested === 'auto' || requested === undefined || requested === null
    ? configuredMax : Number(requested);
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    throw new Error('渲染并发数必须为1至12的整数，或使用 auto');
  }
  if (!Number.isFinite(workerBytes) || workerBytes <= 0) throw new Error('渲染工作进程内存预算必须大于0');
  // 动态保留总内存的 8%，但至少保留 2 GiB；每个浏览器工作进程按 1.5 GiB 预算。
  const reserveBytes = Math.max(2 * GIB, totalBytes * 0.08);
  const memoryLimit = Math.max(1, Math.floor((freeBytes - reserveBytes) / workerBytes));
  const effective = Math.min(value, configuredMax, Math.max(1, Number(cpus) || 1), memoryLimit);
  return {requested:value, configuredMax, effective, freeBytes, totalBytes, reserveBytes, workerBytes};
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
