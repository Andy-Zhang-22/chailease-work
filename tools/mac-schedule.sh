#!/bin/bash
# Mac 的「登入／喚醒就抓標案」排程（版本 390）：用 launchd 的 LaunchAgent 叫 tools/pcc-daily.sh。
#   登入就跑（RunAtLoad）、之後每 30 分鐘再叫一次（StartInterval；Mac 睡著時錯過的，醒來會補一次），
#   pcc-daily.sh 自己記「今天跑過」就不重跑，所以實際一天只抓一次，醒來後最多半小時內。
# 用法：bash tools/mac-schedule.sh install   （裝好或更新；repo 搬家就再跑一次）
#       bash tools/mac-schedule.sh remove    （關掉）
#       bash tools/mac-schedule.sh status    （看有沒有在排程裡、上次的輸出）
# 記錄在 ~/Library/Logs/chailease-work/pcc-daily.log。104 徵才那段要用 Claude 跟 Chrome，不走這裡（看 tools/hiring-104.py 檔頭）。
set -euo pipefail
LABEL="com.chailease-work.pcc-daily"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/chailease-work"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UID_="$(id -u)"
case "${1:-}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$ROOT/tools/pcc-daily.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>1800</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/pcc-daily.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/pcc-daily.log</string>
</dict></plist>
PL
    launchctl bootstrap "gui/$UID_" "$PLIST"
    echo "裝好了：登入／喚醒後最多半小時內抓一次標案，今天抓過就不重跑。記錄在 $LOG_DIR/pcc-daily.log" ;;
  remove)
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "關掉了（Mac 不再自動抓標案；要手動抓就 bash tools/pcc-daily.sh）" ;;
  status)
    if launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1; then echo "在排程裡（$PLIST）"; else echo "沒有排程"; fi
    [ -f "$LOG_DIR/pcc-daily.log" ] && { echo "--- 最近的記錄 ---"; tail -n 5 "$LOG_DIR/pcc-daily.log"; } || true ;;
  *) echo "用法：bash tools/mac-schedule.sh install|remove|status"; exit 2 ;;
esac
