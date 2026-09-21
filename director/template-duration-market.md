# 模板时长体质市场 v3（218 个）

> **体质规则**：
> - **stretch** = 归一化时间轴（useT，t∈[0,1]），动画任何时长都完整播完，只是快慢变化 → **分镜时长直接决定，变速适配**
> - **fixed** = 绝对帧号编排，改时长会残缺或静止等待 → 用其最佳时长或 ±15% 变速
> - **loop** = 无限循环 → 金句停留/氛围背景
> - **static** = 无动画 → 封面/静态背景

> **适配原则**：分镜时长 X 时 → 优先选 stretch 且推荐时长接近 X 的；X 落在 fixed 模板最佳时长 ±15% 内才选 fixed；金句/收尾长镜头用 loop。

## 体质分布
- **stretch**: 144 个
- **fixed**: 70 个
- **loop**: 3 个
- **static**: 1 个

## 完整清单

| # | 分类 | 模板 | 体质 | 推荐时长 | 适配说明 | 演示内容 |
|---|------|------|------|---------|---------|----------|
| 1 | 文字排版 | `typography/blur-slide` | **stretch** | 3.8s | 归一化时间轴，推荐 3.8s，可变速±40%仍完整 | Your headline goes here |
| 2 | 文字排版 | `typography/brace-expand` | **stretch** | 3.8s | 归一化时间轴，推荐 3.8s，可变速±40%仍完整 | — |
| 3 | 文字排版 | `typography/brand-ink-open` | **fixed** | 3.5s | 绝对帧编排到 104f，最佳 3.5s（可±15%） | Times New Roman | AI Foundation Lab |
| 4 | 文字排版 | `typography/cel-flash-stomp` | **fixed** | 2.7s | 绝对帧编排到 80f，最佳 2.7s（可±15%） | SHIP | FASTER |
| 5 | 文字排版 | `typography/countdown-arc-scatter` | **stretch** | 1.1s | 归一化时间轴，推荐 1.1s，可变速±40%仍完整 | — |
| 6 | 文字排版 | `typography/flying-words` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | Motion', 'Layout', 'Camera', 'Stagger',  | Be |
| 7 | 文字排版 | `typography/glitch-cycle` | **stretch** | 5.6s | 归一化时间轴，推荐 5.6s，可变速±40%仍完整 | INITIALIZING', 'LOADING ASSETS',  | READY TO  |
| 8 | 文字排版 | `typography/gradient-word-sweep` | **fixed** | 0.4s | 绝对帧编排到 12f，最佳 0.4s（可±15%） | Avenir Next | Helvetica Neue |
| 9 | 文字排版 | `typography/lead-word-zoom-assemble` | **stretch** | 任意 | 有动画但结构待实测 | Introducing Lumen Deck | Lumen |
| 10 | 文字排版 | `typography/marker-underline-title` | **fixed** | 1.4s | 绝对帧编排到 42f，最佳 1.4s（可±15%） | Helvetica Neue |
| 11 | 文字排版 | `typography/outline-word-fill` | **stretch** | 2.5s | 归一化时间轴，推荐 2.5s，可变速±40%仍完整 | Faster | Helvetica Neue |
| 12 | 文字排版 | `typography/paper-title-card` | **fixed** | 1.1s | 绝对帧编排到 34f，最佳 1.1s（可±15%） | Times New Roman | All |
| 13 | 文字排版 | `typography/pill-chip-slot-cycle-handled` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | Sales | Workflow |
| 14 | 文字排版 | `typography/pill-slot-cycle` | **stretch** | 任意 | 有动画但结构待实测 | One AI tool to do it all. | Helvetica, Arial, |
| 15 | 文字排版 | `typography/scramble` | **stretch** | 3.2s | 归一化时间轴，推荐 3.2s，可变速±40%仍完整 | TEMPLATE MOTION DEMO | SF Mono |
| 16 | 文字排版 | `typography/split-flap-title` | **stretch** | 任意 | 有动画但结构待实测 | SHIP FASTER | Helvetica, Arial, sans-serif |
| 17 | 文字排版 | `typography/text-column-converge` | **stretch** | 任意 | 有动画但结构待实测 | NEW RAYCAST | LAUNCHER DESIGN |
| 18 | 文字排版 | `typography/title-demote-to-label` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | Running Subage |
| 19 | 文字排版 | `typography/type-assembly-moves` | **fixed** | 3.5s | 绝对帧编排到 104f，最佳 3.5s（可±15%） | ASSEMBLE | ASSEMBLE |
| 20 | 文字排版 | `typography/type-assembly-moves` | **stretch** | 任意 | 有动画但结构待实测 | MOTION SYSTEM | MOTION SYSTEM |
| 21 | 文字排版 | `typography/type-assembly-moves` | **fixed** | 2.7s | 绝对帧编排到 82f，最佳 2.7s（可±15%） | GROWTH ALL THE WAY | TEXT ON PATH |
| 22 | 文字排版 | `typography/type-assembly-moves` | **fixed** | 1.9s | 绝对帧编排到 58f，最佳 1.9s（可±15%） | BREATHE | BREATHE |
| 23 | 文字排版 | `typography/type-entrance-moves` | **stretch** | 任意 | 有动画但结构待实测 | GRAVITY | GRAVITY |
| 24 | 文字排版 | `typography/type-entrance-moves` | **stretch** | 任意 | 有动画但结构待实测 | DECODE SPEED | DECODE SPEED |
| 25 | 文字排版 | `typography/type-rhythm-sync` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 26 | 文字排版 | `typography/type-rhythm-sync` | **fixed** | 4.3s | 绝对帧编排到 130f，最佳 4.3s（可±15%） | SHIP | FASTER |
| 27 | 文字排版 | `typography/typewriter-moves` | **loop** | 任意 | 循环，任意时长 | Menlo, Consolas, monospace |
| 28 | 文字排版 | `typography/typewriter-moves` | **stretch** | 任意 | 有动画但结构待实测 | Courier New |
| 29 | 文字排版 | `typography/typing-code-block` | **stretch** | 4.6s | 归一化时间轴，推荐 4.6s，可变速±40%仍完整 | SF Mono | LINE FADE-IN |
| 30 | 文字排版 | `typography/vertical-word-roll-blur-cycle` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | Apps', 'Teams', 'Data', 'Everyone |
| 31 | 文字排版 | `typography/word-relay-filmstrip` | **stretch** | 任意 | 有动画但结构待实测 | Computer | Didot |
| 32 | 文字排版 | `typography/word-relay-geometry` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | Faster | Better |
| 33 | 运镜 | `camera/basic-3d-scene` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | Position the idea | Rotate the view |
| 34 | 运镜 | `camera/crash-zoom-punch` | **fixed** | 1.3s | 绝对帧编排到 38f，最佳 1.3s（可±15%） | — |
| 35 | 运镜 | `camera/crash-zoom-punch` | **fixed** | 1.6s | 绝对帧编排到 48f，最佳 1.6s（可±15%） | — |
| 36 | 运镜 | `camera/cursor-flyover` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | Overview', 'Traffic', 'Revenue', 'Cohorts | A |
| 37 | 运镜 | `camera/depth-layer-moves` | **fixed** | 3.7s | 绝对帧编排到 110f，最佳 3.7s（可±15%） | — |
| 38 | 运镜 | `camera/depth-layer-moves` | **fixed** | 4.2s | 绝对帧编排到 125f，最佳 4.2s（可±15%） | — |
| 39 | 运镜 | `camera/graze-face-tour` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | People & Teams |
| 40 | 运镜 | `camera/overhead-camera-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 41 | 运镜 | `camera/overhead-camera-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 42 | 运镜 | `camera/space-camera-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 43 | 运镜 | `camera/space-camera-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 44 | 运镜 | `camera/steep-tilt-glide` | **fixed** | 3.3s | 绝对帧编排到 100f，最佳 3.3s（可±15%） | Helvetica, Arial, sans-serif | Widget brainst |
| 45 | 运镜 | `camera/tension-camera-moves` | **fixed** | 4.3s | 绝对帧编排到 128f，最佳 4.3s（可±15%） | Helvetica, Arial, sans-serif | BULLET TIME |
| 46 | 运镜 | `camera/tension-camera-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 47 | 运镜 | `camera/tension-camera-moves` | **fixed** | 3.7s | 绝对帧编排到 110f，最佳 3.7s（可±15%） | Helvetica, Arial, sans-serif |
| 48 | 运镜 | `camera/tension-camera-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 49 | 运镜 | `camera/terminal-3d` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | — |
| 50 | 数据图表 | `data/avatar-grid-radial-build-colorize` | **stretch** | 5.6s | 归一化时间轴，推荐 5.6s，可变速±40%仍完整 | VS', 'KJ', 'EM', 'AL', 'TR', 'MN', 'BQ',  | R |
| 51 | 数据图表 | `data/before-after-slider-scrub` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 52 | 数据图表 | `data/chart-live-moves` | **stretch** | 任意 | 有动画但结构待实测 | Monthly revenue | Jan', 'Feb', 'Mar', 'Apr',  |
| 53 | 数据图表 | `data/chart-live-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 54 | 数据图表 | `data/chart-live-moves` | **stretch** | 任意 | 有动画但结构待实测 | Total customers | Helvetica, Arial, sans-seri |
| 55 | 数据图表 | `data/counter-confetti` | **stretch** | 4.6s | 归一化时间轴，推荐 4.6s，可变速±40%仍完整 | Segoe UI',sans-serif |
| 56 | 数据图表 | `data/cycle-glass-node-morph` | **fixed** | 4.5s | 绝对帧编排到 134f，最佳 4.5s（可±15%） | Arial, sans-serif | SENSE |
| 57 | 数据图表 | `data/gauge-readout-moves` | **fixed** | 0.7s | 绝对帧编排到 20f，最佳 0.7s（可±15%） | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 58 | 数据图表 | `data/gauge-readout-moves` | **fixed** | 3.2s | 绝对帧编排到 96f，最佳 3.2s（可±15%） | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 59 | 数据图表 | `data/hatch-depth` | **stretch** | 4.4s | 归一化时间轴，推荐 4.4s，可变速±40%仍完整 | SF Mono | SF Mono |
| 60 | 数据图表 | `data/odometer-digit-roll` | **fixed** | 2.8s | 绝对帧编排到 84f，最佳 2.8s（可±15%） | ODOMETER DIGIT ROLL | Helvetica, Arial, sans- |
| 61 | 数据图表 | `data/particle-celebrate-hits` | **fixed** | 0.5s | 绝对帧编排到 14f，最佳 0.5s（可±15%） | CONFETTI CROSSFIRE | Helvetica, Arial, sans-s |
| 62 | 数据图表 | `data/particle-celebrate-hits` | **stretch** | 任意 | 有动画但结构待实测 | COUNTER TICK SPARKS | Helvetica, Arial, sans- |
| 63 | 数据图表 | `data/particle-sand-fill` | **stretch** | 任意 | 有动画但结构待实测 | PARTICLE SAND FILL | Helvetica, Arial, sans-s |
| 64 | 数据图表 | `data/ring-diagram-annotation-reveal` | **fixed** | 6.2s | 绝对帧编排到 187f，最佳 6.2s（可±15%） | Arial, sans-serif | Arial, sans-serif |
| 65 | 数据图表 | `data/scroll-brake-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 66 | 数据图表 | `data/scroll-brake-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 67 | 数据图表 | `data/timeline-travel` | **stretch** | 任意 | 有动画但结构待实测 | Today | Helvetica, Arial, sans-serif |
| 68 | 开场 | `opening/crane-rise-reveal` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 69 | 开场 | `opening/dataviz-landscape-open` | **fixed** | 5.3s | 绝对帧编排到 160f，最佳 5.3s（可±15%） | Menlo,  |
| 70 | 开场 | `opening/fracture` | **stretch** | 5.2s | 归一化时间轴，推荐 5.2s，可变速±40%仍完整 | — |
| 71 | 开场 | `opening/icon-field-colorize` | **fixed** | 3.7s | 绝对帧编排到 110f，最佳 3.7s（可±15%） | — |
| 72 | 开场 | `opening/letterspace-materialize` | **stretch** | 任意 | 有动画但结构待实测 | SUPERHUMAN |
| 73 | 开场 | `opening/magician-card-flourish` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 74 | 开场 | `opening/orbit-ring-title-open` | **stretch** | 任意 | 有动画但结构待实测 | VIDEO-SHOTCRAFT | PingFang SC |
| 75 | 开场 | `opening/spotlight-hero-card` | **fixed** | 4.3s | 绝对帧编排到 130f，最佳 4.3s（可±15%） | Times New Roman |
| 76 | 开场 | `opening/stroke-segment-build` | **stretch** | 任意 | 有动画但结构待实测 | SHIP | SHIP |
| 77 | 开场 | `opening/text-as-mask` | **stretch** | 任意 | 有动画但结构待实测 | SCALE | Helvetica, Arial, sans-serif |
| 78 | 收尾 | `outro/edit-hook-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 79 | 收尾 | `outro/grain-dissolve` | **stretch** | 2.0s | 归一化时间轴，推荐 2.0s，可变速±40%仍完整 | ACME | SourceGraphic |
| 80 | 收尾 | `outro/logo-shrink-wordmark-lockup` | **stretch** | 4.4s | 归一化时间轴，推荐 4.4s，可变速±40%仍完整 | BRAND | Helvetica Neue',sans-serif |
| 81 | 收尾 | `outro/neon-triple-marquee` | **stretch** | 任意 | 有动画但结构待实测 | Arial Black | Helvetica Neue |
| 82 | 收尾 | `outro/outro-group-photo-launch` | **fixed** | 2.7s | 绝对帧编排到 80f，最佳 2.7s（可±15%） | Times New Roman | AI Foundation Lab |
| 83 | 收尾 | `outro/ui-strip-away-outro` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 84 | 收尾 | `outro/ui-to-brand-morph` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 85 | 收尾 | `outro/ui-to-brand-morph` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 86 | 转场 | `transition/bottom-push-stack-wipe` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 87 | 转场 | `transition/bubble-swarm-takeover` | **stretch** | 任意 | 有动画但结构待实测 | Hallo! | Ciao! |
| 88 | 转场 | `transition/card-flip-reveal` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | CARD FLIP REVE |
| 89 | 转场 | `transition/card-flock-tumble` | **stretch** | 任意 | 有动画但结构待实测 | Avenir Next | Helvetica Neue |
| 90 | 转场 | `transition/circle-match-iris` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 91 | 转场 | `transition/color-block-step-wipe` | **fixed** | 2.6s | 绝对帧编排到 78f，最佳 2.6s（可±15%） | — |
| 92 | 转场 | `transition/cube-navigation` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | OVERVIEW | METRICS |
| 93 | 转场 | `transition/gradient-transition` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | LINEAR | RADIAL |
| 94 | 转场 | `transition/line-carry-transition` | **fixed** | 4.1s | 绝对帧编排到 124f，最佳 4.1s（可±15%） | Scene A | Scene B |
| 95 | 转场 | `transition/mosaic-reframe` | **stretch** | 6.0s | 归一化时间轴，推荐 6.0s，可变速±40%仍完整 | — |
| 96 | 转场 | `transition/page-turn-transitions` | **fixed** | 1.8s | 绝对帧编排到 55f，最佳 1.8s（可±15%） | BARN DOOR SPLIT |
| 97 | 转场 | `transition/page-turn-transitions` | **fixed** | 2.3s | 绝对帧编排到 68f，最佳 2.3s（可±15%） | CUBE ROTATE |
| 98 | 转场 | `transition/paper-plane-messenger` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 99 | 转场 | `transition/print-texture-transitions` | **fixed** | 3.3s | 绝对帧编排到 100f，最佳 3.3s（可±15%） | BEFORE | BEFORE |
| 100 | 转场 | `transition/shot-transitions` | **fixed** | 2.6s | 绝对帧编排到 78f，最佳 2.6s（可±15%） | Times New Roman | Every |
| 101 | 转场 | `transition/shot-transitions` | **fixed** | 1.7s | 绝对帧编排到 52f，最佳 1.7s（可±15%） | — |
| 102 | 转场 | `transition/shot-transitions` | **fixed** | 1.4s | 绝对帧编排到 42f，最佳 1.4s（可±15%） | — |
| 103 | 转场 | `transition/shot-transitions` | **fixed** | 2.8s | 绝对帧编排到 85f，最佳 2.8s（可±15%） | — |
| 104 | 转场 | `transition/shot-transitions` | **fixed** | 2.4s | 绝对帧编排到 73f，最佳 2.4s（可±15%） | Scene B |
| 105 | 转场 | `transition/shot-transitions` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 106 | 转场 | `transition/shot-transitions` | **fixed** | 1.4s | 绝对帧编排到 43f，最佳 1.4s（可±15%） | — |
| 107 | 转场 | `transition/tear-streak-transitions` | **fixed** | 2.1s | 绝对帧编排到 62f，最佳 2.1s（可±15%） | — |
| 108 | 转场 | `transition/transition-hidden-cut` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 109 | 转场 | `transition/transition-hidden-cut` | **fixed** | 3.2s | 绝对帧编排到 95f，最佳 3.2s（可±15%） | Next Page |
| 110 | 转场 | `transition/transition-hidden-cut` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 111 | 转场 | `transition/transition-travel` | **fixed** | 3.7s | 绝对帧编排到 110f，最佳 3.7s（可±15%） | DASH | DASH |
| 112 | 转场 | `transition/transition-travel` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 113 | 转场 | `transition/white-flash-logo-simplify-cut` | **stretch** | 3.6s | 归一化时间轴，推荐 3.6s，可变速±40%仍完整 | BRAND | Helvetica Neue',sans-serif |
| 114 | 转场 | `transition/wipe-transitions` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 115 | 转场 | `transition/wipe-transitions` | **fixed** | 3.2s | 绝对帧编排到 96f，最佳 3.2s（可±15%） | — |
| 116 | 节奏 | `rhythm/beat-cut-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 117 | 节奏 | `rhythm/beat-cut-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 118 | 节奏 | `rhythm/beat-step-list-theme-cycle` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 119 | 节奏 | `rhythm/montage-rhythm-moves` | **stretch** | 任意 | 有动画但结构待实测 | CHAIN REACTION | CHAIN REACTION |
| 120 | 节奏 | `rhythm/montage-rhythm-moves` | **stretch** | 任意 | 有动画但结构待实测 | DROP | Helvetica, Arial, sans-serif |
| 121 | 节奏 | `rhythm/montage-rhythm-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 122 | 节奏 | `rhythm/panel-grid-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 123 | 节奏 | `rhythm/panel-grid-moves` | **stretch** | 任意 | 有动画但结构待实测 | FLIP GRID REFLOW |
| 124 | 节奏 | `rhythm/panel-grid-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 125 | 节奏 | `rhythm/quad-split-parallel-scenes` | **loop** | ≥2.1s | 循环，任意时长 | Tab One', 'Tab Two', 'Tab Three',  | Tab Five |
| 126 | 节奏 | `rhythm/rhythm-interrupt-moves` | **stretch** | 任意 | 有动画但结构待实测 | JUMP CUT PUNCH-IN |
| 127 | 节奏 | `rhythm/rhythm-interrupt-moves` | **stretch** | 任意 | 有动画但结构待实测 | STROBE BLACK FRAMES |
| 128 | 节奏 | `rhythm/sakuga-timing-shift` | **stretch** | 任意 | 有动画但结构待实测 | SAKUGA TIMING SHIFT | Courier New, monospace |
| 129 | 节奏 | `rhythm/smear-multiples` | **fixed** | 1.3s | 绝对帧编排到 38f，最佳 1.3s（可±15%） | SMEAR MULTIPLES |
| 130 | 节奏 | `rhythm/spectrum-morph-ui` | **fixed** | 0.3s | 绝对帧编排到 10f，最佳 0.3s（可±15%） | LAUNCH WEEK | Helvetica, Arial, sans-serif |
| 131 | 节奏 | `rhythm/speed-ramp-freeze` | **fixed** | 3.5s | 绝对帧编排到 104f，最佳 3.5s（可±15%） | SourceGraphic |
| 132 | 节奏 | `rhythm/speed-ramp-freeze` | **fixed** | 2.8s | 绝对帧编排到 83f，最佳 2.8s（可±15%） | — |
| 133 | 节奏 | `rhythm/trailer-grammar-moves` | **fixed** | 3.5s | 绝对帧编排到 105f，最佳 3.5s（可±15%） | Helvetica, Arial, sans-serif | SHIP |
| 134 | 节奏 | `rhythm/trailer-grammar-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 135 | 节奏 | `rhythm/trailer-grammar-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 136 | UI入场 | `ui-entrance/avatar-bracket-carousel` | **stretch** | 5.2s | 归一化时间轴，推荐 5.2s，可变速±40%仍完整 | Designer | Support |
| 137 | UI入场 | `ui-entrance/bezier-source-converge-merge` | **stretch** | 5.6s | 归一化时间轴，推荐 5.6s，可变速±40%仍完整 | Segoe UI | Four sources unified |
| 138 | UI入场 | `ui-entrance/card-stack` | **stretch** | 4.2s | 归一化时间轴，推荐 4.2s，可变速±40%仍完整 | — |
| 139 | UI入场 | `ui-entrance/carousel-3d` | **stretch** | 5.6s | 归一化时间轴，推荐 5.6s，可变速±40%仍完整 | — |
| 140 | UI入场 | `ui-entrance/clipcard-looping` | **static** | 任意 | 无帧动画，静态/纯CSS | — |
| 141 | UI入场 | `ui-entrance/cloner-depth-echo` | **stretch** | 任意 | 有动画但结构待实测 | CLONER DEPTH ECHO |
| 142 | UI入场 | `ui-entrance/deck-deal-flyin` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 143 | UI入场 | `ui-entrance/doc-park-left-pill-deal` | **stretch** | 5.8s | 归一化时间轴，推荐 5.8s，可变速±40%仍完整 | Segoe UI | Quick Start |
| 144 | UI入场 | `ui-entrance/document-typewriter-reveal` | **fixed** | 0.5s | 绝对帧编排到 16f，最佳 0.5s（可±15%） | Jackie's Download |
| 145 | UI入场 | `ui-entrance/draw-svg-trace` | **fixed** | 2.9s | 绝对帧编排到 86f，最佳 2.9s（可±15%） | DRAW SVG TRACE |
| 146 | UI入场 | `ui-entrance/element-body-moves` | **fixed** | 0.3s | 绝对帧编排到 10f，最佳 0.3s（可±15%） | AXIAL STRETCH |
| 147 | UI入场 | `ui-entrance/element-body-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 148 | UI入场 | `ui-entrance/floating-glossy-label-pills` | **stretch** | 4.0s | 归一化时间轴，推荐 4.0s，可变速±40%仍完整 | Feature A | Feature B |
| 149 | UI入场 | `ui-entrance/integration-hub-map` | **fixed** | 3.3s | 绝对帧编排到 100f，最佳 3.3s（可±15%） | Avenir Next | Helvetica Neue |
| 150 | UI入场 | `ui-entrance/list-reveal` | **stretch** | 3.6s | 归一化时间轴，推荐 3.6s，可变速±40%仍完整 | Dashboard', 'Projects', 'Analytics',  | Setti |
| 151 | UI入场 | `ui-entrance/list-stack-press` | **fixed** | 2.6s | 绝对帧编排到 78f，最佳 2.6s（可±15%） | — |
| 152 | UI入场 | `ui-entrance/morph-from-primitive` | **fixed** | 2.3s | 绝对帧编排到 68f，最佳 2.3s（可±15%） | — |
| 153 | UI入场 | `ui-entrance/neon-frame-forerun` | **fixed** | 3.3s | 绝对帧编排到 98f，最佳 3.3s（可±15%） | — |
| 154 | UI入场 | `ui-entrance/neon-frame-orbit-drop` | **fixed** | 4.3s | 绝对帧编排到 130f，最佳 4.3s（可±15%） | — |
| 155 | UI入场 | `ui-entrance/page-waterfall-wall` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 156 | UI入场 | `ui-entrance/page-waterfall-wall` | **loop** | 任意 | 循环，任意时长 | — |
| 157 | UI入场 | `ui-entrance/paper-craft-moves` | **stretch** | 任意 | 有动画但结构待实测 | MASKING TAPE SLAP |
| 158 | UI入场 | `ui-entrance/paper-craft-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 159 | UI入场 | `ui-entrance/platform-hinge-rise` | **stretch** | 任意 | 有动画但结构待实测 | Arial, sans-serif | Arial, sans-serif |
| 160 | UI入场 | `ui-entrance/product-card-progressive-assemble` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | Placeholder copy for  | Second highlight |
| 161 | UI入场 | `ui-entrance/radial-wave` | **stretch** | 3.8s | 归一化时间轴，推荐 3.8s，可变速±40%仍完整 | — |
| 162 | UI入场 | `ui-entrance/research-card-stack-scroll` | **stretch** | 4.8s | 归一化时间轴，推荐 4.8s，可变速±40%仍完整 | SF Pro Text | PingFang SC |
| 163 | UI入场 | `ui-entrance/row-embed` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 164 | UI入场 | `ui-entrance/runway-ground-skim` | **fixed** | 3.1s | 绝对帧编排到 94f，最佳 3.1s（可±15%） | Helvetica, Arial, sans-serif | Creative Refre |
| 165 | UI入场 | `ui-entrance/skeleton-reveal` | **stretch** | 任意 | 有动画但结构待实测 | Ana', 'Ben', 'Kai', 'Mia | Morning! Kicking o |
| 166 | UI入场 | `ui-entrance/svg-shape-morph` | **stretch** | 5.2s | 归一化时间轴，推荐 5.2s，可变速±40%仍完整 | SF Mono |
| 167 | UI入场 | `ui-entrance/value-stagger-gradient` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | SF Mono |
| 168 | UI入场 | `ui-entrance/wall-reveal-moves` | **fixed** | 4.0s | 绝对帧编排到 121f，最佳 4.0s（可±15%） | Features |
| 169 | UI入场 | `ui-entrance/wall-reveal-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 170 | UI入场 | `ui-entrance/wall-reveal-moves` | **fixed** | 3.9s | 绝对帧编排到 118f，最佳 3.9s（可±15%） | — |
| 171 | 交互 | `interaction/ai-stream-response` | **fixed** | 4.0s | 绝对帧编排到 120f，最佳 4.0s（可±15%） | Indexed the workspace',  | Mapped the authent |
| 172 | 交互 | `interaction/autolayout-gap-dial` | **fixed** | 0.5s | 绝对帧编排到 16f，最佳 0.5s（可±15%） | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 173 | 交互 | `interaction/canvas-materialize-moves` | **stretch** | 任意 | 有动画但结构待实测 | Generate an entity-relationship diagram | Hel |
| 174 | 交互 | `interaction/canvas-materialize-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 175 | 交互 | `interaction/chip-grid-single-select-blackout` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | Segoe UI | Option one plan', 'Option two plan |
| 176 | 交互 | `interaction/chip-lift-to-user-pill` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | Segoe UI | JD', 'MK', 'CD', 'RL', 'AV', 'TP', |
| 177 | 交互 | `interaction/collab-cursor-moves` | **stretch** | 任意 | 有动画但结构待实测 | Lisa | Lucas |
| 178 | 交互 | `interaction/collab-cursor-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | Designer |
| 179 | 交互 | `interaction/command-palette-summon` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 180 | 交互 | `interaction/glass-pill-dictation-typing` | **stretch** | 1.7s | 归一化时间轴，推荐 1.7s，可变速±40%仍完整 | Segoe UI | Speak or type here |
| 181 | 交互 | `interaction/hashtag-to-pill-materialize` | **stretch** | 任意 | 有动画但结构待实测 | My favorite bands | Futura, 'Century Gothic', |
| 182 | 交互 | `interaction/input-trigger-moves` | **fixed** | 0.8s | 绝对帧编排到 24f，最佳 0.8s（可±15%） | Helvetica, Arial, sans-serif |
| 183 | 交互 | `interaction/input-trigger-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 184 | 交互 | `interaction/picker-carousel-feature-cycle` | **stretch** | 3.6s | 归一化时间轴，推荐 3.6s，可变速±40%仍完整 | Data Cleanup',
  'Direct Message',
   | Bat |
| 185 | 交互 | `interaction/segmented-thumb-hero` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 186 | 交互 | `interaction/theme-switch-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 187 | 交互 | `interaction/theme-switch-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 188 | 交互 | `interaction/type-and-filter` | **fixed** | 2.2s | 绝对帧编排到 67f，最佳 2.2s（可±15%） | — |
| 189 | 交互 | `interaction/voice-waveform-live` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 190 | 特效 | `effects/assemble-then-type-flyin` | **stretch** | 5.2s | 归一化时间轴，推荐 5.2s，可变速±40%仍完整 | SF Mono',Menlo,Consolas,monospace | Georgia,' |
| 191 | 特效 | `effects/aurora-bloom-bg-flip` | **stretch** | 5.2s | 归一化时间轴，推荐 5.2s，可变速±40%仍完整 | For many years |
| 192 | 特效 | `effects/brand-frame-snap` | **stretch** | 任意 | 有动画但结构待实测 | DESIGN | DEV MODE |
| 193 | 特效 | `effects/dashboard-glow-highlight-pill` | **stretch** | 2.0s | 归一化时间轴，推荐 2.0s，可变速±40%仍完整 | Ready. | Balances', 'Order History',  |
| 194 | 特效 | `effects/fui-hud-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 195 | 特效 | `effects/fui-hud-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 196 | 特效 | `effects/glow-flyline-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 197 | 特效 | `effects/glow-flyline-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 198 | 特效 | `effects/glow-flyline-moves` | **fixed** | 4.0s | 绝对帧编排到 120f，最佳 4.0s（可±15%） | — |
| 199 | 特效 | `effects/icon-performance-moves` | **fixed** | 2.4s | 绝对帧编排到 72f，最佳 2.4s（可±15%） | Helvetica, Arial, sans-serif |
| 200 | 特效 | `effects/icon-performance-moves` | **stretch** | 任意 | 有动画但结构待实测 | Deployed | Helvetica, Arial, sans-serif |
| 201 | 特效 | `effects/impact-feedback` | **stretch** | 任意 | 有动画但结构待实测 | IMPACT |
| 202 | 特效 | `effects/impact-feedback` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif |
| 203 | 特效 | `effects/light-play-moves` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | Helvetica, Ari |
| 204 | 特效 | `effects/light-play-moves` | **fixed** | 2.3s | 绝对帧编排到 68f，最佳 2.3s（可±15%） | Helvetica, Arial, sans-serif |
| 205 | 特效 | `effects/light-play-moves` | **stretch** | 任意 | 有动画但结构待实测 | — |
| 206 | 特效 | `effects/line-boil` | **stretch** | 任意 | 有动画但结构待实测 | ALIVE | Helvetica, Arial, sans-serif |
| 207 | 特效 | `effects/radial-ripple-phone-chips` | **stretch** | 5.6s | 归一化时间轴，推荐 5.6s，可变速±40%仍完整 | — |
| 208 | 特效 | `effects/riso-print-hits` | **stretch** | 任意 | 有动画但结构待实测 | Helvetica, Arial, sans-serif | ON THE BEAT |
| 209 | 特效 | `effects/riso-print-hits` | **fixed** | 0.7s | 绝对帧编排到 20f，最佳 0.7s（可±15%） | Helvetica, Arial, sans-serif | IMPACT |
| 210 | 特效 | `effects/scan-bracket-sweep` | **stretch** | 5.0s | 归一化时间轴，推荐 5.0s，可变速±40%仍完整 | — |
| 211 | 特效 | `effects/scanline-annotate-focus` | **stretch** | 4.6s | 归一化时间轴，推荐 4.6s，可变速±40%仍完整 | SF Mono',Menlo,Consolas,monospace | Georgia,' |
| 212 | 特效 | `effects/scanline-assemble-flyin` | **stretch** | 4.6s | 归一化时间轴，推荐 4.6s，可变速±40%仍完整 | SF Mono',Menlo,Consolas,monospace | Georgia,' |
| 213 | 特效 | `effects/slam-entrance-moves` | **stretch** | 任意 | 有动画但结构待实测 | IMPACT BURST KIT |
| 214 | 特效 | `effects/slam-entrance-moves` | **fixed** | 0.7s | 绝对帧编排到 22f，最佳 0.7s（可±15%） | KANADA PERSPECTIVE SNAP |
| 215 | 特效 | `effects/slam-entrance-moves` | **fixed** | 0.4s | 绝对帧编排到 11f，最佳 0.4s（可±15%） | SCORE SLAM | Helvetica, Arial, sans-serif |
| 216 | 特效 | `effects/spotlight-sweep-moves` | **fixed** | 3.3s | 绝对帧编排到 100f，最佳 3.3s（可±15%） | Avenir Next | Helvetica Neue |
| 217 | 特效 | `effects/spotlight-sweep-moves` | **fixed** | 4.4s | 绝对帧编排到 132f，最佳 4.4s（可±15%） | — |
| 218 | 特效 | `effects/spotlight-sweep-moves` | **fixed** | 4.4s | 绝对帧编排到 132f，最佳 4.4s（可±15%） | — |

## Fixed 模板（绝对帧，需用最佳时长）（70 个）
- `rhythm/spectrum-morph-ui` → 0.3s （LAUNCH WEEK | Helvetica, Arial, sans-serif）
- `ui-entrance/element-body-moves` → 0.3s （AXIAL STRETCH）
- `typography/gradient-word-sweep` → 0.4s （Avenir Next | Helvetica Neue）
- `effects/slam-entrance-moves` → 0.4s （SCORE SLAM | Helvetica, Arial, sans-serif）
- `data/particle-celebrate-hits` → 0.5s （CONFETTI CROSSFIRE | Helvetica, Arial, sans-s）
- `ui-entrance/document-typewriter-reveal` → 0.5s （Jackie's Download）
- `interaction/autolayout-gap-dial` → 0.5s （Helvetica, Arial, sans-serif | Helvetica, Ari）
- `data/gauge-readout-moves` → 0.7s （Helvetica, Arial, sans-serif | Helvetica, Ari）
- `effects/riso-print-hits` → 0.7s （Helvetica, Arial, sans-serif | IMPACT）
- `effects/slam-entrance-moves` → 0.7s （KANADA PERSPECTIVE SNAP）
- `interaction/input-trigger-moves` → 0.8s （Helvetica, Arial, sans-serif）
- `typography/paper-title-card` → 1.1s （Times New Roman | All）
- `camera/crash-zoom-punch` → 1.3s 
- `rhythm/smear-multiples` → 1.3s （SMEAR MULTIPLES）
- `typography/marker-underline-title` → 1.4s （Helvetica Neue）
- `transition/shot-transitions` → 1.4s 
- `transition/shot-transitions` → 1.4s 
- `camera/crash-zoom-punch` → 1.6s 
- `transition/shot-transitions` → 1.7s 
- `transition/page-turn-transitions` → 1.8s （BARN DOOR SPLIT）
- `typography/type-assembly-moves` → 1.9s （BREATHE | BREATHE）
- `transition/tear-streak-transitions` → 2.1s 
- `interaction/type-and-filter` → 2.2s 
- `transition/page-turn-transitions` → 2.3s （CUBE ROTATE）
- `ui-entrance/morph-from-primitive` → 2.3s 
- `effects/light-play-moves` → 2.3s （Helvetica, Arial, sans-serif）
- `transition/shot-transitions` → 2.4s （Scene B）
- `effects/icon-performance-moves` → 2.4s （Helvetica, Arial, sans-serif）
- `transition/color-block-step-wipe` → 2.6s 
- `transition/shot-transitions` → 2.6s （Times New Roman | Every）
- `ui-entrance/list-stack-press` → 2.6s 
- `typography/cel-flash-stomp` → 2.7s （SHIP | FASTER）
- `typography/type-assembly-moves` → 2.7s （GROWTH ALL THE WAY | TEXT ON PATH）
- `outro/outro-group-photo-launch` → 2.7s （Times New Roman | AI Foundation Lab）
- `data/odometer-digit-roll` → 2.8s （ODOMETER DIGIT ROLL | Helvetica, Arial, sans-）
- `transition/shot-transitions` → 2.8s 
- `rhythm/speed-ramp-freeze` → 2.8s 
- `ui-entrance/draw-svg-trace` → 2.9s （DRAW SVG TRACE）
- `ui-entrance/runway-ground-skim` → 3.1s （Helvetica, Arial, sans-serif | Creative Refre）
- `data/gauge-readout-moves` → 3.2s （Helvetica, Arial, sans-serif | Helvetica, Ari）
- `transition/transition-hidden-cut` → 3.2s （Next Page）
- `transition/wipe-transitions` → 3.2s 
- `camera/steep-tilt-glide` → 3.3s （Helvetica, Arial, sans-serif | Widget brainst）
- `transition/print-texture-transitions` → 3.3s （BEFORE | BEFORE）
- `ui-entrance/integration-hub-map` → 3.3s （Avenir Next | Helvetica Neue）
- `ui-entrance/neon-frame-forerun` → 3.3s 
- `effects/spotlight-sweep-moves` → 3.3s （Avenir Next | Helvetica Neue）
- `typography/brand-ink-open` → 3.5s （Times New Roman | AI Foundation Lab）
- `typography/type-assembly-moves` → 3.5s （ASSEMBLE | ASSEMBLE）
- `rhythm/speed-ramp-freeze` → 3.5s （SourceGraphic）
- `rhythm/trailer-grammar-moves` → 3.5s （Helvetica, Arial, sans-serif | SHIP）
- `camera/depth-layer-moves` → 3.7s 
- `camera/tension-camera-moves` → 3.7s （Helvetica, Arial, sans-serif）
- `opening/icon-field-colorize` → 3.7s 
- `transition/transition-travel` → 3.7s （DASH | DASH）
- `ui-entrance/wall-reveal-moves` → 3.9s 
- `ui-entrance/wall-reveal-moves` → 4.0s （Features）
- `interaction/ai-stream-response` → 4.0s （Indexed the workspace',  | Mapped the authent）
- `effects/glow-flyline-moves` → 4.0s 
- `transition/line-carry-transition` → 4.1s （Scene A | Scene B）
- `camera/depth-layer-moves` → 4.2s 
- `typography/type-rhythm-sync` → 4.3s （SHIP | FASTER）
- `camera/tension-camera-moves` → 4.3s （Helvetica, Arial, sans-serif | BULLET TIME）
- `opening/spotlight-hero-card` → 4.3s （Times New Roman）
- `ui-entrance/neon-frame-orbit-drop` → 4.3s 
- `effects/spotlight-sweep-moves` → 4.4s 
- `effects/spotlight-sweep-moves` → 4.4s 
- `data/cycle-glass-node-morph` → 4.5s （Arial, sans-serif | SENSE）
- `opening/dataviz-landscape-open` → 5.3s （Menlo, ）
- `data/ring-diagram-annotation-reveal` → 6.2s （Arial, sans-serif | Arial, sans-serif）

## Loop 模板（金句/氛围）（3 个）
- `typography/typewriter-moves`  （Menlo, Consolas, monospace）
- `rhythm/quad-split-parallel-scenes` → ≥2.1s （Tab One', 'Tab Two', 'Tab Three',  | Tab Five）
- `ui-entrance/page-waterfall-wall`  

## Stretch 模板推荐时长排序（长分镜变速首选）（70 个）
- `typography/countdown-arc-scatter` → 1.1s 
- `typography/outline-word-fill` → 2.5s （Faster | Helvetica Neue）
- `typography/scramble` → 3.2s （TEMPLATE MOTION DEMO | SF Mono）
- `typography/blur-slide` → 3.8s （Your headline goes here）
- `typography/brace-expand` → 3.8s 
- `typography/typing-code-block` → 4.6s （SF Mono | LINE FADE-IN）
- `typography/pill-chip-slot-cycle-handled` → 5.0s （Sales | Workflow）
- `typography/glitch-cycle` → 5.6s （INITIALIZING', 'LOADING ASSETS',  | READY TO ）
- `typography/flying-words` → 6.0s （Motion', 'Layout', 'Camera', 'Stagger',  | Be）
- `typography/lead-word-zoom-assemble`  （Introducing Lumen Deck | Lumen）
- `typography/text-column-converge`  （NEW RAYCAST | LAUNCHER DESIGN）
- `typography/type-entrance-moves`  （GRAVITY | GRAVITY）
- `typography/vertical-word-roll-blur-cycle` → 5.0s （Apps', 'Teams', 'Data', 'Everyone）
- `typography/word-relay-filmstrip`  （Computer | Didot）
- `outro/grain-dissolve` → 2.0s （ACME | SourceGraphic）
- `data/hatch-depth` → 4.4s （SF Mono | SF Mono）
- `outro/logo-shrink-wordmark-lockup` → 4.4s （BRAND | Helvetica Neue',sans-serif）
- `data/counter-confetti` → 4.6s （Segoe UI',sans-serif）
- `opening/fracture` → 5.2s 
- `data/avatar-grid-radial-build-colorize` → 5.6s （VS', 'KJ', 'EM', 'AL', 'TR', 'MN', 'BQ',  | R）
- `typography/word-relay-geometry` → 6.0s （Faster | Better）
- `camera/basic-3d-scene` → 6.0s （Position the idea | Rotate the view）
- `camera/cursor-flyover` → 6.0s （Overview', 'Traffic', 'Revenue', 'Cohorts | A）
- `camera/terminal-3d` → 6.0s 
- `data/chart-live-moves`  （Total customers | Helvetica, Arial, sans-seri）
- `data/scroll-brake-moves`  （Helvetica, Arial, sans-serif）
- `opening/letterspace-materialize`  （SUPERHUMAN）
- `opening/magician-card-flourish`  
- `opening/orbit-ring-title-open`  （VIDEO-SHOTCRAFT | PingFang SC）
- `outro/ui-strip-away-outro`  （Helvetica, Arial, sans-serif | Helvetica, Ari）
- `transition/bottom-push-stack-wipe`  
- `transition/card-flip-reveal`  （Helvetica, Arial, sans-serif | CARD FLIP REVE）
- `transition/cube-navigation` → 6.0s （OVERVIEW | METRICS）
- `transition/gradient-transition` → 6.0s （LINEAR | RADIAL）
- `transition/mosaic-reframe` → 6.0s 
- `transition/shot-transitions`  
- `transition/white-flash-logo-simplify-cut` → 3.6s （BRAND | Helvetica Neue',sans-serif）
- `rhythm/montage-rhythm-moves`  （CHAIN REACTION | CHAIN REACTION）
- `rhythm/panel-grid-moves`  
- `interaction/glass-pill-dictation-typing` → 1.7s （Segoe UI | Speak or type here）
- `effects/dashboard-glow-highlight-pill` → 2.0s （Ready. | Balances', 'Order History', ）
- `ui-entrance/list-reveal` → 3.6s （Dashboard', 'Projects', 'Analytics',  | Setti）
- `interaction/picker-carousel-feature-cycle` → 3.6s （Data Cleanup',
  'Direct Message',
   | Bat）
- `ui-entrance/radial-wave` → 3.8s 
- `ui-entrance/floating-glossy-label-pills` → 4.0s （Feature A | Feature B）
- `ui-entrance/card-stack` → 4.2s 
- `effects/scanline-annotate-focus` → 4.6s （SF Mono',Menlo,Consolas,monospace | Georgia,'）
- `effects/scanline-assemble-flyin` → 4.6s （SF Mono',Menlo,Consolas,monospace | Georgia,'）
- `ui-entrance/research-card-stack-scroll` → 4.8s （SF Pro Text | PingFang SC）
- `ui-entrance/product-card-progressive-assemble` → 5.0s （Placeholder copy for  | Second highlight）
- `ui-entrance/value-stagger-gradient` → 5.0s （SF Mono）
- `interaction/chip-grid-single-select-blackout` → 5.0s （Segoe UI | Option one plan', 'Option two plan）
- `interaction/chip-lift-to-user-pill` → 5.0s （Segoe UI | JD', 'MK', 'CD', 'RL', 'AV', 'TP',）
- `effects/scan-bracket-sweep` → 5.0s 
- `ui-entrance/avatar-bracket-carousel` → 5.2s （Designer | Support）
- `effects/assemble-then-type-flyin` → 5.2s （SF Mono',Menlo,Consolas,monospace | Georgia,'）
- `ui-entrance/bezier-source-converge-merge` → 5.6s （Segoe UI | Four sources unified）
- `ui-entrance/carousel-3d` → 5.6s 
- `ui-entrance/cloner-depth-echo`  （CLONER DEPTH ECHO）
- `ui-entrance/deck-deal-flyin`  
- `ui-entrance/doc-park-left-pill-deal` → 5.8s （Segoe UI | Quick Start）
- `ui-entrance/paper-craft-moves`  
- `ui-entrance/platform-hinge-rise`  （Arial, sans-serif | Arial, sans-serif）
- `ui-entrance/row-embed`  
- `ui-entrance/svg-shape-morph` → 5.2s （SF Mono）
- `interaction/command-palette-summon`  
- `effects/aurora-bloom-bg-flip` → 5.2s （For many years）
- `effects/glow-flyline-moves`  
- `effects/icon-performance-moves`  （Deployed | Helvetica, Arial, sans-serif）
- `effects/radial-ripple-phone-chips` → 5.6s 
