#!/usr/bin/env python3
"""政府標案得標：g0v 標案 API（pcc-api.openfun.app，政府電子採購網的鏡像）→ 決標公告裡的得標廠商 → leads/pcc/。

使用者（2026/10/24）：「新增一個案源來源『政府標案得標廠商』…每天跑前一天的日期…只取決標公告（更正決標公告也取、跟原公告去重）…
只取是否得標為「是」的廠商…每次請求間隔 1 秒；失敗重試 2 次…篩選做成設定檔參數」。
這支用 Python（標準函式庫，不用裝東西）而不是 Node：API 從 GitHub Actions 連會被 Cloudflare 的機器人驗證擋（403），
只能在使用者自己的電腦跑；電腦上有 Python 沒有 Node。成立日期、資本額另外由 GitHub Actions 的 fill-founded.mjs --source pcc 補。

鍵名（2026/10/24 在使用者電腦用 pcc_test/probe_keys.py 看到的）：
  /api/listbydate?date=YYYYMMDD → records[]：date, filename, brief{type,title,…}, job_number, unit_id, unit_name, …
  /api/tender?unit_id=&job_number= → records[]（同一案的所有公告），用 filename 對到同一筆；detail 的鍵是「區塊:子項:欄位」：
    機關資料:機關名稱 / 已公告資料:標案名稱 / 已公告資料:標案案號 / 決標資料:決標日期 / 決標資料:總決標金額
    投標廠商:投標廠商N:廠商代碼、廠商名稱、是否得標（是／否／None）、組織型態（公司登記／商業登記／其他／None）、廠商地址、廠商電話、決標金額、是否為中小企業、僱用員工總人數
輸出：leads/pcc/pcc.csv（一家一列，跨期同統編不重複；同一家得好幾標留最近那一標，件數另外記）、cases.csv（去重用）、index.json；
      另外寫 pcc_test/result-YYYYMMDD.csv（當天得標廠商一家一列，給使用者看）。只印筆數與統計，不印公司名。
用法：python3 tools/fetch-pcc.py [--date YYYYMMDD] [--days 1] [--out leads/pcc]
"""
import csv, io, json, os, re, sys, time, datetime, urllib.parse, urllib.request, urllib.error

# ---------- 設定（使用者要改的都在這） ----------
CONFIG = {
    "cities": ["新北市", "臺北市", "台北市"],          # 廠商地址開頭要是這些（臺／台都認）
    "org_keep": ["公司登記", "商業登記"],              # 組織型態只留這些（醫院、學校、財團法人、其他都不要）
    "award_types": r"^(更正)?決標公告$",              # brief.type 要符合的（「無法決標公告」不算）
    "request_gap_sec": 1.0,                            # 每次請求間隔
    "retries": 2,                                      # 失敗重試次數
    "keep_days": 180,                                  # pcc.csv 留最近幾天決標的公司
    "base": "https://pcc-api.openfun.app",
}
HEAD = ["統編", "名稱", "組織型態", "地址", "電話", "最近決標日", "標案名稱", "招標機關", "決標金額", "得標件數", "首次決標日", "案號", "成立日期", "資本額"]
RESULT_HEAD = ["決標日期", "標案名稱", "招標機關", "案號", "得標廠商", "統編", "組織型態", "地址", "電話", "決標金額", "總決標金額", "是否中小企業", "員工人數", "留下", "刷掉原因"]
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", "Accept": "application/json"}

# ---------- 純函式（測試在 pcc_test/test_fetch_pcc.py） ----------
def parse_amount(s):
    """「新臺幣1,234,567元」「1234567」→ 1234567；沒有數字回 0"""
    d = re.sub(r"[^\d]", "", str(s or ""))
    return int(d) if d else 0

def parse_date(s):
    """114/10/23、2026/10/23、2026-10-23、20261023、1141023 → 2026-10-23；壞的回空字串"""
    t = str(s or "").strip()
    m = re.match(r"^(\d{2,4})[/\-.](\d{1,2})[/\-.](\d{1,2})", t)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        n = re.sub(r"\D", "", t)
        if len(n) == 8: y, mo, d = int(n[:4]), int(n[4:6]), int(n[6:])
        elif len(n) == 7: y, mo, d = int(n[:3]), int(n[3:5]), int(n[5:])
        else: return ""
    if y < 1911: y += 1911
    if not (1 <= mo <= 12 and 1 <= d <= 31): return ""
    return f"{y:04d}-{mo:02d}-{d:02d}"

