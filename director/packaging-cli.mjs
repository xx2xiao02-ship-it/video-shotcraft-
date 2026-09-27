#!/usr/bin/env node
// 视频外包装 CLI：node director/packaging-cli.mjs <command> [options]
// 与 packaging-server.mjs 共用同一套逻辑模块；产物同样落在 director/packaging-runs/。
import crypto from 'node:crypto';
import {mkdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractFrame, probeVideo} from './packaging-media.mjs';
import {composeCover, composeTitleCard, probeImage} from './packaging-compose.mjs';
import {generateTitles} from './packaging-titles.mjs';
import {generateAiCover, generateAiTitles, reversePromptFromImage} from './packaging-ai.mjs';
import {galleryAvailable, galleryCategories, listGalleryEntries, getGalleryEntry, SKILL_CLONE_HINT} from './packaging-gallery.mjs';
import {packagingLatest} from './packaging-routes.mjs';
import {packagingAiReadiness, packagingRuntimeConfig, writeStoredPackagingConfig} from './packaging-provider-config.mjs';
import {readPackagingTheme} from './packaging-theme.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_DIR = path.join(ROOT, 'director', 'packaging-runs');

const USAGE = `视频外包装模块 CLI

用法: node director/packaging-cli.mjs <command> [options]

命令:
  latest                                               查看最新成片及其封面完成状态
  probe <video>                                        探测视频时长/分辨率
  cover <video> --title "标题" [--subtitle 副标题]       离线合成封面（默认取 1/3 处画面）
      [--ratio 16:9|9:16] [--time 秒] [--overlay 0.6] [--out 路径]
  title-card --title "标题" [--subtitle] [--ratio] [--out]  纯标题卡（主题底色）
  titles --topic "主题" [--keywords a,b] [--platform general]  规则式候选标题
  gallery [分类id]                                     浏览 GPT-Image2 图库条目
  gallery-show <条目id>                                查看图库条目完整 prompt
  ai-cover <video> --prompt "提示词" | --gallery <条目id>   AI 封面（走 GPT-Image2 CLI）
      [--tweak "补充调整"] [--quality low|medium|high|xhigh|max] [--model 模型id]
      [--time 秒] [--ratio 16:9|9:16] [--no-frame] [--out 路径]
  reverse <图片或视频> [--time 秒]                      依图反推提示词（get-prompt-from-image）
  ai-titles --topic "主题" [--platform]                     AI 标题（需先 config set）
  config show                                               查看配置状态（不显示密钥）
  config set --openai-api-key sk-xxx [--openai-base-url URL] [--openai-image-model 模型]

说明: 密钥经 Windows DPAPI 加密存于本机 %LOCALAPPDATA%\\VideoShotCraft\\packaging-config.dpapi.json，
      也可直接用环境变量 OPENAI_API_KEY / OPENAI_BASE_URL 传入。
      图库与 AI 封面依赖 vendored skill：${SKILL_CLONE_HINT}`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) flags[arg.slice(2)] = true;
      else { flags[arg.slice(2)] = next; index += 1; }
    } else positional.push(arg);
  }
  return {positional, flags};
}

function newRunDir() {
  const runId = crypto.randomUUID();
  const runDir = path.join(RUNS_DIR, runId);
  mkdirSync(runDir, {recursive:true});
  return {runId, runDir};
}

