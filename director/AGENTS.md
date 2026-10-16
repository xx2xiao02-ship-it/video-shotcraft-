# B 模式 TalkCraft 任务

本仓库还提供 `.agents/skills/b-mode-github-governance/SKILL.md`。涉及 B 模式分镜、模板、渲染或样片时一并加载，用它执行基线对账和本项目已确认的节奏/数字人规则；它补充上游规则，不替换 `_audit/video-talkcraft/SKILL.md`。

处理数字人口播、口播视频、B 模式编导或 `director/b-mode-runs/*/talkcraft/` 时，先阅读本机已安装的 `video-talkcraft/SKILL.md`。当前源位于 `E:\video-shotcraft\_audit\video-talkcraft`；可通过 `TALKCRAFT_SKILL_ROOT` 指向同版本的其他安装路径。按其 ①–⑧ 阶段执行，勿把旧的 `b-mode-semantic-annotate.mjs`、固定卡池或 `BModeBaseline` 称为完整 TalkCraft 编导。

- 新任务经 `/api/talkcraft/create` 隔离保存输入；`talkcraft-stages.mjs bootstrap <run-id>` 生成配音、时间轴和语义骨架。页面“火山生成分镜”经 `/api/talkcraft/stage` 的 `editorial` 阶段，复用已配置的火山方舟 API；用户确认模型费用后生成逐句 `sem/need/weight/entities` 和分镜初稿。结果必须经过原稿对应、连续时间覆盖、`semantic-apply`、`semantic-check` 校验，不用 Codex 指令复制代替 API 调用。不把初稿或候选生成标为素材、预检和成片通过。
- 按语义段落写 `remotion/shots.json` 和 `SHOTBOOK.md`，逐镜登记真实素材路径、选卡行、蒙皮行、节拍、音效与未完成清单。用上游 `card_match.py` 出候选，选中卡须阅读其 `references/cards/<slug>.md` 与 `template/cards/<slug>.tsx`；复制原卡源码进本片，不凭卡名重写近似动效。
- 输入路径在创建任务时由后端固定：上传真人视频为 `workflowPath=recorded-host`，使用视频原声，先做人物素材体检，再按原版进入分镜与全量预检。缺失或无效视频不得回退到 TTS / RunningHub。当前工程只接受恒定 30fps，不得强制重复帧转换；原视频保留，不自动预剪。
- 未上传真人视频时按用户 2026-10-15 确认的适配路径：分镜规划与 `planning-check` → 分镜审核 → RunningHub 按审核人物区间生成 → `host-preflight` → 原版 `preflight` → 场景实现 → 样片审核 → 整片。规划校验不能记作全量预检通过，不得要求未来口型素材才能进行规划。两类结果、审批范围与当前输入哈希分别记录。
- 分镜生成和已有结果校验在语义通过后，数字人路径执行 `planning-check`，真人视频路径执行原版 `preflight`。失败显示具体缺项并保留成果。原版全量预检必须通过才能实现或渲染。真实页面证据要保存原页图与同会话 DOM 坐标；缺证据、缺素材时保持 FAIL，不用示意图或不相关 B-roll 假充。
- 先做样板镜，`sample` 出有声单镜供用户确认；确认后才 `render-all`。逐镜场景与工作台六项拆解契约一致，`workbench-contract`、`beat-lint`、卡片保真和音效检查均不可省。
- 最终片跑 `qa`，独立审片报告绑定成片哈希、P0/P1 归零后才 `deliver`。没有真实扬声器试听、数字人口型或 RunningHub 任务时，分别标记待用户听验、静态角色占位和外部服务未验；不得用视频能播替代这些验收。
- 保留原 B 基线入口、旧运行目录、用户修改与成功资产。任何付费数字人生成、声音复刻或生产重试按用户的单次授权执行。
- 画面卡片与工作台文案按 `source-run.json.visualTextLocale` 编写；默认及兼容旧任务时使用 `zh-CN`（简体中文）。仅用户明确要求时才使用繁体。不要因此改写口播稿、配音、时间戳或来源引用。
- 成片交付后的修复迭代（文字贴边、暗底字色、动效抖动等 P0/P1）按 `.agents/skills/b-mode-post-delivery-fix/SKILL.md` 执行：快照 → 修复 → preflight → 布局审计 → 逐拍修正 → 独立视觉复核 → 绑定校验 → 底片替换导出（工具：`director/layout-audit.mjs` + `director/render-revised-film.mjs`）。修正不等于用户接受新片，不覆盖原成片。

