import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {test} from 'node:test';
import {galleryAvailable, galleryCategories, galleryEntryCount, listGalleryEntries,
  getGalleryEntry, parseGalleryMarkdown, listCoverEntries, isCoverCategory, SKILL_REPO_DIR} from './packaging-gallery.mjs';

test('vendored GPT-Image2-Skill gallery is present and fully parsed', () => {
  assert.ok(galleryAvailable(), `skill 仓库应在 ${SKILL_REPO_DIR}`);
  assert.ok(galleryEntryCount() >= 150, `图库条目应不少于 150，实际 ${galleryEntryCount()}`);
  const categories = galleryCategories();
  assert.ok(categories.length >= 25, `分类应不少于 25，实际 ${categories.length}`);
  for (const category of categories) {
    assert.ok(category.id && category.label && category.count > 0);
  }
});

test('typography-posters category parses the tea poster entry intact', () => {
  const entries = listGalleryEntries('typography-and-posters');
  assert.equal(entries.length, 13);
  for (const entry of entries) assert.equal(entry.hasPrompt, true);
  const tea = getGalleryEntry('typography-and-posters-33');
  assert.equal(tea.title, 'Chinese tea launch poster');
  assert.equal(tea.sizeToken, 'portrait');
  assert.equal(tea.literalSize, '1024x1536');
  assert.ok(tea.prompt.includes('山川茶事'), 'prompt 应包含精确中文文案');
  assert.ok(tea.prompt.includes('3:4 vertical poster'));
  assert.ok(tea.imageUrl && tea.imageUrl.startsWith('/director/packaging-skill/GPT-Image2-Skill/docs/'));
  assert.ok(existsSync(tea.imageAbs), '参考图应真实存在');
});

test('cover-recommended union only contains visual, cover-fit categories', () => {
  const coverEntries = listCoverEntries();
  assert.ok(coverEntries.length >= 40 && coverEntries.length < galleryEntryCount(),
    `封面推荐应少于全库且不少于 40 条，实际 ${coverEntries.length}/${galleryEntryCount()}`);
  for (const entry of coverEntries) {
    assert.ok(isCoverCategory(entry.categorySlug), `混入非封面类目: ${entry.categorySlug}`);
    assert.ok(!['research-paper-figures', 'ui-ux-mockups', 'data-visualization'].includes(entry.categorySlug));
  }
  // 海报排版类必须排最前（封面第一联想）
  assert.equal(coverEntries[0].categorySlug, 'typography-and-posters');
  assert.ok(coverEntries[0].imageUrl?.startsWith('/director/packaging-skill/'), '封面推荐条目必须带可服务缩略图');
});

test('parseGalleryMarkdown tolerates entries without image or prompt', () => {
  const markdown = [
    '# 🎨 Test Category',
    '',
    '### No. 1 · Has everything',
    '- Image: `docs/x/y.png`',
    '- Metadata: Test Category · `square` · `1024x1024` · Curated',
    '```text',
    'A prompt.',
    '```',
    '',
    '### No. 2 · Bare entry',
    '- Metadata: Test Category · `landscape`',
  ].join('\n');
  const entries = parseGalleryMarkdown(markdown, 'test');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].prompt, 'A prompt.');
  assert.equal(entries[0].category, 'Test Category');
  assert.equal(entries[1].prompt, '');
  assert.equal(entries[1].imageRel, null);
  assert.equal(entries[1].sizeToken, 'landscape');
});