def in_city(address, cities):
    """API 回的地址前面帶郵遞區號（「114 臺北市內湖區…」「23553新北市…」），先去掉再比縣市（2026/10/23 實跑 614 家全被刷掉才發現）"""
    a = re.sub(r"^[\s\d\-－]+", "", str(address or "").strip())
    return any(a.startswith(c) for c in cities)

def vendors_of(detail):
    """detail → 投標廠商 N 的清單（原樣，不篩）"""
    out = {}
    for k, v in (detail or {}).items():
        m = re.match(r"^投標廠商:投標廠商(\d+):(.+)$", k)
        if not m: continue
        n = int(m.group(1)); out.setdefault(n, {})[m.group(2)] = v
    return [out[n] for n in sorted(out)]

def tax_of(v):
    t = re.sub(r"\D", "", str(v.get("廠商代碼") or ""))
    return t if len(t) == 8 else ""

def judge(v, cfg=CONFIG):
    """一家投標廠商 → (留不留, 刷掉原因)。順序：得標 → 統編 → 地址縣市 → 組織型態"""
    if str(v.get("是否得標") or "").strip() != "是": return False, "沒得標"
    if not tax_of(v): return False, "沒統編"
    if not in_city(v.get("廠商地址"), cfg["cities"]): return False, "不在縣市內"
    if str(v.get("組織型態") or "").strip() not in cfg["org_keep"]: return False, f"組織型態 {str(v.get('組織型態') or 'None').strip()}"
    return True, ""

def award_of(rec):
    """tender 的一筆（決標公告）→ 標案層的欄位"""
    d = rec.get("detail") or {}
    return {
        "date": parse_date(d.get("決標資料:決標日期")) or parse_date(rec.get("date")),
        "tender": str(d.get("已公告資料:標案名稱") or (rec.get("brief") or {}).get("title") or "").strip(),
        "agency": str(d.get("機關資料:機關名稱") or rec.get("unit_name") or "").strip(),
        "case_no": str(d.get("已公告資料:標案案號") or rec.get("job_number") or "").strip(),
        "total": parse_amount(d.get("決標資料:總決標金額")),
        "key": f"{rec.get('unit_id', '')}|{rec.get('job_number', '')}",
    }

def csv_text(rows):
    buf = io.StringIO(); w = csv.writer(buf, lineterminator="\n")
    for r in rows: w.writerow(r)
    return "﻿" + buf.getvalue()

def read_csv(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.reader(f))
    except FileNotFoundError:
        return [], []
    return (rows[0], rows[1:]) if rows else ([], [])

def merge_rows(prev_head, prev_rows, prev_cases, wins, today, cfg=CONFIG):
    """既有 pcc.csv ＋ 這次的得標廠商 → 新的列（統編 → dict）、案件集合。wins：[{tax, name, org, address, tel, amount, award}]"""
    by = {}
    idx = {h: i for i, h in enumerate(prev_head)}
    for r in prev_rows:
        o = {h: (r[idx[h]] if idx.get(h) is not None and idx[h] < len(r) else "") for h in HEAD}
        if o["統編"]: by[o["統編"]] = o
    cases = set(prev_cases)
    added = updated = dup = 0
    for w in wins:
        a = w["award"]; ck = f"{w['tax']}|{a['key']}"
        if ck in cases: dup += 1; continue   # 更正決標公告或補抓到同一案：不重複算件數
        cases.add(ck)
        o = by.get(w["tax"])
        if not o:
            by[w["tax"]] = {"統編": w["tax"], "名稱": w["name"], "組織型態": w["org"], "地址": w["address"], "電話": w["tel"], "最近決標日": a["date"], "標案名稱": a["tender"], "招標機關": a["agency"], "決標金額": str(w["amount"] or ""), "得標件數": "1", "首次決標日": a["date"], "案號": a["case_no"], "成立日期": "", "資本額": ""}
            added += 1
        else:
            o["得標件數"] = str(int(o.get("得標件數") or 1) + 1)
            if a["date"] >= (o.get("最近決標日") or ""):
                o.update({"名稱": w["name"] or o["名稱"], "地址": w["address"] or o["地址"], "電話": w["tel"] or o["電話"], "最近決標日": a["date"], "標案名稱": a["tender"], "招標機關": a["agency"], "決標金額": str(w["amount"] or ""), "案號": a["case_no"]})
            if a["date"] and (not o.get("首次決標日") or a["date"] < o["首次決標日"]): o["首次決標日"] = a["date"]
            updated += 1
    floor = (datetime.date.fromisoformat(today) - datetime.timedelta(days=cfg["keep_days"])).isoformat()
    dropped = [t for t, o in by.items() if (o.get("最近決標日") or "") < floor]
    for t in dropped: del by[t]
    return by, cases, {"added": added, "updated": updated, "dup": dup, "dropped": len(dropped)}

