---
name: b-mode-github-governance
description: Enforce the GitHub video-talkcraft baseline for Mode B storyboard, template selection, rendering, and sample delivery while preserving approved local governance rules.
metadata:
  short-description: Govern Mode B from the GitHub video-talkcraft pipeline
---

# B 模式 GitHub 基线治理

本 Skill 只适用于 `director/b-mode-runs/*/talkcraft/` 的 B 模式任务。它把 GitHub `video-talkcraft` 作为唯一主链，并把本项目已验收的 B 模式约束接入主链。不要把 A 模式实现、旧样片、固定白名单或旧的 B 模式脚本当成上游基线。

## 基线来源

先读取上游 Skill 根目录的 `SKILL.md`、`scripts/semantic_annotate.py`、`scripts/card_match.py`、`scripts/preflight.py` 和 `scripts/render_shots.mjs`。默认根目录是仓库内的 `_audit/video-talkcraft`；如果设置了 `TALKCRAFT_SKILL_ROOT`，以该路径为准。上游文件是规则来源，本 Skill 只增加用户已经确认的本地治理约束。

## 唯一主链

严格按上游 ①–⑧ 执行：

1. 口播稿与配音输入。
2. 配音时间戳和语义标注，使用上游 `semantic_annotate.py`。
3. 按语义 `need`、实体和素材类型准备真实素材。
4. 写 SHOTBOOK，运行上游 `card_match.py` 推荐，由编导比较完整已审目录选择；候选外按原版写明语义偏离理由。
5. 运行上游 `preflight.py`，通过后才实现模板和场景。
6. 使用候选卡对应的上游模板源码实现，并用 `render_shots.mjs` 分段渲染。
7. 运行机器验收、卡片/参数/素材/时间映射对账，并实际检查视频。
8. 提供可播放样片或成片给用户审核；机器通过不等于用户通过。

不得跳过中间阶段、把候选直接当最终模板、在渲染阶段覆盖 `cardProps` 或素材参数，也不得用旧样片替代新链路验证。

## 已确认的 B 模式约束

- 语义拍按自然逗号、冒号、分号和句号切分；不在顿号处切，不把孤立词切成镜头。目标约 2.4 秒，自然短句允许约 1.1 秒，上限约 3.4 秒；完整语义优先于凑固定秒数。
- 前 8 秒的候选池只允许模板原生完整时长不超过 3 秒（30fps 即 `nativeFrames <= 90`）的已登记模板。不能通过截断或加速长模板来伪造短模板。
- 视觉拍时长和模板原生动画时长分开记录。长视觉拍必须有原生节拍、hold、转场或子节拍，不能让一个模板无变化地占满镜头。
- 视觉拍小于 2.5 秒时禁止数字人；数字人出现时必须由 SHOTBOOK、`visual-beats.json` 和运行时绑定一致。没有数字人的图形卡必须自动居中，不得保留空出的数字人栏位。
- 候选卡、SHOTBOOK 选卡、运行时渲染卡逐镜一致；素材路径、模板内部素材槽位、数字人绑定、语义到镜头映射和 `cardProps` 不得丢失或被默认参数覆盖。
- 只能使用索引中存在且有上游源码的模板；禁止新造库外模板，禁止固定白名单替代 `card_match.py`。
- 真实素材必须登记来源并在渲染中实际出现。缺素材、缺参数、缺映射时保持阻断，不用占位图或旧视频掩盖。

## 每次执行前后

执行前记录：用户本次规则、GitHub 基线规则、运行目录、入口脚本和不可破坏资产。执行后逐项核对：`semantics.json`、`SHOTBOOK.md`、候选表、`preflight` 结果、最终模板绑定、素材文件、数字人绑定、分段输出和机器 QA。交付记录必须包含 run ID、输出路径、SHA-256、尺寸、fps、帧数、时长、音频、完整解码、卡片表、预检结果、已知限制和用户审核状态。

## Windows 渲染阻断

`spawn EPERM` 表示 Remotion 浏览器或子进程运行环境阻断，不是业务逻辑通过。先停止继续堆积分镜修改，在隔离运行目录重试并记录权限/环境结果；只有真实 Remotion 渲染、完整解码和关键 QA 都通过，才能进入用户审核。不要用静态报告或单节点成功替代渲染证据。

## 范围和保护边界

只处理 B 模式。不要修改生产端口 `8769`，不要擅自删除旧代码、历史运行、成功资产或治理证据，不要自动调用付费服务，不要提交、推送或覆盖远程 Git 历史。删除或大范围迁移必须先列出精确路径、影响和保留边界，获得确认后再做。

详细的阶段产物、阻断条件和验收字段见 [references/workflow-contract.md](references/workflow-contract.md)。

## 已审模板复用门禁（用户 2026-10-16 确认）

执行 `docs/workflows/b-mode-reviewed-templates.md`，使用 `director/talkcraft-reviewed-templates.json` 登记的精确源码及依赖版本。模板只有目录登记、没有真实横竖版媒体、参数绑定与布局检查证据时不得入选。上游 `card_match.py` 仅接收已审索引；全部108张已审模板允许比较选择，推荐不是选卡白名单。保留原版语义/素材筛选和排序，以 `--top <已审索引总数>` 返回每种语义全部可行推荐，不再截取前三。候选外必须在本镜SHOTBOOK按原版格式写明 `- 语义偏离：语义词 ← 至少四字理由`，由原版解析器核验；不能用开场短卡池冒充语义推荐，不事后把已选卡塞入候选。

不同观点的连续30镜不重复；同一观点强关联承接可例外：前后镜 `templateParams.templateContinuity.pointId` 相同，后镜逐次记录 `continuesShotId` 和至少四字 `reason`，完整承接链供人审。仅同组或笼统理由不放行；例外不豁免原生时长、素材、业务参数及字级约束。不得自动从每组推荐第一名改选正式模板；缺记录只能补录编导在shots.json中的实际选择。

禁止新造图解、临时G5组件、SVG补画，以及外层CSS覆盖原卡几何。只通过原卡公开参数适配本片；放不下时回到编导重选卡，不给模板补画。配音和成功数字人素材复用。输入或源码变化后重做候选与对应审核；历史模板技术审查不等于本片验收。

运行 `node director/talkcraft-stages.mjs reviewed-template-check <run-id>` 可生成独立阻断清单；门禁失败仍须保留原结果，不自动调用付费服务。实现、样片、整片和交付入口必须重新核验，不提供关闭开关。
