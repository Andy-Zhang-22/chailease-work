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
TITLE_KEYS = ["title", "dataset_name", "name", "dataset_title", "title_zh"]
ID_KEYS = ["tid", "dataset_tid", "oid", "id", "datasetId", "nid"]
def titleOf(r): return next((r[k] for k in TITLE_KEYS if r.get(k)), "")
def idOf(r): return next((r[k] for k in ID_KEYS if r.get(k)), "")

import os
def main():
    if os.environ.get("ONLY_D"): return part_d()
    print("== A. data.gov.tw 搜尋職缺相關資料集")
    found = {}
    for q in ["就業機會", "職缺", "台灣就業通", "徵才", "求才"]:
        for page in (1, 2):
            body = json.dumps({"bool": [{"fulltext": {"value": q}}], "filter": [], "page_num": page, "page_limit": 20, "tids": [], "sort": "_score_desc"}).encode()
            try:
                st, ct, raw = get("https://data.gov.tw/api/front/dataset/list", data=body, ct="application/json")
                j = json.loads(raw.decode("utf-8", "ignore"))
                rows = walk_records(j)
                if page == 1 and q == "就業機會" and rows:
                    print(f"   一筆的全部欄位：{list(rows[0].keys())}")
                if page == 1:
                    print(f"   查「{q}」：HTTP {st}，結果 {len(rows)} 筆；標題：{[str(titleOf(r))[:28] for r in rows[:10]]}")
                for r in rows:
                    t = str(titleOf(r)); i = str(idOf(r))
                    if re.search(r"職缺|就業機會|求才|徵才|人才|就業通", t) and i and i not in found:
                        found[i] = {"title": t, "org": str(r.get("agency_name") or ""), "fmt": str(r.get("file_type") or r.get("format") or ""), "freq": str(r.get("check_freq_name") or "")}
                if not rows: break
            except Exception as e:
                print(f"   查「{q}」第 {page} 頁失敗：{str(e)[:120]}"); break
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
    part_d()

def part_d():
    print("== D. 台灣就業通職缺清單（44062）的 datastore API：能不能翻頁、篩縣市、總筆數")
    base = "https://apiservice.mol.gov.tw/OdService/rest/datastore/A17000000J-030144-VAL"
    def peek(label, url):
        try:
            st, ct, raw = get(url)
            text = raw.decode("utf-8-sig", "ignore"); s2 = text.lstrip()
            if s2.startswith("{") or s2.startswith("["):
                j = json.loads(s2); rows = walk_records(j)
                top = list(j.keys())[:12] if isinstance(j, dict) else "list"
                meta = {k: j[k] for k in j if isinstance(j, dict) and k != "result" and not isinstance(j[k], (list, dict))} if isinstance(j, dict) else {}
                res = j.get("result") if isinstance(j, dict) else None
                rmeta = {k: res[k] for k in res if not isinstance(res[k], (list, dict))} if isinstance(res, dict) else {}
                cities = {}
                for r in rows: c = str(r.get("CITYNAME（工作地點）") or r.get("CITYNAME") or "")[:3]; cities[c] = cities.get(c, 0) + 1
                first = str(rows[0].get("TRANDATE（職缺更新日期）") or rows[0].get("TRANDATE") or "")[:10] if rows else ""
                print(f"   {label}：HTTP {st} ｜ {len(raw):,} bytes ｜ 最外層 {top} ｜ {meta} ｜ result 的純量 {rmeta} ｜ 筆數 {len(rows)} ｜ 縣市前 5 {sorted(cities.items(), key=lambda x: -x[1])[:5]} ｜ 第一筆更新日 {first}")
            else:
                print(f"   {label}：HTTP {st} ｜ {ct[:30]} ｜ {len(raw):,} bytes ｜ 開頭：{text[:160]!r}")
        except Exception as e:
            print(f"   {label}：失敗 {str(e)[:140]}")
        pause()
    peek("無參數", base)
    peek("limit=5", base + "?limit=5")
    peek("offset=1000&limit=5", base + "?offset=1000&limit=5")
    peek("$top=5", base + "?$top=5")
    peek("$skip=1000&$top=5", base + "?$skip=1000&$top=5")
    peek("page=2&size=5", base + "?page=2&size=5")
    peek("CITYNAME=新北市", base + "?CITYNAME=" + urllib.parse.quote("新北市"))
    peek("q=新北市", base + "?q=" + urllib.parse.quote("新北市"))
    peek("filters JSON", base + "?filters=" + urllib.parse.quote(json.dumps({"CITYNAME": "新北市"}, ensure_ascii=False)))
    print("   CSV 下載加參數：")
    for extra in ["?limit=5000", "?offset=1000", "?$skip=1000", "?page=2"]:
        try:
            st, ct, raw = get("https://apiservice.mol.gov.tw/OdService/download/A17000000J-030144-MKw" + extra)
            import csv, io
            rd = list(csv.reader(io.StringIO(raw.decode("utf-8-sig", "ignore"))))
            cities = {}
            ci = next((i for i, h in enumerate(rd[0]) if h.startswith("CITYNAME")), None) if rd else None
            for r in rd[1:]:
                c = (r[ci] if ci is not None and ci < len(r) else "")[:3]; cities[c] = cities.get(c, 0) + 1
            print(f"   CSV{extra}：HTTP {st} ｜ {len(raw):,} bytes ｜ {max(0, len(rd) - 1)} 筆 ｜ 縣市前 3 {sorted(cities.items(), key=lambda x: -x[1])[:3]}")
        except Exception as e:
            print(f"   CSV{extra}：失敗 {str(e)[:120]}")
        pause()
    print("探路結束。")

if __name__ == "__main__":
    main()