# ---------- 網路 ----------
def get_json(url, cfg=CONFIG, log=print):
    last = None
    for i in range(cfg["retries"] + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                ct = r.headers.get("content-type", "")
                body = r.read()
            if "json" not in ct: raise RuntimeError(f"不是 JSON（{ct.split(';')[0]}）")
            return json.loads(body.decode("utf-8", "ignore"))
        except Exception as e:
            last = e
            if i < cfg["retries"]: time.sleep(cfg["request_gap_sec"] * (i + 2))
    log(f"  請求失敗，跳過：{url.replace(cfg['base'], '')[:80]}（{last}）")
    return None

def taipei_yesterday():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8) - datetime.timedelta(days=1)).strftime("%Y%m%d")

def fetch_day(date, cfg=CONFIG, log=print):
    """一天：決標公告 → 每案的明細 → 得標廠商（每家一列，含留不留）。回 (rows, stats)"""
    base = cfg["base"]
    lst = get_json(f"{base}/api/listbydate?date={date}", cfg, log)
    stats = {"date": date, "notices": 0, "awards": 0, "detail_ok": 0, "detail_fail": 0, "vendors": 0, "won": 0, "kept": 0, "reasons": {}, "api_down": lst is None}
    if lst is None: return [], stats
    recs = lst.get("records") or []
    stats["notices"] = len(recs)
    awards = {}
    for r in recs:
        if re.match(cfg["award_types"], str((r.get("brief") or {}).get("type") or "")):
            awards[f"{r.get('unit_id')}|{r.get('job_number')}"] = r   # 同案的更正公告蓋掉原公告（後面的 filename 比較新）
    stats["awards"] = len(awards)
    rows = []
    log(f"{date}：公告 {len(recs)} 筆，決標公告 {len(awards)} 案，開始逐案抓明細（每案等 {cfg['request_gap_sec']:g} 秒，約 {int(len(awards) * (cfg['request_gap_sec'] + 0.5) / 60) + 1} 分鐘）…")
    for i, (key, a) in enumerate(awards.items(), 1):
        if i % 20 == 0: log(f"  …{i}/{len(awards)} 案")
        time.sleep(cfg["request_gap_sec"])
        t = get_json(f"{base}/api/tender?unit_id={urllib.parse.quote(str(a.get('unit_id', '')))}&job_number={urllib.parse.quote(str(a.get('job_number', '')))}", cfg, log)
        if t is None: stats["detail_fail"] += 1; continue
        trs = t.get("records") or []
        hit = next((x for x in trs if x.get("filename") == a.get("filename")), None)
        if hit is None:
            cand = [x for x in trs if re.match(cfg["award_types"], str((x.get("brief") or {}).get("type") or ""))]
            hit = cand[-1] if cand else None
        if hit is None: stats["detail_fail"] += 1; continue
        stats["detail_ok"] += 1
        aw = award_of(hit)
        for v in vendors_of(hit.get("detail")):
            stats["vendors"] += 1
            keep, why = judge(v, cfg)
            if str(v.get("是否得標") or "").strip() == "是": stats["won"] += 1
            if keep: stats["kept"] += 1
            elif why != "沒得標": stats["reasons"][why] = stats["reasons"].get(why, 0) + 1
            rows.append({"tax": tax_of(v), "name": str(v.get("廠商名稱") or "").strip(), "org": str(v.get("組織型態") or "").strip(), "address": str(v.get("廠商地址") or "").strip(),
                         "tel": str(v.get("廠商電話") or "").strip(), "amount": parse_amount(v.get("決標金額")), "sme": str(v.get("是否為中小企業") or ""), "staff": str(v.get("僱用員工總人數") or ""),
                         "won": str(v.get("是否得標") or "").strip() == "是", "keep": keep, "why": why, "award": aw})
    return rows, stats

