#!/usr/bin/env python3
"""
104 徵才查詢：Mac 這一段（版本 388）。讀候選池 → 在使用者的 Chrome 裡查 104 → 把職缺數寫回同步檔。

三段流程（版本 387 的 README 有整體說明）：
  1. 清晨：GitHub Actions 的 feed-drive 把「候選池」寫進雲端硬碟同步檔的設定 hiring-candidates。
  2. 早上（這支）：Mac 從雲端硬碟桌面版的同步檔讀候選池，在使用者自己的 Chrome（Claude in Chrome）裡逐家查 104 的
     「找公司」API 拿目前職缺數，寫回設定 hiring-results。104 擋程式（直接連是 403），只走使用者授權的這一條。
  3. 網站同步完看到結果，有徵才的從候選池加進今天的名單、卡片標「104 徵才 N 件」。

同步檔：~/Library/CloudStorage/GoogleDrive-<帳號>/我的雲端硬碟/電話推廣名單-同步資料.json
  頂層 settings 是物件，每個鍵的值是 { v: <字串>, at: <毫秒時間戳> }。
  讀 settings['hiring-candidates'].v（JSON 字串）→ { day, at, head, list: [{ key, name, src, row }] }
    key 多半是 8 碼統編（商行可能是名稱）；name 是公司全名；row 是匯入用的那一列（15 欄 CSV），這裡只拿「地址」欄算縣市。
  寫 settings['hiring-results'] = { v: JSON.stringify({ at, list: [{ key, count, at }] }), at }
    count 是 104 上目前的職缺數（整數），查無這家算 0；被擋而沒查到的不寫（不是 0）。
    at 一定比舊的大（網站合併設定時取 at 較大的那份）。其他鍵、records、logs、states、tombstones 一律不動。
  改檔前先備份一份到 /tmp/hiring-104/；寫回時整個 JSON 重新序列化（UTF-8、跟網站一樣不縮排）。

用法（三步，由本機對話窗的 Claude 照「例行步驟」跑；人也可以手動跑）：
  python3 tools/hiring-104.py prepare            # 讀候選池，寫 /tmp/hiring-104/snippet.js（要在 Chrome 的 104 頁面裡執行的程式）
  python3 tools/hiring-104.py write /tmp/hiring-104/results.json    # 把 Chrome 查到的結果寫回同步檔
  python3 tools/hiring-104.py status             # 看同步檔裡現在的候選池與結果（只印筆數）
  選項：--sync <路徑> 指定同步檔；prepare --any-day 候選池不是今天的也照查。

例行步驟（每個上班日早上 07:40，Cowork 的排程任務；手動跑也是這三步）：
  1. 終端機：python3 tools/hiring-104.py prepare → 印「候選 N 家」。印「今天沒有候選池」就結束，不用查。
  2. Claude in Chrome：開新分頁到 https://www.104.com.tw/company/ ，把 /tmp/hiring-104/snippet.js 整個內容當 JavaScript 執行
     （它會自己一家一次、間隔 2 秒，背景跑，約 2～3 分鐘）；每 30 秒執行 window.__hiring104.poll() 看進度，
     finished 為 true 就把 window.__hiring104.result（字串）原封不動存成 /tmp/hiring-104/results.json。
     被 403／429／驗證碼擋會自己停（stopped 有原因），已查到的照樣存。
  3. 終端機：python3 tools/hiring-104.py write /tmp/hiring-104/results.json → 印「查了 N 家、M 家有徵才」。
  回報只講筆數：候選幾家、查了幾家、幾家有徵才。不印公司名、不留職缺內容；/tmp 底下的檔案不進 repo。

規則：repo 是公開的，這支程式的輸出只有筆數與統計。104 的內容只留職缺數。不碰 records、不改洽談狀態。只用 Python 標準函式庫。
"""
import argparse, csv, datetime, glob, io, json, os, shutil, sys, time

WORK = '/tmp/hiring-104'
SNIPPET = os.path.join(WORK, 'snippet.js')
RESULTS = os.path.join(WORK, 'results.json')
POOL_KEY, RESULT_KEY = 'hiring-candidates', 'hiring-results'
GAP_MS = 2000

