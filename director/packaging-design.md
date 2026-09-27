# 视频外包装模块设计（video packaging）

独立于现有代码的「封面 + 标题」模块。**硬约束：不 import 仓库内其他模块、不修改任何现有文件**；
对现有设施只做两件事：读 `director/current-theme.json` 数据文件、外调 ffmpeg/ffprobe CLI。

## 能力

| 能力 | 实现 | 默认 |
|---|---|---|
| 封面（离线，仅 CLI） | ffmpeg 抽帧 + 渐变压暗 + 大字标题合成；UI 已删除，`packaging-cli.mjs cover` 仍可用 | 16:9 1920×1080，可选 9:16 |
| 标题卡（离线，仅 CLI） | 同上，`packaging-cli.mjs title-card` 仍可用 | 同上 |
| 标题文案 | 规则模板生成候选（数字/悬念/对比/利益/短句等 12 型），按平台字数标注 | 8 条 |
| AI 封面（可选） | **走 GPT-Image2-Skill 打包 CLI**：图库模板 prompt 或自由提示词，质量分档 low→max，flare/sunburst/gpt-image-2 三模型；内容来源二选一——视频帧作参考图（edits）或按文案核心观点文生图（generations） | quality=medium |
| 文案驱动提示词 | 自动读取成片关联的口播文案（input.txt / talkcraft/input.txt / script.txt），LLM 提炼核心观点 → 海报级生图提示词 + 封面大字标题（标题限 ≤12 字且须来自文案原意） | 需 key |
| 风格模板图库 | 解析 vendored skill 的 163 条 gallery prompt（31 类），带成品参考图预览，一键套用 | - |
| 反推提示词 | 依 get-prompt-from-image 分析框架，从当前帧/任意图反推可复用 prompt + 负向词 | 需 key |
| AI 标题（可选） | OpenAI `chat/completions` 增强候选 | 同上 |

## GPT-Image2-Skill 集成（vendored）

- 仓库克隆到 `director/packaging-skill/GPT-Image2-Skill`（MIT，已 gitignore，缺失时模块优雅降级并提示克隆命令）：
  `git clone --depth 1 https://github.com/wuyoscar/GPT-Image2-Skill "director/packaging-skill/GPT-Image2-Skill"`
- **遵循该 skill 自身的 runbook：图像生成一律调用其打包 CLI**（`skills/gpt-image/scripts/generate.py`，
  本机 Python 3.14 + openai 2.46 满足其 >=3.11 与依赖要求），不自行重写 images API 调用。
- 参数面来自 skill CLI：`--model`（`gpt-image-2.5-flare` 快速草稿 / `gpt-image-2.5-sunburst` 精确参考编辑 /
  `gpt-image-2` 兼容）、`--quality`（low→max 六档）、`--size`（landscape/portrait 等 token）、
  `-i`（多参考图，含即走 edits 端点）、`--background transparent`、`--input-fidelity` 等（见 `packaging-ai.mjs` 的 `buildGptImageArgs`）。
