# 政府電子採購網 決標公告 可行性測試（pcc_test）

跟電推系統無關的一次性測試，不要併進網站或後台。2026/10/24 做了六輪探路，結論在下面。

## 結論（2026/10/24）

**從雲端（GitHub Actions，美國 IP）抓採購網：不可行。**
- `web.pcc.gov.tw` 的所有頁面（首頁、決標查詢頁、`tps/openDataApi/*`、`peems/*`）都回「The URL you requested has been blocked」（HTTP 500），是境外 IP 封鎖，不是驗證碜，不能也不該繞。
- 所以採購網本身的開放資料 API（下面列的）也只有台灣的機器連得到。

**開放資料平臺（data.gov.tw）有什麼：**
| 資料集 | 來源 | 更新 | 內容 | 從雲端 |
|---|---|---|---|---|
| 6155 決標金額前 5 大之決標公告 | `web.pcc.gov.tw/tps/openDataApi/atmTop5`（JSON） | 每日 | 只有每天金額前 5 大 | 擋 |
| 165150 前 1 年度公告金額以上採購限制性決標公告 | `web.pcc.gov.tw/tps/openDataApi/lyOpenData?runType=3` | 每年 | 只有限制性招標 | 擋 |
| 7264 與政府機關有巨額採購且在履約期間之廠商名單 | `web.pcc.gov.tw/peems/.../downLoadOpenData`（XML） | 每日 | 近一週巨額採購（上億）的得標廠商 | 擋 |
| 16371 決標公告 | `pms.sme.gov.tw/PMSApi/v2/ODT/ATM`（JSON） | 不定期 | 只是中小企業署自己的委辦計畫，1,022 筆、5 欄（計畫年度、案號、計畫名稱、決標金額、投標廠商），沒統編、沒地址、不能依日期篩 | 通 |
| 近半年 GPA 決標資料集、水利署招標及決標訊息 等 | 各機關自己的 | — | 只涵蓋單一機關或 GPA 案 | 未測 |

→ **沒有「全國所有決標公告」的開放資料**；全國決標只在採購網的查詢頁與它的 openDataApi 裡，都要台灣 IP。

**網頁抓取（決標查詢頁 → 明細）：還沒驗證。** 從雲端連不到查詢頁，看不到表單結構、分頁方式、有沒有驗證碼。要在台灣的機器上跑一次 `scrape_awards.py`（目前是探路版：只印表單欄位與連結，不抓內容）才知道。

**每天排程會遇到的問題：**
1. GitHub Actions 整個不能用（境外封鎖）。要在台灣跑：自己的電腦排工作排程、或台灣的 VPS。
2. 採購網查詢頁一般有驗證碼與筆數上限（傳聞每次查詢最多 100 筆、要分頁），探路後才能確認。
3. 若改用採購網的 openDataApi（atmTop5 等），每日只有前 5 大，不是全部決標。

## 檔案
- `probe_sources.py`：第六輪探路——用 data.gov.tw 的搜尋 API（POST `/api/front/dataset/list`，body `bool:[{fulltext:{value:…}}]`）找決標資料集，直接打來源看欄位、筆數、能否依日期篩。只印結構。
- `probe_open_data.py`：前五輪的探路（錄下搜尋頁背後的 API；採購網境外封鎖的證據）。
- `scrape_awards.py`：Playwright（Python）探路版——打開採購網首頁與決標查詢頁候選網址，印表單欄位、連結；看到驗證碼／登入／阻擋就停。
- `run-log.txt`：最近一次在 Actions 跑的記錄（機器人推回來）。
- `.github/workflows/pcc-test.yml`：只手動觸發；`step=probe` 跑來源探路，`step=scrape` 跑網頁（從 GitHub 會被擋）。

## 在自己電腦（台灣 IP）跑網頁探路
```
pip install playwright && playwright install chromium
python pcc_test/scrape_awards.py
```
把印出來的表單欄位與連結貼給 Claude（只有結構、沒有標案內容），就能照結構把 `scrape_awards.py` 補成真的抓取：最近 7 天、前 20 筆、每筆進明細、每家得標廠商一列，寫 `result.csv`（UTF-8 with BOM）。
規則不變：每次請求間隔 2～3 秒；驗證碼、登入、阻擋就停；欄位抓不到留空。
