# 政府標案得標：在公司的 Windows 電腦上跑——抓前一天的決標公告，推上 GitHub 分支，之後 GitHub Actions 會接著補成立日與資本額、自動合併進 main。
# 跟 Mac 的 tools/pcc-daily.sh 做一樣的事，多了「今天跑過就不重跑」，所以可以排成「登入就跑」。
# 版本 392 起照 Mac 版 390：剛登入網路還沒通就等（最多 2 分鐘）、標案 API 連不上就把 leads/pcc 還原、不寫記號、不推，當天之後再跑會重試。
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
$stamp = if ($env:CHAILEASE_STAMP_DIR) { Join-Path $env:CHAILEASE_STAMP_DIR 'chailease-pcc-last.txt' } else { Join-Path $env:LOCALAPPDATA 'chailease-pcc-last.txt' }
$today = Get-Date -Format 'yyyy-MM-dd'
if (-not $Force -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $today)) { Write-Host "今天抓過了（$today），不重跑；要重跑加 -Force"; exit 0 }
# 剛登入時網路可能還沒接上：最多等 2 分鐘，連不到就這次先不算（下次登入再試）
$online = $false
for ($i = 1; $i -le 12; $i++) {
  try { $null = Invoke-WebRequest -Uri 'https://github.com' -Method Head -UseBasicParsing -TimeoutSec 5; $online = $true; break } catch { Start-Sleep -Seconds 10 }
}
if (-not $online) { Write-Host '網路還沒通，這次先不抓（之後會再試）'; exit 0 }
$python = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } elseif (Get-Command py -ErrorAction SilentlyContinue) { 'py -3' } else { throw '找不到 Python，請先安裝 Python 3（安裝時勾 Add to PATH）' }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
git pull --rebase --autostash -q origin $branch
if ($LASTEXITCODE -ne 0) { throw 'git pull 失敗（網路或登入問題）' }
# 抓取的輸出照樣印出來，同時留一份判斷「API 連不上」（fetch-pcc.py 那天抓不到就會印這句；進度列走 stderr，直接到畫面）
$out = Invoke-Expression "$python tools\fetch-pcc.py --date `"$Date`" --days $Days" | ForEach-Object { Write-Host $_; $_ }
if ($LASTEXITCODE -ne 0) { git checkout -q -- leads/pcc; throw '抓取失敗（看上面的訊息）' }
if (($out -join "`n") -match 'API 連不上') { git checkout -q -- leads/pcc; Write-Host '標案 API 連不上，這次先不算（之後會再試）'; exit 0 }
git add leads/pcc
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host '沒有新資料，不用推'; Set-Content $stamp $today; exit 0 }
git commit -q -m "政府標案得標名單：$today"
git push -q origin "HEAD:$branch"
if ($LASTEXITCODE -ne 0) { throw 'git push 失敗（第一次會要你登入 GitHub；之後多半是網路）' }
Set-Content $stamp $today
Write-Host "推上 $branch 了；GitHub Actions 會接著補成立日與資本額、合併進 main"
