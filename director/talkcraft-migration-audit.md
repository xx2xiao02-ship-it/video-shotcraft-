# TalkCraft 工作路径迁移审计

日期：2026-09-24  
当前分支：`main`  
外部参考：`https://github.com/Vincentwei1021/video-talkcraft`（只读对照）

## 当前生产入口

```text
POST /api/b-mode/placeholder
  → director/b-mode-placeholder.mjs
  → TTS/帧时间与逐镜素材准备
  → BModeBaseline（当前主路径）
  → template/out/b-mode/<run-id>.placeholder.mp4

可选实验：同一脚本加 `--talkcraft`
  → director/props.json 卡片候选
  → DynamicVideo + TemplateAdapter
  → template/src/* 卡片组件

数字人可选入口：

```text
主操作台 B 模式 → 选择“RunningHub 真实数字人”
  → POST /api/b-mode/digital-human
  → director/b-mode-digital-human.mjs
  → RunningHub InfiniteTalk（服务端密钥存在时才允许调用）
  → director/b-mode-runs/<run-id>/digital-human.mp4
```
```

当前入口由 `console-server.mjs:147` 启动 `b-baseline` 任务，默认走已验收的 `BModeBaseline`；`--talkcraft` 只用于隔离实验运行。旧 `/api/b-mode/test` 路由与对应组件/脚本已删除。

## 文件级迁移矩阵

| 文件/模块 | 分类 | 证据与处理 |
| --- | --- | --- |
| `template/src/DynamicVideo.tsx` | `adapted_migration` | 现有卡片组件地图、TemplateAdapter 注入和素材底层；新增人物角标字段。 |
| `template/src/BModeBaseline.tsx` | `direct_migration` | 从已验收 B 模式排版规则恢复的主路径；保持素材底层、人物构图和字幕安全区。 |
| `template/src/TemplateAdapter.tsx` | `direct_migration` | 现有 35 条注册契约继续作为 B 卡片注入边界。 |
| `director/props.json` | `adapted_migration` | 作为 B 模式卡片候选/风格基线；每次运行覆盖文案、帧数、素材和人物字段，不直接改写源文件。 |
| `director/b-mode-placeholder.mjs` | `adapted_migration` | 保留任务接口兼容和 TTS/素材准备；默认渲染 `BModeBaseline`，`--talkcraft` 仅实验。 |
| `director/b-mode-console.js/html` | `direct_migration` | B 工作台恢复增量基线文案，保留卡片实验结果读取和预览合同。 |
| `template/src/BModeMvp.tsx` | `candidate_for_cleanup → deleted` | 仅由已废弃 B0 路由调用，已无生产调用者。 |
| `director/b-mode-mvp.mjs` | `candidate_for_cleanup → deleted` | 仅由已废弃 `/api/b-mode/test` 调用，已无生产调用者。 |
| `template/src/BModePlaceholder.tsx` | `candidate_for_cleanup → deleted` | 旧三分支静态占位渲染，已被卡片驱动入口替代。 |
| `director/b-mode-acceptance-evidence.md` | `historical_reference` | 保留旧占位验收证据，已明确标注历史路径，不进入当前生产图。 |
| `director/api-center.mjs` | `adapted_migration` | 从隔离数字人模块迁入主目录，集中保存 RunningHub 非敏感配置；密钥只从服务端环境读取。 |
| `director/runninghub-infinitetalk.mjs` | `adapted_migration` | 迁入主目录，保留上传、创建、轮询、下载和状态归一化合同；主管线通过 B 模式 API 调用。 |
| `director/b-mode-digital-human.mjs` | `adapted_migration` | 迁入主目录，按独立运行目录生成 WAV、提交任务、保存报告和 MP4；失败不覆盖图片占位产物。 |
| `director/b-mode-console.html/js/css` | `adapted_migration` | 在现有 B 工作台增加人物生成方式、真实数字人按钮、任务报告和视频结果区；保留图片占位回退。 |

## 实际运行证据

当前主路径运行 ID：`1bcbd397-9aae-4257-9e8a-4b88df0692c0`  
卡片实验运行 ID：`ab9f336a-e47c-418d-9fef-a98d07ece282`

编导层检查运行 ID：`3cbccbeb-ad14-450b-aafa-f1abc8c5f2c3`

- 主路径：`kind=baseline-b-mode-preview`、`renderer=BModeBaseline`
- 实验路径：`kind=talkcraft-card-preview`、`renderer=DynamicVideo + TemplateAdapter`
- 19 个镜头，100.01 秒
- 9 张卡实际进入渲染：`list-reveal`、`list-stack-press`、`bezier-source-converge-merge`、`blur-slide`、`flying-words`、`scramble-decode`、`text-on-path`、`terminal-typewriter`、`neon-frame-forerun`
- 19/19 镜头有视频素材；相邻素材去重约束仍通过
- 编导层产物：`semantics.json`、`shotbook.json`、`shotbook-preflight.json`
- SHOTBOOK preflight：0 FAIL、0 WARN；19 镜头、9 张卡、6 种版式
- MP4 含 H.264 视频与 AAC 音频
- `isDigitalHuman=false`、`runningHubCalled=false`

工作台部署：`http://localhost:5198/?import=project` 已启动；Windows 不允许普通进程创建符号链接，已使用 `workbench/proj` 的目录联接继续部署，未复制或删除 `template/src` 源码。

## 验证状态

`implemented`：B 入口、已验收基线渲染、卡片实验渲染、TemplateAdapter 注入、人物角标、样片预览、RunningHub 数字人适配器和 B 工作台入口。  
`tested`：Remotion 实际渲染、ffprobe、卡片抽帧、相邻素材检查、8 项 B 模式测试、RunningHub 传输层假请求测试、主服务语法检查和数字人配置路由。  
`externally_validated`：无；尚未调用 RunningHub、声音复刻或真实数字人服务。  
`pending_user_acceptance`：用户需要确认真实数字人单次调用和生成结果；调用前需保留单次费用确认边界。  

编导层检查版已实际抽帧，但卡片内容仍有视觉问题：部分卡片的 demo 语义与当前句子不完全匹配，个别卡片在中间帧会出现过渡态字符/空台。该运行保持实验状态，不能晋级主路径；主路径继续使用 `BModeBaseline`。

## 未完成的外部 Skill 能力

当前已接通本地卡片实验链，但主路径仍保持已验收基线；尚未完整移植外部 `video-talkcraft` 的 `semantic_annotate → SHOTBOOK → card_match → layout/preflight` 全套机器闸门。卡片实验选择使用本地 `props.json` 候选和主体类型轮换，后续若要达到外部 Skill 的完整合同，需要新增语义标注文件、SHOTBOOK、版式轮换表、素材类型校验和 preflight 任务；这不是本次增量修复中可以静默推断的字段合同。

## 回滚边界

旧运行目录和已生成 MP4 未删除。新入口只改变后续 B 模式任务的渲染器；A 模式入口、素材库、已付费资产和历史验收文件不在本次删除范围。

## 本次清理记录

- 删除 `template/src/BModeMvp.tsx`、`director/b-mode-mvp.mjs` 和 `template/src/BModePlaceholder.tsx`；三者均无当前生产调用者，旧 `/api/b-mode/test` 已同步移除。
- 删除 `Root.tsx` 中两个旧 B0/B 占位 Composition 注册；保留 `BModeBaseline` 主路径和 `DynamicVideo` 卡片实验 Composition。
- 保留旧运行目录、旧报告和旧验收证据作为 `historical_reference`，不再进入新生产入口。
