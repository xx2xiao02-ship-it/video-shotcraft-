---
name: b-mode-post-delivery-fix
description: 交付后修复迭代工作流：成片交付后用户反馈或复检发现 P0/P1（文字贴边、暗底字色、动效抖动等）时，在 run 的 qa/ 下建立修复迭代，经快照→修复→preflight→布局审计→逐拍修正→独立视觉复核→绑定校验→底片替换导出，产出修复版成片。不重新 TTS、不覆盖原成片、局部复核不替代全片验收。
---

# B 模式交付后修复迭代（post-delivery fix loop）

适用于已走完 TalkCraft ①–⑧ 阶段并交付的成片。参照成功案例：run `17c3017d-136e-45bf-9f11-ed9db11761c4`
（`.isolated/b-mode-backend-rebuild-clone`），迭代 `talkcraft/qa/text-safe-color-fix-20261010/`，
产出 `final-text-safe-color-v3.mp4`（54 拍、173.8s，仅替换 11 个受影响拍、原音轨直拷、原片 SHA-256 校验保留）。

## 阶段与验收门

1. **定位与建目录**：把用户反馈映射到具体拍（card 类型 / 拍 id / 帧区间）；新建
   `talkcraft/qa/<主题>-fix-<YYYYMMDD>/` 作为本次迭代的工作与证据目录。
2. **快照**：所有将被修改的源码、组件、组装脚本先拷贝进 `before/`，供回退与前后对比。
3. **修复实施**：只改受影响的组件排版/颜色/逻辑；**同步修改组装脚本**，防止下次组装把修复冲掉；
   不动音轨、时长与既有入场时间语义。
4. **上游 preflight 重跑**：保存 `preflight.log`；PASS 里的 WARN 如实列出，不得称为全链路验收。
5. **布局审计**：`node director/layout-audit.mjs --project <remotion> --work <迭代目录> --cards <受影响卡型>`
   → `layout-audit.json` 必须零 safeViolations。审计使用画布相对坐标并等待自适应排版稳定后采样；
   隐藏词、有意裁切滚动的元素与正文分开检查。模板需支持 `auditLayout` 埋点。
6. **逐拍修正渲染 + 整片导出**：`node director/render-revised-film.mjs --project <remotion> --base <底片> \
   --audit <layout-audit.json> --cards <卡型> --out <final-<主题>-v<N>.mp4> --work <迭代目录>`。
   工具内置门禁：审计未通过拒绝导出、拒绝覆盖既有输出、原底片 SHA-256 不可变校验、完整解码、
   帧数/分辨率/音轨校验；导出策略为 **最新合格底片 + 仅替换受影响拍 + 原音轨直拷**。
7. **独立视觉复核**：由未参与修复的会话对指定关键帧、抽帧网格（contact sheet）与修正视频完整解码
   出具 `independent-visual-review.md`：P0/P1 判定、证据（坐标/像素/时长）、明确的边界声明
   （局部复核 ≠ 全片审片 ≠ 用户验收）。
8. **绑定校验**：重新生成并校验拍级源码/素材绑定（拍数、SHA-256），确认**先期批准记录保留、未迁移**——
   修正不等于用户接受新片。
9. **回归**：涉及源码的改动跑 JS 语法检查与相关回归测试（如文字对比度回归）。

## 硬规则

- 不重新 TTS、不调用模型或付费服务、不覆盖原成片；一切付费/覆盖操作须用户单次授权。
- 修正版结果存证 `revised-film-result.json` 中 `userAcceptance` 恒为 `false`，只有用户验收后才置位。
- 中间版本（旧审核底片导出的预览）不作为最终推荐文件，交付物命名须能区分迭代版本。
- 独立局部审查、布局审计、preflight 都不能替代全片 QA 与用户验收；非阻断意见（留白、节奏）如实列出。
- 磁盘不足时把临时目录/打包产物移到 E 盘任务目录继续，不删除历史文件。
- 修复完成后 Git 按精确文件路径纳入版本控制（隔离工作区路径被父仓库忽略）。

## 关联工具

- `director/layout-audit.mjs`：布局审计（本次从案例固化）
- `director/render-revised-film.mjs`：底片替换导出（本次从案例固化），`planPatchTimeline` 有单元测试
- 全片首次制作流程见 `director/AGENTS.md` ①–⑧；本 skill 只覆盖交付后修复迭代。
