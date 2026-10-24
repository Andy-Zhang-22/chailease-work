"""查有沒有不用爬網頁的決標資料來源：data.gov.tw 與採購網本身。只印標題、網址、欄位名、筆數、更新頻率。"""
import json, re, sys, time, urllib.request, urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"}

def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("content-type", ""), r.read()

def pause():
    time.sleep(2.5)

def main():
    print("== 1. data.gov.tw 搜尋「決標」")
    found = []
    for q in ["決標公告", "決標 採購", "政府電子採購網"]:
        url = "https://data.gov.tw/datasets/search?p=1&size=10&s=_score_desc&q=" + urllib.parse.quote(q)
        try:
            st, ct, body = get(url)
            html = body.decode("utf-8", "ignore")
            ids = re.findall(r'/dataset/(\d+)', html)
            titles = re.findall(r'<a[^>]*href="/dataset/(\d+)"[^>]*>\s*([^<]{3,80}?)\s*<', html)
            print(f"  查「{q}」 HTTP {st}，頁面 {len(body)} bytes，資料集連結 {len(set(ids))} 個")
            for i, t in titles[:10]:
                print(f"    - {i} {t.strip()}")
            found += [i for i, _ in titles]
        except Exception as e:
            print(f"  查「{q}」失敗：{e}")
        pause()
    seen = []
    for i in found:
        if i not in seen:
            seen.append(i)
    print(f"== 2. 詮釋資料（前 {min(6, len(seen))} 個）")
    for i in seen[:6]:
        try:
            st, ct, body = get(f"https://data.gov.tw/api/v2/rest/dataset/{i}")
            j = json.loads(body.decode("utf-8", "ignore"))
            d = j.get("result", j)
            dist = d.get("distribution") or []
            print(f"  [{i}] {d.get('title','')} ｜ 更新頻率：{d.get('frequency','') or d.get('updateFrequency','')} ｜ 提供機關：{d.get('providerOrganization','') or d.get('publisher','')}")
            print(f"       欄位：{str(d.get('fieldDescription','') or d.get('columnDescription',''))[:300]}")
            for x in dist[:5]:
                print(f"       檔：{x.get('resourceFormat','')} {x.get('resourceDownloadUrl','') or x.get('accessURL','')}")
        except Exception as e:
            print(f"  [{i}] 詮釋資料失敗：{e}")
        pause()
    print("== 3. 採購網首頁與資料開放／API 相關連結")
    for url in ["https://web.pcc.gov.tw/", "https://web.pcc.gov.tw/pis/", "https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic"]:
        try:
            st, ct, body = get(url)
            html = body.decode("utf-8", "ignore")
            title = re.search(r"<title>(.*?)</title>", html, re.S)
            links = re.findall(r'<a[^>]*href="([^"]+)"[^>]*>\s*([^<]{2,40}?)\s*</a>', html)
            hits = [(h, t.strip()) for h, t in links if re.search(r"開放|API|下載|決標|opendata|download", h + t, re.I)]
            print(f"  {url} HTTP {st} {ct.split(';')[0]} {len(body)} bytes 標題：{title.group(1).strip()[:60] if title else ''}")
            print(f"    連結 {len(links)} 個，相關 {len(hits)} 個：")
            for h, t in hits[:25]:
                print(f"      - {t} → {h[:120]}")
            if re.search(r"驗證碼|captcha|請登入", html, re.I):
                print("    ！頁面有驗證碼／登入字樣")
        except Exception as e:
            print(f"  {url} 失敗：{e}")
        pause()

if __name__ == "__main__":
    main()