function printResult(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const {positional, flags} = parseArgs(rest);
  const ratio = flags.ratio === '9:16' ? '9:16' : '16:9';

  if (command === 'latest') {
    return printResult({ok:true, ...packagingLatest()});
  }

  if (command === 'probe') {
    const video = positional[0];
    if (!video) throw new Error('用法: probe <video>');
    return printResult({ok:true, ...probeVideo(video)});
  }

  if (command === 'cover') {
    const video = positional[0];
    if (!video || !flags.title) throw new Error('用法: cover <video> --title "标题" [--subtitle 副标题]');
    const info = probeVideo(video);
    const time = flags.time !== undefined ? Number(flags.time) : info.durationSeconds / 3;
    const {runId, runDir} = newRunDir();
    const outFile = flags.out ? path.resolve(flags.out) : path.join(runDir, `cover-${ratio.replace(':', 'x')}.jpg`);
    writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify({schema:'packaging-run-v1', runId,
      video:path.resolve(video), createdAt:new Date().toISOString(), cli:true,
      videoMtimeMs:statSync(video).mtimeMs}, null, 2), 'utf8');
    const result = composeCover({videoFile:video, timeSeconds:time, title:flags.title,
      subtitle:flags.subtitle || '', ratio, overlayStrength:flags.overlay ? Number(flags.overlay) : 0.6,
      theme:readPackagingTheme(), outFile, workDir:runDir});
    return printResult({ok:true, runId, ...result, ...probeImage(result.file), timeSeconds:Number(time.toFixed(2))});
  }

  if (command === 'title-card') {
    if (!flags.title) throw new Error('用法: title-card --title "标题" [--subtitle 副标题]');
    const {runId, runDir} = newRunDir();
    const outFile = flags.out ? path.resolve(flags.out) : path.join(runDir, `title-card-${ratio.replace(':', 'x')}.png`);
    const result = composeTitleCard({title:flags.title, subtitle:flags.subtitle || '', ratio,
      theme:readPackagingTheme(), outFile, workDir:runDir});
    return printResult({ok:true, runId, ...result, ...probeImage(result.file)});
  }

  if (command === 'titles') {
    const titles = generateTitles({topic:flags.topic, keywords:String(flags.keywords || '').split(','),
      platform:flags.platform || 'general', count:Number(flags.count) || 8});
    return printResult({ok:true, titles});
  }

  if (command === 'gallery') {
    if (!galleryAvailable()) throw new Error(`图库未就绪，请执行：${SKILL_CLONE_HINT}`);
    const entries = listGalleryEntries(positional[0]);
    return printResult({ok:true, categories:galleryCategories(),
      entries:entries.map(entry => ({id:entry.id, no:entry.no, title:entry.title,
        size:entry.sizeToken || entry.literalSize, imageUrl:entry.imageUrl}))});
  }

  if (command === 'gallery-show') {
    const entry = getGalleryEntry(positional[0]);
    if (!entry) throw new Error(`条目不存在: ${positional[0]}`);
    return printResult({ok:true, ...entry});
  }

  if (command === 'ai-cover') {
    const video = positional[0];
    if (!video) throw new Error('用法: ai-cover <video> --prompt "提示词" | --gallery <条目id> [--tweak "补充"]');
    let prompt = String(flags.prompt || '').trim();
    if (flags.gallery) {
      const entry = getGalleryEntry(String(flags.gallery));
      if (!entry?.prompt) throw new Error(`图库条目无效或缺少 prompt: ${flags.gallery}`);
      console.error(`使用图库模板 No.${entry.no} ${entry.title}（${entry.category}）`);
      const tweak = String(flags.tweak || '').trim();
      prompt = tweak ? `${entry.prompt}\n\nAdditional adjustment for this cover: ${tweak}` : entry.prompt;
    }
    if (!prompt) throw new Error('需要 --prompt 或 --gallery');
    const config = packagingRuntimeConfig();
    if (!config.configured) {
      throw new Error('未配置 OPENAI_API_KEY：先 node director/packaging-cli.mjs config set --openai-api-key sk-xxx');
    }
    const info = probeVideo(video);
    const time = flags.time !== undefined ? Number(flags.time) : info.durationSeconds / 3;
    const {runId, runDir} = newRunDir();
    const outFile = flags.out ? path.resolve(flags.out) : path.join(runDir, 'ai-cover.png');
    const referenceImages = [];
    if (!flags['no-frame']) {
      const framePng = path.join(runDir, 'ai-source-frame.png');
      extractFrame(video, time, framePng);
      referenceImages.push(framePng);
      console.error(`已抽取 ${time.toFixed(1)}s 参考帧`);
    }
    console.error(`调用 ${flags.model || config.imageModel}（quality=${flags.quality || 'medium'}，参考图 ${referenceImages.length} 张）…`);
    const result = await generateAiCover({config, prompt, outFile, ratio,
      quality:flags.quality || 'medium', model:flags.model, referenceImages});
    return printResult({ok:true, runId, ...result});
  }

  if (command === 'reverse') {
    const target = positional[0];
    if (!target) throw new Error('用法: reverse <图片或视频> [--time 秒]');
    const config = packagingRuntimeConfig();
    if (!config.configured) {
      throw new Error('未配置 OPENAI_API_KEY：先 node director/packaging-cli.mjs config set --openai-api-key sk-xxx');
    }
    let imageFile = target;
    if (VIDEO_EXT.test(target)) {
      const info = probeVideo(target);
      const time = flags.time !== undefined ? Number(flags.time) : info.durationSeconds / 3;
      const {runDir} = newRunDir();
      imageFile = path.join(runDir, 'reverse-source.png');
      extractFrame(target, time, imageFile);
      console.error(`已抽取 ${time.toFixed(1)}s 画面`);
    }
    const result = await reversePromptFromImage({config, imageFile});
    return printResult({ok:true, ...result});
  }

  if (command === 'ai-titles') {
    const config = packagingRuntimeConfig();
    if (!config.configured) {
      throw new Error('未配置 OPENAI_API_KEY：先 node director/packaging-cli.mjs config set --openai-api-key sk-xxx');
    }
    const titles = await generateAiTitles({config, topic:flags.topic, keywords:String(flags.keywords || '').split(','),
      platform:flags.platform || 'general', count:Number(flags.count) || 8});
    return printResult({ok:true, titles});
  }

  if (command === 'config') {
    if (positional[0] === 'show') return printResult({ok:true, ...packagingAiReadiness()});
    if (positional[0] === 'set') {
      writeStoredPackagingConfig({
        openaiApiKey:flags['openai-api-key'], openaiBaseUrl:flags['openai-base-url'],
        openaiImageModel:flags['openai-image-model'], openaiChatModel:flags['openai-chat-model'],
      });
      return printResult({ok:true, saved:true, ...packagingAiReadiness()});
    }
    throw new Error('用法: config show | config set --openai-api-key sk-xxx');
  }

  throw new Error(`未知命令: ${command}\n\n${USAGE}`);
}

main().catch(error => {
  console.error(`[packaging] ${error.message}`);
  if (String(error.message).includes('未知命令')) console.error(USAGE);
  process.exitCode = 1;
});
