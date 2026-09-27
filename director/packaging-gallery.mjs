// 视频外包装 - GPT-Image2-Skill 图库解析。
// skill 仓库 vendored 在 director/packaging-skill/GPT-Image2-Skill（MIT），缺失时优雅降级并给出生成指引。
// 图库 prompt 位于 skills/gpt-image/references/gallery-*.md，条目格式：
//   ### No. 33 · 标题
//   - Image: `docs/.../xxx.png`
//   - Metadata: 分类 · `portrait` · `1024x1536` · 备注
//   ```text
//   PROMPT
//   ```
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_REPO_DIR = path.join(MODULE_DIR, 'packaging-skill', 'GPT-Image2-Skill');
const REFERENCES_DIR = path.join(SKILL_REPO_DIR, 'skills', 'gpt-image', 'references');
export const SKILL_CLONE_HINT = 'git clone --depth 1 https://github.com/wuyoscar/GPT-Image2-Skill "director/packaging-skill/GPT-Image2-Skill"';

const GALLERY_FILE = /^gallery-(.+)\.md$/;
let cache = null;

// 封面适用类目白名单：视觉导向、可作视频封面；图表/文档/UI 类排除，仍可经「全部分类」浏览
export const COVER_CATEGORY_SLUGS = [
  'typography-and-posters', 'ink-and-chinese', 'retro-and-cyberpunk',
  'cinematic-and-animation', 'brand-systems-and-identity', 'fashion-editorial',
  'illustration', 'more-illustration-styles', 'watercolor', 'fine-art-painting',
  'anime-and-manga', 'gaming', 'beauty-and-lifestyle', 'product-and-food',
];

export function isCoverCategory(slug) {
  return COVER_CATEGORY_SLUGS.includes(slug);
}

export function galleryAvailable() {
  return existsSync(REFERENCES_DIR);
}

function stripDecoration(text) {
  return String(text || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

export function parseGalleryMarkdown(markdown, fileSlug) {
  const entries = [];
  const heads = [];
  const entryRe = /^### No\. (\d+) · (.+)$/gm;
  let match;
  while ((match = entryRe.exec(markdown)) !== null) {
    heads.push({no:Number(match[1]), title:match[2].trim(), index:match.index});
  }
  const h1 = /^# (.+)$/m.exec(markdown);
  const categoryLabel = stripDecoration(h1?.[1]) || fileSlug;
  for (let index = 0; index < heads.length; index += 1) {
    const section = markdown.slice(heads[index].index,
      index + 1 < heads.length ? heads[index + 1].index : undefined);
    const imageMatch = /- Image: `([^`]+)`/.exec(section);
    const metaMatch = /- Metadata: (.+)/.exec(section);
    const promptMatch = /```text\r?\n([\s\S]*?)```/.exec(section);
    let sizeToken = '';
    let literalSize = '';
    let note = '';
    if (metaMatch) {
      const parts = metaMatch[1].split('·').map(part => part.trim().replace(/`/g, ''));
      sizeToken = parts[1] || '';
      literalSize = parts[2] || '';
      note = parts.slice(3).join(' · ');
    }
    entries.push({
      id:`${fileSlug}-${heads[index].no}`,
      no:heads[index].no,
      title:heads[index].title,
      category:categoryLabel,
      categorySlug:fileSlug,
      sizeToken, literalSize, note,
      imageRel:imageMatch ? imageMatch[1] : null,
      prompt:promptMatch ? promptMatch[1].trim() : '',
    });
  }
  return entries;
}

function loadGallery() {
  if (cache) return cache;
  const categories = [];
  const entries = [];
  if (galleryAvailable()) {
    for (const file of readDirSorted(REFERENCES_DIR)) {
      const slugMatch = GALLERY_FILE.exec(file);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      const markdown = readFileSync(path.join(REFERENCES_DIR, file), 'utf8');
      const parsed = parseGalleryMarkdown(markdown, slug);
      if (!parsed.length) continue;
      categories.push({id:slug, label:parsed[0].category, count:parsed.length});
      entries.push(...parsed);
    }
  }
  cache = {categories, entries};
  return cache;
}

function readDirSorted(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

export function galleryCategories() {
  return loadGallery().categories;
}

function entryImageUrl(entry) {
  if (!entry.imageRel) return null;
  // 图库 md 的 - Image: 路径以仓库根为基准；个别可能是 references 相对，两级兜底
  const candidates = [path.resolve(SKILL_REPO_DIR, entry.imageRel), path.resolve(REFERENCES_DIR, entry.imageRel)];
  const abs = candidates.find(candidate => existsSync(candidate));
  if (!abs) return null;
  return '/' + path.relative(path.join(MODULE_DIR, '..'), abs).replace(/\\/g, '/');
}

function decorateEntry(entry) {
  const {prompt, ...rest} = entry;
  return {...rest, hasPrompt:Boolean(prompt), imageUrl:entryImageUrl(entry)};
}

export function listGalleryEntries(categoryId) {
  const {entries} = loadGallery();
  const filtered = categoryId ? entries.filter(entry => entry.categorySlug === categoryId) : entries;
  return filtered.map(decorateEntry);
}

export function galleryEntryCount() {
  return loadGallery().entries.length;
}

// 封面推荐：白名单类目的并集，按类目顺序排列
export function listCoverEntries() {
  const {entries} = loadGallery();
  const result = [];
  for (const slug of COVER_CATEGORY_SLUGS) {
    result.push(...entries.filter(entry => entry.categorySlug === slug).map(decorateEntry));
  }
  return result;
}

export function coverEntryCount() {
  return listCoverEntries().length;
}

// 详情（含完整 prompt）+ 参考图绝对路径与可服务 URL
export function getGalleryEntry(id) {
  const entry = loadGallery().entries.find(item => item.id === id);
  if (!entry) return null;
  return {
    ...entry,
    imageUrl:entryImageUrl(entry),
    imageAbs:entry.imageRel ? path.resolve(SKILL_REPO_DIR, entry.imageRel) : null,
  };
}
