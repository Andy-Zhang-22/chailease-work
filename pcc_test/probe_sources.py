"""第六輪：直接打探路找到的決標開放資料來源，看狀態、欄位、筆數、日期範圍、能不能依日期篩。只印結構與筆數，不印標案或廠商內容。"""
import json, re, time, urllib.error, urllib.parse, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

def get(url, timeout=120, data=None, ct=None):
    h = {"User-Agent": UA, "Accept": "application/json, text/xml, */*"}
    if ct: h["Content-Type"] = ct
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("content-type", ""), r.read()

def pause(): time.sleep(2.5)

DATE_KEY = re.compile(r"date|日期|time|時間|ym|year", re.I)
PERSON_KEY = re.compile(r"name|名稱|廠商|address|地址|phone|電話|負責人|owner|id|統編|統一編號", re.I)

def walk_records(j):
    """找 JSON 裡最像「列表」的陣列（元素是 dict 的最長陣列）"""
    best = []
    def rec(x, depth=0):
        nonlocal best
        if depth > 5: return
        if isinstance(x, list):
            if x and all(isinstance(e, dict) for e in x[:5]) and len(x) > len(best): best = x
            for e in x[:3]: rec(e, depth + 1)
        elif isinstance(x, dict):
            for v in x.values(): rec(v, depth + 1)
    rec(j)
    return best

def describe_json(label, body):
    try:
        j = json.loads(body.decode("utf-8-sig", "ignore"))
    except Exception as e:
        head = re.sub(r"\s+", " ", body.decode("utf-8", "ignore"))[:200]
        print(f"   {label}: 不是 JSON（{e}），前 200 字：{head}"); return
    top = list(j.keys())[:15] if isinstance(j, dict) else f"list[{len(j)}]"
    rows = walk_records(j)
    print(f"   {label}: 頂層 {top}；列表 {len(rows)} 筆")
    if rows:
        keys = list(rows[0].keys())
        print(f"     欄位（{len(keys)}）：{keys[:40]}")
        for k in keys:
            if DATE_KEY.search(k):
                vals = [str(r.get(k, "")) for r in rows if r.get(k)]
                if vals: print(f"     日期欄 {k}：最小 {min(vals)[:20]} 最大 {max(vals)[:20]}（非空 {len(vals)}）")
        # 看一筆的「形狀」：每個欄位的型別與長度，不印值
        r0 = rows[0]
        shape = {k: (type(v).__name__, len(str(v)) if not isinstance(v, (list, dict)) else f"{type(v).__name__}[{len(v)}]") for k, v in list(r0.items())[:40]}
        print(f"     第一筆形狀：{shape}")
        nested = [k for k, v in r0.items() if isinstance(v, (list, dict))]
        for k in nested[:3]:
            v = r0[k]
            if isinstance(v, list) and v and isinstance(v[0], dict): print(f"     巢狀 {k}[0] 的欄位：{list(v[0].keys())[:20]}")
            elif isinstance(v, dict): print(f"     巢狀 {k} 的欄位：{list(v.keys())[:20]}")

