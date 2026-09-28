param(
  [ValidateSet('preflight','checkpoint')]
  [string]$Mode = 'preflight',
  [string[]]$Path,
  [switch]$RunTests
)

$ErrorActionPreference = 'Stop'
function Invoke-Git([string[]]$GitArgs) { & git @GitArgs 2>&1 }
function Normalize([string]$Value) {
  $normalized = $Value -replace '\\','/'
  if ($normalized.StartsWith('./')) { $normalized = $normalized.Substring(2) }
  return $normalized
}

try { $root = (Invoke-Git @('rev-parse','--show-toplevel') | Select-Object -Last 1).Trim() }
catch { Write-Output 'NOT_A_GIT_REPO'; exit 2 }
if (-not $root -or -not (Test-Path -LiteralPath $root)) { Write-Output 'NOT_A_GIT_REPO'; exit 2 }
Set-Location -LiteralPath $root

$branchLines = @(Invoke-Git @('branch','--show-current'))
$branch = if ($LASTEXITCODE -eq 0) { ([string]($branchLines | Select-Object -Last 1)).Trim() } else { '' }
$commitLines = @(Invoke-Git @('rev-parse','--short','HEAD'))
$commit = if ($LASTEXITCODE -eq 0) { ([string]($commitLines | Select-Object -Last 1)).Trim() } else { '(none)' }
$status = @(Invoke-Git @('status','--short')) | Where-Object { $_ -is [string] -and $_.Trim() }
$worktrees = @(Invoke-Git @('worktree','list','--porcelain'))
$allChanged = @(Invoke-Git @('diff','--name-only')) + @(Invoke-Git @('diff','--cached','--name-only')) + @(Invoke-Git @('ls-files','--others','--exclude-standard'))
$allChanged = @($allChanged | ForEach-Object { Normalize $_ } | Where-Object { $_ } | Sort-Object -Unique)
$selected = if ($Path) { @($Path | ForEach-Object { Normalize $_ }) } else { $allChanged }

Write-Output "ROOT=$root"
Write-Output "BRANCH=$branch"
Write-Output "COMMIT=$commit"
Write-Output "WORKTREE_COUNT=$(@($worktrees | Where-Object { $_ -like 'worktree *' }).Count)"
Write-Output "CHANGED_COUNT=$($allChanged.Count)"
if ($allChanged.Count) { Write-Output 'CHANGED_FILES:'; $allChanged | ForEach-Object { Write-Output "- $_" } }

$issues = [System.Collections.Generic.List[string]]::new()
$mainLike = $branch -in @('main','master','trunk')
if ($Mode -eq 'preflight' -and $mainLike -and $allChanged.Count -gt 0) { $issues.Add('WORKTREE_RECOMMENDED: 主分支已有未提交修改') }
if ($Mode -eq 'checkpoint' -and $selected.Count -eq 0) { $issues.Add('NEEDS_FIX: 没有提供待 checkpoint 的精确文件') }

$dangerName = '(?i)(^|/)(\.env($|\.)|.*(secret|credential|password|token|apikey|api-key|private[-_]?key).*|id_rsa|.*\.(pem|key|p12|pfx)$)'
$artifactName = '(?i)(^|/)(node_modules|dist|build|coverage|\.cache|tmp|temp|logs?)(/|$)|(^|/).+\.(log|tmp)$'
foreach ($file in @($selected | Where-Object { $_ })) {
  if ($file -match $dangerName) { $issues.Add("NEEDS_FIX: 可能的敏感文件 $file") }
  if ($file -match $artifactName) { $issues.Add("NEEDS_FIX: 可能的缓存/构建/日志文件 $file") }
}
$diffText = ((Invoke-Git @('diff','--no-ext-diff','--unified=0')) -join "`n")
$stagedText = ((Invoke-Git @('diff','--cached','--no-ext-diff','--unified=0')) -join "`n")
$secretPatterns = '(?i)(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'
if (($diffText -match $secretPatterns) -or ($stagedText -match $secretPatterns)) { $issues.Add('NEEDS_FIX: diff 中疑似包含密钥、Token 或私钥') }

$topDirs = @($selected | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique)
if ($Mode -eq 'checkpoint' -and (($selected.Count -gt 30) -or ($topDirs.Count -gt 4))) { $issues.Add('NEEDS_SPLIT: 修改文件过多或跨越多个顶层目录') }

if ($RunTests) {
  $pkg = Join-Path $root 'package.json'
  if (Test-Path -LiteralPath $pkg) {
    try {
      $json = Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json
      if ($json.scripts.test) {
        Write-Output 'TEST_COMMAND=npm run test'
        & npm run test
        if ($LASTEXITCODE -ne 0) { $issues.Add("NEEDS_FIX: npm run test 退出码 $LASTEXITCODE") }
      } else { Write-Output 'TEST_COMMAND=none(package.json 未定义 test)' }
    } catch { $issues.Add("NEEDS_FIX: 无法读取 package.json 或运行测试：$($_.Exception.Message)") }
  } else { Write-Output 'TEST_COMMAND=none(package.json 不存在)' }
}

if ($issues.Count) {
  $issues | ForEach-Object { Write-Output $_ }
  if ($issues -match '^WORKTREE_RECOMMENDED') { Write-Output 'WORKTREE_RECOMMENDED'; exit 12 }
  if ($issues -match '^NEEDS_SPLIT') { Write-Output 'NEEDS_SPLIT'; exit 11 }
  Write-Output 'NEEDS_FIX'; exit 10
}
Write-Output 'SAFE_TO_COMMIT'; exit 0
