#!/usr/bin/env python3
"""
104 徵才中：每週一次的候選池（版本 405）。在使用者的 Chrome 抓 104「找公司」臺北＋新北的徵才中公司 → 用財政部稅籍登記補統編、
地址、資本額、設立年，用 repo 的公開名單補電話 → 寫進雲端硬碟同步檔的設定 hiring-pool-104 → 網站每天從裡面補幾家進今天的名單。

使用者 11/05：「照建議做」（探路結論：前 10 頁 178 家、資本額 300～6,000 萬的 83% 拿得到統編、只有 5% 已在名單；104 沒有日期欄位、
每次查詢最多 100 頁，抓不出「今天新出現」的，所以每週抓一次、收進每日新名單的候選，不另開分頁）。

為什麼要本機接收器：一次約兩萬家、結果兩三 MB，Claude in Chrome 讀網頁的輸出一次只帶得回一千字左右。所以 prepare 在 127.0.0.1 開一個
一次性接收器（帶暗號、收到就關、最多等 3 小時），結果這樣送回 Mac（版本 406）：
  網頁程式在 104 頁面放一顆「開始抓」按鈕 → 按下去先開一個本機分頁 http://127.0.0.1:<埠>/recv.html（開分頁要真的點擊；打開網址不受「存取區域網路」權限管）
  → 抓完用 postMessage 把結果交給那個分頁（它只收 https://www.104.com.tw 來的、暗號對的）→ 那個分頁再 POST 給同一台的接收器。
  原本（版本 405）是 104 網頁直接 POST 到 127.0.0.1，但 Chrome 155 要使用者允許「存取區域網路」，而 Claude 控制的分頁按了也不會跳詢問、直接拒絕（11/05 實測）。
  直接 POST 仍留著當備援（哪天 Chrome 允許了就通）。

同步檔：跟 tools/hiring-104.py 同一份（~/Library/CloudStorage/GoogleDrive-<帳號>/我的雲端硬碟/電話推廣名單-同步資料.json）。
  寫 settings['hiring-pool-104'] = { v: JSON.stringify({ week, at, head, list: [{ key, name, src, count, row }], stats }), at }
    key＝8 碼統編；row＝標準 15 欄的一列（下次聯絡日放 __DAY__，網站套用那天再換）；count＝104 上目前的職缺數。
    at 一定比舊的大。其他設定、records、logs、states、tombstones 不動；改檔前備份到 /tmp/hire104/。
  104 的內容只留職缺數；公司名稱、地址、資本額、設立年都用政府的稅籍登記，電話用 repo leads/ 的公開名單。不存 104 的電話、介紹。

用法：
  python3 tools/hire104-weekly.py prepare [--force]   # 這週抓過就不抓；寫 /tmp/hire104/snippet.js、開本機接收器
  python3 tools/hire104-weekly.py write               # 讀接收器收到的結果，對稅籍檔、組候選池、寫回同步檔（只印筆數）
  python3 tools/hire104-weekly.py status              # 看同步檔裡的候選池（只印筆數）
  選項：--sync <路徑>；write --result <檔> --fia <BGMOPEN1.csv>（測試用）

例行步驟（每週一 08:30，Cowork 的排程任務；手動跑也是這三步）：
  1. 終端機：python3 tools/hire104-weekly.py prepare → 「這週抓過了」就結束。
  2. Claude in Chrome：開新分頁到 https://www.104.com.tw/company/ ，把 /tmp/hire104/snippet.js 整段當 JavaScript 執行，它回傳按鈕的座標（JSON 的 x、y）；
     用 computer 的 left_click 點那顆按鈕（要真的點擊，Chrome 才肯開本機分頁）。會多開一個「電推系統接收」分頁，不要關。
     之後約每 40 秒執行 window.__hire104.poll() 看進度（只有數字），finished 為 true 就停。全部約 45～60 分鐘。
     被 403／429／驗證碼擋會自己停（stopped 有原因），已抓到的照樣送回 Mac。sent 為 false 時看 sendError；
     頁面上會出現「重送到 Mac」的按鈕，點它（同樣用 left_click，座標在 window.__hire104.resendAt）會重開本機分頁再送一次。做完關掉這兩個分頁。
  3. 終端機：python3 tools/hire104-weekly.py write → 印「抓了 N 家、對上統編 M 家、進候選池 K 家」。
  回報只講筆數，不講公司名。/tmp/hire104/ 的東西不進 repo。

規則：repo 是公開的，這支程式的輸出只有筆數與統計。不碰 records、不改洽談狀態。只用 Python 標準函式庫。
"""
import argparse, csv, datetime, glob, http.server, importlib.util, io, json, os, re, secrets, shutil, subprocess, sys, time, unicodedata, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('HIRE104_ROOT') or os.path.dirname(HERE)   # 測試時指到放假 leads/ 的資料夾
_spec = importlib.util.spec_from_file_location('hiring104', os.path.join(HERE, 'hiring-104.py'))
h104 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h104)   # 共用 find_sync／load／setting_json（同一份同步檔、同一套讀法）

