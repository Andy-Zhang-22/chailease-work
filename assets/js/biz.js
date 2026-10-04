/*
 * 「商行／企業社」分頁：財政部營業（稅籍）登記裡的獨資、合夥，做企金推廣的名單。
 *
 * 使用者：「我想找商行或企業社的老闆做企金推廣，可以怎麼找名單」。
 * 資料由 GitHub Actions 每月抓好放在 leads/biz/（tools/fetch-biz.mjs：新北市、獨資／合夥、資本額 50 萬以上）；
 * 這裡只讀、篩、畫。稅籍資料沒有負責人，有查到商業登記的才有；電話一律沒有（打前用 104 或 Google）。
 * 跟客戶名單的交集跟其他分頁一樣：瀏覽器裡拿統編比對，加入走主站現成匯入流程並排好日期。
 *
 * 「本月新設立／本月變更」：經濟部的商業每月設立／變更登記清冊（PDF，跟公司清冊同一套；tools/fetch-leads.mjs --kind bms
 * 抓到 leads/biz/monthly/）。使用者：「商行那分頁有辦法向變更登記的資訊一樣能看到每月變更狀況嗎？」「或新設立的狀況嗎」。
 * 同一個分頁用模式切換：名單（稅籍）／本月新設立／本月變更，篩選、加入名單共用；名單裡的商行有在本期清冊出現的，
 * 卡片上標「本期 新設立／變更：案由」，每日挑選也把「本期設立／變更」排在前面（跟公司那頁的「本期」一樣）。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/biz/';
  const MONTHLY_BASE = 'leads/biz/monthly/';
  const HIDDEN_KEY = 'biz-hidden-v1';
  /* 商業變更清冊的案由（115/08 新北市 572 筆的分布：所在地變更 134、轉讓登記 131、所營業務變更 89、名稱變更 53、增資變更 34、
   * 出資額變更 29、外縣市遷入 26、組織變更 14、其他 12、繼承登記 9、負責人改名 8、復業 8、更正 7、負責人變更 6、合夥人變更 5、
   * 所在地門牌整改編 3、負責人住居所變更 3、經理人變更 1）。負責人改名、住居所變更、門牌整編不是老闆換人或搬家，歸其他。 */
  const REASONS = [
    ['up', '增資', /增資/],
    ['down', '減資', /減資/],
    ['capital', '出資額／資本額變更', /出資額|資本額/],
    ['owner', '負責人・合夥人變更、轉讓、繼承', /負責人變更|合夥人變更|轉讓|繼承|經理人變更/],
    ['move', '遷址', /所在地變更|遷入|遷出|遷址/],
    ['name', '改名', /名稱變更/],
    ['items', '所營業務變更', /所營業務|營業項目|所營事業/],
    ['org', '組織變更', /組織變更/],
    ['resume', '復業', /復業/],
    ['other', '其他（更正、負責人改名…）', null],
  ];
  const reasonKind = (reason) => { for (const [k, , re] of REASONS) { if (re && re.test(String(reason || ''))) return k; } return 'other'; };
  const MODES = [['list', '名單（稅籍）'], ['setup', '本月新設立'], ['change', '本月變更']];
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  const AGE = [['lt5', '未滿 5 年'], ['5to10', '5～10 年'], ['ge10', '10 年以上'], ['unknown', '不明']];
  const ORG = ['獨資', '合夥'];

  let root = null;
  const $ = (sel) => root.querySelector(sel);
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const parseCsv = (text) => (global.Leads && global.Leads.parseCsv ? global.Leads.parseCsv(text) : [[]]);
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

  /* ---------------- 純邏輯 ---------------- */

  function parseYmd(s) {
    const m = String(s || '').match(/^(\d{4})[/-]?(\d{2})[/-]?(\d{2})/);
    if (!m) return null;
    const y = +m[1]; const mo = +m[2]; const d = +m[3];
    if (y <= 1911 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, m: mo, d };
  }
  function yearsSince(dt, today) {
    const t = today || new Date();
    let n = t.getFullYear() - dt.y;
    if (t.getMonth() + 1 < dt.m || (t.getMonth() + 1 === dt.m && t.getDate() < dt.d)) n -= 1;
    return Math.max(0, n);
  }
  /** 元 → 「100 萬」「1.2 億」 */
  function money(n) {
    const v = Number(n) || 0;
    if (v >= 1e8) return `${(v / 1e8).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 億`;
    return `${(v / 1e4).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 萬`;
  }
  const ageOf = (r) => (!r.setup ? 'unknown' : r.years < 5 ? 'lt5' : r.years < 10 ? '5to10' : 'ge10');
  function branchOf(address) {
    if (!global.Rules || !global.Normalize) return { key: '', label: '', kind: '', city: '', district: '' };
    const { city, district } = global.Normalize.parseAddress(address);
    const b = global.Rules.branchOf(city, district);
    const key = b.kind === 'branch' ? `${b.branches[0]}分公司`
      : b.kind === 'common' ? `${b.branches.join('／')}共同區`
      : b.kind === 'shared' ? '全公司共同區域'
      : (city ? '不在劃分表上' : '無地址');
    return { key, label: b.label || key, kind: b.kind, city, district, b };
  }
  /** biz.csv 一列 → 卡片資料 */
  function toRecord(o, today) {
    const r = {
      taxId: String(o['統編'] || '').replace(/\D/g, ''), name: o['名稱'] || '', org: o['組織別'] || '',
      capital: Number(String(o['資本額'] || '').replace(/\D/g, '')) || 0, setup: parseYmd(o['設立日期']),
      address: o['地址'] || '', code: o['行業代號'] || '', inds: [o['行業'], o['行業2'], o['行業3']].filter(Boolean),
      invoice: o['開發票'] === 'Y', owner: o['負責人'] || '',
      // 商業登記 N＝只有稅籍登記（沒辦商業登記）：findbiz 查不到、沒負責人、資本額是稅籍自填的。舊檔沒這欄就看有沒有負責人
      reg: o['商業登記'] ? o['商業登記'] === 'Y' : !!o['負責人'],
    };
    r.years = r.setup ? yearsSince(r.setup, today) : null;
    r.branch = branchOf(r.address);
    r.district = r.branch.district || '';
    r.key = r.taxId;
    r.blob = [r.name, r.taxId, r.owner, r.address, ...r.inds, r.org].join(' ').toLowerCase();
    return r;
  }
  /** 清冊的民國日期 115/08/19 → {y,m,d}；西元的也收 */
  function parseAnyDate(s) {
    const m = String(s || '').match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
    if (m && +m[1] < 1000) { const y = +m[1] + 1911; const mo = +m[2]; const d = +m[3]; return (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? { y, m: mo, d } : null; }
    return parseYmd(s);
  }
  const ymd = (dt) => (dt ? `${dt.y}/${String(dt.m).padStart(2, '0')}/${String(dt.d).padStart(2, '0')}` : '');
  /** 期別 11508 → 2026/08 */
  const periodLabel = (p) => { const m = String(p || '').match(/^(\d{3})(\d{2})$/); return m ? `${+m[1] + 1911}/${m[2]}` : String(p || ''); };
  /** 商業每月清冊（fetch-leads.mjs --kind bms 的 CSV，欄位名沿用公司清冊）一列 → 卡片資料 */
  function toMonthlyRecord(o, today) {
    const items = String(o['營業項目'] || '').split('；').map((t) => t.trim()).filter(Boolean)
      .map((t) => { const m = t.match(/^([A-Z]{1,2}\d{5,6})\s*(.*)$/); return m ? { code: m[1], name: m[2].trim() } : { code: '', name: t }; })
      .filter((i) => i.name && !/除許可業務外/.test(i.name));
    const kind = o['清冊'] === '設立' ? '設立' : '變更';
    const r = {
      taxId: String(o['統一編號'] || '').replace(/\D/g, ''), name: o['公司名稱'] || '', org: '',
      capital: Number(String(o['資本額'] || '').replace(/\D/g, '')) || 0,
      setup: parseAnyDate(o['核准設立日期']), changed: parseAnyDate(o['核准變更日期']),
      reason: (o['案由或變更事項'] || '').trim(), address: o['公司所在地'] || '', code: items[0] ? items[0].code : '',
      inds: items.map((i) => i.name), invoice: null, owner: o['代表人'] || '',
      reg: true, monthly: true, kind, period: o['期別'] || '',
    };
    r.rk = kind === '變更' ? reasonKind(r.reason) : '';
    r.years = r.setup ? yearsSince(r.setup, today) : null;
    r.branch = branchOf(r.address);
    r.district = r.branch.district || '';
    r.key = r.taxId;
    r.blob = [r.name, r.taxId, r.owner, r.address, r.reason, ...r.inds].join(' ').toLowerCase();
    return r;
  }

  /* ---------------- 跟名單比對 ---------------- */

  function customerMap() {
    const byTax = new Map(); const byName = new Map();
    const views = typeof global.customerViews === 'function' ? global.customerViews() : [];
    views.forEach((v) => {
      const tax = String(v.taxId || '').replace(/\D/g, '');
      if (tax && !byTax.has(tax)) byTax.set(tax, v);
      if (v.company && !byName.has(v.company)) byName.set(v.company, v);
    });
    return { byTax, byName };
  }
  const mineOf = (r, cm) => (r.taxId && cm.byTax.get(r.taxId)) || (r.name && cm.byName.get(r.name)) || null;
  const declined = (v) => !!v && (v.blocked || v.outcome === 'blocked');
  const mineKey = (r, cm) => { const m = mineOf(r, cm); return m ? (declined(m) ? 'declined' : 'in') : 'out'; };
  const mmdd = (iso) => { const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };
  const myBranch = () => { let b = ''; try { b = localStorage.getItem('my-branch') || ''; } catch (e) { /* 無痕 */ } return `${b || '新莊'}分公司`; };

  /* ---------------- 狀態 ---------------- */

  let index = null;
  let rows = [];
  let limit = PAGE;
  let started = false;
  let ready = false;
  let showHidden = false;
  let mode = 'list';            // list｜setup｜change
  let monthly = null;           // leads/biz/monthly/index.json
  const mrows = {};             // 期別 → { setup: [...], change: [...] }
  let listSub = '';
  // 「利率不敏感」預設勾（使用者：「在各來源的分頁裡也預設篩選利率不敏感的」）；rate-filter-default＝'0' 是預設不勾（測試用）
  const rateDefault = () => { try { return localStorage.getItem('rate-filter-default') === '0' ? [] : ['Y']; } catch (e) { return ['Y']; } };
  const f = { rate: new Set(rateDefault()), branches: new Set(), districts: new Set(), orgs: new Set(), ages: new Set(), inds: new Set(), mine: new Set(), invoice: new Set(), reasons: new Set(), phone: new Set(), q: '' };
  const curPeriod = () => { const sel = root && $('#biz-period'); return (sel && sel.value) || (monthly && monthly.latest) || ''; };
  /** 目前模式在看的那一池 */
  const pool = () => (mode === 'list' ? rows : ((mrows[curPeriod()] || {})[mode] || []));
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };

  function criteria() {
    return {
      min: (Number($('#biz-capMin').value) || 0) * 1e4,
      max: (Number($('#biz-capMax').value) || 0) * 1e4 || Infinity,
      terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean),
      cm: customerMap(),
    };
  }
  function passes(r, c, except) {
    return (except === 'branches' || !f.branches.size || f.branches.has(r.branch.key))
      && (except === 'districts' || !f.districts.size || f.districts.has(r.district))
      && (except === 'orgs' || !f.orgs.size || f.orgs.has(r.org))
      && (except === 'ages' || !f.ages.size || f.ages.has(ageOf(r)))
      && (except === 'inds' || !f.inds.size || r.inds.some((i) => f.inds.has(i)))
      && (except === 'invoice' || !f.invoice.size || f.invoice.has(r.invoice ? 'Y' : 'N'))
      && (except === 'reasons' || mode !== 'change' || !f.reasons.size || f.reasons.has(r.rk))
      && (except === 'mine' || !f.mine.size || f.mine.has(mineKey(r, c.cm)))
      && (except === 'rate' || !f.rate.size || f.rate.has(rateKey(r)))
      && (except === 'phone' || !f.phone.size || [...f.phone].some((k) => phoneKindsOf(r).has(k)))
      && r.capital >= c.min && r.capital <= c.max
      && (showHidden || !(hidden.has(r.key) || deletedOf(r.name, r.taxId)))
      && c.terms.every((t) => r.blob.includes(t));
  }
  function visible(c) {
    const list = pool().filter((r) => passes(r, c, null));
    const sort = $('#biz-sort').value;
    // 「最新在前」：變更清冊看核准變更日期，其他看設立日期
    const setupKey = (r) => { const dt = (mode === 'change' ? r.changed : r.setup) || r.setup; return dt ? `${dt.y}${String(dt.m).padStart(2, '0')}${String(dt.d).padStart(2, '0')}` : '0'; };
    list.sort((a, b) => (sort === 'newest' ? setupKey(b).localeCompare(setupKey(a)) || b.capital - a.capital
      : sort === 'name' ? a.name.localeCompare(b.name, 'zh-Hant')
        : (b.reg ? 1 : 0) - (a.reg ? 1 : 0) || b.capital - a.capital || setupKey(b).localeCompare(setupKey(a))));   // 只有稅籍登記的資本額不可信，排後面
    return list;
  }

  /* ---------------- 畫面 ---------------- */

  /*
   * 分頁上就先找電話、填電話（使用者：「我會複製分頁內名單的公司名，去看一下他是做什麼的，順便找他的電話，
   * 但我把它加入到重點電推表中還要再找他出來才能新增電話」）：
   * 名稱旁一顆複製的點；卡片上一排 Google／地圖／104／1111；找到的電話先貼在卡片上的框，按「加入客戶名單」就一起帶進去；
   * 單張加入後直接打開那一筆。貿易署電話表對得到的不用填（會自動填），框就不出現。
   */
  // 名單上刪掉的公司（公司排除）：各分頁一起當「藏起來」，放回來＝收回排除（app.js 的 deletedCompany／liftCompany）
  const deletedOf = (name, tax) => (typeof global.deletedCompany === 'function' ? global.deletedCompany(name, tax) : false);
  const restoreBtn = (name, tax) => el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來（名單刪過）', title: '這家你在名單上刪過，匯入與每日挑選都會跳過；放回來就收回排除', onclick: async () => { if (typeof global.liftCompany === 'function') await global.liftCompany(name, tax); render(); toast('放回來了，之後匯入與每日挑選會再出現'); } });
  const typed = new Map();   // 卡片 key → 使用者貼的電話（重畫不會掉）
  /*
   * Google 地圖找到的電話（使用者：「商行那頁有辦法找到相對應的電話嗎」）：稅籍檔沒電話，商行多半是店面，Google 地圖的命中率高。
   * 「幫篩出來的找電話」對目前篩出來、沒電話的前 HUNT_MAX 家用主站同一條 Places 查法（名稱＋地址），確定／疑似都留下、標清楚；
   * 找到的填進卡片上貼電話的框，加入名單時一起帶。存本機（FOUND_KEY），重開不會重查、不會多花額度。
   */
  const FOUND_KEY = 'biz-found-phones-v1';
  const HUNT_MAX = 50;
  let found = new Map();
  try { found = new Map(Object.entries(JSON.parse(localStorage.getItem(FOUND_KEY) || '{}'))); } catch (e) { found = new Map(); }
  const saveFound = () => { try { localStorage.setItem(FOUND_KEY, JSON.stringify(Object.fromEntries(found))); } catch (e) { /* 無痕 */ } };
  const foundOf = (r) => { const f = found.get(r.key); return f && f.tel ? f : null; };
  // 公司名底下那排 Google／地圖／104／1111（使用者：「所有分頁的公司名底下都要有，無論有無電話；有電話的就不用輸入框」）
  function phoneBox(r, key, hasAuto) {
    const stop = (e) => e.stopPropagation();
    const input = el('input', { type: 'tel', className: 'phone-paste', placeholder: '找到電話貼這裡，加入時一起帶', autocomplete: 'off', value: typed.get(key) || ((found.get(key) || {}).tel || ''), onclick: stop });
    input.oninput = () => { const v = input.value.trim(); if (v) typed.set(key, v); else typed.delete(key); };
    return el('div', { className: 'card-actions phone-search', onclick: stop }, [
      ...(typeof global.phoneSearchLinks === 'function' ? global.phoneSearchLinks(r.__name, r.__addr) : []),
      hasAuto ? '' : input,
    ]);
  }
  const copyName = (name) => (typeof global.copyDot === 'function' ? global.copyDot(name, '複製公司名稱', `已複製：${name}`) : '');
  /** 單張加入之後直接打開那一筆（整批不開） */
  function openJustAdded(fileName, single) {
    if (!single || typeof global.customerViews !== 'function' || typeof global.openCustomer !== 'function') return;
    const v = global.customerViews().find((x) => x.source === fileName);
    if (v) global.openCustomer(v.id);
  }

  /* 商業（獨資／合夥）在 findbiz 的頁面是 /fts/business/統編/序號，序號（banKey）稅籍與清冊都沒有，湊不出直達連結；
   * /fts/company/統編 是公司用的，商業開不到（使用者回報）。改連查詢結果頁，帶統編當條件（欄位照 findbiz 查詢表單），
   * 點結果那一列就是商業登記頁（網址規則集中在 Normalize.findbizUrl）。findbiz 有 Cloudflare，開發環境與 Actions 都連不到，這條是使用者實際點過確認的。 */
  const findbiz = (taxId, text) => el('a', { href: global.Normalize.findbizUrl(taxId, text), target: '_blank', rel: 'noopener', textContent: text, title: '商工登記公示資料：用統編查商業登記' });

  function card(r, c) {
    const mine = mineOf(r, c.cm);
    const isHidden = hidden.has(r.key) || deletedOf(r.name, r.taxId);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [r.reg ? findbiz(r.taxId, r.name) : el('span', { textContent: r.name, title: '只有稅籍登記，商工登記查不到' }), copyName(r.name)]),
      r.org ? el('span', { className: 'badge badge-new', textContent: r.org }) : '',
      r.monthly ? (r.kind === '設立'
        ? el('span', { className: 'badge badge-up', textContent: `${periodLabel(r.period)} 新設立` })
        : el('span', { className: `badge ${r.rk === 'up' ? 'badge-up' : r.rk === 'down' ? 'badge-down' : 'badge-ind'}`, textContent: r.reason || '變更', title: '案由或變更事項' })) : '',
      r.reg ? '' : el('span', { className: 'badge badge-own', textContent: '只有稅籍登記', title: '沒辦商業登記（小規模營業人可免辦）：商工登記查不到、沒有負責人，資本額是稅籍上自己填的' }),
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      r.invoice ? el('span', { className: 'badge badge-ind', textContent: '開發票' }) : '',
      hasPhone(r) ? el('span', { className: 'badge badge-ind', textContent: phoneKindsOf(r).has('M') ? '📞 手機（多半是老闆本人）' : '📞 有電話', title: '貿易署出進口廠商登記裡有電話，加入名單時會自動填' }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.addedDate ? `・${mmdd(mine.addedDate)} 加入` : ''}${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}`, title: '哪天加進名單的（名單新增日期）；點一下打開名單上這一筆', onclick: () => { if (typeof global.openCustomer === 'function') global.openCustomer(mine.id); } })) : '',
    ]);
    const fp = foundOf(r);
    const meta = el('div', { className: 'card-meta' }, [
      fp ? el('span', {}, ['📞 ', el('a', { href: `tel:${fp.tel.replace(/[^\d+#]/g, '')}`, textContent: fp.tel }), el('small', { className: 'muted', textContent: fp.level === 'sure' ? '（Google 地圖找到，名稱地址都對）' : '（Google 地圖找到，疑似，打前核對）' }), fp.maps ? el('a', { href: fp.maps, target: '_blank', rel: 'noopener', textContent: ' 地圖', title: 'Google 地圖上的這家' }) : '']) : '',
      el('span', { textContent: `💰 資本額 ${money(r.capital)}${r.reg ? '' : '（稅籍自填）'}` }),
      r.setup ? el('span', { textContent: `🎂 ${r.monthly && r.kind === '設立' ? '核准設立' : '設立'} ${r.setup.y}/${String(r.setup.m).padStart(2, '0')}${r.monthly && r.kind === '設立' ? `/${String(r.setup.d).padStart(2, '0')}` : `（${r.years} 年）`}` }) : (r.monthly ? '' : el('span', { className: 'muted', textContent: '🎂 設立不明' })),
      r.changed ? el('span', { textContent: `🔁 核准變更 ${ymd(r.changed)}` }) : '',
      r.dyn ? el('span', { className: 'biz-dyn', title: '本期商業登記清冊裡有這家', textContent: `🔔 ${periodLabel(r.dyn.period)} ${r.dyn.kind === '設立' ? '新設立' : `變更：${r.dyn.reason || ''}`}` }) : '',
      r.owner ? el('span', { textContent: `👤 負責人 ${r.owner}` }) : '',
      r.inds.length ? el('span', { textContent: `🏭 ${r.inds.slice(0, 3).join('、')}${r.inds.length > 3 ? `…共 ${r.inds.length} 項` : ''}` }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      el('span', { textContent: `#${r.taxId}` }),
    ]);
    const actions = el('div', { className: 'card-actions' }, [
      mine ? '' : el('button', { className: 'btn btn-tiny btn-primary biz-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
      deletedOf(r.name, r.taxId) ? restoreBtn(r.name, r.taxId) : isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(r.key); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny biz-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(r.key); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    r.__name = r.name; r.__addr = r.address;
    return el('article', { className: `card leads-card biz-card${r.branch.key === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, phoneBox(r, r.key, hasPhone(r) || !!mine), meta, actions]);
  }

  function chips(host, options, set) {
    host.textContent = '';
    options.forEach(([value, label, count]) => {
      const b = el('button', { className: 'chip', type: 'button' }, [document.createTextNode(label), count != null ? el('small', { textContent: String(count) }) : '']);
      b.setAttribute('aria-pressed', String(set.has(value)));
      b.onclick = () => { if (set.has(value)) set.delete(value); else set.add(value); limit = PAGE; render(); };
      host.append(b);
    });
  }
  function drawChips(c) {
    const facet = (except, pred) => { let n = 0; pool().forEach((r) => { if (pred(r) && passes(r, c, except)) n += 1; }); return n; };
    const count = (except, keyOf) => { const m = new Map(); pool().forEach((r) => { if (!passes(r, c, except)) return; (Array.isArray(keyOf(r)) ? keyOf(r) : [keyOf(r)]).forEach((k) => { if (k) m.set(k, (m.get(k) || 0) + 1); }); }); return m; };
    const bc = count('branches', (r) => r.branch.key);
    const order = (k) => (k === myBranch() ? -1 : /分公司$/.test(k) ? 0 : /共同區$/.test(k) ? 1 : 2);
    const bkeys = [...new Set([...bc.keys(), ...f.branches])].sort((a, b) => order(a) - order(b) || (bc.get(b) || 0) - (bc.get(a) || 0));
    chips($('#biz-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    const dc = count('districts', (r) => r.district);
    const dkeys = [...new Set([...dc.keys(), ...f.districts])].sort((a, b) => (dc.get(b) || 0) - (dc.get(a) || 0));
    chips($('#biz-fDistrict'), dkeys.map((k) => [k, k, dc.get(k) || 0]), f.districts);
    chips($('#biz-fOrg'), ORG.map((k) => [k, k, facet('orgs', (r) => r.org === k)]), f.orgs);
    chips($('#biz-fAge'), AGE.map(([k, label]) => [k, label, facet('ages', (r) => ageOf(r) === k)]), f.ages);
    chips($('#biz-fInvoice'), [['Y', '開統一發票'], ['N', '不開發票（免用）']].map(([k, label]) => [k, label, facet('invoice', (r) => (r.invoice ? 'Y' : 'N') === k)]), f.invoice);
    const ic = count('inds', (r) => r.inds);
    const ikeys = [...new Set([...[...ic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k]) => k), ...f.inds])];
    chips($('#biz-fInd'), ikeys.map((k) => [k, k, ic.get(k) || 0]), f.inds);
    chips($('#biz-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
    chips($('#biz-fRate'), [['Y', '利率不敏感'], ['N', '其他']].map(([k, label]) => [k, label, facet('rate', (r) => rateKey(r) === k)]), f.rate);
    chips($('#biz-fPhone'), PHONE_CHIPS.map(([k, label]) => [k, label, facet('phone', (r) => phoneKindsOf(r).has(k))]), f.phone);
    if (mode === 'change') chips($('#biz-fReason'), REASONS.map(([k, label]) => [k, label, facet('reasons', (r) => r.rk === k)]).filter(([k, , n]) => n || f.reasons.has(k)), f.reasons);
    $('#biz-gOrg').hidden = mode !== 'list'; $('#biz-gInvoice').hidden = mode !== 'list'; $('#biz-gReason').hidden = mode !== 'change';
    drawModes();
  }
  function drawModes() {
    const host = $('#biz-mode');
    host.textContent = '';
    const p = curPeriod();
    MODES.forEach(([k, label]) => {
      const n = k === 'list' ? rows.length : ((mrows[p] || {})[k] || []).length;
      const b = el('button', { className: 'chip', type: 'button' }, [document.createTextNode(label), (k === 'list' || mrows[p]) ? el('small', { textContent: n.toLocaleString() }) : '']);
      b.setAttribute('aria-pressed', String(mode === k));
      b.onclick = () => { switchMode(k).catch((err) => toast(err.message)); };
      host.append(b);
    });
    const sel = $('#biz-period');
    sel.hidden = mode === 'list' || !monthly;
  }
  /** 切模式：組織別、發票、案由的篩選跟著清掉（清冊沒那些欄位） */
  async function switchMode(k) {
    if (k !== 'list') {
      $('#biz-loading').hidden = false; $('#biz-loading').textContent = '下載清冊…';
      try { await ensureMonthly(curPeriod()); }
      catch (err) { $('#biz-loading').hidden = true; throw new Error(`商業每月清冊：${err.message}`); }
      $('#biz-loading').hidden = true;
    }
    mode = k; f.orgs.clear(); f.invoice.clear(); f.reasons.clear(); limit = PAGE;
    if (k !== 'list' && $('#biz-sort').value === 'capital' && !switchMode.touched) $('#biz-sort').value = 'newest';
    render();
  }
  /** 載清冊的 index 與某一期的檔（新北市 設立＋變更）；載過就不再抓 */
  async function ensureMonthly(period) {
    if (!monthly) {
      const res = await fetch(`${MONTHLY_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('還沒有抓好的清冊（Actions「每月商行／企業社」跑過就有）');
      monthly = await res.json();
      const sel = $('#biz-period');
      sel.textContent = '';
      Object.keys(monthly.periods || {}).sort().reverse().forEach((p) => sel.append(el('option', { value: p, textContent: periodLabel(p) })));
    }
    const p = period || monthly.latest;
    if (!p || !monthly.periods || !monthly.periods[p]) throw new Error('這一期沒有清冊');
    if (mrows[p]) return p;
    const got = { setup: [], change: [] };
    const files = (monthly.periods[p].files || []);
    await Promise.all(files.map(async (fl) => {
      const res = await fetch(`${MONTHLY_BASE}${fl.path}?t=${monthly.periods[p].generatedAt || monthly.generatedAt}`, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`${fl.path}：HTTP ${res.status}`);
      const table = parseCsv(await res.text());
      const head = table[0] || [];
      table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); got[fl.type === 'setup' ? 'setup' : 'change'].push(toMonthlyRecord(o)); });
    }));
    mrows[p] = got;
    return p;
  }
  /** 名單裡的商行有在本期清冊出現的，掛上 dyn（卡片標「本期 新設立／變更」，每日挑選排前面） */
  async function attachDyn() {
    let p = '';
    try { p = await ensureMonthly(''); } catch (e) { return; }
    const m = new Map();
    [...mrows[p].setup, ...mrows[p].change].forEach((r) => { if (r.taxId) m.set(r.taxId, r); });
    rows.forEach((r) => { const d = m.get(r.taxId); if (d) r.dyn = d; });
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#biz-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const fresh = current.filter((r) => !mineOf(r, c.cm)).length;
    $('#biz-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">${current.length - fresh ? `　／ 其中 ${current.length - fresh} 家已在名單` : ''}</span>`;
    const del = pool().filter((r) => deletedOf(r.name, r.taxId)).length;
    const hid = pool().filter((r) => hidden.has(r.key)).length + del;
    const hb = $('#biz-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    $('#biz-more').hidden = current.length <= limit;
    $('#biz-empty').hidden = !!current.length;
    $('#biz-empty').textContent = pool().length ? '沒有符合條件的，把篩選放寬試試。' : '';
    if (mode === 'list') $('#biz-sub').textContent = listSub;
    else {
      const p = curPeriod(); const gen = monthly && monthly.periods && monthly.periods[p] ? String(monthly.periods[p].generatedAt || '').slice(0, 10).replace(/-/g, '/') : '';
      const up = mode === 'change' ? pool().filter((r) => r.rk === 'up').length : 0;
      $('#biz-sub').textContent = `${periodLabel(p)} 新北市商業${mode === 'setup' ? '設立' : '變更'}登記清冊 ${pool().length.toLocaleString()} 家${up ? `（增資 ${up} 家）` : ''}　·　經濟部商業每月登記資料清冊，上次抓取 ${gen}`;
    }
    $('#biz-add').disabled = !fresh;
    $('#biz-add').textContent = `把篩出來的加入客戶名單${fresh ? `（${Math.min(fresh, 200)} 家）` : ''}`;
    $('#biz-export').disabled = !current.length;
    const pill = document.getElementById('countBiz');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單 ---------------- */

  function noteFor(r) {
    const src = r.monthly ? `商行／企業社（${periodLabel(r.period)} 商業${r.kind}登記清冊${r.reason ? `：${r.reason}` : ''}）` : `商行／企業社（稅籍登記）：${r.org}`;
    return [src, `資本額 ${money(r.capital)}${r.reg ? '' : '（稅籍自填）'}`, r.setup ? `設立 ${r.setup.y}-${String(r.setup.m).padStart(2, '0')}-${String(r.setup.d).padStart(2, '0')}` : '',
      r.changed ? `核准變更 ${ymd(r.changed)}` : '',
      r.dyn ? `${periodLabel(r.dyn.period)} 商業登記${r.dyn.kind === '設立' ? '新設立' : `變更：${r.dyn.reason || ''}`}` : '',
      r.inds.length ? `行業 ${r.inds.slice(0, 3).join('、')}` : '', r.invoice == null ? '' : (r.invoice ? '開統一發票' : '免用統一發票'),
      !r.reg ? '只有稅籍登記、沒辦商業登記，資本額是稅籍自填的' : (r.owner ? '' : '負責人清冊還沒有，打前查商工登記')].filter(Boolean).join('，');
  }
  const thousands = (yuan) => (yuan ? Math.round(yuan / 1000).toLocaleString() : '');
  function toStandardCsv(list, dates) {
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.name, r.taxId, '', r.setup ? String(r.setup.y) : '', thousands(r.capital), typed.get(r.key) || (foundOf(r) ? foundOf(r).tel : ''), r.owner || '', '', r.inds[0] || '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fromDate = () => { const v = $('#biz-from') && $('#biz-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm)).slice(0, 200);
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], `商行企業社-${todayIso()}-${fresh.length}家.csv`, { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    fresh.forEach((r) => typed.delete(r.key));
    openJustAdded(file.name, fresh.length === 1);
    // 匯入時靠名稱比對到已在名單的會被略過（名單上那筆沒統編就只能比名稱），不能再說「N 家排在…」
    // （使用者：昨天加進去的，「昨天新增」卻看不到——其實是早就在名單上，加的那次被略過了）
    const got = (typeof global.customerViews === 'function' ? global.customerViews() : []).filter((v) => v.source === file.name).length;
    const lost = fresh.length - got;
    const sorted = dates.filter(Boolean).sort();
    if (!got) toast(`${fresh.length === 1 ? '這家' : `這 ${fresh.length} 家`}早就在名單上了（同名或同統編），沒有再加一次；卡片上的「已在名單」有寫哪天加的`);
    else if (sorted.length) toast(`${got} 家排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}${lost > 0 ? `；另外 ${lost} 家早就在名單上（同名），略過` : ''}`);
    render();
  }

  /* ---------------- 每日挑選（給 app.js 的每日新名單用） ---------------- */

  // 使用者：「商行的話就單純看資本額跟成立年」——原本的商業登記、電話、本期變更、分公司、開發票、利率不敏感都不看，只分四級往下走，同一級資本額高的先：
  //   500 萬以上＋成立 5 年內 → 500 萬以上＋5 年以上（成立年不明的也在這級）→ 200 萬以上＋5 年內 → 其他
  // 名稱裡不用「、」：成效統計是用「、」切條件的
  const DAILY_PRIORITY = ['資本額 500 萬以上＋成立 5 年內', '資本額 500 萬以上＋成立 5 年以上', '資本額 200 萬以上＋成立 5 年內'];
  const youngBiz = (r) => !!r.setup && r.years < 5;
  const tierOf = (r) => (r.capital >= 5000000 ? (youngBiz(r) ? 0 : 1) : r.capital >= 2000000 && youngBiz(r) ? 2 : 3);
  // 分頁篩選的「利率不敏感」：動產擔保上跟同業（租賃／融資，不含銀行）借的（每日挑選不看，見上）
  const peerOf = (id) => (global.Chattel && global.Chattel.peerLenderOf ? global.Chattel.peerLenderOf(id) : '');
  const rateFreeOf = (r) => {
    const peer = peerOf(r.taxId);
    if (peer) return `跟${peer}借`;
    return '';
  };
  const rateKey = (r) => (rateFreeOf(r) ? 'Y' : 'N');
  // 有電話＝貿易署出進口廠商登記裡對得到（使用者：新增的名單撈不到電話就得自己 Google，所以有電話的先挑）
  const hasPhone = (r) => !!(global.Trade && global.Trade.hasPhone && global.Trade.hasPhone(r.taxId));
  const isMobile = (tel) => /^0?9\d{8}$/.test(String(tel || '').replace(/\D/g, '').replace(/^886/, '0'));
  // 電話籤、每日挑選：出進口登記的，或 Google 地圖找到的，都算有電話
  const phoneKindsOf = (r) => {
    const fp = foundOf(r);
    if (fp && fp.tel) return isMobile(fp.tel) ? new Set(['Y', 'M']) : new Set(['Y']);
    return global.Trade && global.Trade.phoneKindsOf ? global.Trade.phoneKindsOf(r.taxId) : new Set(['N']);
  };
  // 電話籤：出進口廠商登記的電話表對得到的；手機是有電話的一部分，籤是「或」的關係
  const PHONE_CHIPS = [['Y', '有電話'], ['M', '手機'], ['N', '沒電話']];
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  const dailyChecks = (r) => [tierOf(r)];
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return b.capital - a.capital;
  }
  /** 「符合：…」那串：落在哪一級；成立年不明的寫出來 */
  const whyOf = (r) => {
    const t = r._checks[0];
    if (t > 2) return '基準都不符，補位';
    return `符合：${t === 1 && !r.setup ? '資本額 500 萬以上＋成立年不明' : DAILY_PRIORITY[t]}`;
  };
  /** 同一區、還不在名單上的商行（客戶詳細頁「附近可以順訪的」用，店面型可以直接走進去）；有電話的在前 */
  async function nearby(district, limit) {
    if (!root) root = document.getElementById('paneBiz');
    if (!root || !district) return [];
    await start();
    if (!ready) return [];
    if (global.Trade && global.Trade.ensurePhones) { try { await global.Trade.ensurePhones(); } catch (e) { /* 沒電話表就當都沒有 */ } }
    const cm = customerMap();
    const tel = (r) => (foundOf(r) ? foundOf(r).tel : '') || typed.get(r.key) || (global.Trade && global.Trade.telOf ? global.Trade.telOf(r.taxId) : '') || '';
    return rows.filter((r) => r.district === district && !mineOf(r, cm) && !hidden.has(r.key) && !deletedOf(r.name, r.taxId))
      .map((r) => ({ kind: '商行', name: r.name, taxId: r.taxId, address: r.address, tel: tel(r), note: [r.inds[0] || '', r.owner ? `負責人 ${r.owner}` : ''].filter(Boolean).join('・'), add: () => addToList([r]) }))
      .sort((a, b) => Number(!!b.tel) - Number(!!a.tel))
      .slice(0, limit || 50);
  }
  async function dailyCandidates() {
    if (!root) root = document.getElementById('paneBiz');
    if (!root) return [];
    await start();
    if (!ready) return [];
    if (global.Trade && global.Trade.ensurePhones) { try { await global.Trade.ensurePhones(); } catch (e) { /* 沒電話表就當都沒有 */ } }
    const cm = customerMap();
    // 池子＝名單 ＋ 本期清冊裡資本額到門檻、名單裡沒有的（新設立的稅籍檔還沒收進去，只有清冊有）
    let extra = [];
    try {
      const p = await ensureMonthly('');
      const seen = new Set(rows.map((r) => r.taxId));
      const minCap = (index && index.minCapital) || 500000;
      extra = [...mrows[p].setup, ...mrows[p].change].filter((r) => { if (!r.taxId || seen.has(r.taxId) || r.capital < minCap) return false; seen.add(r.taxId); return true; });
    } catch (e) { extra = []; }
    return [...rows, ...extra].filter((r) => !mineOf(r, cm) && !hidden.has(r.key) && !deletedOf(r.name, r.taxId))
      .map((r) => { r._checks = dailyChecks(r); r._why = whyOf(r); return r; })
      .sort(dailyCompare);
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const modes = el('div', { className: 'leads-row biz-modes' }, [
      el('div', { className: 'chips', id: 'biz-mode' }),
      el('select', { id: 'biz-period', hidden: true, title: '清冊期別' }),
    ]);
    const filters = el('details', { className: 'leads-filters', id: 'biz-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。稅籍資料沒有電話，統編對得到貿易署出進口廠商登記的才有（「電話」籤）；其他打前用 104 或 Google 查。' }),
      Object.assign(group('案由（變更清冊）', el('div', { className: 'chips', id: 'biz-fReason' })), { id: 'biz-gReason', hidden: true }),
      group('歸屬分公司（同「規則」的劃分表）', el('div', { className: 'chips', id: 'biz-fBranch' })),
      group('區', el('div', { className: 'chips', id: 'biz-fDistrict' })),
      Object.assign(group('組織別', el('div', { className: 'chips', id: 'biz-fOrg' })), { id: 'biz-gOrg' }),
      group('設立', el('div', { className: 'chips', id: 'biz-fAge' })),
      Object.assign(group('統一發票', el('div', { className: 'chips', id: 'biz-fInvoice' })), { id: 'biz-gInvoice' }),
      group('行業（最多的 24 種；其他用關鍵字）', el('div', { className: 'chips', id: 'biz-fInd' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'biz-fMine' })),
      group('利率（跟同業借、剛擴張的，比較不在乎利率）', el('div', { className: 'chips', id: 'biz-fRate' })),
      group('電話（貿易署出進口廠商登記對得到的）', el('div', { className: 'chips', id: 'biz-fPhone' })),
      group('資本額（萬元）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'biz-capMin', type: 'number', min: '0', step: '10', placeholder: '下限' }), '～',
        el('input', { id: 'biz-capMax', type: 'number', min: '0', step: '10', placeholder: '上限' })])),
      group('關鍵字', el('input', { id: 'biz-q', type: 'search', placeholder: '名稱、統編、負責人、地址、行業', autocomplete: 'off' }), 'biz-q'),
      group('排序', el('select', { id: 'biz-sort' }, [
        el('option', { value: 'capital', textContent: '資本額（高到低）' }),
        el('option', { value: 'newest', textContent: '最新設立在前' }),
        el('option', { value: 'name', textContent: '名稱' })]), 'biz-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'biz-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'biz-hidden', type: 'button', hidden: true })]),
    ]);
    // 使用者：「找名單的預設篩選畫面都先收起來，我每次點進來都要自己關」；leads-filters-open＝'1' 是預設打開（測試用）
    filters.open = (() => { try { return localStorage.getItem('leads-filters-open') === '1'; } catch (e) { return false; } })();
    root.append(
      el('p', { className: 'muted leads-sub', id: 'biz-sub', textContent: '財政部營業（稅籍）登記裡的商行、企業社（獨資、合夥）' }),
      modes,
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'biz-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'biz-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'biz-add', type: 'button', title: '把目前篩出來、還不在名單裡的全部送進匯入流程（一次最多 200 家）', textContent: '把篩出來的加入客戶名單' }),
          el('button', { className: 'btn', id: 'biz-export', type: 'button', textContent: '匯出 CSV' }),
          el('button', { className: 'btn', id: 'biz-hunt', type: 'button', title: `對目前篩出來、沒電話的前 ${HUNT_MAX} 家用 Google 地圖（Places API）查電話，用你在選單裡設的金鑰；找到的填進卡片，加入名單時一起帶`, textContent: '幫篩出來的找電話（Google 地圖）' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'biz-loading', hidden: true }),
      el('div', { className: 'cards', id: 'biz-cards' }),
      el('div', { className: 'empty', id: 'biz-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'biz-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [el('span', {}, [el('i', { className: 'swatch is-up' }), ' 在我的分公司轄區'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：財政部財政資訊中心「全國營業（稅籍）登記資料」（每月更新），只留新北市、獨資或合夥、資本額 50 萬以上、非分公司；GitHub Actions 每月抓。負責人與正式資本額來自新北市商業登記清冊；「只有稅籍登記」的是沒辦商業登記的（小規模營業人可免辦），商工登記查不到、資本額是自填的。電話一律沒有。「本月新設立／本月變更」是經濟部「商業每月登記資料清冊」（新北市，次月初產製，Actions 每月抓，留最近 6 期）；名單裡的商行有在本期清冊出現的，卡片上標 🔔。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳。' }),
    );
  }

  let starting = null;
  function start() {
    if (starting) return starting;
    starting = (async () => {
      started = true;
      build();
      try {
        const res = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        index = await res.json();
      } catch (err) {
        $('#biz-empty').hidden = false;
        $('#biz-empty').textContent = '還沒有抓好的資料。GitHub Actions 每月會自動抓，也可以到 repo 的 Actions 頁手動執行「每月商行／企業社」。';
        return;
      }
      listSub = `${(index.cities || []).join('、')}的商行、企業社 ${Number(index.total || 0).toLocaleString()} 家（獨資 ${(index.byOrg || {})['獨資'] || 0}、合夥 ${(index.byOrg || {})['合夥'] || 0}）　·　資本額 ${money(index.minCapital || 0)} 以上　·　稅籍資料 ${index.fileDate || ''}，上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}${index.withOwner ? `　·　查到負責人的 ${index.withOwner} 家` : ''}`;
      $('#biz-sub').textContent = listSub;
      $('#biz-loading').hidden = false;
      $('#biz-loading').textContent = '下載資料…';
      try {
        const csvRes = await fetch(`${DATA_BASE}biz.csv?t=${index.generatedAt}`, { cache: 'force-cache' });
        if (!csvRes.ok) throw new Error(`biz.csv：HTTP ${csvRes.status}`);
        const table = parseCsv(await csvRes.text());
        const head = table[0] || [];
        table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(toRecord(o)); });
      } catch (err) {
        $('#biz-loading').hidden = true;
        $('#biz-empty').hidden = false;
        $('#biz-empty').textContent = `資料下載失敗：${err.message}`;
        return;
      }
      $('#biz-loading').hidden = true;
      await attachDyn();   // 本期清冊對名單（沒有清冊就略過）
      ready = true;
      if (global.Trade && global.Trade.ensurePhones) global.Trade.ensurePhones().then(() => { if (ready) render(); }).catch(() => {});   // 電話表載好再補上 📞
      if (global.Chattel && global.Chattel.ensureData) global.Chattel.ensureData().then(() => { if (ready) render(); }).catch(() => {});   // 動保載好才知道誰跟同業借（利率不敏感）
      const rerender = () => { limit = PAGE; render(); };
      ['#biz-capMin', '#biz-capMax'].forEach((s) => { $(s).oninput = rerender; });
      $('#biz-sort').onchange = () => { switchMode.touched = true; rerender(); };
      $('#biz-period').onchange = () => { switchMode(mode).catch((err) => toast(err.message)); };
      let qt = null;
      $('#biz-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
      $('#biz-more').onclick = () => { limit += PAGE; render(); };
      $('#biz-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
      $('#biz-reset').onclick = () => {
        Object.values(f).forEach((v) => { if (v instanceof Set) v.clear(); }); f.q = ''; rateDefault().forEach((k) => f.rate.add(k));
        $('#biz-q').value = ''; $('#biz-capMin').value = ''; $('#biz-capMax').value = ''; $('#biz-sort').value = mode === 'list' ? 'capital' : 'newest'; showHidden = false;
        rerender();
      };
      $('#biz-add').onclick = () => { const c = criteria(); addToList(current.filter((r) => !mineOf(r, c.cm))); };
      $('#biz-hunt').onclick = async () => {
        const btn = $('#biz-hunt');
        if (!(global.placesKey && global.placesKey())) { toast('還沒設 Google 地圖的 API 金鑰：右上選單「幫沒電話的找電話」那裡設'); return; }
        const c = criteria();
        const todo = current.filter((r) => !mineOf(r, c.cm) && !hasPhone(r) && !found.has(r.key) && !typed.get(r.key)).slice(0, HUNT_MAX);   // 查過沒找到的也不再查
        if (!todo.length) { toast('篩出來的這些不是已有電話就是查過了'); return; }
        btn.disabled = true;
        let sure = 0; let maybe = 0; let done = 0; let stopped = '';
        for (const r of todo) {
          btn.textContent = `找電話中 ${done + 1}／${todo.length}…`;
          try {
            const { best } = await global.placesLookup({ company: r.name, address: r.address, city: r.branch.city || '', district: r.district || '' });
            if (best && best.phone) {
              found.set(r.key, { tel: best.phone, level: best.level, maps: best.maps || '' });
              if (!typed.get(r.key)) typed.set(r.key, best.phone);   // 加入名單時一起帶
              if (best.level === 'sure') sure += 1; else maybe += 1;
            } else found.set(r.key, { tel: '', level: 'none', maps: '' });   // 查過沒有：下次不再花額度
          } catch (err) { stopped = err && err.message ? err.message : String(err); break; }
          done += 1;
          if (done % 10 === 0) { saveFound(); render(); }
        }
        saveFound();
        btn.disabled = false; btn.textContent = '幫篩出來的找電話（Google 地圖）';
        render();
        toast(stopped ? `查到第 ${done + 1} 家停了：${stopped}` : `查了 ${done} 家：確定 ${sure} 家、疑似 ${maybe} 家、沒找到 ${done - sure - maybe} 家`);
      };
      $('#biz-export').onclick = () => {
        const blob = new Blob([toStandardCsv(current)], { type: 'text/csv;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `商行企業社${mode === 'list' ? '' : `-${periodLabel(curPeriod()).replace('/', '')}${mode === 'setup' ? '設立' : '變更'}`}-${todayIso()}-${current.length}家.csv` });
        document.body.append(a); a.click(); a.remove();
      };
      render();
    })();
    return starting;
  }

  function show() {
    if (!root) root = document.getElementById('paneBiz');
    if (!root) return;
    if (started) { if (ready) render(); return; }
    start().catch((err) => { console.error(err); toast(`商行／企業社載入失敗：${err.message}`); });
  }

  global.Biz = { show, toRecord, toMonthlyRecord, reasonKind, REASONS, parseAnyDate, periodLabel, toStandardCsv, noteFor, money, parseYmd, yearsSince, ageOf, nearby, dailyCandidates, DAILY_PRIORITY };
})(window);
