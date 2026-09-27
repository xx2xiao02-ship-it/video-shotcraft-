// 视频外包装 - 页面完整性回归测试：packaging-console.js 引用的每个元素 id
// 必须存在于 packaging-console.html（重写页面时漏掉 ai-config-status 曾导致 init 整链崩溃）。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

test('every element id referenced by the console script exists in the page', () => {
  const html = readFileSync(path.join(DIR, 'packaging-console.html'), 'utf8');
  const js = readFileSync(path.join(DIR, 'packaging-console.js'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const referenced = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]));
  assert.ok(referenced.size >= 20, `应引用至少 20 个元素，实际 ${referenced.size}`);
  const missing = [...referenced].filter(id => !htmlIds.has(id));
  assert.deepEqual(missing, [], `页面缺少脚本引用的元素: ${missing.join(', ')}`);
});

test('page declares the embed hook and step navigation contract', () => {
  const html = readFileSync(path.join(DIR, 'packaging-console.html'), 'utf8');
  assert.ok(html.includes('data-go='), '步骤导航应存在');
  const css = readFileSync(path.join(DIR, 'packaging-console.css'), 'utf8');
  assert.ok(css.includes('html.embedded'), '内嵌模式样式应存在（?embed=1 约定）');
});
