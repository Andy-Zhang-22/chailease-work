# 104 徵才查詢：探路（進行中）

使用者 10/25：「每天系統從後台挑選名單的公司名單，再進一步透過本機的對話窗去 104 篩選最近是否有徵才資訊，判斷公司是否仍為活躍中的公司」。

## 要確認的事（在 Mac 上跑 `probe_104.py`）
1. 從 Mac 連 104 的搜尋介面（`/jobs/search/list`）通不通、回 JSON 嗎、有沒有驗證碼。
2. 回傳每筆有哪些欄位：公司名（custName）、公司代號（custNo）、刊登日（appearDate）在不在。
3. 公司職缺頁（`/company/ajax/joblist/<custNo>`）通不通、有沒有 totalCount。
4. Google 雲端硬碟桌面版的同步檔在不在 `~/Library/CloudStorage/GoogleDrive-*/…/電話推廣名單-同步資料.json`，今天的新名單幾家。

## 規則
- 一家一次、間隔 2 秒、失敗重試 1 次；403／429／驗證碼就停，不繞。
- 只印筆數與欄位名，不印公司名、職缺內容。104 的內容不存、不轉貼。

## 結論（2026/10/25 在使用者 Mac 跑）

**用程式直接連 104（urllib、curl）：不通。** `/jobs/search/list` 回 HTTP 403，內容是 104 的「我突然壞掉了」錯誤頁（165 KB HTML），
從 Mac 的台灣 IP 也一樣；Claude 桌面 App 的內建瀏覽器同樣被擋（頁面開得起來，但列表 API 全回 403）。兩者都是 104 對自動化用戶端的封鎖，不繞。

**從使用者自己的 Chrome（Claude in Chrome 擴充功能）在 104 頁面內 fetch：通。** 2026/10/25 實測，9 個關鍵字 100 多頁、508 筆、0 次錯誤。
- **找公司 API（這條最合用）**：`GET /company/ajax/list?keyword=<公司名>&jobsource=index_s_cs&features=1&pageSize=18`，回 JSON `data[]`：
  `name`、`areaDesc`、`industryDesc`、`capitalDesc`（「資本額1億8000萬元」）、`employeeCountDesc`（「員工數46人」）、**`jobCount`（目前職缺數）**、`encodedCustNo`、`jobCats`、`tagNames`；`metadata.pagination.total`。
  一家 0.1～0.5 秒。查無回 `total 0`。用全名比對 `name`，但 104 的名字後面可能帶括號品牌（「台灣積體電路製造股份有限公司(台積電)」），比對前要去掉結尾括號。
  要「公司是否活躍」看 `jobCount` 就夠，不用再進職缺頁。
- 找職缺 API：`GET /jobs/search/api/jobs?jobsource=index_s&keyword=<kw>&mode=s&order=15&page=<p>&pagesize=20`，回 `data[]`（jobName、custName、custNo、jobAddrNoDesc、appearDate、coIndustryDesc、salaryLow/High、link.job）。
  只在 `/jobs/search/` 頁面內呼叫才有結果（從別的頁面 fetch 回空陣列）；用公司全名當關鍵字幾乎查不到，它是比職缺內容。
- `/company/ajax/joblist/<custNo>` 回的是 HTML，不是 JSON（舊路徑），不用。
- 探路腳本裡的 `/jobs/search/list` 是舊端點，正式版換成上面兩支。

**Google 雲端硬碟同步檔**：這台 Mac 沒裝雲端硬碟桌面版，`~/Library/CloudStorage/` 不存在，所以 `--from-sync` 找不到檔。
同步檔在雲端硬碟上是有的（`電話推廣名單-同步資料.json`，約 2 MB，10/25 有更新），正式版要嘛讀雲端硬碟 API，要嘛由對話窗從系統頁面直接拿今天的新名單。

**正式版的做法建議**：每天的新名單 → 本機對話窗用 Claude in Chrome 在 104 找公司頁內逐家呼叫 `/company/ajax/list`（一家一次、間隔 2 秒），
記 `jobCount` 與最近職缺的 `appearDate`；403／驗證碼就停。結果只回系統要的欄位，104 內容不存、不轉貼。
