---
name: git-version-guard
description: Audit a Git project before changes and checkpoints, detect unsafe or mixed modifications, select the right validation, and create exact-path local commits without pushing, merging, or deleting history.
---

# Git Version Guard

这是当前项目内的版本治理 Skill。它适用于开始独立功能、修复、重构、合并前检查和任务收尾；重点是先审计代码状态，再决定能否继续、是否需要隔离、是否需要拆分，以及是否可以形成可回滚的本地 checkpoint。

## 强制流程

1. **修改前审计**
   - 运行 `scripts/check-repo.ps1 -Mode preflight`。
   - 核对仓库根目录、当前分支、当前 commit、未提交文件、所有 worktree 和主分支状态。
   - 如果主分支已有修改、目录可能被其他任务共用，或本次工作是较大的独立功能，输出 `WORKTREE_RECOMMENDED`，优先使用独立 branch + worktree；不要覆盖现有修改。

2. **实现期间保持边界**
   - 只修改当前任务需要的文件。
   - 保留用户已有修改、成功资产、历史链路和生产入口。
   - 不使用 `git add .`、`git add -A` 或通配符提交未知文件。
   - 不自动 push、merge、删除 branch/worktree 或覆盖远程历史。

3. **checkpoint 前审计**
   - 运行 `scripts/checkpoint.ps1 -Path <精确文件列表> -RunTests`。
   - 检查 unstaged/staged/untracked diff、修改范围、敏感内容、构建产物、测试命令和测试退出码。
   - 修改跨越多个无关功能、文件异常过多或存在无关变更时输出 `NEEDS_SPLIT`。
   - 测试失败、疑似泄露凭据、错误删除或其他阻断问题时输出 `NEEDS_FIX`。

4. **形成本地 checkpoint**
   - 只有审计状态为 `SAFE_TO_COMMIT` 时，才运行：
     `scripts/safe-commit.ps1 -Path <文件1>,<文件2> -Message "type(scope): outcome" -RunTests`
   - 脚本只暂存传入的精确文件并再次检查 staged diff，然后创建本地 commit。
   - 提交后检查 `git show --stat --summary HEAD` 和 `git status`；向用户说明 commit，推送仍需用户明确授权。

## 审计状态

每次审计必须明确输出一个主状态：

- `SAFE_TO_COMMIT`：范围明确、没有敏感内容、验证通过，可以形成本地 checkpoint。
- `NEEDS_FIX`：测试失败、凭据/临时产物风险、错误状态或其他必须先修复的问题。
- `NEEDS_SPLIT`：当前 diff 混合多个功能或无法作为独立回滚单元。
- `WORKTREE_RECOMMENDED`：现有目录有共享/主分支/脏工作区风险，应先隔离。
- `NOT_A_GIT_REPO`：当前目录不是 Git 仓库。

## 验证原则

优先读取 `package.json`、`pyproject.toml`、`Makefile`、`Cargo.toml`、`go.mod`、`README`、`AGENTS.md` 和已有脚本来确定最小有效测试。不能用语法检查、Mock、静态页面或单节点成功冒充完整链路验证；报告中分别说明已实现、已测试、外部验证和待用户验收。

详细的 PowerShell 审计和提交行为由本目录 `scripts/` 中的脚本实现；脚本只作用于当前仓库，不写死项目路径。