WORK = os.environ.get('HIRE104_WORK', '/tmp/hire104')
SNIPPET = os.path.join(WORK, 'snippet.js')
RESULT = os.path.join(WORK, 'result.json')
PIDFILE = os.path.join(WORK, 'receiver.pid')
FIA_DIR = os.path.join(WORK, 'fia')
FIA_URL = 'https://eip.fia.gov.tw/data/BGMOPEN1.zip'   # 財政部全國營業（稅籍）登記，data.gov.tw 9400；repo 的 fetch-biz.mjs 也用這份
POOL_KEY = 'hiring-pool-104'
ORIGIN = 'https://www.104.com.tw'
PORT = int(os.environ.get('HIRE104_PORT', '8765'))
GAP_MS = 2000
POOL_MAX = 400                         # 候選池最多幾家（一天網站只拿幾家，一週用不完；太大同步檔會變肥）
CAP_FLOOR = 2000                       # 仟元；跟網站每日新名單的資本額門檻一樣（版本 362：200 萬），0＝不知道，不擋
CAP_LO, CAP_HI = 3000, 60000           # 仟元；預設篩選 300～6,000 萬，排前面
CITIES = ('臺北市', '新北市')
ORGS = ('股份有限公司', '有限公司', '外國公司在台之分公司', '無限公司', '兩合公司')   # 獨資、合夥是商行那份的事
HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家']
DAY = '__DAY__'