def main():
    print("== A. 開放資料平臺上「決標」相關資料集（用它的搜尋 API，翻 3 頁）")
    found = {}
    for q in ["決標公告", "決標", "GPA決標", "得標廠商"]:
        for page in (1, 2, 3):
            body = json.dumps({"bool": [{"fulltext": {"value": q}}], "filter": [], "page_num": page, "page_limit": 20, "tids": [], "sort": "_score_desc"}).encode()
            try:
                st, ct, raw = get("https://data.gov.tw/api/front/dataset/list", data=body, ct="application/json")
                j = json.loads(raw.decode("utf-8", "ignore"))
                rows = walk_records(j)
                if page == 1 and q == "決標公告" and rows:
                    print(f"   搜尋結果一筆的欄位：{list(rows[0].keys())[:25]}")
                n = 0
                for r in rows:
                    t = str(r.get("title", "")); i = str(r.get("id") or r.get("oid") or r.get("datasetId") or "")
                    if re.search(r"決標|得標", t) and i and i not in found:
                        found[i] = {"title": t, "org": str(r.get("providerOrganization") or r.get("organization") or r.get("orgName") or ""), "fmt": str(r.get("fileType") or r.get("format") or r.get("resourceFormat") or ""), "freq": str(r.get("updateFrequency") or r.get("frequency") or "")}; n += 1
                if not rows: break
            except Exception as e:
                print(f"   查「{q}」第 {page} 頁失敗：{str(e)[:100]}"); break
            pause()
    print(f"   共 {len(found)} 個標題含決標／得標的資料集：")
    for i, d in found.items():
        print(f"   - {i} {d['title'][:60]} ｜ {d['org'][:20]} ｜ {d['fmt']} ｜ {d['freq']}")
    print("== B. 幾個主要來源的詮釋資料（v2，完整鍵）")
    for i in ["16371", "6155", "165150", "7264"] + [k for k, d in found.items() if "GPA" in d["title"] or "水利署" in d["title"]][:2]:
        try:
            st, ct, raw = get(f"https://data.gov.tw/api/v2/rest/dataset/{i}")
            j = json.loads(raw.decode("utf-8", "ignore")); d = j.get("result", j)
            print(f"   [{i}] {d.get('title','')} ｜ 鍵：{list(d.keys())[:30]}")
            for k in ("providerOrganization", "updateFrequency", "frequency", "regularupdate", "modified", "metadataModified", "fieldDescription", "columnDescription", "description"):
                if d.get(k): print(f"       {k}: {str(d[k])[:300]}")
            for x in (d.get("distribution") or [])[:5]:
                print(f"       檔：{x.get('resourceFormat','')} {x.get('resourceDownloadUrl','') or x.get('accessURL','')} ｜ {str(x.get('resourceDescription',''))[:80]}")
        except Exception as e:
            print(f"   [{i}] 失敗：{str(e)[:100]}")
        pause()
    print("== C. 直接打來源")
    for label, url in [
        ("16371 決標公告（pms.sme.gov.tw）", "https://pms.sme.gov.tw/PMSApi/v2/ODT/ATM"),
        ("6155 決標金額前 5 大（採購網 openDataApi）", "https://web.pcc.gov.tw/tps/openDataApi/atmTop5"),
        ("165150 限制性決標（採購網 openDataApi）", "https://web.pcc.gov.tw/tps/openDataApi/lyOpenData?runType=3"),
        ("7264 巨額採購履約中廠商（採購網 peems）", "https://web.pcc.gov.tw/peems/lapeem/lapeemGeneralPolit/downLoadOpenData"),
    ]:
        try:
            st, ct, raw = get(url)
            print(f"   {label}: HTTP {st} {ct.split(';')[0]} {len(raw):,} bytes")
            if "json" in ct or raw[:1] in (b"{", b"["): describe_json(label, raw)
            else:
                head = re.sub(r"\s+", " ", raw.decode("utf-8", "ignore"))[:200]
                print(f"     前 200 字：{head}")
        except urllib.error.HTTPError as e:
            print(f"   {label}: HTTP {e.code}")
        except Exception as e:
            print(f"   {label}: 失敗 {str(e)[:120]}")
        pause()
    print("== D. 16371 能不能依日期篩（試幾種參數，只看筆數有沒有變）")
    for qs in ["?StartDate=2026-10-17&EndDate=2026-10-24", "?startDate=20261017&endDate=20261024", "?date=20261023", "?awardDate=2026-10-23", "?page=1&size=20", "?year=2026&month=10"]:
        try:
            st, ct, raw = get("https://pms.sme.gov.tw/PMSApi/v2/ODT/ATM" + qs)
            j = json.loads(raw.decode("utf-8-sig", "ignore")); rows = walk_records(j)
            print(f"   {qs}: HTTP {st} {len(raw):,} bytes，列表 {len(rows)} 筆")
        except urllib.error.HTTPError as e:
            print(f"   {qs}: HTTP {e.code}")
        except Exception as e:
            print(f"   {qs}: 失敗 {str(e)[:100]}")
        pause()

if __name__ == "__main__":
    main()
