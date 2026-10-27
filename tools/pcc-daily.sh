#!/bin/bash
# 政府標案得標：在使用者的 Mac 上跑——抓前一天的決標公告（或指定日期），推上 GitHub 分支，之後 GitHub Actions 會接著補成立日與資本額、自動合併進 main。
# 版本 390 起多了「今天跑過就不重跑」（記在 ~/Library/Application Support/chailease-work/pcc-last.txt），
# 所以可以交給 launchd 排成「登入／喚醒就跑」（tools/mac-schedule.sh install）；公司電腦（pcc-daily.ps1）同時跑也不會重複（cases.csv 去重）。
# 用法：bash tools/pcc-daily.sh                    （抓台灣的昨天；今天跑過就不重跑）
#       bash tools/pcc-daily.sh --force           （今天跑過也再跑一次）
#       bash tools/pcc-daily.sh 20261023          （抓指定日期）
#       bash tools/pcc-daily.sh 20261023 3        （從那天往回抓 3 天）
# 第一次要先 git clone 這個 repo、設好推送的權限（README「版本 378」有步驟）。
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # launchd 叫起來時 PATH 很短
FORCE=0; ARGS=()
for a in "$@"; do case "$a" in --force) FORCE=1 ;; *) ARGS+=("$a") ;; esac; done
STAMP_DIR="${CHAILEASE_STAMP_DIR:-$HOME/Library/Application Support/chailease-work}"
STAMP="$STAMP_DIR/pcc-last.txt"
TODAY="$(date +%Y-%m-%d)"
if [ "$FORCE" = 0 ] && [ -f "$STAMP" ] && [ "$(tr -d '[:space:]' < "$STAMP")" = "$TODAY" ]; then
  echo "今天抓過了（$TODAY），不重跑；要重跑加 --force"; exit 0
fi
# 剛登入／剛喚醒時網路可能還沒接上：最多等 2 分鐘，連不到就這次先不算（下次喚醒或半小時後再試）
for i in $(seq 1 12); do
  if curl -s -m 5 -o /dev/null https://github.com 2>/dev/null; then break; fi
  [ "$i" = 12 ] && { echo "網路還沒通，這次先不抓（之後會再試）"; exit 0; }
  sleep 10
done
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --rebase --autostash -q origin "$BRANCH"
OUT="$(python3 tools/fetch-pcc.py --date "${ARGS[0]:-}" --days "${ARGS[1]:-1}" | tee /dev/stderr)"
if grep -q "API 連不上" <<<"$OUT"; then git checkout -q -- leads/pcc; echo "標案 API 連不上，這次先不算（之後會再試）"; exit 0; fi
mkdir -p "$STAMP_DIR"
git add leads/pcc
if git diff --cached --quiet; then echo "沒有新資料，不用推"; echo "$TODAY" > "$STAMP"; exit 0; fi
git commit -q -m "政府標案得標名單：$TODAY"
git push -q origin "HEAD:$BRANCH"
echo "$TODAY" > "$STAMP"
echo "推上 $BRANCH 了；GitHub Actions 會接著補成立日與資本額、合併進 main"
