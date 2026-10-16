# B 模式 TalkCraft 任务

本仓库还提供 `.agents/skills/b-mode-github-governance/SKILL.md`。涉及 B 模式分镜、模板、渲染或样片时一并加载，用它执行基线对账和本项目已确认的节奏/数字人规则；它补充上游规则，不替换 `_audit/video-talkcraft/SKILL.md`。

处理数字人口播、口播视频、B 模式编导或 `director/b-mode-runs/*/talkcraft/` 时，先阅读本机已安装的 `video-talkcraft/SKILL.md`。当前源位于 `E:\video-shotcraft\_audit\video-talkcraft`；可通过 `TALKCRAFT_SKILL_ROOT` 指向同版本的其他安装路径。按其 ①–⑧ 阶段执行，勿把旧的 `b-mode-semantic-annotate.mjs`、固定卡池或 `BModeBaseline` 称为完整 TalkCraft 编导。

- 新任务经 `/api/talkcraft/create` 隔离保存输入；`talkcraft-stages.mjs bootstrap <run-id>` 生成配音、时间轴和语义骨架。页面“火山生成分镜”经 `/api/talkcraft/stage` 的 `editorial` 阶段，复用已配置的火山方舟 API；用户确认模型费用后生成逐句 `sem/need/weight/entities` 和分镜初稿。结果必须经过原稿对应、连续时间覆盖、`semantic-apply`、`semantic-check` 校验，不用 Codex 指令复制代替 API 调用。不把初稿或候选生成标为素材、预检和成片通过。
- 按语义段落写 `remotion/shots.json` 和 `SHOTBOOK.md`，逐镜登记真实素材路径、选卡行、蒙皮行、节拍、音效与未完成清单。用上游 `card_match.py` 出候选，选中卡须阅读其 `references/cards/<slug>.md` 与 `template/cards/<slug>.tsx`；复制原卡源码进本片，不凭卡名重写近似动效。
- 分镜生成和已有火山结果校验在语义通过后自动执行 `preflight`（含候选生成）；预检失败须显示具体缺项，保留已有成果，补齐后可重试本地预检。`preflight` 必须通过才能进入样板镜实现。真实页面证据要保存原页图与同会话 DOM 坐标；缺证据、缺素材时保持 FAIL，不用示意图或不相关 B-roll 假充。
- 先做样板镜，`sample` 出有声单镜供用户确认；确认后才 `render-all`。逐镜场景与工作台六项拆解契约一致，`workbench-contract`、`beat-lint`、卡片保真和音效检查均不可省。
- 最终片跑 `qa`，独立审片报告绑定成片哈希、P0/P1 归零后才 `deliver`。没有真实扬声器试听、数字人口型或 RunningHub 任务时，分别标记待用户听验、静态角色占位和外部服务未验；不得用视频能播替代这些验收。
- 保留原 B 基线入口、旧运行目录、用户修改与成功资产。任何付费数字人生成、声音复刻或生产重试按用户的单次授权执行。
- 画面卡片与工作台文案按 `source-run.json.visualTextLocale` 编写；默认及兼容旧任务时使用 `zh-CN`（简体中文）。仅用户明确要求时才使用繁体。不要因此改写口播稿、配音、时间戳或来源引用。
- 成片交付后的修复迭代（文字贴边、暗底字色、动效抖动等 P0/P1）按 `.agents/skills/b-mode-post-delivery-fix/SKILL.md` 执行：快照 → 修复 → preflight → 布局审计 → 逐拍修正 → 独立视觉复核 → 绑定校验 → 底片替换导出（工具：`director/layout-audit.mjs` + `director/render-revised-film.mjs`）。修正不等于用户接受新片，不覆盖原成片。


## 已审模板强制复用（用户2026-10-16确认）

执行 `docs/workflows/b-mode-reviewed-templates.md`。仅允许 `director/talkcraft-reviewed-templates.json` 中有真实历史媒体、参数绑定、布局检查及源码版本证据的模板进入上游选卡索引。候选外选卡不得凭语义偏离说明放行；开场短卡池不得代替语义筛选。禁止自行补画、添加定制图解或外层CSS覆盖模板几何。配音和成功人物素材复用；模板级技术审查不等于本片通过。
