import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PLATFORM_LIMITS, generateTitles} from './packaging-titles.mjs';

test('generates deduplicated candidates with consistent metadata', () => {
  const titles = generateTitles({topic:'家用咖啡机选购', keywords:['咖啡机', '测评'], count:6});
  assert.equal(titles.length, 6);
  assert.equal(new Set(titles.map(item => item.text)).size, 6);
  for (const item of titles) {
    assert.equal(item.length, item.text.length);
    assert.equal(item.fitsLimit, item.text.length <= PLATFORM_LIMITS.general);
    assert.ok(item.pattern.length > 0);
    assert.ok(!item.text.includes('\n'));
  }
});

test('platform limit flags over-length titles instead of dropping them', () => {
  const titles = generateTitles({topic:'长视频剪辑工作流的完整搭建思路与踩坑记录', platform:'douyin', count:10});
  assert.ok(titles.some(item => item.fitsLimit), '应存在符合抖音 20 字限制的候选');
  for (const item of titles) {
    assert.equal(item.fitsLimit, item.text.length <= PLATFORM_LIMITS.douyin);
  }
});

test('empty topic falls back to a usable subject', () => {
  const titles = generateTitles({count:3});
  assert.equal(titles.length, 3);
  assert.ok(titles.every(item => item.text.includes('这个主题')));
});
