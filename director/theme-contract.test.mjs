import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeTheme, themeAdapter, themeHash, videoDimensions} from './theme-contract.mjs';

test('normalizes the existing flat A-mode theme and keeps aliases', () => {
  const theme = normalizeTheme({name:'测试', bg:'#111111', ink:'#eeeeee', mid:'#999999', accent:'#aa8800'});
  assert.equal(theme.schema, 'shotcraft-theme-v2');
  assert.deepEqual(theme.compatibility, ['A', 'B']);
  assert.equal(theme.tokens.background, '#111111');
  assert.equal(theme.tokens.text, '#eeeeee');
  assert.equal(theme.bg, theme.tokens.background);
  assert.equal(theme.ink, theme.tokens.text);
  assert.equal(themeHash(theme), theme.themeHash);
});

test('nested tokens take precedence and expose both mode adapters', () => {
  const theme = normalizeTheme({id:'nested', name:'嵌套', bg:'#000', tokens:{background:'#123456', text:'#fedcba', accentPrimary:'#abcdef'}});
  assert.equal(theme.tokens.background, '#123456');
  assert.equal(theme.tokens.text, '#fedcba');
  assert.equal(theme.tokens.accentPrimary, '#abcdef');
  const a = themeAdapter(theme, 'A');
  const b = themeAdapter(theme, 'B');
  assert.equal(a.style.bg, '#123456');
  assert.equal(a.theme.text, '#fedcba');
  assert.equal(b.tokens.background, '#123456');
  assert.equal(b.cssVars['--sc-bg'], '#123456');
  assert.equal(a.themeHash, b.themeHash);
});

test('video aspect defaults to landscape and survives both mode adapters', () => {
  const landscape = normalizeTheme({});
  const portrait = normalizeTheme({...landscape, aspectRatio:'9:16'});
  assert.equal(landscape.aspectRatio, '16:9');
  assert.equal(portrait.aspectRatio, '9:16');
  assert.notEqual(landscape.themeHash, portrait.themeHash);
  assert.deepEqual(videoDimensions(portrait.aspectRatio), {width:1080, height:1920});
  assert.equal(themeAdapter(portrait, 'A').aspectRatio, '9:16');
  assert.equal(themeAdapter(portrait, 'B').aspectRatio, '9:16');
  assert.throws(() => normalizeTheme({aspectRatio:'4:3'}), /视频画幅/);
});
