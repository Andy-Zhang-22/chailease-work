#!/usr/bin/env python3
"""
104 徵才查詢：探路腳本（一次性，只印欄位與筆數，不印公司名）。

目的：確認從 Mac 連 104 的搜尋介面通不通、回什麼欄位、有沒有驗證碼，
      再決定「每天把新名單拿去 104 查有沒有在徵才」正式怎麼做。
用法：
  python3 probe_104/probe_104.py --from-sync        # 從 Google 雲端硬碟的同步檔取今天的新名單（最多 3 家）
  python3 probe_104/probe_104.py --names 甲 乙 丙    # 自己給公司名
規則：一家一次、間隔 2 秒、失敗重試 1 次；遇到 403／429／驗證碼就停，不繞。
只用 Python 標準函式庫。
"""
import argparse, glob, json, os, sys, time, urllib.parse, urllib.request, urllib.error, datetime

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
SEARCH = 'https://www.104.com.tw/jobs/search/list?ro=0&keyword={kw}&order=15&asc=0&page=1&mode=s&jobsource=2018indexpoc'
JOBLIST = 'https://www.104.com.tw/company/ajax/joblist/{custno}?roleJobCat=0_0&area=0&page=1&pageSize=20&order=11&asc=0'
HEADERS = {'User-Agent': UA, 'Referer': 'https://www.104.com.tw/jobs/search/', 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'zh-TW,zh;q=0.9'}
GAP = 2.0

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read()
                return r.status, r.headers.get('Content-Type', ''), body
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get('Content-Type', '') if e.headers else '', e.read()
        except Exception as e:  # 連線錯誤
            if attempt == 0:
                time.sleep(GAP); continue
            return 0, '', str(e).encode()
    return 0, '', b''

def blocked(status, body):
    text = body[:4000].decode('utf-8', 'ignore').lower()
    return status in (403, 429) or 'captcha' in text or 'verify you are human' in text or 'robot' in text

def norm(s):
    return ''.join(str(s or '').split()).replace('（', '(').replace('）', ')')

def today_names():
    """從 Google 雲端硬碟桌面版同步的資料夾找同步檔，取今天新名單的公司名（最多 3 家）。只在這台電腦上讀，不印名字。"""
    home = os.path.expanduser('~')
    pats = [f'{home}/Library/CloudStorage/GoogleDrive-*/*/電話推廣名單-同步資料.json',
            f'{home}/Google Drive/*/電話推廣名單-同步資料.json', f'{home}/Google Drive/電話推廣名單-同步資料.json']
    files = [f for p in pats for f in glob.glob(p)]
    if not files:
        print('找不到同步檔（Google 雲端硬碟桌面版的資料夾）；改用 --names 給公司名'); return []
    with open(files[0], encoding='utf-8') as f:
        data = json.load(f)
    recs = data.get('records') or []
    today = datetime.date.today().isoformat()
    fresh = [r for r in recs if str(r.get('source', '')).startswith(f'每日新名單-{today}')]
    print(f'同步檔：{len(recs)} 筆客戶，今天的新名單 {len(fresh)} 家（取前 3 家試）')
    return [r.get('company') for r in fresh if r.get('company')][:3]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--names', nargs='*', default=[])
    ap.add_argument('--from-sync', action='store_true')
    a = ap.parse_args()
    names = a.names or (today_names() if a.from_sync else [])
    if not names:
        print('沒有公司名可查'); sys.exit(1)
    for i, name in enumerate(names, 1):
        if i > 1: time.sleep(GAP)
        st, ct, body = get(SEARCH.format(kw=urllib.parse.quote(name)))
        print(f'\n第 {i} 家：HTTP {st}，Content-Type {ct[:40]}，{len(body)} bytes')
        if blocked(st, body):
            print('  被擋（403／429／驗證碼），停止。'); sys.exit(2)
        try:
            j = json.loads(body)
        except Exception:
            print('  不是 JSON；開頭：', body[:120].decode('utf-8', 'ignore').replace('\n', ' ')); continue
        print('  最外層鍵：', sorted(j.keys())[:12])
        data = j.get('data') or {}
        if isinstance(data, dict):
            print('  data 的鍵：', sorted(data.keys())[:15])
            lst = data.get('list') or []
            print(f'  totalCount={data.get("totalCount")}，list {len(lst)} 筆')
            if lst:
                print('  每筆的鍵：', sorted(lst[0].keys())[:40])
                hit = [x for x in lst if norm(x.get('custName')) == norm(name)]
                print(f'  公司名完全相同的：{len(hit)} 筆；日期欄 appearDate 例：{(hit or lst)[0].get("appearDate")}')
                cust = (hit or [{}])[0].get('custNo')
                if cust:
                    time.sleep(GAP)
                    st2, ct2, body2 = get(JOBLIST.format(custno=cust))
                    print(f'  公司職缺頁：HTTP {st2}，{len(body2)} bytes')
                    if blocked(st2, body2):
                        print('  被擋，停止。'); sys.exit(2)
                    try:
                        j2 = json.loads(body2)
                        d2 = j2.get('data') or {}
                        print('  職缺頁的鍵：', sorted(j2.keys())[:10], '／data：', sorted(d2.keys())[:12] if isinstance(d2, dict) else type(d2).__name__)
                        if isinstance(d2, dict):
                            print(f'  職缺 totalCount={d2.get("totalCount")}')
                    except Exception:
                        print('  職缺頁不是 JSON；開頭：', body2[:120].decode('utf-8', 'ignore').replace('\n', ' '))
    print('\n探路結束。')

if __name__ == '__main__':
    main()