# 在 104 頁面裡執行的程式。__LIST__ 會換成候選清單 [{key, name, city}]。
# 找公司 API（探路結論，probe_104/README.md）：GET /company/ajax/list?keyword=<公司名>&jobsource=index_s_cs&features=1&pageSize=18
#   回 data[]：name、areaDesc、jobCount…。name 結尾可能帶括號品牌，比對前去掉；同名多筆再比 areaDesc 的縣市，對不上算 0。
JS = r"""(() => {
  const LIST = __LIST__;
  const GAP = __GAP__;
  const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/臺/g, '台');
  const strip = (s) => norm(s).replace(/\([^()]*\)$/, '');
  const st = window.__hiring104 = { started: Date.now(), n: LIST.length, done: 0, hit: 0, stopped: '', finished: false, list: [], result: '' };
  st.poll = () => JSON.stringify({ n: st.n, done: st.done, hit: st.hit, stopped: st.stopped, finished: st.finished });
  const finish = () => { st.finished = true; st.result = JSON.stringify({ at: Date.now(), n: st.n, done: st.done, hit: st.hit, stopped: st.stopped, list: st.list }); };
  (async () => {
    for (const c of LIST) {
      if (st.done) await new Promise((r) => setTimeout(r, GAP));
      let res, text;
      try {
        res = await fetch(`/company/ajax/list?keyword=${encodeURIComponent(c.name)}&jobsource=index_s_cs&features=1&pageSize=18`,
          { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } });
        text = await res.text();
      } catch (e) { st.stopped = `連線錯誤：${e && e.message}`; break; }
      if (res.status === 403 || res.status === 429) { st.stopped = `HTTP ${res.status}`; break; }
      let j;
      try { j = JSON.parse(text); } catch (e) { st.stopped = /captcha|驗證/i.test(text) ? '驗證碼' : `不是 JSON（HTTP ${res.status}）`; break; }
      const rows = Array.isArray(j && j.data) ? j.data : [];
      const want = strip(c.name);
      let same = rows.filter((r) => strip(r && r.name) === want);
      if (same.length > 1) same = c.city ? same.filter((r) => norm(r.areaDesc).startsWith(c.city)) : [];
      const count = same.length ? Math.max(0, Math.floor(Number(same[0].jobCount) || 0)) : 0;
      st.list.push({ key: c.key, count, at: Date.now() });
      st.done += 1; if (count > 0) st.hit += 1;
    }
    finish();
  })();
  return `started ${st.n}`;
})()"""


def find_sync(path=None):
    if path:
        return path
    home = os.path.expanduser('~')
    pats = [f'{home}/Library/CloudStorage/GoogleDrive-*/*/電話推廣名單-同步資料.json',
            f'{home}/Google Drive/*/電話推廣名單-同步資料.json', f'{home}/Google Drive/電話推廣名單-同步資料.json']
    files = [f for p in pats for f in glob.glob(p)]
    if not files:
        sys.exit('找不到同步檔（Google 雲端硬碟桌面版的資料夾）；用 --sync 指定路徑')
    return files[0]


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def setting_json(data, key):
    e = (data.get('settings') or {}).get(key)
    if not e or not isinstance(e, dict) or not e.get('v'):
        return None
    try:
        return json.loads(e['v'])
    except Exception:
        return None


def city_of(head, row):
    """候選列是 15 欄 CSV，拿「地址」欄的前三個字當縣市（臺→台）；沒有就空字串。"""
    try:
        cols = next(csv.reader(io.StringIO(head)))
        vals = next(csv.reader(io.StringIO(row)))
        i = cols.index('地址')
        addr = ''.join(vals[i].split()).replace('臺', '台') if i < len(vals) else ''
        return addr[:3] if len(addr) >= 3 and addr[2] in '市縣' else ''
    except Exception:
        return ''


def norm_name(s):
    return ''.join(str(s or '').split()).replace('（', '(').replace('）', ')').replace('臺', '台')


