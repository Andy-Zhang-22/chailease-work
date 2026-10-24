"""查有沒有不用爬網頁的決標資料來源。只印標題、網址、欄位名、筆數、更新頻率，不印標案或廠商內容。
第一輪（10/24）：data.gov.tw 搜尋頁是前端畫的，純 HTML 看不到結果 → 改用 Playwright 畫出來再讀；
採購網 web.pcc.gov.tw 從 GitHub（美國 IP）連回「The URL you requested has been blocked」，境外封鎖。"""
import datetime, json, re, time, urllib.error, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("content-type", ""), r.read()

def pause():
    time.sleep(2.5)

def main():
    print("== 1. data.gov.tw 搜尋（瀏覽器畫出來，順便錄下它背後呼叫的 API）")
    ids = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_context(user_agent=UA, locale="zh-TW").new_page()
        pg.set_default_timeout(60000)
        api_calls = []
        def on_resp(resp):
            try:
                u = resp.url
                if "data.gov.tw" in u and re.search(r"api|search|dataset", u, re.I) and not re.search(r"\.(js|css|png|svg|woff2?|ico)(\?|$)", u):
                    ct = resp.headers.get("content-type", "")
                    item = {"url": u[:200], "status": resp.status, "ct": ct.split(";")[0]}
                    if "json" in ct:
                        try:
                            j = resp.json()
                            item["keys"] = list(j.keys())[:12] if isinstance(j, dict) else f"list[{len(j)}]"
                            txt = json.dumps(j, ensure_ascii=False)
                            item["titles"] = re.findall(r'"title"\s*:\s*"([^"]{2,60})"', txt)[:25]
                        except Exception:
                            pass
                    api_calls.append(item)
            except Exception:
                pass
        pg.on("response", on_resp)
        reqs = []
        pg.on("request", lambda rq: reqs.append((rq.method, rq.url[:160], (rq.post_data or "")[:300])) if "data.gov.tw/api" in rq.url else None)
        for q in ["決標公告", "決標"]:
            url = "https://data.gov.tw/datasets/search?p=1&size=20&s=_score_desc&q=" + urllib.parse.quote(q)
            try:
                pg.goto(url, wait_until="networkidle")
                pg.wait_for_timeout(2500)
                # 試著直接在搜尋框打字再送出（網址帶 q 可能沒被讀）
                boxes = pg.query_selector_all("input")
                print(f"  頁上 input {len(boxes)} 個：{[(b.get_attribute('type'), b.get_attribute('placeholder'), b.get_attribute('name'), b.get_attribute('id')) for b in boxes[:8]]}")
                box = pg.query_selector("input[type='search'], input[placeholder*='搜尋'], input[placeholder*='關鍵'], input[name='q'], input[type='text']")
                if box:
                    box.fill(q); box.press("Enter"); pg.wait_for_timeout(5000)
                rows = pg.eval_on_selector_all("a[href*='/dataset/']", "els => els.map(a => [a.getAttribute('href'), (a.innerText||'').trim()])")
                rows = [(h, t) for h, t in rows if re.search(r"/dataset/\d+$", h or "") and t]
                print(f"  查「{q}」：畫面上資料集連結 {len(rows)} 個；標題含決標／採購的：{[t[:40] for h, t in rows if re.search(r'決標|採購|標案', t)][:10]}")
                for h, t in rows:
                    i = h.rsplit("/", 1)[-1]
                    if re.search(r"決標|採購|標案", t) and i not in ids:
                        ids.append(i)
            except Exception as e:
                print(f"  查「{q}」失敗：{e}")
            pause()
        print(f"  送出的 API request {len(reqs)} 個（method、網址、body）：")
        for m, u, b in reqs[:12]:
            print(f"    {m} {u}  body={b}")
        print(f"  背後 API 呼叫 {len(api_calls)} 個：")
        for c in api_calls[:20]:
            print(f"    {c['status']} {c['ct']} {c['url']}")
            if c.get("keys"): print(f"       keys={c['keys']}")
            if c.get("titles"): print(f"       titles={c['titles'][:12]}")
            for t in c.get("titles", []):
                pass
        br.close()
    print("== 1b. 直接打 /api/front/dataset/list 試關鍵字參數")
    for params in [{"keyword": "決標公告", "size": 20, "page": 1}, {"q": "決標公告", "size": 20, "p": 1}, {"query": "決標公告"}, {"searchText": "決標公告"}]:
        for method in ["GET", "POST"]:
            try:
                if method == "GET":
                    req = urllib.request.Request("https://data.gov.tw/api/front/dataset/list?" + urllib.parse.urlencode(params), headers={"User-Agent": UA, "Accept": "application/json"})
                else:
                    req = urllib.request.Request("https://data.gov.tw/api/front/dataset/list", data=json.dumps(params).encode(), headers={"User-Agent": UA, "Accept": "application/json", "Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=60) as r:
                    j = json.loads(r.read().decode("utf-8", "ignore"))
                txt = json.dumps(j, ensure_ascii=False)
                titles = re.findall(r'"title"\s*:\s*"([^"]{2,60})"', txt)
                hit = [t for t in titles if re.search(r"決標|採購|標案", t)]
                print(f"  {method} {params}: 回 {len(titles)} 個標題，含決標／採購 {len(hit)} 個 {hit[:8]}")
                if hit:
                    for m in re.finditer(r'\{[^{}]*"title"\s*:\s*"([^"]*(?:決標|採購|標案)[^"]*)"[^{}]*\}', txt):
                        blk = m.group(0)
                        idm = re.search(r'"(?:id|datasetId|oid)"\s*:\s*"?(\d+)"?', blk)
                        if idm and idm.group(1) not in ids:
                            ids.append(idm.group(1))
            except urllib.error.HTTPError as e:
                print(f"  {method} {params}: HTTP {e.code}")
            except Exception as e:
                print(f"  {method} {params}: 失敗 {str(e)[:80]}")
            pause()
    # 從 API 回傳裡找資料集 id（title 旁邊通常有 id）
    for c in api_calls:
        for i in re.findall(r'"id"\s*:\s*"?(\d{3,7})"?', json.dumps(c)):
            pass
    print(f"== 2. 詮釋資料（標題含決標／得標／採購的，最多 10 個）")
    shown = 0
    for i in ids:
        if shown >= 10:
            break
        try:
            st, ct, body = get(f"https://data.gov.tw/api/v2/rest/dataset/{i}")
            d = json.loads(body.decode("utf-8", "ignore"))
            d = d.get("result", d) if isinstance(d, dict) else {}
            title = str(d.get("title", ""))
            if not re.search(r"決標|得標|採購|標案", title):
                continue
            shown += 1
            dist = d.get("distribution") or []
            print(f"  [{i}] {title}")
            print(f"       更新頻率：{d.get('frequency','') or d.get('updateFrequency','')}；機關：{d.get('providerOrganization','') or d.get('publisher','')}；最後更新：{d.get('metadataModified','') or d.get('modified','')}")
            print(f"       欄位：{str(d.get('fieldDescription','') or d.get('columnDescription',''))[:400]}")
            for x in dist[:6]:
                print(f"       檔：{x.get('resourceFormat','')} {x.get('resourceDownloadUrl','') or x.get('accessURL','')}")
        except Exception as e:
            print(f"  [{i}] 詮釋資料失敗：{e}")
        pause()
    print("== 3. 採購網本身（境外會不會擋）")
    try:
        st, ct, body = get("https://web.pcc.gov.tw/")
        html = body.decode("utf-8", "ignore")
        t = re.search(r"<title>(.*?)</title>", html, re.S)
        print(f"  web.pcc.gov.tw HTTP {st} 標題：{t.group(1).strip()[:80] if t else ''}")
    except Exception as e:
        print(f"  web.pcc.gov.tw 失敗：{e}")
    pause()
    print("== 4. 對照：g0v 社群鏡站 API（非官方，pcc.g0v.ronny.tw）")
    d = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8) - datetime.timedelta(days=2)).strftime("%Y%m%d")
    for url in [f"https://pcc.g0v.ronny.tw/api/listbydate?date={d}", "https://pcc.g0v.ronny.tw/api/searchbytitle?query=%E5%86%B7%E6%B0%A3&page=1"]:
        try:
            st, ct, body = get(url)
            txt = body.decode("utf-8", "ignore")
            if "json" not in ct:
                head = re.sub(r"\s+", " ", txt)[:160]
                print(f"  {url[:60]} HTTP {st} {ct.split(';')[0]}，不是 JSON，前 160 字：{head}")
                pause(); continue
            j = json.loads(txt)
            recs = j.get("records") or []
            keys = sorted(set().union(*[r.keys() for r in recs[:50]])) if recs else []
            briefs = [r.get("brief", {}) for r in recs[:50] if isinstance(r.get("brief"), dict)]
            types = sorted(set(str(b.get("type", "")) for b in briefs))
            print(f"  {url.split('?')[0].rsplit('/',1)[-1]} HTTP {st}：{len(recs)} 筆（total_records {j.get('total_records','?')}），欄位：{', '.join(keys)[:300]}")
            print(f"     brief.type 種類：{types[:12]}")
            award = [r for r in recs if "決標" in str(r.get("brief", {}).get("type", ""))]
            print(f"     其中決標公告 {len(award)} 筆；單筆 detail 的鍵（前 15）：{sorted((award or recs)[0].get('detail', {}).keys())[:15] if (award or recs) and isinstance((award or recs)[0].get('detail'), dict) else '要另外 /api/tender 查'}")
        except Exception as e:
            print(f"  {url[:60]} 失敗：{e}")
        pause()

if __name__ == "__main__":
    main()
