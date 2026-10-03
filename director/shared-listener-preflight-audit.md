# 共享监听接入前审计（2026-09-27）

## 结论与范围

状态：`WORKTREE_RECOMMENDED`；尚未完成可发布代码快照，也未部署新的只读匹配模块。审计阶段只读核查生产入口、素材/背景音乐/渲染调用链、Git 归属及隔离资产；随后按用户明确确认归档并清理了两个 BGM smoke 目录。未移动、暂存或提交其他现有文件。此前设计文档的“共享监听、只匹配不接入”仍是待实施目标。

## 当前运行与数据边界

| 环节 | 已核实路径 | 隔离风险 |
| --- | --- | --- |
| 操作台入口 | `start-console.bat` → `node console-server.mjs` → 默认 `127.0.0.1:8765` | 启动脚本写死 `E:\video-shotcraft`；`SHOTCRAFT_ROOT` 未指定时服务也默认指向主工程。审计时 8765、18765、18766、5270 均无监听，未做 HTTP 页面验收。 |
| 素材匹配 | `POST /api/b-mode/material-match` → `loadMaterialIndex(ROOT)` → `matchSceneVideos` | 此接口只读取 `materials/_index.json` 并返回建议；当前索引是 3396 条记录的数组。它不代表整个 B 模式管线只读。 |
| 音乐管理 | `/api/library/music/*` → `materials/_music/`、`materials/_music-selection.json` | 列表/试听为读，上传/选曲为写；不能将整组接口称为只读匹配。当前没有选曲文件。 |
| A 合成 | `/api/render/confirm` → `director/render.mjs` → `DynamicVideo` | `render.mjs` 按源码目录写 `director/props.json` 和 `template/public/audio/`；当前 `.shotcraft-output.json` 将导出指向 `E:\video`。只改服务端口或 `SHOTCRAFT_ROOT` 不能隔离这条链。 |
| B 合成 | `/api/talkcraft/stage` → `director/talkcraft-stages.mjs` → `bgm-props.json` / TalkCraft 工程 | 运行和素材快照写入 `director/b-mode-runs/<id>/talkcraft/`；需要保留已确认样板及历史资产。B 基线 `POST /api/b-mode/placeholder` 是另一条入口。 |

## 版本归属与保留项

- `main` 比 `origin/main` 领先 3 个提交，存在大量未提交改动。`console-server.mjs`、`console-ui.html`、`director/render.mjs`、`template/src/DynamicVideo.tsx` 是多功能混合差异，不能整文件归为背景音乐。现有两个其他 worktree 中一个干净、一个有字幕工作，均未触碰。
- 主操作台直接导入多份未跟踪源码：B 模式、TalkCraft、供应商配置、字幕与背景音乐模块；`director/render.mjs` 也导入未跟踪的字幕和音乐模块。从当前 Git HEAD 新建空白 worktree，无法复现本工作树中的完整操作台。先做精确文件/片段归属和可重建快照，再谈隔离部署。
- `package.json`、`package-lock.json` 新增的 `ws` 被 `director/volcengine-tts2.mjs` 使用，属于火山 TTS 2.0 依赖，不属于背景音乐；不可从 BGM 变更中随手移除。
- `materials/`（含索引和实际素材）、`director/b-mode-runs/`、`template/out/` 是被忽略的业务数据/成片；`_audit/video-talkcraft/` 是当前 TalkCraft 运行可解析到的本地 Skill；`.isolated/digital-human/` 含独立 Git 目录和大量文件。以上均不得按“未跟踪垃圾”删除或移动。
- `.isolated/background-music-smoke-*`、`.isolated/talkcraft-bgm-smoke-*` 是本地短片验证产物，清理记录见下；`graphify-out/cache/`、`.zcode/plans/` 为工具状态候选清理项，须确认其他任务不再依赖。`.shotcraft-output.json` 是当前生效的导出配置，不应作为普通源码提交或被静默改写。
- `director/asset-matching-design.md` 将 `_index.json` 描述为按文件名索引的对象，并描述自动接入/生成；实际索引为数组，当前只读接口返回建议。该文档应视为历史设计草案，不能作为现行 API 合同。

## 验证与放行条件

- `node --test --test-isolation=none director/b-mode-material-match.test.mjs`：2/2 通过，仅为纯匹配逻辑。
- `node --test --test-isolation=none console-music.test.mjs`：2/2 通过，服务在临时目录、随机本地端口运行；不证明主监听页面或真实长片。默认沙箱运行曾因 `spawn EPERM` 拦截，获准执行本地子进程后通过。
- 未运行主工程渲染、未调用外部 TTS/RunningHub、未覆盖导出文件；浏览器目视、真实音量/授权、完整业务链路与用户验收均待完成。
- 接入前先对每个混合文件按功能片段定归属，明确 BGM、字幕、火山 TTS 2.0、B 模式的最小可回滚集合；保护现有数据、产物和其他 worktree。随后在独立工作区准备可重建代码快照，核对输出目录和技能路径，再实现默认关闭的只读匹配入口。
- 试验入口关闭时主线接口与页面不变；开启后只读索引、只返回待确认建议，不写主索引/任务/成片、不调用渲染或付费服务。通过隔离 HTTP 测试和主线回归后才能考虑共享监听部署。

## 已执行的隔离清理

用户确认后，将 `.isolated/background-music-smoke-cVLjjK/` 的 7 个文件和 `.isolated/talkcraft-bgm-smoke-h0gpoz/` 的 41 个文件分别打包到 `.isolated/_archives/`，逐文件比较原件与 ZIP 内文件的长度及 SHA-256，48/48 一致后才删除这两个原目录。归档保留于：

- `.isolated/_archives/background-music-smoke-cVLjjK-20260927-223909.zip`，SHA-256 `CE42A7FAA49ED815BDD91534F26B59E4E996D2978CCFE31B1447F4A8CE3F35E7`。
- `.isolated/_archives/talkcraft-bgm-smoke-h0gpoz-20260927-223909.zip`，SHA-256 `57059226DFC54C33BEC9384158CDC81667D2F63A01230CD81696C8F264A8C266`。

## 建议清理项（待确认，不执行）

| 路径 | 原用途/当前调用 | 删除影响 |
| --- | --- | --- |
| `graphify-out/cache/`、`.zcode/plans/` | 工具缓存/计划；未发现生产代码直接引用 | 可能影响其他正在进行的任务，确认所有者后再处理。 |
| `director/asset-matching-design.md` | 历史素材匹配草案；非运行依赖 | 不建议删除；应在后续文档治理中标注实际索引合同。 |

不清理 `_audit/video-talkcraft/`、`.isolated/digital-human/`、`materials/`、`director/b-mode-runs/`、`template/out/` 或其他 worktree。