def main():
    args = sys.argv[1:]
    opt = lambda n, d: (args[args.index(f"--{n}") + 1] if f"--{n}" in args and args.index(f"--{n}") + 1 < len(args) and not args[args.index(f"--{n}") + 1].startswith("--") else d)
    date = (opt("date", "") or "").strip() or taipei_yesterday()
    days = int(opt("days", "1") or 1)
    out = opt("out", "leads/pcc")
    os.makedirs(out, exist_ok=True); os.makedirs("pcc_test", exist_ok=True)
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)).strftime("%Y-%m-%d")
    prev_head, prev_rows = read_csv(os.path.join(out, "pcc.csv"))
    _, case_rows = read_csv(os.path.join(out, "cases.csv"))
    prev_cases = [r[0] for r in case_rows if r]
    try:
        index = json.load(open(os.path.join(out, "index.json"), encoding="utf-8"))
    except Exception:
        index = {}
    d0 = datetime.datetime.strptime(date, "%Y%m%d").date()
    all_wins = []; day_stats = []
    for i in range(days):
        d = (d0 - datetime.timedelta(days=i)).strftime("%Y%m%d")
        rows, st = fetch_day(d, CONFIG, print)
        day_stats.append(st)
        won = [r for r in rows if r["won"]]
        print(f"{d}：公告 {st['notices']} 筆，決標公告 {st['awards']} 案（明細取到 {st['detail_ok']}、失敗 {st['detail_fail']}），投標廠商 {st['vendors']} 家，得標 {st['won']} 家，篩完留 {st['kept']} 家"
              + (f"；刷掉：{'、'.join(f'{k} {v}' for k, v in st['reasons'].items())}" if st["reasons"] else "") + ("；API 連不上，今天沒資料" if st["api_down"] else ""))
        # 給使用者看的：當天得標廠商一家一列（含沒留的與原因）
        res = [RESULT_HEAD] + [[r["award"]["date"], r["award"]["tender"], r["award"]["agency"], r["award"]["case_no"], r["name"], r["tax"], r["org"], r["address"], r["tel"], r["amount"] or "", r["award"]["total"] or "", r["sme"], r["staff"], "是" if r["keep"] else "", r["why"]] for r in won]
        with open(os.path.join("pcc_test", f"result-{d}.csv"), "w", encoding="utf-8", newline="") as f: f.write(csv_text(res))
        all_wins += [r for r in rows if r["keep"]]
    by, cases, m = merge_rows(prev_head, prev_rows, prev_cases, all_wins, today)
    rows_out = sorted(by.values(), key=lambda o: (o["最近決標日"], o["名稱"]), reverse=True)
    with open(os.path.join(out, "pcc.csv"), "w", encoding="utf-8", newline="") as f: f.write(csv_text([HEAD] + [[o.get(h, "") for h in HEAD] for o in rows_out]))
    with open(os.path.join(out, "cases.csv"), "w", encoding="utf-8", newline="") as f: f.write(csv_text([["統編|案件"]] + [[c] for c in sorted(cases)]))
    dates = index.get("dates") or {}
    for st in day_stats:
        dates[st["date"]] = {k: st[k] for k in ("notices", "awards", "vendors", "won", "kept", "api_down")}
    for k in sorted(dates)[:-400]: del dates[k]
    index.update({"generatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"), "source": f"{CONFIG['base']}（政府電子採購網決標公告）", "cities": ["新北市", "臺北市"], "orgKeep": CONFIG["org_keep"],
                  "days": CONFIG["keep_days"], "total": len(rows_out), "withPhone": sum(1 for o in rows_out if o.get("電話")), "latestDate": rows_out[0]["最近決標日"] if rows_out else "", "lastFetched": date,
                  "apiDown": any(st["api_down"] for st in day_stats), "dates": dates, "files": [{"path": "pcc.csv", "rows": len(rows_out)}]})
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f: f.write(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    print(f"→ {out}/pcc.csv 共 {len(rows_out)} 家（新增 {m['added']}、既有再得標 {m['updated']}、重複案件略過 {m['dup']}、超過 {CONFIG['keep_days']} 天刪掉 {m['dropped']}；有電話 {index['withPhone']}）；給你看的在 pcc_test/result-{date}.csv")

if __name__ == "__main__":
    main()