# 在 104 頁面裡執行的程式。臺北（6001001xxx）、新北（6001002xxx）逐區、只看徵才中（sw=2），每區最多 100 頁（104 的上限），
# 一頁一次、間隔 GAP；同一家（encodedCustNo）只留一次。按鈕按下去才開始（要開本機分頁），抓完經本機分頁交給接收器。
JS = r"""(() => {
  const GAP = __GAP__, MAXP = 100, URL_ = __URL__, TOKEN = __TOKEN__;
  const RECV_ORIGIN = new URL(URL_).origin, RECV_PAGE = URL_ + 'recv.html';
  const seen = new Map();
  const st = window.__hire104 = { started: 0, areas: 0, areaDone: 0, pages: 0, overflow: 0, stopped: '', finished: false, sent: false, sendError: '', resendAt: null };
  st.poll = () => JSON.stringify({ started: !!st.started, areas: st.areas, areaDone: st.areaDone, pages: st.pages, companies: seen.size, overflow: st.overflow, stopped: st.stopped, finished: st.finished, sent: st.sent, sendError: st.sendError, resendAt: st.resendAt });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = null;
  const fromRecv = (pred, ms) => new Promise((res) => {
    const t = setTimeout(() => { removeEventListener('message', h); res(null); }, ms);
    const h = (e) => { if (e.origin === RECV_ORIGIN && e.data && pred(e.data)) { clearTimeout(t); removeEventListener('message', h); res(e.data); } };
    addEventListener('message', h);
  });
  const openRecv = () => { const ready = fromRecv((d) => d.ready, 15000); win = window.open(RECV_PAGE, 'hire104recv'); return ready; };   // 要在點擊裡同步叫
  const button = (label, onclick) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, { position: 'fixed', top: '120px', left: '40px', zIndex: 2147483647, padding: '14px 20px', fontSize: '18px', background: '#1f6feb', color: '#fff', border: '0', borderRadius: '8px', cursor: 'pointer' });
    b.onclick = () => { b.remove(); onclick(); };
    document.body.appendChild(b);
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  };
  const get = async (url) => {
    let res;
    try { res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } }); } catch (e) { throw new Error('連線錯誤'); }
    if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    const t = await res.text();
    try { return JSON.parse(t); } catch (e) { throw new Error(/captcha|驗證/i.test(t) ? '驗證碼' : `不是 JSON（HTTP ${res.status}）`); }
  };
  const send = async () => {
    const body = JSON.stringify({ at: Date.now(), areas: st.areas, areaDone: st.areaDone, pages: st.pages, overflow: st.overflow, stopped: st.stopped, list: [...seen.values()] });
    st.sendError = '';
    if (win && !win.closed) {
      const reply = fromRecv((d) => 'ok' in d, 60000);
      win.postMessage({ token: TOKEN, body }, RECV_ORIGIN);
      const r = await reply;
      if (r && r.ok) { st.sent = true; return; }
      st.sendError = r ? `接收器拒收（${r.status || ''}）` : '接收分頁沒回應';
    } else st.sendError = '接收分頁被關掉了';
    try {   // 備援：直接連（Chrome 允許這個網站存取區域網路才會通）
      const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body });
      if (r.ok) { st.sent = true; st.sendError = ''; return; }
    } catch (e) { /* 照留上面的原因 */ }
    st.resendAt = button('重送到 Mac（電推系統）', async () => { st.resendAt = null; await openRecv(); await send(); });
  };
  const crawl = async () => {
    st.started = Date.now();
    try {
      const tree = await get('/jobs/search/ajax/function-tree/area');
      const areas = Object.keys((tree && tree.data) || {}).filter((k) => /^60010(01|02)\d{3}$/.test(k) && !k.endsWith('000'));
      st.areas = areas.length;
      for (const a of areas) {
        let last = 1;
        for (let p = 1; p <= Math.min(last, MAXP); p++) {
          await sleep(GAP);
          const j = await get(`/company/ajax/list?area=${a}&jobsource=n_my104_search&mode=s&page=${p}&sw=2&features=1&pageSize=18`);
          const pg = (j && j.metadata && j.metadata.pagination) || {};
          if (p === 1) { last = Math.max(1, Number(pg.lastPage) || 1); if (Number(pg.total) > MAXP * 18) st.overflow += Number(pg.total) - MAXP * 18; }
          const rows = Array.isArray(j && j.data) ? j.data : [];
          rows.forEach((x) => {
            const k = (x && (x.encodedCustNo || x.name)) || '';
            if (!k || seen.has(k)) return;
            seen.set(k, { name: x.name || '', area: x.areaDesc || '', count: Math.max(0, Math.floor(Number(x.jobCount) || 0)) });
          });
          st.pages += 1;
          if (!rows.length) break;
        }
        st.areaDone += 1;
      }
    } catch (e) { st.stopped = (e && e.message) || String(e); }
    await send();
    st.finished = true;
  };
  return JSON.stringify(button('開始抓 104 徵才中（電推系統）', () => { openRecv(); crawl(); }));
})()"""


# ---------- 純函式（tests/hire104-weekly.test.js 用假資料測） ----------
def norm(s):
    """公司名正規化：全形轉半形、去空白、去結尾括號品牌、台→臺（稅籍檔用「臺」）。瀏覽器端沒有用到，兩邊只在這裡比。"""
    s = unicodedata.normalize('NFKC', str(s or ''))
    s = re.sub(r'\s+', '', s)
    s = re.sub(r'\([^()]*\)$', '', s)
    return s.replace('台', '臺')


