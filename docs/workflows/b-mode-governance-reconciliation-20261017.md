# B 模式已确认治理成果主线对账（2026-10-17）

## 授权与范围

用户明确授权：逐项对账已确认成果，保留历史及现有素材，统一主分支，验证与当前运行代码一致后提交并上传 GitHub。原 main 为 589b48dd5d8691c9ab5e9f0417e8f0e4508326fc。

共核对 194 个现有文件：135 个治理分支路径，29 个缺失的直接运行依赖，15 个此前确认的宋体组件/字体/许可证，15 个 B 模式直接调用的共享模块及测试。本轮没有重新设计生产逻辑。逐文件原始 SHA256 和 Git 换行规范化 SHA256 见同名 JSON。

## 逐项治理对账

| 已确认结果 | 代码/工作流边界 |
|---|---|
| 节点职责、串并行依赖、前后端真实状态 | workflow-contract、progress、control-state、auto-advance、parallel-preparation |
| 原版选卡与 108 张已审卡比较、候选外理由、30 镜周期 | reviewed-templates、template-governance、ark-editorial |
| 前 8 秒短镜头、内容起始、关键词前空白 | opening-choice、editorial-planning-contract、content-onset |
| 模板动效允许 15% 以内变速，音频与字时钟不变 | native-time-map、native-timing、word-reveal |
| RunningHub 已有任务恢复、防重复提交、2.2 秒人物门槛 | digital-human、resume、admission、runninghub-infinitetalk |
| 主体保护、背景独占、取消统一缩卡、保留原构图 | background-*、native-presentation-root、scene-shared |
| 正式预览绑定真实输出、样片审核、来源与全量校验 | shot-preview、sample-provenance、binding、governed-contract |
| 顶层独立字幕、屏蔽模板口播字幕、保留标题图表、主题同步 | caption-layer、caption-style、keyword-caption、theme-contract |
| 真实字级时间与固定演示时间分类 | anchored-time-contract、governed-contract |
| 模型跌落与运行资源依赖闭合 | 共享 ark-client/provider-config、bundled-fonts、契约锁定模块 |

## 历史保留

下列 8 个分支的 tip 均通过 merge 保留为主线祖先；冲突以当前已运行实现为准，旧实现继续存在于原提交中。

- codex/formal-preview-host-20261017：b27c7b12d7c1a17bbe2f18126b208fe9e99a7b52
- codex/full-text-gates-20261016：88ab869c03f9544200ec78512d9bbfb0fccab707
- codex/opening-caption-20261017：11b9ab55674c054782d9297a1c75d1fb3f94e676
- codex/progress-checkpoint-20261015：e1e24bdcd769d9d3de2dcd016713066beecc0a21
- codex/reviewed-template-gates-20261016：fd9c4636f4a6f1e4a4e04214d0a7de70314a12d4
- codex/sample-layout-readability-20261015：bbad896f8dd8a393c5d92f3d7f7a46ab7617ca97
- codex/windows-task-recovery：c82cc7465203a55375355b40bfe85b4ca29ea3e3
- codex/workflow-dag-20261016：84ee8e604857b4007232bee569b4f52b923deb90

## 验证

- 当前运行目录与隔离归并目录的 194 个文件原始字节一致。
- 46 个测试文件，共 296 项。运行目录 289 通过、7 项既有失败。
- 隔离目录初跑 288 通过、8 失败：与运行目录相同的 7 项，另 1 项因来源清单固定绝对安装路径产生。将隔离代码的该项测试放到真实上游安装目录上下文重跑，1/1 通过；不修改校验、不改来源清单、不改测试断言。
- 7 项既有失败：TalkCraft segments creates only marked shot clips with exact frame counts；TalkCraft combined creates only marked shot clips with exact frame counts；TalkCraft segments-recovery creates only marked shot clips with exact frame counts；TalkCraft segments-25fps creates only marked shot clips with exact frame counts；TalkCraft uncertain-submission creates only marked shot clips with exact frame counts；整片数值可行性先验：不移动口型、不卡死无可行短卡的句子、不替编导选卡；已通过旧预检的正式模板缺少逐词计划时仍被阻断。
- 本次按用户指定的“与当前运行代码一致”门禁保存，不声称项目所有历史测试全绿，不把本次 Git 验证作为视频验收。
- 静态依赖对账覆盖 B 模式及其共享主题/供应商/素材/渲染模块；A 模式与包装模块的其他未确认修改保留在原工作区，不混入。
- 提交前精确路径扫描凭据及大文件；字体包含 OFL 许可证。未提交 API 密钥、配音、数字人、成片、运行任务状态及临时测试目录。

## 生产保护与备份边界

主目录没有 checkout、重启服务、覆盖源码或重新生成素材。主分支仅更新 Git 引用与索引，不写工作树；原始脏工作区中的其他修改保留。各工作分支保留，不做 squash、强推或删除。

上游 Skill、node_modules 和 Python 安装仍是现有本机依赖，不把 GitHub 源码备份称为可独立部署包。字体作为已确认源码依赖一并保存。

并行观察中，视频任务 149 在画面拼接后音轨重渲阶段报告 s17-transparent.webm 读取帧失败；已保留现场并暂停自动跟进，不在本次归并中修复、不提交新的计费任务。
