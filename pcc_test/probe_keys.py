"""在自己電腦跑：印 g0v 標案 API 的鍵名（只印鍵名、筆數、種類，不印標案或廠商內容）。
用法：python3 pcc_test/probe_keys.py 20261023
GitHub Actions 上連這個 API 會被 Cloudflare 的「Just a moment…」驗證擋（403），所以在使用者的電腦上跑。"""
import json, sys, time, urllib.parse, urllib.request

BASE = "https://pcc-api.openfun.app"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", "Accept": "application/json"}

def get(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        ct = r.headers.get("content-type", "")
        body = r.read()
        print(f"GET {path} → {r.status} {ct.split(';')[0]} {len(body)} bytes")
        if "json" not in ct:
            print("  不是 JSON，前 120 字：", body.decode("utf-8", "ignore")[:120].replace("\n", " "))
            return None
        return json.loads(body.decode("utf-8", "ignore"))

def main():
    date = sys.argv[1] if len(sys.argv) > 1 else "20261023"
    lst = get(f"/api/listbydate?date={date}")
    if not lst:
        return
    print("listbydate 頂層鍵：", list(lst.keys()))
    recs = lst.get("records") or []
    print("records 筆數：", len(recs), "；一筆的鍵：", list(recs[0].keys()) if recs else "-", "；brief 的鍵：", list(recs[0]["brief"].keys()) if recs and isinstance(recs[0].get("brief"), dict) else "-")
    types = {}
    for r in recs:
        t = (r.get("brief") or {}).get("type", "?")
        types[t] = types.get(t, 0) + 1
    print("brief.type 種類與筆數：", types)
    awards = [r for r in recs if "決標公告" in str((r.get("brief") or {}).get("type", ""))]
    print("決標公告（含更正）筆數：", len(awards))
    for a in awards[:3]:
        time.sleep(1)
        t = get(f"/api/tender?unit_id={urllib.parse.quote(str(a.get('unit_id', '')))}&job_number={urllib.parse.quote(str(a.get('job_number', '')))}")
        if not t:
            continue
        trs = t.get("records") or []
        print("tender 頂層鍵：", list(t.keys()), "；records 筆數：", len(trs), "；各筆 brief.type：", [(x.get("brief") or {}).get("type") for x in trs])
        hit = next((x for x in trs if x.get("filename") == a.get("filename")), trs[-1] if trs else None)
        d = (hit or {}).get("detail") or {}
        keys = list(d.keys())
        print(f"對到 filename 的那筆：一筆的鍵 {list((hit or {}).keys())}；detail 鍵數 {len(keys)}")
        groups = {}
        for k in keys:
            g = k.split(":")[0]
            groups[g] = groups.get(g, 0) + 1
        print("detail 區塊與鍵數：", groups)
        print("detail 非投標廠商的鍵（全部）：", [k for k in keys if not k.startswith("投標廠商")])
        print("投標廠商1 的鍵：", [k for k in keys if k.startswith("投標廠商:投標廠商1:")])
        ns = sorted({k.split(":")[1] for k in keys if k.startswith("投標廠商:投標廠商")})
        print("投標廠商家數：", len(ns), "；是否得標 的值種類：", sorted({str(d.get(f"投標廠商:{n}:是否得標")) for n in ns}), "；組織型態 的值種類：", sorted({str(d.get(f"投標廠商:{n}:組織型態")) for n in ns}))
        print()

if __name__ == "__main__":
    main()
