# 政府電子採購網 決標公告 可行性測試（pcc_test）

跟電推系統無關的一次性測試，不要併進網站或後台。

- 目的：試能不能自動抓「決標公告」（最近 7 天、前 20 筆、每筆進明細頁），看開放資料與網頁抓取哪個可行、哪個穩。
- 這個開發環境連不到政府網站，所以在 GitHub Actions 上跑（`.github/workflows/pcc-test.yml`，只手動觸發）。
- `probe_open_data.py`：查 data.gov.tw 與採購網有沒有決標的開放資料／API（只印標題、網址、欄位、筆數）。
- `scrape_awards.py`：Playwright（Python）到採購網決標公告查詢頁抓前 20 筆進明細，寫 `result.csv`（UTF-8 with BOM）。
  - 每次請求間隔 2～3 秒；看到驗證碼、登入、阻擋就停下來回報，不繞；欄位抓不到留空。
- 結果：`result.csv`、`run-log.txt`（流程記錄，只有筆數與欄位統計）。
