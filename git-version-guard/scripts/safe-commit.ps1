param(
  [Parameter(Mandatory=$true)] [string[]]$Path,
  [Parameter(Mandatory=$true)] [ValidateNotNullOrEmpty()] [string]$Message,
  [switch]$RunTests
)
$ErrorActionPreference = 'Stop'
function Normalize([string]$Value) {
  $normalized = $Value -replace '\\','/'
  if ($normalized.StartsWith('./')) { $normalized = $normalized.Substring(2) }
  return $normalized
}
if (-not $Path -or $Path.Count -eq 0) { Write-Error '必须提供精确文件列表'; exit 10 }
if ($Path | Where-Object { $_ -in @('.', '*', './', '.\') -or $_ -match '[*?]' }) { Write-Error '禁止使用目录通配符或 git add .'; exit 10 }
$check = Join-Path $PSScriptRoot 'check-repo.ps1'
& $check -Mode checkpoint -Path $Path -RunTests:$RunTests
if ($LASTEXITCODE -ne 0) { Write-Error '审计未通过，未执行提交'; exit $LASTEXITCODE }

$before = @(git diff --cached --name-only | ForEach-Object { $_ -replace '\\','/' } | Where-Object { $_ })
if ($before.Count) { Write-Error "提交前已有 staged 文件，请先单独处理：$($before -join ', ')"; exit 11 }

git add -- $Path
if ($LASTEXITCODE -ne 0) { Write-Error 'git add 指定文件失败'; exit 10 }
$staged = @(git diff --cached --name-only | ForEach-Object { $_ -replace '\\','/' } | Where-Object { $_ })
$expected = @($Path | ForEach-Object { Normalize $_ } | Sort-Object -Unique)
$actual = @($staged | Sort-Object -Unique)
if ((Compare-Object -ReferenceObject $expected -DifferenceObject $actual) -ne $null) {
  Write-Error "staged 文件与指定范围不一致。指定：$($expected -join ', ')；实际：$($actual -join ', ')"; exit 11
}
$secretPatterns = '(?i)(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'
$stagedDiff = (git diff --cached --no-ext-diff --unified=0) -join "`n"
if ($stagedDiff -match $secretPatterns) { Write-Error 'staged diff 疑似包含密钥或 Token，已停止提交'; exit 10 }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Error 'git commit 失败'; exit 10 }
Write-Output 'LOCAL_COMMIT_CREATED'
git show --stat --summary HEAD
git status --short --branch
Write-Output 'PUSH_NOT_PERFORMED'
