# B 模式全文图片占位联通测试（历史记录）

> 本文件记录已废弃的静态占位渲染路径，仅用于历史追溯。当前 B 模式入口已切换到 `talkcraft-card-preview`（`DynamicVideo + TemplateAdapter`）；新验收以新运行目录中的 `placeholder-report.json`、`talkcraft-props.json` 和卡片抽帧为准。

日期：2026-09-24

## 固定输入

- 文案：`b-mode-acceptance-script.txt`，用户提供的全文，520 字、7 段；未删改文案内容。
- 人工分镜夹具：`b-mode-acceptance-plan.json`，19 句；8 个静态角色图口播占位、8 个图解/文字镜头、3 个“素材待补”镜头，连续人物单位 6 个。它不是自动编导结果。
- 角色图：此前用户提供且已用于本项目长版样片的 `director/b-mode-runs/7a1cb0fe-3446-4d4d-98e0-f7675a67cb9f/avatar.png`；本次在新 UUID 运行目录内规范化，不覆盖原文件。
- 音色：`zh-CN-YunxiNeural`，整段文案只合成一条 TTS。

## 本次运行

- Run ID：`bab8eab2-3fdd-48d7-bf85-16593f5fad31`。先前估算时间的运行 `534b2483-40d7-4a10-90e0-d1e1e8e2376c` 原样保留，未覆盖。
- 输出：`template/out/b-mode/bab8eab2-3fdd-48d7-bf85-16593f5fad31.placeholder.mp4`，100.01 秒，1280×720、30 fps、H.264 视频与 AAC 音频。
- TTS：99.96 秒，`edge-tts`；19 个 `SentenceBoundary` 与 19 句验收文案逐一匹配，`timingMethod=edge_sentence_boundary`。这是句首级时间，不是逐字对齐。相对于旧版停顿估算，分镜切点最大变化 33 帧。
- 时间线：19 镜头，2999 帧；最后镜头结束帧为 2999，覆盖整个视频主时间轴。
- 报告：`director/b-mode-runs/<run-id>/placeholder-report.json` 明确写入 `kind=static-avatar-placeholder`、`isDigitalHuman=false`、`runningHubCalled=false`、`backgroundApplied=false`。

## 已验证

1. `GET /api/b-mode/acceptance` 返回 520 字全文与 19 句固定分镜；浏览器 B 视图显式载入后也显示 520 字及 19 句、8 个人物镜头和 6 个连续人物单位。
2. `POST /api/b-mode/placeholder` 用角色图、全文、现成音色及固定分镜启动独立运行；任务退出码为 0，新运行的 `input.txt` 与 520 字验收夹具内容完全一致（统一 LF 换行），原文与 19 个 TTS 句段严格匹配后才进入渲染。
3. `ffprobe` 确认最终 MP4 长 100.01 秒且同时含 H.264/AAC；音轨 `volumedetect` 约为平均 -28.0 dB、峰值 -5.2 dB。`blackdetect` 未报告连续黑段。
4. 抽看第 2、11、45、72、83、98 秒画面，覆盖开场人物、收藏素材待补、认知卸载文字、三步方法和结尾；所选主体对应正确，无文字溢出或遮挡。浏览器已实际加载并播放最终 MP4；本地 HTTP 范围请求返回 206。
5. `node --test --test-isolation=none director/b-mode-placeholder-plan.test.mjs` 的 4 项断句/时间合同检查通过。原 B0 样片的视频接口仍返回 206。

## 内置浏览器黑屏修复

直接打开 MP4 时，内置浏览器原生播放器在播放结束后显示黑屏；复播时也曾显示全黑，但播放器 `readyState=4`、无解码错误且持续解码视频帧。对同一时刻的视频绘制到离屏画布后，像素平均亮度约 86，非黑像素比例约 99.9%；FFmpeg 抽帧同样有画面，说明问题在原生播放层的可见呈现。

新预览入口为 `/director/b-mode-video-preview.html?id=<run-id>`。它保留原 MP4 和音轨，视频帧绘到可见画布；初始显示海报，结束时保留最后一帧并提供重播。B 视图结果区也使用此预览器，MP4 链接只作下载。已在内置浏览器实际检查封面、约 28 秒、约 90 秒及 100.01 秒结束画面，均不黑屏。

### 声音输出边界

用户反馈画布预览没有声音。MP4 内含 48 kHz 双声道 AAC，`volumedetect` 平均 -28.0 dB、峰值 -5.2 dB；预览器的原隐藏 `<video>` 音量为 1、未静音，但不能证明 Codex 内置浏览器实际出声。改用可见原生 `<audio>` 控件时，内置浏览器测试标签在点击播放后崩溃，故撤回该方式。当前预览器通过 Web Audio 解码本运行的 `placeholder-voice.mp3`，音频源连接到默认输出、画面使用它的时钟；浏览器诊断确认音频缓冲 99.96 秒、上下文为 `running`、增益 1.2（后调为默认 1.5），播放时画面同步且未再崩溃。`GET /api/b-mode/placeholder/audio?id=...` 返回 `audio/mpeg` 和可用的 HTTP Range；页面另提供“下载配音”。**扬声器是否实际可听仍待用户在当前设备确认**，不能以缓冲或画面进度代替听觉验收。

## 尚未验证

- RunningHub 数字人生成、真实口型、数字人视频替换、绿幕抠像与复刻音色；本次未调用这些服务，也未发生其付费请求。
- 自动编导的语义选镜。本次 19 句主体由固定人工夹具指定。
- 逐字同步与真实数字人口型。当前只有 TTS 实际句首边界；正式制作仍需逐镜校对画面切点和口播感受。
- 浏览器文件选择器触发的完整 UI 提交流程；本次从本地 HTTP 接口提交角色图，浏览器验证了夹具载入与最终播放。

以上结果只证明“固定全文 → TTS → 人工分镜时间映射 → 静态角色图占位/文字/素材待补 → 有声 MP4 → 浏览器”在本机可运行；不构成正式 B1 或用户验收。

## 素材库视频背景追加测试

- Run ID：`c081b908-42e5-4b01-85be-b44108c0cbb5`，继续使用上述 520 字全文、19 句固定分镜和同一角色图。
- 背景来源：素材库索引中的 `城市通讯电子商务科技信息网络移动互联网生活高清视频宣传片素材/14SPSC互联网科技/01-Scene-019.mp4`。服务端通过索引和实际文件核对后，在本次运行内转为 1280×720、10.53 秒、无音轨的 `background-proxy.mp4`；原素材未改动。
- 最终 MP4：100.01 秒、H.264 视频与 AAC 音频；报告为 `backgroundVideoApplied=true`、`backgroundKeyApplied=false`、`isDigitalHuman=false`、`runningHubCalled=false`。黑帧检测无连续黑段。
- 抽看第 2、7、17、93 秒：城市视频只出现在人物图镜头底层，图解文字镜头保持无视频背景；人物图白底仍在，未声称已抠像。
- B 视图里搜索 `01-Scene-019` 得到该条素材，选中后显示缩略图与 10.5 秒时长；刷新后选择保留，“移除”可清除。尚未通过浏览器文件选择器提交一次带背景的完整 UI 任务；本次真实渲染由同一 HTTP 接口提交。