def strip_branch(n):
    """「…公司臺灣分公司」「…公司臺北營業所」→「…公司」（稅籍檔的外商分公司）"""
    n = re.sub(r'臺灣分公司$', '', n)
    n = re.sub(r'(?<=公司)[^公司]{1,4}(分公司|營業所|分店)$', '', n)
    return re.sub(r'臺灣分公司$', '', n)


def city_of(addr):
    a = norm(addr)
    a = re.sub(r'^[\d\-]+', '', a)
    return a[:3] if a[:3] in CITIES else ''


def week_of(d):
    y, w, _ = d.isocalendar()
    return f'{y}-W{w:02d}'


def year_of(setup):
    d = re.sub(r'\D', '', str(setup or ''))
    if len(d) == 7: return str(int(d[:3]) + 1911)
    if len(d) == 8: return d[:4]
    return ''


def kilo(yuan):
    """稅籍的資本額是元 → 仟元（整數）；沒填回 0"""
    d = re.sub(r'\D', '', str(yuan or ''))
    return int(d) // 1000 if d else 0


def csv_row(vals):
    """跟網站各頁的 toStandardCsv 一樣：欄位有逗號、引號、換行就加引號（訪談內容有換行；csv.writer 行尾設空字串時不會替換行加引號）"""
    q = lambda v: f'"{v.replace(chr(34), chr(34) * 2)}"' if any(ch in v for ch in ',"\n\r') else v
    return ','.join(q(str(v)) for v in vals)


def pick(cands, city):
    """同名的稅籍資料挑一家：縣市要對、組織別要是公司；剩一家才收，兩家以上不猜（回 None）。總機構優先。"""
    c = [x for x in cands if x['city'] == city and x['org'] in ORGS] if city else [x for x in cands if x['org'] in ORGS]
    hq = [x for x in c if not x['hq']]
    c = hq or c
    uniq = {x['tax']: x for x in c}
    return next(iter(uniq.values())) if len(uniq) == 1 else None


def build_pool(crawl, fia_rows, phones, existing, buried, today):
    """104 抓到的公司 → 候選池（list 已排好）＋統計。crawl：[{name, area, count}]；fia_rows：正規化名 → [稅籍列]。"""
    stats = {'crawled': len(crawl), 'hiring': 0, 'matched': 0, 'ambiguous': 0, 'noTax': 0, 'already': 0, 'lowCap': 0, 'noPhone': 0}
    out, seen = [], set()
    for c in crawl:
        if int(c.get('count') or 0) <= 0: continue
        stats['hiring'] += 1
        n = norm(c.get('name'))
        cands = fia_rows.get(n) or fia_rows.get(strip_branch(n)) or []
        if not cands: stats['noTax'] += 1; continue
        hit = pick(cands, city_of(c.get('area')))
        if not hit: stats['ambiguous'] += 1; continue
        if hit['tax'] in seen: continue
        seen.add(hit['tax'])
        stats['matched'] += 1
        bare = re.sub(r'\s', '', hit['name'])   # Python 3.9：f-string 裡不能有反斜線
        keys = {f"tax:{hit['tax']}", f'name:{bare}'}
        if keys & existing or keys & buried: stats['already'] += 1; continue
        cap = hit['cap']
        if cap and cap < CAP_FLOOR: stats['lowCap'] += 1; continue
        tel = phones.get(hit['tax'], '')
        if not tel: stats['noPhone'] += 1; continue   # 每日新名單只進有電話的（版本 318）
        out.append({'hit': hit, 'count': int(c['count']), 'tel': tel, 'target': CAP_LO <= cap <= CAP_HI})
    out.sort(key=lambda x: (not x['target'], -x['count'], x['hit']['name']))
    out = out[:POOL_MAX]
    md = f'{today.month}/{today.day}'
    lst = []
    for x in out:
        h = x['hit']
        note = f"104 徵才中：{x['count']} 件（{md} 查）\n每日新名單，符合：104 徵才中"
        row = csv_row([h['name'], h['tax'], '', year_of(h['setup']), f"{h['cap']:,}" if h['cap'] else '', x['tel'], '', '', h['ind'], DAY, '', note, h['addr'], today.isoformat(), ''])
        lst.append({'key': h['tax'], 'name': h['name'], 'src': '104 徵才中', 'count': x['count'], 'row': row})
    stats['pool'] = len(lst)
    stats['target'] = sum(1 for x in out if x['target'])
    return lst, stats


