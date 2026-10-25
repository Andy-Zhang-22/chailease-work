"""
台灣就業通／勞動部職缺開放資料：探路（一次性）。只印資料集標題、網址、欄位名、筆數、統計，不印職缺內容、公司名。
目的：找一份後台 Actions 連得到、每天更新、有統編或公司名的「目前有職缺的公司」資料，當每日新名單的訊號（版本 389 起），
      取代要在使用者 Chrome 裡查的 104。
"""
import json, re, time, urllib.parse, urllib.request, urllib.error

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

def get(url, data=None, ct=None, timeout=90):
    h = {"User-Agent": UA, "Accept": "application/json, text/plain, */*"}
    if ct: h["Content-Type"] = ct
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("content-type", ""), r.read()

def walk_records(j):
    """搜尋 API 回的結構會變：找出第一個「字典的清單」當結果列"""
    if isinstance(j, dict):
        for k in ("payload", "result", "data"):
            if k in j:
                r = walk_records(j[k])
                if r: return r
        for v in j.values():
            r = walk_records(v)
            if r: return r
    if isinstance(j, list) and j and isinstance(j[0], dict): return j
    return []

def pause(): time.sleep(2.0)

def main():
    print("== A. data.gov.tw 搜尋職缺相關資料集")
    found = {}
    for q in ["就業機會", "職缺", "台灣就業通", "徵才", "求才"]:
        for page in (1, 2):
            body = json.dumps({"bool": [{"fulltext": {"value": q}}], "filter": [], "page_num": page, "page_limit": 20, "tids": [], "sort": "_score_desc"}).encode()
            try:
                st, ct, raw = get("https://data.gov.tw/api/front/dataset/list", data=body, ct="application/json")
                j = json.loads(raw.decode("utf-8", "ignore"))
                rows = walk_records(j)
                if page == 1:
                    print(f"   查「{q}」：HTTP {st}，最外層鍵 {list(j.keys())[:8] if isinstance(j, dict) else type(j).__name__}，結果 {len(rows)} 筆")
                    if rows: print(f"       一筆的欄位：{list(rows[0].keys())[:20]}；前 8 個標題：{[str(r.get('title',''))[:30] for r in rows[:8]]}")
                    else: print(f"       原始回應開頭：{raw[:300].decode('utf-8','ignore')}")
                for r in rows:
                    t = str(r.get("title", "")); i = str(r.get("id") or r.get("oid") or r.get("datasetId") or "")
                    if re.search(r"職缺|就業機會|求才|徵才|人才", t) and i and i not in found:
                        found[i] = {"title": t, "org": str(r.get("providerOrganization") or r.get("organization") or r.get("orgName") or ""),
                                    "fmt": str(r.get("fileType") or r.get("format") or r.get("resourceFormat") or ""), "freq": str(r.get("updateFrequency") or r.get("frequency") or "")}
                if not rows: break
            except Exception as e:
                print(f"   查「{q}」第 {page} 頁失敗：{str(e)[:120]}"); break
            pause()
    for url in ["https://data.gov.tw/api/v2/rest/datasets?q=%E8%81%B7%E7%BC%BA&size=20", "https://data.gov.tw/api/front/dataset/list?q=%E8%81%B7%E7%BC%BA&page_num=1&page_limit=20"]:
        try:
            st, ct, raw = get(url)
            j = json.loads(raw.decode("utf-8", "ignore")); rows = walk_records(j)
            print(f"   GET {url[:70]}：HTTP {st}，結果 {len(rows)} 筆；標題：{[str(r.get('title',''))[:30] for r in rows[:8]]}")
            for r in rows:
                t = str(r.get("title", "")); i = str(r.get("id") or r.get("oid") or r.get("datasetId") or "")
                if re.search(r"職缺|就業機會|求才|徵才|人才", t) and i and i not in found:
                    found[i] = {"title": t, "org": str(r.get("providerOrganization") or ""), "fmt": str(r.get("fileType") or ""), "freq": str(r.get("updateFrequency") or "")}
        except Exception as e:
            print(f"   GET {url[:70]} 失敗：{str(e)[:120]}")
        pause()
    print(f"   共 {len(found)} 個：")
    for i, d in found.items(): print(f"   - {i} {d['title'][:70]} ｜ {d['org'][:24]} ｜ {d['fmt']} ｜ {d['freq']}")

    print("== B. 詮釋資料（v2）：更新頻率、欄位說明、下載網址")
    picks = []
    for i, d in found.items():
        try:
            st, ct, raw = get(f"https://data.gov.tw/api/v2/rest/dataset/{i}")
            j = json.loads(raw.decode("utf-8", "ignore")); m = j.get("result", j)
            freq = m.get("updateFrequency") or m.get("frequency") or ""
            fields = str(m.get("fieldDescription") or m.get("columnDescription") or "")[:400]
            dist = m.get("distribution") or []
            print(f"   [{i}] {str(m.get('title',''))[:60]} ｜ {str(m.get('providerOrganization',''))[:20]} ｜ 更新：{freq}")
            if fields: print(f"       欄位說明：{fields}")
            for x in dist[:4]:
                print(f"       檔：{x.get('resourceFormat','')} {x.get('resourceDownloadUrl','') or x.get('accessURL','')} ｜ {str(x.get('resourceDescription',''))[:60]}")
            if dist and re.search(r"職缺|就業機會|求才|徵才", str(m.get("title", ""))):
                picks.append((i, str(m.get("title", "")), dist))
        except Exception as e:
            print(f"   [{i}] 失敗：{str(e)[:100]}")
        pause()

    print("== C. 直接下載，看欄位、筆數、有沒有統編、新北／台北幾筆（只印統計）")
    for i, title, dist in picks[:6]:
        for x in dist[:2]:
            url = x.get("resourceDownloadUrl") or x.get("accessURL") or ""
            if not url: continue
            try:
                st, ct, raw = get(url)
                text = raw.decode("utf-8-sig", "ignore")
                print(f"   [{i}] {title[:40]} ｜ HTTP {st} ｜ {ct[:30]} ｜ {len(raw):,} bytes")
                rows, fields = [], []
                s = text.lstrip()
                if s.startswith("{") or s.startswith("["):
                    j = json.loads(s); rows = walk_records(j)
                    fields = list(rows[0].keys()) if rows else (list(j.keys()) if isinstance(j, dict) else [])
                else:
                    import csv, io
                    rd = list(csv.reader(io.StringIO(text)))
                    if rd: fields = rd[0]; rows = [dict(zip(fields, r)) for r in rd[1:]]
                print(f"       欄位（{len(fields)}）：{fields[:30]}")
                print(f"       筆數：{len(rows):,}")
                if rows:
                    keys = [k for k in fields if re.search(r"統一?編|統編|taxid|ban|uniform", str(k), re.I)]
                    print(f"       像統編的欄位：{keys or '無'}")
                    if keys:
                        k = keys[0]; n8 = sum(1 for r in rows if re.fullmatch(r"\d{8}", str(r.get(k, "")).strip() or ""))
                        print(f"       統編 8 碼的筆數：{n8:,}")
                    blob = lambda r: " ".join(str(v) for v in r.values())
                    print(f"       含「新北市」：{sum(1 for r in rows if '新北市' in blob(r)):,}；含「臺北市／台北市」：{sum(1 for r in rows if '臺北市' in blob(r) or '台北市' in blob(r)):,}")
                    datek = [k for k in fields if re.search(r"日期|date|更新|刊登", str(k), re.I)]
                    if datek:
                        vals = sorted({str(r.get(datek[0], ""))[:10] for r in rows if r.get(datek[0])})
                        print(f"       日期欄 {datek[0]}：最早 {vals[0] if vals else ''}、最晚 {vals[-1] if vals else ''}、{len(vals)} 種")
            except Exception as e:
                print(f"   [{i}] 下載失敗 {url[:80]}：{str(e)[:120]}")
            pause()
    print("探路結束。")

if __name__ == "__main__":
    main()
