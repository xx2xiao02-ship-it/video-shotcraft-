# 模式 C：AIGC 素材补足

模式 C 独立于模式 A、B。它只在镜头卡因为缺少图片、视频或多图素材而不可行时，生成补足素材，然后重新执行候选匹配。

## 当前状态

- `dryRun` 默认开启，不调用外部生成接口。
- Veo Skill 固定来源于 `jlouage/Veo-Claude-Skills`。
- Image2 Skill 固定来源于 `fengfengzhidao/codex-image2-skill`，当前只保留 Windows x64 执行文件。
- `Omni2` 仅作为研究候选记录，不进入生产调用链。

## 阶段

```text
card candidates → generation queue → verify/normalize → card rematch
```

运行候选素材补足的 dry-run：

```powershell
node director/mode-c/mode-c-dispatcher.mjs dry-run <talkcraft-project>
```

这会写入项目内的 `mode-c/manifests/generation-queue.json` 和 `mode-c/manifests/rematch-plan.json`，只生成任务清单与调用计划，不产生费用。

无付费验收可继续执行本地 Mock 素材回填，再执行校验与重新选卡计划：

```powershell
node director/mode-c/mode-c-dispatcher.mjs mock <talkcraft-project>
node director/mode-c/mode-c-dispatcher.mjs verify <talkcraft-project>
node director/mode-c/mode-c-dispatcher.mjs rematch <talkcraft-project>
```

任务状态统一使用：`pending_generation`、`generating`、`generated`、`verifying`、`verified`、`generation_failed`、`blocked`、`card_rematch`。

主操作台 C 按钮只负责选择模式；点击“开始生成视频”后会把 `visualMode=C` 送入 `/api/mode-c/create`。服务端提供：

- `GET /api/mode-c/config`
- `POST /api/mode-c/create`
- `POST /api/mode-c/dry-run`
- `POST /api/mode-c/mock`
- `POST /api/mode-c/verify`
- `POST /api/mode-c/rematch-plan`
- `POST /api/mode-c/rematch`

真实生成仍需显式关闭 `dryRun`，并通过费用确认；任何 API Key 都只能放在本机环境变量中。