# ---------- 讀檔 ----------
def read_fia(path, wanted):
    """稅籍檔只留名字在 wanted 裡的（含外商分公司去後綴）。回 正規化名 → [ {tax, name, hq, city, org, cap, setup, addr, ind} ]"""
    out = {}
    with open(path, encoding='utf-8-sig', newline='') as f:
        head = None
        for line in csv.reader(f):
            if head is None:
                if '統一編號' in line: head = {k: i for i, k in enumerate(line)}
                continue
            if len(line) < len(head) - 4: continue
            raw = line[head['營業人名稱']]
            n = norm(raw)
            for k in {n, strip_branch(n)}:
                if k not in wanted: continue
                addr = unicodedata.normalize('NFKC', line[head['營業地址']].strip())
                out.setdefault(k, []).append({'tax': line[head['統一編號']].strip(), 'name': raw.strip(), 'hq': line[head['總機構統一編號']].strip(),
                    'city': city_of(addr), 'org': line[head['組織別名稱']].strip(), 'cap': kilo(line[head['資本額']]), 'setup': line[head['設立日期']].strip(),
                    'addr': addr, 'ind': line[head['名稱']].strip() if '名稱' in head else ''})
    return out


def read_phones(root):
    """repo leads/ 的公開名單：統編 → 第一支電話（貿易署電話表、標案、健保、工廠、產業、電子發票、上市櫃）"""
    out = {}
    srcs = [('leads/trade/phones.csv', '統編', '電話'), ('leads/trade/trade.csv', '統編', '電話'), ('leads/pcc/pcc.csv', '統編', '電話'),
            ('leads/nhi/nhi.csv', '統編', '電話'), ('leads/factory/factory.csv', '統編', '電話'), ('leads/industry/industry.csv', '統編', '電話'),
            ('leads/einv/einv.csv', '統編', '電話'), ('leads/listed/companies.csv', '統一編號', '總機電話')]
    for rel, kt, kp in srcs:
        p = os.path.join(root, rel)
        if not os.path.exists(p): continue
        with open(p, encoding='utf-8-sig', newline='') as f:
            for r in csv.DictReader(f):
                t = re.sub(r'\D', '', r.get(kt) or '')
                tel = (r.get(kp) or '').strip()
                if len(t) == 8 and tel and t not in out: out[t] = tel
    return out


def ensure_fia(path=None):
    if path: return path
    os.makedirs(FIA_DIR, exist_ok=True)
    csvp = os.path.join(FIA_DIR, 'BGMOPEN1.csv')
    if os.path.exists(csvp) and time.time() - os.path.getmtime(csvp) < 6 * 86400: return csvp
    zp = os.path.join(FIA_DIR, 'BGMOPEN1.zip')
    req = urllib.request.Request(FIA_URL, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'})
    with urllib.request.urlopen(req, timeout=600) as r, open(zp, 'wb') as f: shutil.copyfileobj(r, f)
    with zipfile.ZipFile(zp) as z:
        name = next(n for n in z.namelist() if n.lower().endswith('.csv'))
        with z.open(name) as src, open(csvp, 'wb') as dst: shutil.copyfileobj(src, dst)
    os.remove(zp)
    os.utime(csvp, None)
    return csvp


def save_setting(path, data, key, value):
    settings = data.setdefault('settings', {})
    now = int(time.time() * 1000)
    old = settings.get(key) or {}
    at = max(now, int(old.get('at') or 0) + 1)
    value = dict(value, at=at)
    settings[key] = {'v': json.dumps(value, ensure_ascii=False, separators=(',', ':')), 'at': at}
    os.makedirs(WORK, exist_ok=True)
    backup = os.path.join(WORK, f'backup-{datetime.datetime.now():%Y%m%d-%H%M%S}.json')
    shutil.copy2(path, backup)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    tmp = path + '.hire104.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8') as f: f.write(body)
        os.replace(tmp, path)
    except OSError:   # 雲端硬碟的資料夾不給換名就直接寫
        if os.path.exists(tmp): os.remove(tmp)
        with open(path, 'w', encoding='utf-8') as f: f.write(body)
    return backup