## 已审模板强制复用（用户2026-10-16确认）

执行 `docs/workflows/b-mode-reviewed-templates.md`。仅允许 `director/talkcraft-reviewed-templates.json` 中有真实历史媒体、参数绑定、布局检查及源码版本证据的模板进入上游选卡索引。108张已审模板均可比较选择；上游匹配保留筛选与排序，默认返回每种语义全部可行卡，不再只取前三。推荐外按原版SHOTBOOK语义偏离格式写明理由，由原解析器检查；开场短卡池不得代替语义筛选，不事后添加候选，不自动按第一名替编导选卡。连续30镜不同观点不重复，同观点强关联承接须用 `templateParams.templateContinuity` 逐镜记录相同pointId、continuesShotId和至少四字reason，例外不豁免素材/时长/字级门禁。禁止自行补画、添加定制图解或外层CSS覆盖模板几何。配音和成功人物素材复用；模板级技术审查不等于本片通过。


## 模板动效15%变速（用户2026-10-16批准的本地适配）

- 仅原卡动效允许0.85～1.15倍速。以原生首尾帧跨度 / 输出首尾帧跨度计算实际速度，整数帧量化后仍不得越限；不是把时长简单增减15%。首尾完整、动作顺序不变，不能裁切、倒放或改原卡运动参数。
- 分镜可填 nativePresentation.playbackRate；省略时优先1倍，原卡略长则可在15%内完整适配。正式timeline每个motion记录实际playbackRate；旧1倍计划兼容。长镜头仍在原卡主体完整可见处明确驻留。
- 配音、数字人口型、字级输出锚点及真实切镜边界不变。变速仅作用于NativePresentationRoot内卡片，WordRevealRoot在外层；模板音效按同一映射迁移。卡内有hostSrc或音视频槽位时不得变速，须重新选卡，不能把口型一起拉伸。
- 开场原卡仍须完整时长≤3秒，前8秒实际镜头≤3.4秒；108已审库、30镜去重、候选外语义理由、首秒内容和关键词窗口校验继续生效。超速、参数/素材不合适的镜头返回编导重选卡，不自动挑推荐第一名，不补画。
- 改速后重新运行分镜、字级、素材、全量预检和样片审核；原配音、成功人物素材及旧片保留。技术通过不等于人工验收，新增模型请求仍需单次费用授权。

## 编导输入完整性与修订反馈

执行docs/workflows/b-mode-reviewed-templates.md中的“编导输入与失败闭环”：由正式代码生成字段类型/范围、DSL格式、开场真实时长和复用口型窗口；失败自动落盘并在同输入的授权修订中带回。不得临时手工提示替代正式链路，不自动换卡、不修改配音/口型/字级时钟。此为本地适配，不能冒称GitHub原文；108张已审卡比较与原版语义偏离理由保留。

## 生成请求的本地自检

执行工作流文档的“生成请求与校验一致性”：发送前逐字段对照实际模型输入与正式校验，并验证全片数值覆盖；源契约允许空值不得误拦，内嵌媒体驻留也不得改变口型时钟。未通过时不消耗模型授权、不发网络请求。回放原始响应，区分代码误判、输入遗漏与返回违规；禁止连续付费重试代替根因治理。该治理是本地实现，不是GitHub原文。
