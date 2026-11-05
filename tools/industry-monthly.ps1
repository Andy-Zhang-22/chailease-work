# 產業名單的備援：在公司的 Windows 電腦上跑——GitHub Actions 每月 14 日抓經濟部等的產業名單（monthly-industry.yml），
# 10/23～24 連四次被經濟部的下載網站擋（503），所以公司電腦（台灣 IP、每天開機）當備援：Actions 沒抓成，這台就抓、推上分支。
# 做法跟 tools/pcc-daily.ps1 一樣（等網路、更新 repo、抓、推），多了「什麼時候才該跑」：
#   - 每月 15 日起才跑（14 日先讓 Actions 試）；leads/industry/index.json 這個月已經抓過（Actions 成功）就不跑；
#   - 今天跑過（成功或失敗）就不重跑，記在 %LOCALAPPDATA%\chailease-industry-last.txt；失敗隔天登入再試。
#   - 每次跑在 %LOCALAPPDATA%\chailease-industry.log 留一行，出事看這裡。
# 用法（PowerShell）：  powershell -ExecutionPolicy Bypass -File tools\industry-monthly.ps1
#                      加 -Force 不管日期、不管這個月抓過沒，現在就抓一次（第一次試跑用）
# 要先裝 Node.js 22 以上（LTS）與 Git；設定步驟在 README「版本 402」。公司網路攔 HTTPS，Node 要加 --use-system-ca 用 Windows 的憑證庫（Node 22.15 起有）。
param([string]$Cities = '新北市,臺北市', [switch]$Force)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$dir = if ($env:CHAILEASE_STAMP_DIR) { $env:CHAILEASE_STAMP_DIR } else { $env:LOCALAPPDATA }
$stamp = Join-Path $dir 'chailease-industry-last.txt'
$log = Join-Path $dir 'chailease-industry.log'
$today = Get-Date -Format 'yyyy-MM-dd'
function Note([string]$m) { Write-Host $m; Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $m" -Encoding UTF8 }
if (-not $Force) {
  if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $today)) { Write-Host "今天跑過了（$today）；要重跑加 -Force"; exit 0 }
  if ((Get-Date).Day -lt 15) { Write-Host '每月 15 日起才跑（14 日先讓 GitHub Actions 抓）；現在就抓加 -Force'; exit 0 }
  try {
    $idx = Get-Content (Join-Path $root 'leads\industry\index.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $at = ([datetime]$idx.generatedAt).ToLocalTime()
    if ($at.ToString('yyyy-MM') -eq (Get-Date -Format 'yyyy-MM')) { Write-Host "這個月已經抓過了（$($at.ToString('MM/dd HH:mm'))，多半是 Actions 抓的），不用備援；要重抓加 -Force"; exit 0 }
  } catch { Write-Host '讀不到 leads/industry/index.json，當作還沒抓' }
}
# 剛登入時網路可能還沒接上：最多等 2 分鐘，連不到就這次先不算（下次登入再試）
$online = $false
for ($i = 1; $i -le 12; $i++) {
  try { $null = Invoke-WebRequest -Uri 'https://github.com' -Method Head -UseBasicParsing -TimeoutSec 5; $online = $true; break } catch { Start-Sleep -Seconds 10 }
}
if (-not $online) { Write-Host '網路還沒通，這次先不抓（之後會再試）'; exit 0 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Note '找不到 Node.js，請先安裝 Node.js 22（LTS）'; throw '找不到 Node.js' }
$major = [int]((node --version).Trim().TrimStart('v').Split('.')[0])
if ($major -lt 22) { Note "Node.js 要 22 以上（現在是 $(node --version)）"; throw 'Node.js 版本太舊' }
# 公司網路把 HTTPS 的憑證換成公司自己的 CA：Node 預設不信，加 --use-system-ca 改用 Windows 的憑證庫（跟瀏覽器同一套信任，不是關掉驗證）
$nodeOpt = @(); node --use-system-ca -e 0 2>$null; if ($LASTEXITCODE -eq 0) { $nodeOpt = @('--use-system-ca') } else { Write-Host '這版 Node 沒有 --use-system-ca（22.15 起才有）；公司網路攔 HTTPS 的話會抓不到，請更新 Node' }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
git pull --rebase --autostash -q origin $branch
if ($LASTEXITCODE -ne 0) { Note 'git pull 失敗（網路或登入問題）'; throw 'git pull 失敗' }
Set-Content $stamp $today    # 先記今天跑過：抓十幾分鐘，中途失敗也不要同一天一直重抓（隔天會再試）
& node @nodeOpt tools/fetch-industry.mjs --cities $Cities
if ($LASTEXITCODE -ne 0) { git checkout -q -- leads/industry; Note "抓取失敗（結束代碼 $LASTEXITCODE，看上面的訊息；明天登入會再試）"; exit 1 }
git add -A leads/industry
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Note '抓完沒有變動，不用推'; exit 0 }
git commit -q -m "產業名單：$today（公司電腦備援）"
git push -q origin "HEAD:$branch"
if ($LASTEXITCODE -ne 0) { Note 'git push 失敗（第一次會要你登入 GitHub；之後多半是網路）'; throw 'git push 失敗' }
Note "產業名單抓好、推上 $branch 了（等使用者說「合併」才進 main）"