# ---------- 子命令 ----------
def receiver_alive():
    try:
        pid = int(open(PIDFILE).read().strip())
        os.kill(pid, 0)
        return pid
    except Exception:
        return 0


def cmd_prepare(a):
    today = datetime.date.today()
    data = h104.load(h104.find_sync(a.sync))
    pool = h104.setting_json(data, POOL_KEY)
    if pool and pool.get('week') == week_of(today) and not a.force:
        print(f"這週（{pool['week']}）抓過了，候選池 {len(pool.get('list') or [])} 家；要重抓加 --force")
        return 0
    os.makedirs(WORK, exist_ok=True)
    old = receiver_alive()
    if old:
        try: os.kill(old, 15)
        except OSError: pass
    if os.path.exists(RESULT): os.remove(RESULT)
    token = secrets.token_hex(16)
    js = JS.replace('__GAP__', str(GAP_MS)).replace('__URL__', json.dumps(f'http://127.0.0.1:{PORT}/')).replace('__TOKEN__', json.dumps(token))
    with open(SNIPPET, 'w', encoding='utf-8') as f: f.write(js)
    log = open(os.path.join(WORK, 'receiver.log'), 'a')
    p = subprocess.Popen([sys.executable, os.path.abspath(__file__), 'receive', '--token', token], stdout=log, stderr=log, start_new_session=True)
    with open(PIDFILE, 'w') as f: f.write(str(p.pid))
    print(f'接收器開好了（127.0.0.1:{PORT}，最多等 3 小時）。在 Chrome 的 104 頁面執行 {SNIPPET}')
    return 0


RECV_PAGE = """<!doctype html><meta charset="utf-8"><title>電推系統接收</title>
<body style="font:16px sans-serif;padding:24px">電推系統：等 104 網頁把結果送過來（這個分頁不要關）…
<script>
const TOKEN = __TOKEN__, FROM = __FROM__;
addEventListener('message', async (e) => {
  if (e.origin !== FROM || !e.data || e.data.token !== TOKEN || typeof e.data.body !== 'string') return;
  let ok = false, status = 0;
  try { const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body: e.data.body }); ok = r.ok; status = r.status; } catch (err) { status = -1; }
  document.body.textContent = ok ? '電推系統：收到了，這個分頁可以關掉。' : '電推系統：沒存成（' + status + '）';
  e.source.postMessage({ ok, status }, e.origin);
});
if (window.opener) window.opener.postMessage({ ready: true }, FROM);
</script>"""


