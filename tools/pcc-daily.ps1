# 政府標案得標：在公司的 Windows 電腦上跑——抓前一天的決標公告，推上 GitHub 分支，之後 GitHub Actions 會接著補成立日與資本額、自動合併進 main。
# 跟 Mac 的 tools/pcc-daily.sh 做一樣的事，多了「今天跑過就不重跑」，所以可以排成「登入就跑」。
# 用法（PowerShell）：  powershell -ExecutionPolicy Bypass -File tools\pcc-daily.ps1
#                      powershell -ExecutionPolicy Bypass -File tools\pcc-daily.ps1 -Date 20261023 -Days 3   （抓指定日期、往回幾天）
#                      加 -Force 今天跑過也再跑一次
# 第一次要先裝 Python 3 與 Git，git clone 這個 repo，第一次 push 會跳 GitHub 登入（Git Credential Manager）。設定步驟在 README「版本 389」。
param([string]$Date = '', [int]$Days = 1, [switch]$Force)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$stamp = Join-Path $env:LOCALAPPDATA 'chailease-pcc-last.txt'
$today = Get-Date -Format 'yyyy-MM-dd'
if (-not $Force -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $today)) { Write-Host "今天抓過了（$today），不重跑；要重跑加 -Force"; exit 0 }
$python = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } elseif (Get-Command py -ErrorAction SilentlyContinue) { 'py -3' } else { throw '找不到 Python，請先安裝 Python 3（安裝時勾 Add to PATH）' }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
git pull --rebase -q origin $branch
if ($LASTEXITCODE -ne 0) { throw 'git pull 失敗（網路或登入問題）' }
Invoke-Expression "$python tools\fetch-pcc.py --date `"$Date`" --days $Days"
if ($LASTEXITCODE -ne 0) { throw '抓取失敗（看上面的訊息）' }
git add leads/pcc
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host '沒有新資料，不用推'; Set-Content $stamp $today; exit 0 }
git commit -q -m "政府標案得標名單：$today"
git push -q origin "HEAD:$branch"
if ($LASTEXITCODE -ne 0) { throw 'git push 失敗（第一次會要你登入 GitHub；之後多半是網路）' }
Set-Content $stamp $today
Write-Host "推上 $branch 了；GitHub Actions 會接著補成立日與資本額、合併進 main"
