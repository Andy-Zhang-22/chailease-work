/*
 * 「新公司」分頁：經濟部每月的公司設立／變更登記清冊。
 *
 * 以前是獨立網站（leads/index.html），使用者說兩個網站分開很難用，就併進主站當一個分頁。
 * 併進來的只有畫面：清冊資料還是 GitHub Actions 每月抓成 CSV 放在 leads/ 底下，這裡用
 * fetch 讀；客戶名單（IndexedDB）完全不碰。兩邊的交集只有一條路：「加入客戶名單」把篩好的
 * 清冊組成跟 Actions 一模一樣的 CSV，送進主站現成的匯入流程（會再問一次條件、自動略過重複）。
 *
 * 成立年：變更清冊上只有「核准變更日期」，沒有設立日期。打開分頁就自動在背景拿統編查
 * 商工登記（跟「從商工登記更新公司資料」同一條路：官方 → 自架代理 → g0v 鏡像，一次一家
 * 隔 300ms），查到的存在 localStorage，設立日期不會變所以永遠不用重查。
 */
(function (global) {
  'use strict';

  const PAGE = 80;
  const DATA_BASE = 'leads/';
  const TYPE_LABEL = { change: '變更', setup: '設立' };
  const IND = { C: '製造業', E: '營造業', G: '運輸倉儲', F: '批發零售', I: '專業服務', H: '金融不動產', J: '文教育樂', A: '農林漁牧', D: '水電燃氣', B: '礦業土石', Z: '其他' };
  const IND_ORDER = ['C', 'E', 'G', 'F', 'I', 'H', 'J', 'A', 'D', 'B', 'Z'];
  const REASONS = [
    ['up', '增資／發行新股', /增資|發行新股/],
    ['owner', '負責人／董事變更', /負責人|董事|代表人/],
    ['move', '遷址', /所在地|遷/],
    ['down', '減資', /減資/],
    ['other', '其他變更', null],
  ];
  const HOLDING_RE = /投資|資產|控股|創投|管理顧問|顧問/;
  // 案由看得出在擴張的：遷址、所營事業／營業項目變更、設立分公司
  const EXPAND_RE = /所在地|遷|所營事業|營業項目|分公司/;
  const AGE = [['lt5', '未滿 5 年'], ['ge5', '5 年以上']];
  const AGE_YEARS = 5;
  const CSV_HEAD = ['統一編號', '公司名稱', '公司所在地', '代表人', '資本額', '核准設立日期', '核准變更日期', '案由或變更事項', '營業項目', '縣市', '清冊', '期別'];

  let root = null;
  const $ = (sel) => root.querySelector(sel);
  const el = (tag, props, children) => {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k.includes('-')) n.setAttribute(k, v); else n[k] = v; });
    (children || []).forEach((c) => { if (c !== '' && c != null) n.append(c); });
    return n;
  };
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  let index = null;
  let rows = [];            // 目前期別載進來的全部列
  const loaded = new Set(); // 已載入的 path
  let limit = PAGE;
  let started = false;      // 第一次切到這個分頁才去抓 index.json
  let ready = false;
  const f = { types: new Set(['change']), cities: new Set(), reasons: new Set(['up']), inds: new Set(), branches: new Set(), ages: new Set(), mine: new Set(), phone: new Set(), q: '' };

  /* ---------------- 跟我的名單比對 ---------------- */

  /*
   * 跟動產擔保名單那頁同一套：統編優先，沒統編才比公司名；在瀏覽器裡對 IndexedDB，
   * 名單不會上傳。每次畫都重算（主站的 allViews 有快取，便宜），所以剛匯進去的馬上變「已在名單」。
   */
  function customerMap() {
    const byTax = new Map();
    const byName = new Map();
    const views = typeof global.customerViews === 'function' ? global.customerViews() : [];
    views.forEach((v) => {
      const tax = String(v.taxId || '').replace(/\D/g, '');
      if (tax && !byTax.has(tax)) byTax.set(tax, v);
      if (v.company && !byName.has(v.company)) byName.set(v.company, v);
    });
    return { byTax, byName };
  }
  const mineOf = (r, cm) => (r['統一編號'] && cm.byTax.get(String(r['統一編號']).replace(/\D/g, ''))) || (r['公司名稱'] && cm.byName.get(r['公司名稱'])) || null;
  // 主站只有「禁止推廣」這一種不能打的狀態（婉拒算已聯絡，還是可以再打）
  const declined = (v) => !!v && (v.blocked || v.outcome === 'blocked');
  const mineKey = (r, cm) => { const m = mineOf(r, cm); return m ? (declined(m) ? 'declined' : 'in') : 'out'; };
  const MINE = [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']];

  // 「這家不用了」：只是不想再看到，不是刪客戶，所以記在這台裝置就好（跟動產擔保那頁一樣）
  const HIDDEN_KEY = 'leads-hidden-v1';
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };
  let showHidden = false;
  const keyOf = (r) => (r['統一編號'] || r['公司名稱'] || '');
  const mmdd = (iso) => { const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };

  /* ---------------- 成立年 ---------------- */

  const FOUNDED_KEY = 'leads-founded-v1';
  let founded = {};   // 統編 → 'YYYY/MM/DD'（西元）；'' ＝ 查過了，登記上查不到
  try { founded = JSON.parse(localStorage.getItem(FOUNDED_KEY) || '{}') || {}; } catch (e) { founded = {}; }
  let saveT = null;
  const saveFounded = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(FOUNDED_KEY, JSON.stringify(founded)); } catch (e) { /* 無痕 */ } }, 500); };

  /** 民國 115/08/21、西元 2026/8/21 或 2006年10月30日 → {y,m,d}；空白與「1911年0月0日」→ null */
  function parseDate(s) {
    const m = String(s || '').match(/^(\d{2,4})[/年.-](\d{1,2})[/月.-](\d{1,2})/);
    if (!m) return null;
    let y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (y < 1000) y += 1911;
    if (y <= 1911 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, m: mo, d };
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtDate = (dt) => `${dt.y}/${pad2(dt.m)}/${pad2(dt.d)}`;
  const fmtRoc = (dt) => `${dt.y - 1911}/${pad2(dt.m)}/${pad2(dt.d)}`;
  const TODAY = new Date();
  /** 滿幾年：生日還沒到就少算一年，跟算年齡一樣。 */
  function yearsSince(dt) {
    let n = TODAY.getFullYear() - dt.y;
    if (TODAY.getMonth() + 1 < dt.m || (TODAY.getMonth() + 1 === dt.m && TODAY.getDate() < dt.d)) n -= 1;
    return n;
  }
  const cachedFounded = (taxId) => (founded[taxId] ? parseDate(founded[taxId]) : null);
  const ageOf = (r) => (r.foundedDate ? (yearsSince(r.foundedDate) >= AGE_YEARS ? 'ge5' : 'lt5') : null);
  const needLookup = (r) => !r.foundedDate && founded[r['統一編號']] === undefined && /^\d{8}$/.test(r['統一編號'] || '');

  /*
   * 查設立日期的工人：一次一個（跟主站的批次更新一樣），佇列在每次重畫時重算（條件改了就換查別家），
   * gen 變了就是叫它停。連續三次連不上就停下來講，不要一直撞。
   *
   * auto：打開分頁就自己查（使用者說每次都要先按一顆鈕很難用）；paused：使用者按了暫停，
   * 或連不上停下來的，要等使用者按「繼續」才會再動。查的都是「套用其他條件後還在名單上」的公司。
   */
  const hunt = { gen: 0, active: 0, queue: [], dirty: true, pending: new Set(), fail: 0, paused: '', auto: true };
  const stopHunt = () => { hunt.gen += 1; hunt.queue = []; hunt.pending.clear(); hunt.fail = 0; };
  function ensureHunt() {
    if (!global.Registry) { hunt.paused = '找不到查詢程式 registry.js，沒辦法查設立日期。'; return; }
    hunt.dirty = true;
    if (!hunt.active) huntWorker(hunt.gen);
  }
  // 節流不是防抖：結果每 300ms 來一筆，「有新的就重新計時」會讓畫面到整批查完才動一次
  let renderT = null;
  const scheduleRender = () => { if (renderT) return; renderT = setTimeout(() => { renderT = null; render(); }, 600); };
  async function huntWorker(gen) {
    hunt.active += 1;
    let did = 0;   // 這個工人真的查到東西才在收工時重畫；沒事做的工人不重畫，不然 render → ensureHunt → 又派工人，繞不完
    try {
      while (gen === hunt.gen && hunt.auto && !hunt.paused) {
        if (hunt.dirty) {
          const c = criteria();
          hunt.queue = [...new Set(rows.filter((r) => needLookup(r) && !hunt.pending.has(r['統一編號']) && passes(r, c, 'ages')).map((r) => r['統一編號']))];
          hunt.dirty = false;
        }
        const id = hunt.queue.shift();
        if (!id) break;
        if (founded[id] !== undefined || hunt.pending.has(id)) continue;
        hunt.pending.add(id);
        let res;
        // 主站批次更新用的就是 lookupCompany + useMirror：統編查不齊會自己用名稱補
        const name = (rows.find((r) => r['統一編號'] === id) || {})['公司名稱'] || '';
        try { res = await global.Registry.lookupCompany({ taxId: id, name }, { useMirror: true }); }
        catch (err) { res = { ok: false, attempts: [], reason: String((err && err.message) || err) }; }
        hunt.pending.delete(id);
        if (gen !== hunt.gen) break;
        if (res.ok) {
          const dt = parseDate(res.data && res.data.founded);
          founded[id] = dt ? fmtDate(dt) : '';
          hunt.fail = 0;
        } else if (/^用名稱查到/.test(res.reason || '') || (res.attempts || []).some((a) => /查無資料|部分欄位/.test(a.reason || ''))) {
          // 有連上、但登記上查不到（或名稱查到的統編對不上）：記下來，不要一直重查。
          // 連不上的長相是每一次嘗試都被擋或逾時，那種才算失敗
          founded[id] = '';
          hunt.fail = 0;
        } else {
          hunt.fail += 1;
          if (hunt.fail >= 3) {
            hunt.paused = '商工登記連不上（官方、自架代理、g0v 鏡像都不通），先停下來；按「繼續」會從沒查到的接著查。';
            toast('商工登記連不上，成立年先停下來；等一下按「繼續」再查');
            stopHunt();
            break;
          }
          continue;
        }
        rows.forEach((r) => { if (r['統一編號'] === id) r.foundedDate = cachedFounded(id); });
        did += 1;
        saveFounded();
        scheduleRender();
        await new Promise((done) => setTimeout(done, 300));
      }
    } finally {
      hunt.active -= 1;
      // 最後一個工人收工就馬上重畫，不要讓名單還停在 600ms 前的樣子
      if (!hunt.active && did) { clearTimeout(renderT); renderT = null; render(); }
      else foundedBar();
    }
  }
  /** 目前名單（套用成立年數以外的條件）的成立年：已知幾家、登記上查不到幾家、還有幾家沒查。 */
  function foundedStatus() {
    const c = criteria();
    let known = 0; let none = 0; let todo = 0;
    rows.forEach((r) => {
      if (!passes(r, c, 'ages')) return;
      if (r.foundedDate) known += 1;
      else if (founded[r['統一編號']] === '' || !/^\d{8}$/.test(r['統一編號'] || '')) none += 1;
      else todo += 1;
    });
    return { known, none, todo };
  }
  /** 名單上方那一行：成立年查到哪了，跟暫停／繼續。全部查完就收起來。 */
  function foundedBar() {
    const bar = $('#leads-founded');
    if (!bar || !ready) return;
    const st = foundedStatus();
    const running = hunt.active > 0 && !hunt.paused;
    bar.hidden = !st.todo && !hunt.paused;
    if (bar.hidden) return;
    const text = `成立年：已知 ${st.known.toLocaleString()} 家${st.none ? `、登記上查不到 ${st.none} 家` : ''}、還有 ${st.todo.toLocaleString()} 家${running ? '，查詢中…' : ''}`;
    $('#leads-founded-text').textContent = hunt.paused ? `${text}　${hunt.paused}` : text;
    const btn = $('#leads-founded-btn');
    btn.textContent = running ? '暫停' : '繼續';
    btn.hidden = !st.todo && !hunt.paused;
  }
  function toggleHunt() {
    if (hunt.active > 0 && !hunt.paused) {
      stopHunt();
      hunt.paused = '已暫停；查到的都留著。';
      render();
      return;
    }
    hunt.paused = '';
    hunt.auto = true;
    render();
  }

  /* ---------------- 資料 ---------------- */

  /** 歸屬分公司：跟主站 view() 算 branchKey 的方式一樣，籤上才會是同一個字。 */
  function branchOf(address) {
    if (!global.Rules || !global.Normalize) return { key: '', label: '' };
    const { city, district } = global.Normalize.parseAddress(address);
    const b = global.Rules.branchOf(city, district);
    const key = b.kind === 'branch' ? `${b.branches[0]}分公司`
      : b.kind === 'common' ? `${b.branches.join('／')}共同區`
      : b.kind === 'shared' ? '全公司共同區域'
      : (city ? '不在劃分表上' : '無登記地址');
    return { key, label: b.label || key, kind: b.kind, b };
  }

  /** 正規的 CSV 解析：欄位裡有逗號、引號、換行都吃得下。 */
  function parseCsv(text) {
    const out = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const src = text.replace(/^﻿/, '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out.filter((r) => r.length > 1 || (r[0] || '').trim());
  }
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function toRecord(obj, file) {
    const codes = (obj['營業項目'] || '').match(/\b[A-Z]{1,2}\d{5,6}\b/g) || [];
    const classes = [...new Set(codes.map((c) => c[0]))];
    const reason = obj['案由或變更事項'] || '';
    let rk = '';
    if (file.type === 'change') { rk = 'other'; for (const [k, , re] of REASONS) { if (re && re.test(reason)) { rk = k; break; } } }
    const branch = branchOf(obj['公司所在地']);
    return {
      ...obj, file, city: file.city, type: file.type, branch,
      capital: Number(String(obj['資本額'] || '').replace(/\D/g, '')) || 0,
      date: obj['核准設立日期'] || obj['核准變更日期'] || '',
      // 設立清冊用清冊上的；變更清冊看之前查過沒有
      foundedDate: parseDate(obj['核准設立日期']) || cachedFounded(obj['統一編號']),
      reason, rk, classes,
      holding: HOLDING_RE.test(obj['公司名稱'] || '') && !classes.some((c) => 'CEG'.includes(c)),
      blob: [obj['統一編號'], obj['公司名稱'], obj['代表人'], obj['公司所在地'], obj['營業項目'], reason].join(' ').toLowerCase(),
    };
  }

  async function loadFile(file) {
    if (loaded.has(file.path)) return;
    // 檔案路徑帶期別（11508/新北市-change.csv），不同期不會撞
    const res = await fetch(`${DATA_BASE}${file.path}?t=${index.generatedAt}`, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`${file.path}：HTTP ${res.status}`);
    const table = parseCsv(await res.text());
    const head = table[0];
    table.slice(1).forEach((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i] || ''; }); rows.push(toRecord(o, file)); });
    loaded.add(file.path);
  }

  /** 目前勾的縣市與清冊需要哪些檔；沒載的就去載。 */
  const periodFiles = () => {
    const period = $('#leads-period').value;
    if (period === 'all') return Object.keys(index.periods).sort().flatMap((k) => (index.periods[k].files || []).map((x) => ({ ...x, period: k })));
    return ((index.periods[period] || {}).files || []).map((x) => ({ ...x, period }));
  };
  async function ensureLoaded() {
    const files = periodFiles().filter((x) => f.types.has(x.type) && (!f.cities.size || f.cities.has(x.city)));
    const todo = files.filter((x) => !loaded.has(x.path));
    if (!todo.length) return;
    $('#leads-loading').hidden = false;
    $('#leads-loading').textContent = `下載清冊… ${todo.map((x) => `${x.city}${TYPE_LABEL[x.type]}`).join('、')}`;
    try { await Promise.all(todo.map(loadFile)); }
    catch (err) { toast(`下載失敗：${err.message}`); }
    $('#leads-loading').hidden = true;
  }

  /*
   * 一列過不過得了篩選；except 是「這一組先不算」，給篩選籤上的數字用：
   * 籤上的數字要回答「勾了這顆會剩幾家」，所以要套用其他所有條件、唯獨不套自己那一組。
   */
  function criteria() {
    return {
      period: $('#leads-period').value,
      min: (Number($('#leads-capMin').value) || 0) * 10000,
      max: (Number($('#leads-capMax').value) || 0) * 10000 || Infinity,
      skipHolding: $('#leads-skipHolding').checked,
      terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean),
      cm: customerMap(),
    };
  }
  function passes(r, c, except, F = f) {
    return (c.period === 'all' || r['期別'] === c.period)
      && (except === 'types' || F.types.has(r.type))
      && (except === 'cities' || !F.cities.size || F.cities.has(r.city))
      && (except === 'reasons' || r.type !== 'change' || !F.reasons.size || F.reasons.has(r.rk))
      && (except === 'inds' || !F.inds.size || r.classes.some((k) => F.inds.has(k)))
      && (except === 'branches' || !F.branches.size || F.branches.has(r.branch.key))
      && (except === 'ages' || !F.ages.size || F.ages.has(ageOf(r)))
      && (except === 'mine' || !F.mine.size || F.mine.has(mineKey(r, c.cm)))
      && (except === 'phone' || !F.phone.size || [...F.phone].some((k) => phoneKindsOf(r).has(k)))
      && (showHidden || !(hidden.has(keyOf(r)) || delOf(r)))
      && r.capital >= c.min && r.capital <= c.max
      && !(c.skipHolding && r.holding)
      && c.terms.every((t) => r.blob.includes(t));
  }
  function visible() {
    const c = criteria();
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#leads-sort').value;
    list.sort((a, b) => (sort === 'capital' ? b.capital - a.capital
      : sort === 'date' ? (b.date || '').localeCompare(a.date || '')
        : (a['公司名稱'] || '').localeCompare(b['公司名稱'] || '', 'zh-Hant')));
    return list;
  }

  /* ---------------- 畫面 ---------------- */

  const wan = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(n % 1e8 ? 1 : 0)} 億` : `${Math.round(n / 1e4).toLocaleString()} 萬`);

  /*
   * 分頁上就先找電話、填電話（使用者：「我會複製分頁內名單的公司名，去看一下他是做什麼的，順便找他的電話，
   * 但我把它加入到重點電推表中還要再找他出來才能新增電話」）：
   * 名稱旁一顆複製的點；卡片上一排 Google／地圖／104／1111；找到的電話先貼在卡片上的框，按「加入客戶名單」就一起帶進去；
   * 單張加入後直接打開那一筆。貿易署電話表對得到的不用填（會自動填），框就不出現。
   */
  // 名單上刪掉的公司（公司排除）：各分頁一起當「藏起來」，放回來＝收回排除（app.js 的 deletedCompany／liftCompany）
  const deletedOf = (name, tax) => (typeof global.deletedCompany === 'function' ? global.deletedCompany(name, tax) : false);
  const restoreBtn = (name, tax) => el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來（名單刪過）', title: '這家你在名單上刪過，匯入與每日挑選都會跳過；放回來就收回排除', onclick: async () => { if (typeof global.liftCompany === 'function') await global.liftCompany(name, tax); render(); toast('放回來了，之後匯入與每日挑選會再出現'); } });
  const delOf = (r) => deletedOf(r['公司名稱'], r['統一編號']);
  const typed = new Map();   // 卡片 key → 使用者貼的電話（重畫不會掉）
  function phoneBox(r, key, hasAuto) {
    if (hasAuto) return '';
    const stop = (e) => e.stopPropagation();
    const input = el('input', { type: 'tel', className: 'phone-paste', placeholder: '找到電話貼這裡，加入時一起帶', autocomplete: 'off', value: typed.get(key) || '', onclick: stop });
    input.oninput = () => { const v = input.value.trim(); if (v) typed.set(key, v); else typed.delete(key); };
    return el('div', { className: 'card-actions phone-search', onclick: stop }, [
      el('span', { className: 'muted', textContent: '找電話：' }),
      ...(typeof global.phoneSearchLinks === 'function' ? global.phoneSearchLinks(r.__name, r.__addr) : []),
      input,
    ]);
  }
  const copyName = (name) => (typeof global.copyDot === 'function' ? global.copyDot(name, '複製公司名稱', `已複製：${name}`) : '');
  /** 單張加入之後直接打開那一筆（整批不開） */
  function openJustAdded(fileName, single) {
    if (!single || typeof global.customerViews !== 'function' || typeof global.openCustomer !== 'function') return;
    const v = global.customerViews().find((x) => x.source === fileName);
    if (v) global.openCustomer(v.id);
  }
  function card(r, c) {
    const mine = c ? mineOf(r, c.cm) : null;
    const mineBadge = !mine ? '' : declined(mine)
      ? el('span', { className: 'badge badge-own', textContent: `名單上禁止推廣${mine.lastDate ? `・${mmdd(mine.lastDate)}` : ''}` })
      : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.addedDate ? `・${mmdd(mine.addedDate)} 加入` : ''}${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}${mine.nextDate ? `・下次 ${mmdd(mine.nextDate)}` : ''}`, title: '哪天加進名單的（名單新增日期）；點一下打開名單上這一筆', onclick: () => { if (typeof global.openCustomer === 'function') global.openCustomer(mine.id); } })
    const reasonBadge = r.type === 'setup' ? el('span', { className: 'badge badge-new', textContent: '新設立' })
      : r.rk === 'up' ? el('span', { className: 'badge badge-up', textContent: r.reason })
        : r.rk === 'down' ? el('span', { className: 'badge badge-down', textContent: r.reason })
          : el('span', { className: 'badge', textContent: r.reason || '變更' });
    const name = el('span', { className: 'card-name' }, [r['統一編號']
      ? el('a', { href: `https://findbiz.nat.gov.tw/fts/company/${encodeURIComponent(r['統一編號'])}`, target: '_blank', rel: 'noopener', textContent: r['公司名稱'] })
      : document.createTextNode(r['公司名稱']), copyName(r['公司名稱'] || '')]);
    const inds = r.classes.filter((c) => IND[c]).slice(0, 2).map((c) => el('span', { className: 'badge badge-ind', textContent: IND[c] }));
    const items = (r['營業項目'] || '').split('；').filter(Boolean);
    const all = $('#leads-period').value === 'all';
    const isHidden = hidden.has(keyOf(r)) || delOf(r);
    const actions = mine
      ? [el('button', { className: 'btn btn-tiny btn-primary', type: 'button', textContent: '打開名單上這一家', onclick: () => { if (typeof global.openCustomer === 'function') global.openCustomer(mine.id); } })]
      : [el('button', { className: 'btn btn-tiny btn-primary leads-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
        delOf(r) ? restoreBtn(r['公司名稱'], r['統一編號']) : isHidden
          ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(keyOf(r)); saveHidden(); render(); } })
          : el('button', { className: 'btn btn-tiny leads-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(keyOf(r)); saveHidden(); render(); toast('藏起來了，下個月清冊更新也不會再冒出來'); } })];
    return el('article', { className: `card leads-card${mine ? ' is-mine' : r.rk === 'up' ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}` }, [
      el('div', { className: 'card-top' }, [name, reasonBadge, ...inds,
        r.branch.key ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
        r.holding ? el('span', { className: 'badge badge-ind', textContent: '投資／控股類' }) : '',
        hasPhone(r) ? el('span', { className: 'badge badge-ind', textContent: phoneKindsOf(r).has('M') ? '📞 手機（多半是老闆本人）' : '📞 有電話', title: '貿易署出進口廠商登記裡有電話，加入名單時會自動填' }) : '', mineBadge]),
      el('div', { className: 'card-meta' }, [
        el('span', { textContent: `💰 ${wan(r.capital)}` }),
        r['代表人'] ? el('span', { textContent: `👤 ${r['代表人']}` }) : '',
        el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r['公司所在地'])}`, target: '_blank', rel: 'noopener', textContent: r['公司所在地'] })]),
        el('span', { textContent: `📅 ${r.date}${r.type === 'setup' ? ' 設立' : ' 核准變更'}${all ? `（${r['期別'].slice(0, 3)}/${+r['期別'].slice(3)} 清冊）` : ''}` }),
        // 變更清冊的成立日期是查商工登記來的，秀出來讓人對得上；設立清冊上面那行就是了
        r.type !== 'setup' && r.foundedDate ? el('span', { textContent: `🎂 成立 ${fmtRoc(r.foundedDate)}（${yearsSince(r.foundedDate)} 年）` }) : '',
        el('span', { textContent: `#${r['統一編號']}` }),
      ]),
      items.length ? el('p', { className: 'leads-items', textContent: `${items.slice(0, 4).join('　')}${items.length > 4 ? `　…共 ${items.length} 項` : ''}` }) : '',
      mine ? '' : (r.__name = r['公司名稱'], r.__addr = r['公司所在地'], phoneBox(r, keyOf(r), hasPhone(r))),
      el('div', { className: 'card-actions' }, actions),
    ]);
  }

  function chips(host, options, set) {
    host.textContent = '';
    options.forEach(([value, label, count]) => {
      const approx = String(count).startsWith('~');
      const b = el('button', { className: `chip${approx ? ' is-approx' : ''}`, type: 'button', title: approx ? '這份清冊還沒下載，這是總數；勾了才會照條件算' : '' }, [document.createTextNode(label), count != null ? el('small', { textContent: String(count) }) : '']);
      b.setAttribute('aria-pressed', String(set.has(value)));
      b.onclick = async () => {
        if (set.has(value)) set.delete(value); else set.add(value);
        [...host.children].forEach((c, i) => c.setAttribute('aria-pressed', String(set.has(options[i][0]))));
        limit = PAGE;
        await ensureLoaded();
        render();
      };
      host.append(b);
    });
  }

  /** 所有篩選籤的數字：套用其他條件之後這顆會剩幾家。還沒下載的清冊只能寫總數，前面加 ~。 */
  function drawChips() {
    const c = criteria();
    const files = periodFiles();
    const isLoaded = (subset) => subset.length > 0 && subset.every((x) => loaded.has(x.path));
    const total = (subset) => subset.reduce((n, x) => n + x.rows, 0);
    const facet = (except, pred) => { let n = 0; rows.forEach((r) => { if (pred(r) && passes(r, c, except)) n += 1; }); return n; };
    chips($('#leads-fType'), ['change', 'setup'].map((t) => {
      const need = files.filter((x) => x.type === t && (!f.cities.size || f.cities.has(x.city)));
      return [t, TYPE_LABEL[t], isLoaded(need) ? facet('types', (r) => r.type === t) : `~${total(need)}`];
    }), f.types);
    const cities = [...new Set(files.map((x) => x.city))];
    chips($('#leads-fCity'), cities.map((city) => {
      const need = files.filter((x) => x.city === city && f.types.has(x.type));
      return [city, city, isLoaded(need) ? facet('cities', (r) => r.city === city) : `~${total(need)}`];
    }), f.cities);
    chips($('#leads-fReason'), REASONS.map(([k, label]) => [k, label, facet('reasons', (r) => r.type === 'change' && r.rk === k)]), f.reasons);
    chips($('#leads-fInd'), IND_ORDER.map((k) => [k, IND[k], facet('inds', (r) => r.classes.includes(k))]), f.inds);
    // 成立年數：只算已經知道設立日期的；還沒查的在名單上方那一行
    chips($('#leads-fAge'), AGE.map(([k, label]) => [k, label, facet('ages', (r) => ageOf(r) === k)]), f.ages);
    chips($('#leads-fMine'), MINE.map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
    chips($('#leads-fPhone'), PHONE_CHIPS.map(([k, label]) => [k, label, facet('phone', (r) => phoneKindsOf(r).has(k))]), f.phone);
    // 分公司：籤是從載進來的列長出來的（清冊裡沒有這一欄），分公司在前、共同區在後、劃分表外最後
    const counts = new Map();
    rows.forEach((r) => { if (r.branch.key && passes(r, c, 'branches')) counts.set(r.branch.key, (counts.get(r.branch.key) || 0) + 1); });
    const order = (k) => (/分公司$/.test(k) ? 0 : /共同區$/.test(k) ? 1 : 2);
    const keys = [...new Set([...counts.keys(), ...f.branches])].sort((a, b) => order(a) - order(b) || (counts.get(b) || 0) - (counts.get(a) || 0));
    if (!keys.length) { $('#leads-fBranch').textContent = ''; $('#leads-fBranch').append(el('span', { className: 'muted', textContent: '（載入清冊後才算得出來）' })); }
    else chips($('#leads-fBranch'), keys.map((k) => [k, k, counts.get(k) || 0]), f.branches);
  }

  let current = [];
  function render() {
    if (!ready) return;
    // 先派工人再畫：工人一派下去 hunt.active 就是 1，進度那一行這一輪就畫得出來
    if (hunt.auto && !hunt.paused) ensureHunt();
    drawChips();
    foundedBar();
    current = visible();
    const host = $('#leads-cards');
    host.textContent = '';
    const c = criteria();
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const up = current.filter((r) => r.rk === 'up').length;
    const period = $('#leads-period').value;
    const inList = current.filter((r) => mineOf(r, c.cm)).length;
    $('#leads-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家${up ? `，其中增資 ${up} 家` : ''}${inList ? `、已在名單 ${inList} 家` : ''}<span class="muted">　／ ${period === 'all' ? '全部期別' : '本期'}已載入 ${rows.filter((r) => period === 'all' || r['期別'] === period).length.toLocaleString()} 家</span>`;
    const del = rows.filter(delOf).length;
    const hid = rows.filter((r) => hidden.has(keyOf(r))).length + del;
    const hb = $('#leads-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    const addable = current.length - inList;
    $('#leads-add').textContent = `加入客戶名單${addable ? `（${addable} 家）` : ''}`;
    $('#leads-more').hidden = current.length <= limit;
    $('#leads-empty').hidden = !!current.length;
    $('#leads-empty').textContent = rows.length ? '沒有符合條件的公司，放寬資本額或案由試試。' : '';
    $('#leads-add').disabled = !addable;
    $('#leads-export').disabled = !current.length;
    $('#leads-copy').disabled = !current.length;
    const pill = document.getElementById('countLeads');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /** 篩好的名單組成跟 Actions 產的一模一樣的 CSV（變更清冊查到的設立日期也填進去，主站匯入就有成立年）。 */
  function toCsv(list) {
    const cell = (r, h) => r[h] || (h === '核准設立日期' && r.foundedDate ? fmtRoc(r.foundedDate) : '');
    const lines = [CSV_HEAD, ...list.map((r) => CSV_HEAD.map((h) => cell(r, h)))].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  /**
   * 標準欄位的 CSV（公司名稱、統編、成立、資本額…、下次聯絡日）。
   *
   * 以前送的是登記清冊格式，主站會再跳一次「資本額、地區」的條件對話框——這一頁已經篩過了，
   * 再問一次是多餘的；而且清冊格式帶不了下次聯絡日。改走 fromGovRegistry → govToStandardRows
   * （產業、有沒有設備標的、背景說明都照舊算），再把日期填進「下次聯絡日」欄。
   */
  function toStandardCsv(list, dates) {
    const N = global.Normalize;
    const gov = [CSV_HEAD, ...list.map((r) => CSV_HEAD.map((h) => r[h] || (h === '核准設立日期' && r.foundedDate ? fmtRoc(r.foundedDate) : '')))];
    const { records } = N.fromGovRegistry(gov, { minCapital: 0, maxCapital: Infinity, cities: null, onlyCapitalUp: false });
    const rows = N.govToStandardRows(records);
    const head = rows[0];
    const iNext = head.indexOf('下次聯絡日');
    const iNote = head.indexOf('訪談內容');
    const dateOf = new Map();
    list.forEach((r, i) => { if (dates && dates[i]) dateOf.set(r['統一編號'] || r['公司名稱'], dates[i]); });
    const iTax = head.indexOf('統編');
    const iName = head.indexOf('公司名稱');
    const iAdded = head.indexOf('名單新增日期');
    const iPhone = head.indexOf('電話');
    const t = new Date(); const addedToday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    rows.slice(1).forEach((row) => {
      const d = dateOf.get(row[iTax]) || dateOf.get(row[iName]) || '';
      if (iNext >= 0 && d) row[iNext] = d;
      if (iAdded >= 0) row[iAdded] = addedToday;   // 名單新增日期＝加進名單這天，「今天新增」才篩得到
      const srcKey = list.find((r) => (r['統一編號'] || r['公司名稱']) === (row[iTax] || row[iName]));
      if (iPhone >= 0 && srcKey && typed.get(keyOf(srcKey))) row[iPhone] = typed.get(keyOf(srcKey));   // 卡片上貼的電話一起帶
      // 從哪一期、什麼案由來的寫進去，之後在名單上看得出這家是怎麼來的
      const src = list.find((r) => (r['統一編號'] || r['公司名稱']) === (row[iTax] || row[iName]));
      if (iNote >= 0 && src) row[iNote] = [`新公司清冊 ${src['期別'] ? `${src['期別'].slice(0, 3)}/${+src['期別'].slice(3)}` : ''} ${TYPE_LABEL[src.type] || ''}${src.reason ? `：${src.reason}` : ''}`.trim(), src._why ? `每日新名單，${src._why}` : '', row[iNote] || ''].filter(Boolean).join('\n');
    });
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  }

  /** 從哪天開始排：畫面上的日期欄，空白就是明天。 */
  const fromDate = () => { const v = $('#leads-from') && $('#leads-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };

  /**
   * 單張卡片與整批都走這裡：已在名單的先剔掉，每一家照「一天最多幾家、其中新名單幾家」找一個
   * 日子（主站的 planNewDates），再送進主站匯入流程（自動略過重複、吃排除名單）。
   * 加進來就有下次聯絡日，會出現在每天的提醒列，不會沉在幾百家裡面。
   */
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm));
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], csvName(fresh.length), { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    fresh.forEach((r) => typed.delete(keyOf(r)));
    openJustAdded(file.name, fresh.length === 1);
    // 匯入時靠名稱比對到已在名單的會被略過，不能再說「N 家排在…」（使用者：昨天加的「昨天新增」看不到——早就在名單上）
    const got = (typeof global.customerViews === 'function' ? global.customerViews() : []).filter((v) => v.source === file.name).length;
    const lost = fresh.length - got;
    const last = dates.filter(Boolean).sort().pop();
    if (!got) toast(`${fresh.length === 1 ? '這家' : `這 ${fresh.length} 家`}早就在名單上了（同名或同統編），沒有再加一次；卡片上的「已在名單」有寫哪天加的`);
    else if (last) toast(`${got} 家排在 ${dates[0].replace(/-/g, '/')}${last !== dates[0] ? `～${last.replace(/-/g, '/')}` : ''}${lost > 0 ? `；另外 ${lost} 家早就在名單上（同名），略過` : ''}`);
    render();   // 匯進去之後卡片就變成「已在名單」
  }

  /*
   * 每日自動挑名單的優先順序（使用者定的，跟畫面上的篩選無關；是順序不是門檻）：
   *   本期 → 增資 → 擴張（遷址／加營業項目／設分公司）→ 有電話（貿易署電話表對得到）→ 資本額 500～6,000 萬 → 我的分公司 → 成立 6～10 年
   *   （成立年原本是「5 年以上」；使用者說成交的多半是成立 7～8 年、案件 1,000 萬，改成離 7～8 年多遠：Rules.ageRank）
   *   （第三條原本是「製造／營造、投資控股不算」——那是買設備的看法。使用者說成交多半是
   *   營運週轉金跟投資額度、買設備的少、要成長快的公司，所以改看擴張訊號）
   *   投資控股類不進池子：使用者說「投資控股類的公司給我我也找不到他的電話，等於沒用」
   * 每一家對這六條各打勾，照順序比：前面那條符合的一律排在不符合的前面，都一樣再比下一條，
   * 全部一樣就資本額高的先。所以全符合的先挑，不夠就往下補，總是湊得到 10 家。
   * 「我的分公司」看「規則」那頁設的 my-branch，沒設就是新莊。名單裡有的、藏起來的不挑。
   */
  const myBranch = () => { let b = ''; try { b = localStorage.getItem('my-branch') || ''; } catch (e) { /* 無痕 */ } return `${b || '新莊'}分公司`; };
  const DAILY_PRIORITY = ['本期', '增資', '擴張', '有電話', '資本額 500～6,000 萬', '我的分公司', '成立 6～10 年'];
  // 有電話＝貿易署出進口廠商登記裡對得到（使用者：新增的名單撈不到電話就得自己 Google，所以有電話的先挑）
  const hasPhone = (r) => !!(global.Trade && global.Trade.hasPhone && global.Trade.hasPhone(r['統一編號']));
  const phoneKindsOf = (r) => (global.Trade && global.Trade.phoneKindsOf ? global.Trade.phoneKindsOf(r['統一編號']) : new Set(['N']));
  // 電話籤：出進口廠商登記的電話表對得到的；手機是有電話的一部分，籤是「或」的關係
  const PHONE_CHIPS = [['Y', '有電話'], ['M', '手機'], ['N', '沒電話']];
  const dailyChecks = (r, latest) => [
    r['期別'] === latest,
    r.rk === 'up',
    EXPAND_RE.test(r.reason),   // 遷址、加營業項目、設分公司：在長大的公司才會動這些
    hasPhone(r),
    r.capital >= 5000000 && r.capital <= 60000000,
    branchRank(r),   // 分公司遠近：我的 0 → 共同區 1 → 鄰近 2… → 其他 9（新莊挑完接新北）
    ageRankOf(r),   // 離成立 7～8 年多遠：0＝6～10 年 … 4＝不知道
  ];
  const ageRankOf = (r) => (global.Rules && global.Rules.ageRank ? global.Rules.ageRank(r.foundedDate ? yearsSince(r.foundedDate) : null) : (ageOf(r) === 'ge5' ? 0 : 3));
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return b.capital - a.capital || (a['公司名稱'] || '').localeCompare(b['公司名稱'] || '', 'zh-Hant');
  }
  async function dailyCandidates() {
    if (!root) root = document.getElementById('paneLeads');
    if (!root) return [];
    await start();
    if (!ready || !index) return [];
    // 池子是「本期的變更清冊」：不管畫面上現在切到哪一期、勾了什麼，這幾個檔一定要載進來
    const latest = Object.keys(index.periods || {}).sort().pop();
    if (!latest) return [];
    const need = ((index.periods[latest] || {}).files || []).map((x) => ({ ...x, period: latest })).filter((x) => x.type === 'change' && !loaded.has(x.path));
    if (need.length) { try { await Promise.all(need.map(loadFile)); } catch (err) { console.error('每日新名單載清冊失敗', err); } }
    if (global.Trade && global.Trade.ensurePhones) { try { await global.Trade.ensurePhones(); } catch (e) { /* 沒電話表就當都沒有 */ } }
    const cm = customerMap();
    return rows.filter((r) => r.type === 'change' && !r.holding && !mineOf(r, cm) && !hidden.has(keyOf(r)) && !delOf(r))
      .map((r) => {
        r._checks = dailyChecks(r, latest);
        const hit = DAILY_PRIORITY.filter((_, i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : r._checks[i]));
        const rk = r._checks[DAILY_PRIORITY.indexOf('我的分公司')];
        r._why = [hit.length ? `符合：${hit.join('、')}` : '基準都不符，補位', rk > 0 && rk < 9 ? `分公司放寬到 ${r.branch.key}` : ''].filter(Boolean).join('；');
        return r;
      })
      .sort(dailyCompare);
  }

  const csvName = (n) => `登記清冊-${$('#leads-period').value === 'all' ? '全部期別' : $('#leads-period').value}-${n == null ? current.length : n}家.csv`;

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'leads-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' }), el('span', { className: 'muted', id: 'leads-filter-sum', textContent: '' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家；帶 ~ 的清冊還沒下載，勾了才會照條件算。' }),
      group('期別', el('select', { id: 'leads-period' }), 'leads-period'),
      group('清冊', el('div', { className: 'chips', id: 'leads-fType' })),
      group('縣市', el('div', { className: 'chips', id: 'leads-fCity' })),
      group('歸屬分公司（依登記地址，同「規則」的劃分表）', el('div', { className: 'chips', id: 'leads-fBranch' })),
      group('案由（變更清冊）', el('div', { className: 'chips', id: 'leads-fReason' })),
      group('行業（依營業項目大類）', el('div', { className: 'chips', id: 'leads-fInd' })),
      group('成立年數（依核准設立日期；變更清冊的是查商工登記來的）', el('div', { className: 'chips', id: 'leads-fAge' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'leads-fMine' })),
      group('電話（貿易署出進口廠商登記對得到的）', el('div', { className: 'chips', id: 'leads-fPhone' })),
      group('資本額（萬元）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'leads-capMin', type: 'number', min: '0', step: '100', placeholder: '下限', value: '500' }), '～',
        el('input', { id: 'leads-capMax', type: 'number', min: '0', step: '100', placeholder: '上限', value: '6000' })])),
      el('div', { className: 'leads-group' }, [el('label', {}, [el('input', { type: 'checkbox', id: 'leads-skipHolding', checked: true }), ' 略過投資／控股類（通常找不到電話）'])]),
      group('關鍵字', el('input', { id: 'leads-q', type: 'search', placeholder: '公司、統編、代表人、地址、營業項目', autocomplete: 'off' }), 'leads-q'),
      group('排序', el('select', { id: 'leads-sort' }, [
        el('option', { value: 'capital', textContent: '資本額（高到低）' }),
        el('option', { value: 'date', textContent: '日期（新到舊）' }),
        el('option', { value: 'company', textContent: '公司名稱' })]), 'leads-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'leads-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'leads-hidden', type: 'button', hidden: true })]),
    ]);
    // 桌面版預設展開，手機上先看到名單
    filters.open = !matchMedia('(max-width: 760px)').matches;
    root.append(
      el('p', { className: 'muted leads-sub', id: 'leads-sub', textContent: '經濟部每月公司設立／變更登記清冊' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'leads-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的公司從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'leads-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'leads-add', type: 'button', title: '把目前篩出來、還不在名單裡的公司送進匯入流程，每家排一個下次聯絡日', textContent: '加入客戶名單' }),
          el('button', { className: 'btn', id: 'leads-copy', type: 'button', textContent: '複製統編' }),
          el('button', { className: 'btn', id: 'leads-export', type: 'button', textContent: '匯出 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'leads-loading', hidden: true }),
      el('div', { className: 'leads-founded', id: 'leads-founded', hidden: true }, [
        el('span', { id: 'leads-founded-text' }),
        el('button', { className: 'btn btn-tiny', id: 'leads-founded-btn', type: 'button', textContent: '暫停' })]),
      el('div', { className: 'cards', id: 'leads-cards' }),
      el('div', { className: 'empty', id: 'leads-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'leads-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [
        el('span', {}, [el('i', { className: 'swatch is-up' }), ' 增資']),
        el('span', {}, [el('i', { className: 'swatch is-mine' }), ' 已在你的名單裡'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：經濟部商工登記「公司所營事業項目清冊」，GitHub Actions 每月 8 日自動抓取（清冊在次月初產製，8 月的清冊 9 月初才有）。這裡不存任何客戶資料；成立年是用統編查商工登記來的，查到的留在這台瀏覽器省得重查。' }),
    );
  }

  async function start() {
    if (started) return;
    started = true;
    build();
    try {
      const res = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      index = await res.json();
    } catch (err) {
      $('#leads-empty').hidden = false;
      $('#leads-empty').textContent = '還沒有抓好的清冊。GitHub Actions 每月 8 日會自動抓，也可以到 repo 的 Actions 頁手動執行「每月新公司清冊」。';
      $('#leads-count').textContent = '—';
      return;
    }
    const periods = Object.keys(index.periods || {}).sort().reverse();
    periods.forEach((k) => $('#leads-period').append(el('option', { value: k, textContent: `${k.slice(0, 3)} 年 ${+k.slice(3)} 月` })));
    // 跨月份一次篩：找「最近半年增資的製造業」這種問題，一個月一個月切換很煩
    if (periods.length > 1) $('#leads-period').append(el('option', { value: 'all', textContent: `全部期別（${periods.length} 期）` }));
    $('#leads-sub').textContent = `經濟部每月公司設立／變更登記清冊　·　最近更新 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}`;
    ready = true;
    if (global.Trade && global.Trade.ensurePhones) global.Trade.ensurePhones().then(() => { if (ready) render(); }).catch(() => {});   // 電話表載好再補上 📞
    const rerender = async () => { limit = PAGE; await ensureLoaded(); render(); };
    $('#leads-period').onchange = async () => { await rerender(); };
    $('#leads-capMin').oninput = () => { limit = PAGE; render(); };
    $('#leads-capMax').oninput = () => { limit = PAGE; render(); };
    $('#leads-skipHolding').onchange = () => { limit = PAGE; render(); };
    $('#leads-sort').onchange = () => { limit = PAGE; render(); };
    let qt = null;
    $('#leads-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; limit = PAGE; render(); }, 120); };
    $('#leads-more').onclick = () => { limit += PAGE; render(); };
    $('#leads-founded-btn').onclick = toggleHunt;
    $('#leads-reset').onclick = async () => {
      f.types.clear(); f.types.add('change'); f.cities.clear(); f.reasons.clear(); f.reasons.add('up'); f.inds.clear(); f.branches.clear(); f.ages.clear(); f.mine.clear(); f.phone.clear(); f.q = ''; showHidden = false;
      $('#leads-q').value = ''; $('#leads-capMin').value = '500'; $('#leads-capMax').value = '6000'; $('#leads-skipHolding').checked = true;
      await rerender();
    };
    /*
     * 加入客戶名單：組成跟 Actions 產的 CSV 一模一樣的檔案，交給主站現成的匯入流程
     * （認得「統一編號、公司名稱、公司所在地、代表人、資本額」就是登記清冊，會再問一次
     * 資本額、地區條件，已經在名單裡的自動略過）。不另寫一條匯入路，客戶名單的邏輯不動。
     */
    $('#leads-add').onclick = () => addToList(current);
    $('#leads-hidden').onclick = () => { showHidden = !showHidden; limit = PAGE; render(); };
    $('#leads-export').onclick = () => {
      const blob = new Blob([toCsv(current)], { type: 'text/csv;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: csvName() });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`已匯出 ${current.length} 家`);
    };
    $('#leads-copy').onclick = async () => {
      const text = current.map((r) => r['統一編號']).filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(text); toast(`已複製 ${current.length} 個統編`); }
      catch (e) { toast('這個瀏覽器不讓網頁複製'); }
    };
    await rerender();
  }

  /** 主站切到「新公司」分頁時叫這個；第一次才真的去抓資料。 */
  function show() {
    if (!root) root = document.getElementById('paneLeads');
    if (!root) return;
    // 第二次以後切過來重畫：名單可能剛匯了新的，「已在名單」要跟著變
    if (started) { if (ready) render(); return; }
    start().catch((err) => { console.error(err); toast(`新公司名單載入失敗：${err.message}`); });
  }

  global.Leads = { show, dailyCandidates, DAILY_PRIORITY, toStandardCsv, parseDate, yearsSince, parseCsv, csvCell, AGE_YEARS };
})(window);