- 图库解析：`packaging-gallery.mjs` 解析 `skills/gpt-image/references/gallery-*.md`（`### No. N · 标题`
  + Metadata + ```text prompt 围栏），参考图落在 `docs/<分类>/*.png`，由本模块静态白名单直接服务。
  套用模板时完整保留原 prompt，用户补充以 "Additional adjustment" 追加，不改动模板文案（尊重 skill 的 brief 保持原则）。
- 反推提示词：按 `skills/get-prompt-from-image/SKILL.md` 的分析框架浓缩为系统提示词
  （媒介判定 → 3-5 个还原关键锚点前置 → 媒介边界 → 负向词），输出结构化 JSON。

## 文件结构

```
director/
  packaging-media.mjs            ffmpeg/ffprobe 定位（PATH→winget 回退）、探测、抽帧
  packaging-theme.mjs            只读 current-theme.json（v2 tokens + v1 别名兜底）
  packaging-compose.mjs          离线合成核心（排版纯函数 + ffmpeg filter_complex）
  packaging-titles.mjs           规则式标题生成（纯函数）
  packaging-gallery.mjs          GPT-Image2 图库解析（分类/条目/prompt/参考图 URL）
  packaging-ai.mjs               gpt-image CLI 调用 + 反推/标题 chat + URL 安全校验
  packaging-provider-config.mjs  独立 DPAPI 配置（packaging-config.dpapi.json）
  packaging-server.mjs           独立本地服务（127.0.0.1:5270）
  packaging-console.html/.css/.js 独立操作页（含风格模板面板）
  packaging-cli.mjs              CLI 入口（cover/titles/gallery/ai-cover/reverse/config）
  packaging-*.test.mjs           node:test 单元测试（17 项，含真实 ffmpeg 标题卡渲染与图库解析）
  packaging-skill/GPT-Image2-Skill/ vendored skill 仓库（gitignored，可重克隆）
  packaging-runs/<run-id>/       运行产物（meta.json、frames/、text/、cover*.jpg、title-card*.png、ai-cover*.png）
```

## 复用清单（均为「读文件 / 调 CLI」，零 import）

- 抽帧命令惯例来自 `director/b-mode-placeholder.mjs`（`-ss <t> -i <mp4> -frames:v 1`）。
- ffmpeg 回退路径与 `director/render.mjs` 的 winget 安装一致（ffmpeg 8.1.2 Gyan full build，
  带 libfreetype 的 `drawtext` 与 `gradients` 滤镜；中文字体用系统 `msyhbd.ttc`）。
- 主题色读 `director/current-theme.json`；兼容逻辑简化自 `director/theme-contract.mjs`（未 import）。
- 独立服务模式参照 `director/talkcraft-capture-receiver.mjs`（原生 node:http，绑 127.0.0.1）。
- DPAPI 密钥保护方式参照 `director/provider-config.mjs`（未 import，key 清单独立）。

## 隔离与集成边界

- **双入口，单实现**：API 全部在 `packaging-routes.mjs`；`packaging-server.mjs`（独立 5270）与
  `console-server.mjs`（8765 主台，经 `packagingHandle` 分发，增量仅 1 行 import + 1 段分发块）共用。
- 主台入口：`console-ui.html` 新增「📦 外包装」视图标签（`data-view="packaging"`），iframe 照 b-mode
  约定懒加载 `/director/packaging-console.html?embed=1`；页面在 embed 模式下隐藏顶栏、步骤变横向标签
  （与 b-mode-console 同一套约定）。
- 不 import 仓库内其他模块；对现有设施只做「读数据文件」和「外调 CLI」。
- 密钥存 `%LOCALAPPDATA%\VideoShotCraft\packaging-config.dpapi.json`（DPAPI CurrentUser，0600），
  与主配置 `provider-config.dpapi.json` 完全独立；环境变量 `OPENAI_API_KEY` / `OPENAI_BASE_URL` 可覆盖。
- API 任何响应不回传 apiKey，只回 `configured` 布尔。
- 产物目录 `director/packaging-runs/` 与 vendored skill `director/packaging-skill/` 均已 gitignore。

## 风格统一

页面视觉与主台操作台完全统一，采用 console-ui.html 相同的黑色/白色外观变量族（`--ui-*`，
灰阶体系）：
- `packaging-console.css` 全量变量化，无硬编码色值；主台「黑色 | 白色」切换时外包装页面实时跟随；
- 同步机制：初始读同源 localStorage（`shotcraft-ui-appearance`，与主台同 key）、主台
  `applyUiAppearance` 切换时 postMessage 即时通知、2 秒轮询兜底；
- 独立入口（5270）顶栏自带黑/白迷你切换（内嵌时隐藏，由主台权威控制）；
- 布局沿用 b-mode 工作台骨架（顶栏 + 步骤栏 + 眉标面板 + segmented），`.embedded` 内嵌约定一致。

## 安全约束（AI 通道）

- 出站请求仅允许 http/https；请求前用 `assertPublicHttpUrl` 校验 host，
  拒绝 localhost、`*.local` / `*.internal`、环回（127/8、::1）、私有（10/8、172.16/12、192.168/16、
  fc00::/7、fe80::/10）、链路本地与云元数据（169.254/16）、CGNAT（100.64/10）、组播与保留段。
- 测试覆盖以上各类拒绝项（`packaging-ai.test.mjs`）。

## 使用

- 页面：`node director/packaging-server.mjs` → http://127.0.0.1:5270
- CLI：
  - `node director/packaging-cli.mjs cover template/out/dynamic.mp4 --title "标题" --subtitle "副标题"`
  - `node director/packaging-cli.mjs titles --topic "主题" --platform douyin`
  - `node director/packaging-cli.mjs config set --openai-api-key sk-xxx`（启用 AI）
- 测试：`node --test director/packaging-titles.test.mjs director/packaging-ai.test.mjs director/packaging-compose.test.mjs`
