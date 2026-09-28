param(
  [string[]]$Path,
  [switch]$RunTests
)
$ErrorActionPreference = 'Stop'
$check = Join-Path $PSScriptRoot 'check-repo.ps1'
& $check -Mode checkpoint -Path $Path -RunTests:$RunTests
$code = $LASTEXITCODE
Write-Output "CHECKPOINT_AUDIT_EXIT=$code"
if ($code -ne 0) { exit $code }
Write-Output 'CHECKPOINT_READY: 可调用 safe-commit.ps1 形成本地 commit；不会自动 push。'
exit 0
