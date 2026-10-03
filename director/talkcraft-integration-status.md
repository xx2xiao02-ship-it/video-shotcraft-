# TalkCraft B 模式接入状态

上游基准：`Vincentwei1021/video-talkcraft`，提交 `914103688cdec20ea35699f73b08e357a817c37a`。
当前 B 页面 `POST /api/b-mode/placeholder` 仍走原基线；本接入使用独立的 TalkCraft 工程目录，不覆盖已成功的样片或付费资产。

## 可执行合同

`director/talkcraft-stages.mjs <stage> <b-run-id>` 是本地阶段入口。`TALKCRAFT_SKILL_ROOT`、`TALKCRAFT_PYTHON`、`TALKCRAFT_PYTHONPATH` 可配置；运行目录在 `director/b-mode-runs/<id>/talkcraft/`。

| 阶段 | 命令 | 当前验证 |
| --- | --- | --- |
| 输入隔离 | `prepare`；研究校正版用 `talkcraft-revision.mjs` | 原 100 秒 B 运行保留；用户确认后的新稿在独立运行 `17719136-48c3-479c-9e57-56f3a86dae7b`。 |
| 字级时间 | `synthesize` / `align` | 新稿 Edge TTS 108.10 秒、22 句；上游 Whisper small 字级对齐最低匹配率 0.952。 |
| 语义 | `semantic-init` / `semantic-apply` / `semantic-check` | 上游 26 词封闭合同已跑；十镜各一个主句，关键词提示没有直接充当结论。 |
| SHOTBOOK | 人工写入后 `candidates` / `preflight` | 十镜重组、候选表与两篇 PubMed 原页在册；官方预检 PASS（0 FAIL、2 WARN）。 |
| 工程与工作台 | `scaffold` / `sfx-dump` / `workbench-contract` | Windows 运行专属连接器已启动并通过 HTTP、浏览器及构建验证；108 模板卡、33 音效、7 个本片素材文件入索引；S01 已正式接入，其余 9 镜仍占位。 |
| 样板及全片 | `sample` / `render-all` | S01 第二版有声样板 `remotion/out/preview/s01.mp4` 已渲染并查画面/音轨；首版保存为 `s01-v1.mp4`。待用户确认样板后才能实现其余九镜。 |
| 机器验收 | `render-sfx-solo` / `qa` | 已接上游画面、音效、卡片保真、字锚、工作台合同及 QA 拼图脚本；待成片输入。 |
| 交付 | `deliver` | 要求机器闸与独立审片绑定同一 MP4 哈希、P0/P1 归零，再做两遍响度归一；尚未执行。 |

## 当前阻断

- 原稿研究段经用户确认后已按两项原始研究改写并重新配音；S06 两篇真实 PubMed 页面均已采，S09 已选 8 秒本地同伴讲解实拍。当前仍须核证据镜头的阅读尺度与素材使用范围。
- 十镜已写选卡行和蒙皮行，25 个句锚与重点词锚已通过 `beat_lint`；S01 有正式场景、上游两张原卡、G5 线稿和五记 cue。其余九镜还没有逐卡落位自检、cue 与正式场景，多轨工作台仍显示“占位 9”，不是最终画面。
- 上游 `LICENSE` 为 PolyForm Noncommercial；用户已明确本项目为个人非商业使用，不再将商业授权列为当前阻断。
- 数字人口型、RunningHub 和抠像不是 `video-talkcraft` Skill 自带的生成功能；RunningHub B1 适配器现已接入主 B 工作台，但真实任务、抠像和外部验收仍未执行。
- 上游评审协议要求完成片经过独立审片。没有用户允许委派前，本接入不把制作者自评记作已过关。

## 上游 Skill 覆盖边界

| 上游阶段 | 已实装并验证 | 仍需完成 |
| --- | --- | --- |
| ⓪–② 输入、风格、配音、字级时间 | 独立运行、G0 风格档、Edge TTS、Whisper 字级对齐与 22 句语义审核 | 本运行没有真人原音；真人预剪与 Fish Audio 是可选输入分支，未冒充已调用 |
| ③–④ 素材、SHOTBOOK、选卡、预检 | 三条相符实拍、两篇原始研究页面、十镜层矩阵、官方候选与预检 PASS | 人物仍是静态图；两篇原页仅 1×，正式证据镜头需核缩放可读性 |
| ⑤ 逐镜实现与工作台 | S01 两张上游原卡、G5 线稿、五记 cue；每运行独立 Windows 工作台、108 模板卡与素材索引 | S02–S10 场景、卡经验、cue、逐镜转场及用户样板确认 |
| ⑥–⑧ 渲染、三重验收、交付 | S01 有声样板已渲染并查画面、尺寸、帧率和音轨 | 整片、机器闸、独立审片、两遍响度归一与真实听验 |

当前状态：`implemented` 为本地阶段桥接、Windows 运行专属工作台、S01 正式样板与主 B 工作台 RunningHub 数字人适配器；`tested` 为新稿配音与字级对齐、语义合同、上游预检 PASS（0 FAIL/2 WARN）、25 个字锚、两张卡保真、工作台构建与真实 HTTP/浏览器、S01 音视频及静帧、RunningHub 传输层假请求；`externally_validated` 为无；`pending_user_acceptance` 为真实数字人单次任务、抠像、样板视觉方向和真实听验。不得把现有 100 秒卡片实验样片、静态占位或未通过外部验收的数字人任务称为完整 Skill 成片。
