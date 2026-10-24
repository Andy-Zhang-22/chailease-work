#!/bin/bash
# 政府標案得標：在使用者的 Mac 上跑——抓前一天的決標公告（或指定日期），推上 GitHub 分支，之後 GitHub Actions 會接著補成立日與資本額。
# 用法：bash tools/pcc-daily.sh            （抓台灣的昨天）
#       bash tools/pcc-daily.sh 20261023   （抓指定日期）
#       bash tools/pcc-daily.sh 20261023 3 （從那天往回抓 3 天）
# 第一次要先 git clone 這個 repo、設好推送的權限（README「版本 378」有步驟）。
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --rebase -q origin "$BRANCH"
python3 tools/fetch-pcc.py --date "${1:-}" --days "${2:-1}"
git add leads/pcc
if git diff --cached --quiet; then echo "沒有新資料，不用推"; exit 0; fi
git commit -q -m "政府標案得標名單：$(date +%Y-%m-%d)"
git push -q origin "HEAD:$BRANCH"
echo "推上 $BRANCH 了；GitHub Actions 會接著補成立日與資本額"
