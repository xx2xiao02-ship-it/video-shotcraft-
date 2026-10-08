# B 模式工作管线契约

## 上游阶段与产物

| 阶段 | 上游入口 | 必须存在的产物 | 通过条件 |
|---|---|---|---|
| ① 口播稿 | 工程输入 | 原稿、配音 | 原稿和配音对应 |
| ② 时间戳 | `scripts/timestamps_cpu.py` 或上游等价入口 | `audio/timestamps.json`、`remotion/timing.json` | 文本逐字一致，时间连续 |
| ②-1 语义 | `scripts/semantic_annotate.py` | `semantics.json` | `sem`、`need`、`weight`、实体合法；完成后回填 `shot` |
| ③ 素材 | 上游素材清单规则 | `sources.md`、真实文件 | 路径存在，来源可追溯 |
| ④ 分镜 | `scripts/card_match.py` | `SHOTBOOK.md`、`shots.json`、候选表 | 每镜有素材行、选卡行、版式行、蒙皮行和未完成清单 |
| ④→⑤ 预检 | `scripts/preflight.py` | `qa/preflight-result.json` | 无 FAIL；WARN 必须有处理或记录 |
| ⑤ 实现 | 上游模板源码和工程场景 | `src/cards/<slug>.tsx`、参数和素材绑定 | 卡源码可追溯，参数和槽位未被覆盖 |
| ⑥ 渲染 | `scripts/render_shots.mjs` | 分段视频、分段音频、合成视频 | 分段边界连续，入口是上游分段渲染器 |
| ⑦ 验收 | 上游 lint、QA、ffprobe | QA 报告、抽帧/contact sheet | 解码、音频、卡片、素材、时间和布局对账通过 |
| ⑧ 交付 | 工作台/文件交付 | 可播放文件和交付记录 | 用户拿到文件并单独审核 |

## 运行时对账

按以下顺序核对，任何一项不一致都阻断交付：

1. `semantics.json` 的 `shot` 与 `SHOTBOOK`/`shots.json` 镜头范围一致。
2. 候选表中的卡与 SHOTBOOK 的最终卡一致。
3. SHOTBOOK 的最终卡与运行时 `visual-beats.json`、场景注册和实际渲染日志一致。
4. SHOTBOOK 的参数、素材路径、数字人布局和 `cardProps` 与运行时输入一致。
5. `visual-beats` 边界连续覆盖，模板原生帧数独立记录；开场模板逐个满足 `nativeFrames <= 75`。
6. 数字人镜头满足视觉拍时长 `>= 3.0s`，并且绑定的真实素材存在。
7. 输出视频通过 ffprobe、完整解码、音频存在和关键帧抽检；旧输出只能作为对照，不能作为本次通过证据。

## 用户追加规则的接入方式

用户新增规则先写入本次 SHOTBOOK 和机器预检，再决定是否上升为全局规则。已经确认的开场短模板、自然语义节奏、3 秒数字人门槛属于 B 模式全局治理规则；它们不能覆盖 GitHub 的主链，也不能把模板原生时长误当成语义拍时长。

## 失败处理

- `preflight` FAIL：停止实现/渲染，修复缺项后从预检重跑。
- 候选、SHOTBOOK、运行时不一致：回到分镜和绑定契约修复，不用手工白名单兜底。
- `spawn EPERM`：记录 Windows 子进程阻断，在隔离目录重试；未完成真实渲染前状态保持阻断。
- 真实素材、数字人或外部服务不可用：保留已完成产物并明确标记未完成，不伪造通过。