def cmd_receive(a):
    token = a.token
    deadline = time.time() + a.hours * 3600
    self_origin = f'http://127.0.0.1:{PORT}'
    page = RECV_PAGE.replace('__TOKEN__', json.dumps(token)).replace('__FROM__', json.dumps(ORIGIN)).encode('utf-8')

    class H(http.server.BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Token')
            self.send_header('Access-Control-Allow-Private-Network', 'true')

        def do_OPTIONS(self):
            if self.headers.get('Origin') != ORIGIN: self.send_response(403); self.end_headers(); return
            self.send_response(204); self._cors(); self.end_headers()

        def do_GET(self):   # 本機接收分頁（104 網頁開它、postMessage 給它）
            if self.path.split('?')[0] != '/recv.html': self.send_response(404); self.end_headers(); return
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(page)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(page)

        def do_POST(self):   # 本機接收分頁（同源）或 104 網頁直接送（Chrome 允許存取區域網路時）
            if self.headers.get('Origin') not in (ORIGIN, self_origin) or self.headers.get('X-Token') != token:
                self.send_response(403); self.end_headers(); return
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > 40 * 1024 * 1024: self.send_response(413); self.end_headers(); return
            body = self.rfile.read(n)
            try: json.loads(body)
            except Exception: self.send_response(400); self._cors(); self.end_headers(); return
            tmp = RESULT + '.tmp'
            with open(tmp, 'wb') as f: f.write(body)
            os.replace(tmp, RESULT)
            self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
            self.server.done = True

        def log_message(self, *args): pass

    srv = http.server.HTTPServer(('127.0.0.1', PORT), H)
    srv.done = False
    srv.timeout = 5
    while not srv.done and time.time() < deadline:
        srv.handle_request()
    srv.server_close()
    try: os.remove(PIDFILE)
    except OSError: pass
    return 0


def cmd_write(a):
    path = a.result or RESULT
    if not os.path.exists(path):
        print('還沒收到 104 的結果（網頁那段沒跑完，或沒送回 Mac）；同步檔不動。'); return 1
    with open(path, encoding='utf-8') as f: res = json.load(f)
    crawl = res.get('list') or []
    if not crawl:
        print(f"一家都沒抓到{('（' + res.get('stopped') + '）') if res.get('stopped') else ''}；同步檔不動。"); return 1
    today = datetime.date.today()
    wanted = set()
    for c in crawl:
        n = norm(c.get('name')); wanted.add(n); wanted.add(strip_branch(n))
    fia = read_fia(ensure_fia(a.fia), wanted)
    phones = read_phones(ROOT)
    spath = h104.find_sync(a.sync)
    data = h104.load(spath)
    existing = set()
    for r in data.get('records') or []:
        t = re.sub(r'\D', '', str(r.get('taxId') or ''))
        if t: existing.add(f'tax:{t}')
        nm = re.sub(r'\s', '', str(r.get('company') or ''))
        if nm: existing.add(f'name:{nm}')
    tombs = ((data.get('tombstones') or {}).get('companies') or {}) if isinstance(data.get('tombstones'), dict) else {}
    buried = {k for k, v in tombs.items() if not (isinstance(v, dict) and v.get('lifted'))}
    lst, stats = build_pool(crawl, fia, phones, existing, buried, today)
    stats.update({'areas': res.get('areas'), 'pages': res.get('pages'), 'overflow': res.get('overflow'), 'stopped': res.get('stopped') or ''})
    if not lst:
        print(f"抓了 {stats['crawled']} 家，可以進候選池的 0 家；同步檔不動。"); return 1
    backup = save_setting(spath, data, POOL_KEY, {'week': week_of(today), 'day': today.isoformat(), 'head': ','.join(HEAD), 'list': lst, 'stats': stats})
    stop = f"；中途停了：{stats['stopped']}" if stats['stopped'] else ''
    print(f"抓了 {stats['crawled']} 家（{stats['pages']} 頁，徵才中 {stats['hiring']}），對上統編 {stats['matched']}（同名不確定 {stats['ambiguous']}、查無 {stats['noTax']}）；"
          f"已在名單或刪過 {stats['already']}、資本額未滿 200 萬 {stats['lowCap']}、沒電話 {stats['noPhone']}；進候選池 {stats['pool']} 家（300～6,000 萬 {stats['target']}）{stop}。"
          f"已寫回同步檔（備份在 {backup}）")
    return 0


def cmd_status(a):
    data = h104.load(h104.find_sync(a.sync))
    pool = h104.setting_json(data, POOL_KEY)
    if not pool:
        print('候選池：還沒有'); return 0
    s = pool.get('stats') or {}
    print(f"候選池：{len(pool.get('list') or [])} 家（{pool.get('week')}，{pool.get('day')} 寫的；抓了 {s.get('crawled')} 家）")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sync')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('prepare'); p.add_argument('--force', action='store_true')
    p = sub.add_parser('receive'); p.add_argument('--token', required=True); p.add_argument('--hours', type=float, default=3)
    p = sub.add_parser('write'); p.add_argument('--result'); p.add_argument('--fia')
    sub.add_parser('status')
    a = ap.parse_args()
    return {'prepare': cmd_prepare, 'receive': cmd_receive, 'write': cmd_write, 'status': cmd_status}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