def cmd_prepare(a):
    path = find_sync(a.sync)
    data = load(path)
    pool = setting_json(data, POOL_KEY)
    if not pool or not isinstance(pool.get('list'), list):
        print('同步檔裡沒有候選池（設定 hiring-candidates），清晨的後台可能還沒跑；不查。'); return 0
    today = datetime.date.today().isoformat()
    if pool.get('day') != today and not a.any_day:
        print(f'候選池是 {pool.get("day")} 的，今天（{today}）沒有候選池；不查（要查就加 --any-day）。'); return 0
    seen, lst = set(), []
    for c in pool['list']:
        key, name = str(c.get('key') or '').strip(), str(c.get('name') or '').strip()
        if not key or not name or key in seen:
            continue
        seen.add(key)
        lst.append({'key': key, 'name': name, 'city': city_of(pool.get('head') or '', c.get('row') or '')})
    os.makedirs(WORK, exist_ok=True)
    with open(SNIPPET, 'w', encoding='utf-8') as f:
        f.write(JS.replace('__LIST__', json.dumps(lst, ensure_ascii=False)).replace('__GAP__', str(GAP_MS)))
    with_city = sum(1 for x in lst if x['city'])
    print(f'候選 {len(lst)} 家（{pool.get("day")}，{with_city} 家有縣市可比對）；程式寫在 {SNIPPET}，預計 {len(lst) * GAP_MS // 1000 // 60 + 1} 分鐘。')
    return 0


def cmd_write(a):
    with open(a.results, encoding='utf-8') as f:
        raw = f.read().strip()
    res = json.loads(raw)
    if isinstance(res, str):   # 存的是 result 字串再被包一層
        res = json.loads(res)
    lst = res.get('list') if isinstance(res, dict) else None
    if not isinstance(lst, list):
        sys.exit('結果檔不是 { at, list: [...] } 的格式')
    now = int(time.time() * 1000)
    clean, seen = [], set()
    for x in lst:
        key = str((x or {}).get('key') or '').strip()
        if not key or key in seen:
            continue
        seen.add(key)
        clean.append({'key': key, 'count': max(0, int(float((x or {}).get('count') or 0))), 'at': int((x or {}).get('at') or now)})
    if not clean:
        print('一家都沒查到（可能一開始就被擋），同步檔不動。'); return 0
    path = find_sync(a.sync)
    data = load(path)
    settings = data.setdefault('settings', {})
    old = settings.get(RESULT_KEY) or {}
    at = max(now, int(old.get('at') or 0) + 1)
    settings[RESULT_KEY] = {'v': json.dumps({'at': at, 'list': clean}, ensure_ascii=False, separators=(',', ':')), 'at': at}
    os.makedirs(WORK, exist_ok=True)
    backup = os.path.join(WORK, f'backup-{datetime.datetime.now():%Y%m%d-%H%M%S}.json')
    shutil.copy2(path, backup)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    tmp = path + '.hiring-104.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(body)
        os.replace(tmp, path)
    except OSError:   # 雲端硬碟的資料夾不給換名就直接寫
        if os.path.exists(tmp):
            os.remove(tmp)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body)
    hit = sum(1 for x in clean if x['count'] > 0)
    stopped = f'；中途被擋：{res.get("stopped")}' if isinstance(res, dict) and res.get('stopped') else ''
    print(f'查了 {len(clean)} 家、{hit} 家有徵才{stopped}。已寫回同步檔（備份在 {backup}），網站同步後會自己把有徵才的加進今天的名單。')
    return 0


def cmd_status(a):
    data = load(find_sync(a.sync))
    pool, res = setting_json(data, POOL_KEY), setting_json(data, RESULT_KEY)
    fmt = lambda ms: datetime.datetime.fromtimestamp(int(ms) / 1000).strftime('%m/%d %H:%M') if ms else '—'
    print(f'候選池：{len(pool["list"]) if pool and isinstance(pool.get("list"), list) else 0} 家（{pool.get("day") if pool else "沒有"}）')
    if res and isinstance(res.get('list'), list):
        print(f'結果：查了 {len(res["list"])} 家、{sum(1 for x in res["list"] if int(x.get("count") or 0) > 0)} 家有徵才（{fmt(res.get("at"))} 寫的）')
    else:
        print('結果：還沒有')
    return 0


def main():
    ap = argparse.ArgumentParser(description='104 徵才查詢：讀候選池、寫回職缺數（只印筆數）')
    ap.add_argument('--sync', help='同步檔路徑（預設自己找雲端硬碟桌面版的資料夾）')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('prepare', help='讀候選池，寫要在 Chrome 裡執行的程式'); p.add_argument('--any-day', action='store_true')
    w = sub.add_parser('write', help='把 Chrome 查到的結果寫回同步檔'); w.add_argument('results', nargs='?', default=RESULTS)
    sub.add_parser('status', help='看候選池與結果的筆數')
    a = ap.parse_args()
    return {'prepare': cmd_prepare, 'write': cmd_write, 'status': cmd_status}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
