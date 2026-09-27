import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {composeTitleCard, drawtextFragment, filterPath, hexToFfColor, layoutTitleBlock,
  maxCharsForWidth, outputSize, probeImage, wrapTitleLines} from './packaging-compose.mjs';
import {normalizePackagingTheme} from './packaging-theme.mjs';

test('wrapTitleLines breaks CJK by visual units and keeps ASCII words intact', () => {
  assert.deepEqual(wrapTitleLines('', 8), []);
  const cjk = wrapTitleLines('家用咖啡机选购完全指南与避坑清单', 8);
  assert.ok(cjk.length >= 2 && cjk.length <= 4);
  for (const line of cjk) assert.ok(line.length <= 9, `单行过长: ${line}`);
  assert.deepEqual(wrapTitleLines('Remotion GPT', 6), ['Remotion', 'GPT']);
});

test('layoutTitleBlock stacks title, accent bar and subtitle in bounds', () => {
  const [width, height] = outputSize('16:9');
  const fontSize = Math.round(Math.min(width, height) * 0.125);
  const lines = wrapTitleLines('一行测试标题', maxCharsForWidth(width, fontSize));
  const {ops} = layoutTitleBlock({lines, subtitle:'副标题文字', width, height, mode:'cover'});
  assert.ok(ops.length >= 3);
  for (let index = 1; index < ops.length; index += 1) {
    assert.ok(ops[index].y > ops[index - 1].y, '绘制操作应自上而下');
  }
  assert.equal(ops[0].role, 'title');
  assert.equal(ops.at(-1).role, 'subtitle');
  assert.ok(ops.at(-1).y + ops.at(-1).fontSize <= height + 1, '标题块应落在画布内');
  const bar = ops.find(op => op.kind === 'bar');
  assert.ok(bar && bar.h >= 8);
});

test('filterPath escapes drive colon; drawtext fragment carries files and colors', () => {
  assert.equal(filterPath('C:\\Windows\\Fonts\\msyhbd.ttc'), "'C\\:/Windows/Fonts/msyhbd.ttc'");
  const fragment = drawtextFragment({textFile:'C:\\r\\t.txt', fontSize:100, y:500,
    color:'#ffffff', fontFile:'C:\\Windows\\Fonts\\msyhbd.ttc'});
  assert.ok(fragment.includes('textfile='));
  assert.ok(fragment.includes('fontcolor=0xffffff'));
  assert.ok(fragment.includes('x=(w-text_w)/2'));
  assert.ok(fragment.includes('borderw='));
  const flat = drawtextFragment({textFile:'C:\\r\\t.txt', fontSize:100, y:500,
    color:'#1a1a1a', fontFile:'C:\\Windows\\Fonts\\msyhbd.ttc', outline:false});
  assert.ok(flat.includes('borderw=0'));
  assert.ok(!flat.includes('bordercolor'));
});

test('hexToFfColor validates input', () => {
  assert.equal(hexToFfColor('#D4A853'), '0xd4a853');
  assert.throws(() => hexToFfColor('red'), /非法颜色/);
  assert.throws(() => hexToFfColor('#12345'), /非法颜色/);
});

test('composeTitleCard renders a real PNG with correct dimensions via ffmpeg', {timeout:60000}, () => {
  const work = mkdtempSync(path.join(path.resolve('tmp'), 'packaging-compose-'));
  const out = path.join(work, 'card.png');
  try {
    const theme = normalizePackagingTheme({id:'test', name:'测试', tokens:{background:'#0d0f14', accentPrimary:'#d4a853'}});
    const result = composeTitleCard({title:'测试标题卡', subtitle:'副标题一行', ratio:'16:9', theme, outFile:out, workDir:work});
    assert.ok(existsSync(out));
    assert.deepEqual(probeImage(out), {width:1920, height:1080});
    assert.equal(result.lines.length, 1);
  } finally {
    rmSync(work, {recursive:true, force:true});
  }
});
