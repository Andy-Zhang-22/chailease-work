/*
 * 「動產擔保名單」分頁：新北市動產擔保登記清冊，找同業契約快到期的客戶。
 *
 * 動產抵押、附條件買賣都要向新北市經發局登記，清冊是公開的，上面有債務人與債權人的
 * 統編、契約起迄、擔保金額、標的物。同業（新鑫、和潤、合迪、日盛…）的客戶契約快到期，
 * 就是換約的時機——這一頁就是把那些公司按到期日排出來。
 *
 * 資料由 GitHub Actions 每月抓好放在 leads/chattel/（tools/fetch-chattel.mjs），
 * 誰是客戶、誰是金主在那邊就分好了；這裡只讀 CSV、篩選、畫卡片。
 * 跟客戶名單的交集有兩條路，都不另寫邏輯：
 *   - 「已在名單」是在瀏覽器裡拿統編對 IndexedDB 裡的名單，名單不會上傳到任何地方。
 *   - 「加入客戶名單」組成一份標準欄位的 CSV，送進主站現成的匯入流程（自動略過重複、
 *     吃排除名單），動保的資訊寫在訪談內容裡。
 * 「這家不用了」記在 localStorage：只是不想再看到，不是刪客戶，所以不進同步。
 */
(function (global) {
  'use strict';

  const PAGE = 80;
  const DATA_BASE = 'leads/chattel/';
  const HIDDEN_KEY = 'chattel-hidden-v1';
  const DUE = [['m3', '3 個月內', 92], ['m6', '6 個月內', 183], ['m12', '12 個月內', 366], ['expired', '已過期、還沒註銷', -1], ['all', '全部', Infinity]];
  // 金主家族：同一家的分公司、舊名都歸一起，籤才不會一長串
  const LENDERS = [
    ['chailease', '中租', /中租/], ['sinxin', '新鑫', /新鑫/], ['hotai', '和潤', /和潤/], ['hedi', '合迪', /合迪/],
    ['jih', '日盛', /日盛/], ['orix', '歐力士', /歐力士/], ['taishin', '台新', /台新/], ['first', '第一', /第一租賃|一銀租賃/],
    ['yulon', '裕融', /裕融|裕隆/], ['bank', '銀行', /銀行|商銀|農會|漁會|信用合作社|信合社/], ['insure', '保險／資融', /人壽|保險|資融/],
    ['other', '其他（含設備商）', null],
  ];
  const LENDER_RE = /租賃|銀行|商銀|融資|資融|金融|信託|保險|資產管理|信用合作社|信合社|農會|漁會|票券|中租|和潤|新鑫|合迪|裕融|日盛|租賃業/;
  // 跟主站的標準欄位一模一樣（登記清冊那頁 govToStandardRows 也是這個順序）：每日新名單把兩頁的列接在同一份檔裡，欄位才對得上
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  // 加進名單時下次聯絡日排在到期前幾天（換約要提早談）；已過期或太近的從明天起
  const WHEN = [['60', '到期前 60 天'], ['30', '到期前 30 天'], ['0', '從明天起']];
  const AGE = [['lt5', '未滿 5 年'], ['ge5', '5 年以上'], ['unknown', '還不知道']];
  const AGE_YEARS = 5;

  let root = null;
  const $ = (sel) => root.querySelector(sel);
  // 「已在名單　📝 記錄」：打開名單上那一筆、直接捲到「記錄這通電話」（使用者：在新名單打完電話不用再回重點名單搜尋）
  const openLog = (id) => { if (typeof global.openCustomerLog === 'function') global.openCustomerLog(id); else if (typeof global.openCustomer === 'function') global.openCustomer(id); };
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

  /* ---------------- 純邏輯（測試會叫） ---------------- */

  /** 2026/10/14 或 2026-10-14 → Date（當地時間 0 點）；空白或格式不對 → null。 */
  function parseYmd(s) {
    const m = String(s || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /** 民國 115/08/18、西元 2026/8/18 → {y,m,d}；空白與「1911年0月0日」→ null。 */
  function parseFounded(s) {
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
  const fmtRoc = (dt) => `${dt.y - 1911}/${pad2(dt.m)}/${pad2(dt.d)}`;
  /** 滿幾年：生日還沒到就少算一年，跟算年齡一樣。 */
  function yearsSince(dt, today) {
    const t = today || new Date();
    let n = t.getFullYear() - dt.y;
    if (t.getMonth() + 1 < dt.m || (t.getMonth() + 1 === dt.m && t.getDate() < dt.d)) n -= 1;
    return Math.max(0, n);
  }
  const ageOf = (r) => (!r.founded ? 'unknown' : r.years < AGE_YEARS ? 'lt5' : 'ge5');
  /** 契約迄日離今天幾天：正＝還有幾天、0＝今天、負＝過期幾天；沒日期＝null。 */
  function daysLeft(end, today) {
    const e = parseYmd(end);
    if (!e) return null;
    return Math.round((dayStart(e) - dayStart(today || new Date())) / 86400000);
  }
  /*
   * 最近買設備（使用者：「幫我整理出最近有買設備的，然後以最近有買設備進來的公司優先提供名單給我，
   * 並且該分頁排序以契約最新到最舊排序」）：看契約起算多久，3 個月內／6 個月內／1 年內／更早。
   */
  const RECENT = [['m3', '3 個月內', 92], ['m6', '6 個月內', 183], ['y1', '1 年內', 366], ['all', '全部', Infinity]];
  function recentOf(since) {
    if (since == null) return 'none';
    return since <= 92 ? 'm3' : since <= 183 ? 'm6' : since <= 366 ? 'y1' : 'old';
  }
  const passesRecent = (key, since) => key === 'all' || (since != null && since <= RECENT.find((x) => x[0] === key)[2]);
  const startKey = (r) => String(r.startUse || '').replace(/\D/g, '').padEnd(8, '0');
  function dueOf(days) {
    if (days == null) return 'none';
    if (days < 0) return 'expired';
    if (days <= 92) return 'm3';
    if (days <= 183) return 'm6';
    if (days <= 366) return 'm12';
    return 'later';
  }
  const passesDue = (key, days) => key === 'all' || (days != null && (key === 'expired' ? days < 0 : days >= 0 && days <= DUE.find((d) => d[0] === key)[2]));
  function lenderFamily(name) {
    for (const [k, , re] of LENDERS) if (re && re.test(name || '')) return k;
    return 'other';
  }
  const lenderLabel = (k) => (LENDERS.find((x) => x[0] === k) || [])[1] || '其他';
  const typeShort = (t) => String(t || '').replace(/登記$/, '') || '動保';
  const wan = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(n % 1e8 ? 1 : 0)} 億` : `${Math.round(n / 1e4).toLocaleString()} 萬`);
  const dueText = (days) => (days == null ? '' : days < 0 ? `已過期 ${-days} 天` : days === 0 ? '今天到期' : `還有 ${days} 天到期`);
  /**
   * 寫進訪談內容的那一行。日期用 - 不用 /：主站的訪談內容會把 2026/10/14 這種當成一筆通話
   * 紀錄的日期，契約日期就會變成「最近聯絡日」。
   */
  function noteFor(r) {
    const dash = (s) => String(s || '').replace(/\//g, '-');
    return [`動保：${r.lender.name || '不明'}（${typeShort(r.type)}）擔保 ${wan(r.amount)}`,
      `契約 ${dash(r.start)}～${dash(r.end)}${r.days != null ? `（${dueText(r.days)}）` : ''}`,
      r.items ? `標的 ${r.items} 件` : '', r.addr ? `標的物所在地：${r.addr}` : '', r.no ? `登記 ${r.no}` : ''].filter(Boolean).join('，');
  }

  /** 正規的 CSV 解析：欄位裡有逗號、引號、換行都吃得下。 */
  function parseCsv(text) {
    if (global.Leads && global.Leads.parseCsv) return global.Leads.parseCsv(text);
    const out = []; let row = []; let cell = ''; let quoted = false;
    const src = text.replace(/^﻿/, '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; }
      else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out.filter((r) => r.length > 1 || (r[0] || '').trim());
  }
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function branchOf(address) {
    if (!global.Rules || !global.Normalize) return { key: '', label: '', district: '' };
    const { city, district } = global.Normalize.parseAddress(address);
    const b = global.Rules.branchOf(city, district);
    const key = b.kind === 'branch' ? `${b.branches[0]}分公司`
      : b.kind === 'common' ? `${b.branches.join('／')}共同區`
      : b.kind === 'shared' ? '全公司共同區域'
      : (city ? '不在劃分表上' : '無地址');
    return { key, label: b.label || key, kind: b.kind, district: city ? `${city}${district}` : '', b };
  }

  /** CSV 的一列 → 畫面用的物件。today 可傳進來，測試才好固定。 */
  function toRecord(o, today) {
    const r = {
      type: o['案件類別'] || '', no: o['登記編號'] || '',
      cust: { id: (o['客戶統編'] || '').trim(), name: (o['客戶名稱'] || '').trim() },
      lender: { id: (o['金主統編'] || '').trim(), name: (o['金主名稱'] || '').trim() },
      start: o['契約起'] || '', end: o['契約迄'] || '',
      amount: Number(String(o['擔保金額'] || '').replace(/\D/g, '')) || 0,
      addr: o['標的物所在地'] || '', items: Number(o['標的物件數'] || o['標的物'] || 0) || 0, approved: o['登記核准日'] || '',
      founded: parseFounded(o['成立日期']),
    };
    r.years = r.founded ? yearsSince(r.founded, today) : null;
    /*
     * 清冊本身會打錯日期（使用者截圖：契約起訖都是 2133/12/22，登記核准日卻是 2025/03/17；另有起訖同一天、
     * 迄日在 2060 年以後的）。不合理的日期不拿來算：契約起在未來（多給一個月）就改用登記核准日判斷買設備的時間；
     * 契約迄不晚於契約起、或在 30 年以後，就當沒有迄日（不算到期、不排進快到期）。卡片標「清冊日期疑似有誤」。
     */
    const sDays = daysLeft(r.start, today);
    const startOk = sDays != null && sDays <= 31;
    const eDays = daysLeft(r.end, today);
    const endOk = eDays != null && eDays <= 365 * 30 && (sDays == null || eDays > sDays);
    r.dateOdd = (!!r.start && !startOk) || (!!r.end && !endOk);
    r.startUse = startOk ? r.start : r.approved;   // 判斷「什麼時候買設備」用的日期
    r.days = endOk ? eDays : null;
    r.due = dueOf(r.days);
    // 最近買設備：契約起（不合理或沒有就登記核准日）離今天幾天；還沒到的（未來起算）當 0
    { const d = daysLeft(r.startUse, today); r.sinceDays = d == null ? null : Math.max(0, -d); }
    r.recent = recentOf(r.sinceDays);
    r.family = lenderFamily(r.lender.name);
    r.custIsFin = LENDER_RE.test(r.cust.name);
    r.branch = branchOf(r.addr);
    r.key = r.no || `${r.cust.id}|${r.lender.id}|${r.end}`;
    r.blob = [r.cust.id, r.cust.name, r.lender.name, r.addr, r.no, r.type].join(' ').toLowerCase();
    return r;
  }

  /* ---------------- 狀態 ---------------- */

  let index = null;
  let rows = [];
  let limit = PAGE;
  let started = false;
  let ready = false;
  let showHidden = false;
  // 「利率不敏感」預設勾（使用者：「在各來源的分頁裡也預設篩選利率不敏感的」）；rate-filter-default＝'0' 是預設不勾（測試用）
  const rateDefault = () => { try { return localStorage.getItem('rate-filter-default') === '0' ? [] : ['Y']; } catch (e) { return ['Y']; } };
  const f = { rate: new Set(rateDefault()), due: 'all', recent: 'all', lenders: new Set(), types: new Set(), branches: new Set(), districts: new Set(), mine: new Set(), ages: new Set(), phone: new Set(), q: '' };
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };

  /** 跟名單比對：統編優先，沒統編才比公司名。每次畫都重算（主站的 allViews 有快取，便宜）。 */
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
  const mineOf = (r, cm) => (r.cust.id && cm.byTax.get(r.cust.id.replace(/\D/g, ''))) || (r.cust.name && cm.byName.get(r.cust.name)) || null;
  // 主站只有「禁止推廣」這一種不能打的狀態（婉拒算已聯絡，還是可以再打）
  const declined = (v) => !!v && (v.blocked || v.outcome === 'blocked');

  function criteria() {
    return {
      min: (Number($('#chattel-amtMin').value) || 0) * 10000,
      max: (Number($('#chattel-amtMax').value) || 0) * 10000 || Infinity,
      hideFin: $('#chattel-hideFin').checked,
      terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean),
      cm: customerMap(),
    };
  }
  /*
   * 一列過不過得了篩選；except 是「這一組先不算」，給篩選籤上的數字用。
   * 金主沒勾＝同業全部，但中租自家不算（自家的客戶不是要搶的對象）；要看自家就勾它。
   */
  function passes(r, c, except, F = f) {
    const mine = mineOf(r, c.cm);
    return (except === 'due' || passesDue(F.due, r.days))
      && (except === 'recent' || passesRecent(F.recent || 'all', r.sinceDays))
      && (except === 'lenders' || (F.lenders.size ? F.lenders.has(r.family) : r.family !== 'chailease'))
      && (except === 'types' || !F.types.size || F.types.has(r.type))
      && (except === 'branches' || !F.branches.size || F.branches.has(r.branch.key))
      && (except === 'districts' || !F.districts.size || F.districts.has(r.branch.district))
      && (except === 'mine' || !F.mine.size || F.mine.has(mine ? (declined(mine) ? 'declined' : 'in') : 'out'))
      && (except === 'ages' || !F.ages.size || F.ages.has(ageOf(r)))
      && (except === 'rate' || !F.rate.size || F.rate.has(rateKey(r)))
      && (except === 'phone' || !F.phone.size || [...F.phone].some((k) => phoneKindsOf(r).has(k)))
      && r.amount >= c.min && r.amount <= c.max
      && !(c.hideFin && r.custIsFin)
      && (showHidden || !(hidden.has(r.key) || deletedOf(r.cust.name, r.cust.id)))
      && c.terms.every((t) => r.blob.includes(t));
  }
  function visible(c) {
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#chattel-sort').value;
    list.sort((a, b) => (sort === 'start' ? startKey(b).localeCompare(startKey(a)) || b.amount - a.amount
      : sort === 'amount' ? b.amount - a.amount
      : sort === 'company' ? a.cust.name.localeCompare(b.cust.name, 'zh-Hant')
        : (a.days == null ? 1e9 : a.days) - (b.days == null ? 1e9 : b.days)));
    return list;
  }

  /* ---------------- 畫面 ---------------- */

  const mmdd = (iso) => { const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };

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
  // 公司名底下那排 Google／地圖／104／1111（使用者：「所有分頁的公司名底下都要有，無論有無電話；有電話的就不用輸入框」）
  function phoneBox(r, key, hasAuto) {
    const stop = (e) => e.stopPropagation();
    const input = el('input', { type: 'tel', className: 'phone-paste', placeholder: '找到電話貼這裡，加入時一起帶', autocomplete: 'off', value: typed.get(key) || '', onclick: stop });
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
  /** 卡片：公司名那行底下接找電話那排（名單裡有的也有，只是不給輸入框） */
  function card(r, c) {
    const art = cardBody(r, c);
    r.__name = r.cust.name; r.__addr = r.addr;
    const top = art.querySelector('.card-top');
    if (top) top.after(phoneBox(r, r.key, hasPhone(r) || !!mineOf(r, c.cm)));
    return art;
  }
  function cardBody(r, c) {
    const mine = mineOf(r, c.cm);
    const dueBadge = r.days == null ? el('span', { className: 'badge', textContent: r.dateOdd && r.end ? '迄日有誤' : '契約沒有迄日' })
      : el('span', { className: `badge${r.days < 0 ? ' badge-expired' : r.days <= 30 ? ' badge-overdue' : r.days <= 90 ? ' badge-due' : ''}`, textContent: dueText(r.days) });
    const lenderBadge = r.family === 'chailease'
      ? el('span', { className: 'badge', textContent: `自家：${r.lender.name}`, title: '中租自家的案件，預設藏起來' })
      : el('span', { className: 'badge badge-peer', textContent: `金主：${r.lender.name || '不明'}` });
    const phoneBadge = hasPhone(r) ? el('span', { className: 'badge badge-ind', textContent: phoneKindsOf(r).has('M') ? '📞 手機（多半是老闆本人）' : '📞 有電話', title: '貿易署出進口廠商登記裡有電話，加入名單時會自動填' }) : '';
    const mineBadge = !mine ? '' : declined(mine)
      ? el('span', { className: 'badge badge-own', textContent: `名單上是禁止推廣${mine.lastDate ? `・${mmdd(mine.lastDate)}` : ''}` })
      : el('span', { className: 'badge badge-mine is-log', textContent: `已在名單${mine.addedDate ? `・${mmdd(mine.addedDate)} 加入` : ''}${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}${mine.nextDate ? `・下次 ${mmdd(mine.nextDate)}` : ''}　📝 記錄`, title: '點一下打開名單上這一筆，直接記這通電話', onclick: () => openLog(mine.id) });
    const name = el('span', { className: 'card-name' }, [r.cust.id
      ? el('a', { href: global.Normalize.findbizUrl(r.cust.id, r.cust.name), target: '_blank', rel: 'noopener', textContent: r.cust.name || r.cust.id, title: '商工登記公示資料（開新分頁）' })   // 債務人是商行時走用統編查的結果頁
      : document.createTextNode(r.cust.name || '（沒有名稱）'), copyName(r.cust.name || '')]);
    const isHidden = hidden.has(r.key) || deletedOf(r.cust.name, r.cust.id);
    const actions = mine
      ? [el('button', { className: 'btn btn-tiny btn-primary', type: 'button', textContent: '打開名單上這一家', onclick: () => { if (typeof global.openCustomer === 'function') global.openCustomer(mine.id); } })]
      : [el('button', { className: 'btn btn-tiny btn-primary chattel-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
        deletedOf(r.cust.name, r.cust.id) ? restoreBtn(r.cust.name, r.cust.id) : isHidden
          ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(r.key); saveHidden(); render(); } })
          : el('button', { className: 'btn btn-tiny chattel-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(r.key); saveHidden(); render(); toast('藏起來了，下個月清冊更新也不會再冒出來'); } })];
    return el('article', { className: `card leads-card chattel-card${mine ? ' is-mine' : r.days != null && r.days >= 0 && r.days <= 30 ? ' is-overdue' : r.days != null && r.days > 30 && r.days <= 90 ? ' is-due' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [
      el('div', { className: 'card-top' }, [name, (r.recent === 'm3' || r.recent === 'm6') ? el('span', { className: 'badge badge-new', textContent: `🆕 最近買設備 ${ymOf(r.startUse)}`, title: '契約起算 6 個月內' }) : '',
        r.dateOdd ? el('span', { className: 'badge badge-overdue', textContent: '清冊日期疑似有誤', title: `清冊原始：契約 ${r.start || '？'} → ${r.end || '？'}，登記核准日 ${r.approved || '？'}。起日不合理改用登記核准日判斷，迄日不合理就不算到期。` }) : '', dueBadge, el('span', { className: 'badge', textContent: typeShort(r.type) }), lenderBadge, phoneBadge, mineBadge,
        r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
        r.custIsFin ? el('span', { className: 'badge badge-ind', textContent: '客戶那一方也是金融業' }) : '']),
      el('div', { className: 'card-meta' }, [
        el('span', { textContent: `💰 擔保 ${wan(r.amount)}` }),
        el('span', { textContent: `📅 契約 ${r.start || '？'} → ${r.end || '？'}${r.dateOdd ? `（疑似有誤；登記核准 ${r.approved || '？'}）` : ''}` }),
        r.items ? el('span', { textContent: `📦 標的 ${r.items} 件`, title: '清冊只有件數，沒有標的物內容' }) : '',
        r.addr ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.addr)}`, target: '_blank', rel: 'noopener', textContent: r.addr })]) : '',
        r.founded ? el('span', { textContent: `🎂 成立 ${fmtRoc(r.founded)}（${r.years} 年）`, title: '查商工登記來的' }) : '',
        r.no ? el('span', { textContent: `🧾 登記 ${r.no}` }) : '',
        r.cust.id ? el('span', { textContent: `#${r.cust.id}` }) : '',
      ]),
      casesTable(r),
      el('div', { className: 'card-actions' }, actions),
    ]);
  }

  /*
   * 這家公司的每一件動保（使用者：「動產擔保的分頁裡，能幫我列出各家公司的每筆契約起訖及金額嗎」）。
   * 卡片是一件一張，同一家的其他件散在別張；這裡用統編把同一家的全部列在一起：金主｜起訖（年月）｜金額，
   * 新的在上、這張卡片那件粗體、3 個月內到期的橘色。最多先列 2 件，其他收起，點「其他 N 件」展開。只有一件的不列（上面就是了）。
   */
  const openCases = new Set();
  const ymOf = (x) => { const m = String(x || '').match(/^(\d{4})\D(\d{1,2})/); return m ? `${m[1]}/${m[2].padStart(2, '0')}` : '？'; };
  function casesTable(r) {
    const list = r.cust.id ? casesOf(r.cust.id) : [r];
    if (list.length < 2) return '';
    const sorted = [...list].sort((a, b) => startKey(b).localeCompare(startKey(a)));
    const SHOW = 2;   // 使用者：「每張卡片最多顯示兩筆，其他收起來，我要看再點開看就好」
    const open = openCases.has(r.cust.id);
    const rows = sorted.map((c, i) => el('tr', { className: `chattel-line${c === r ? ' is-self' : ''}${c.days != null && c.days >= 0 && c.days <= 92 ? ' is-soon' : ''}`, hidden: !open && i >= SHOW }, [
      el('td', { className: 'ch-lender', textContent: lenderShort(c.lender.name) }),
      el('td', { className: 'ch-ym', textContent: `${ymOf(c.startUse)}～${c.days == null ? (c.dateOdd ? '迄日有誤' : '無迄日') : ymOf(c.end)}`, title: c.dateOdd ? `清冊原始：${c.start || '？'} → ${c.end || '？'}（日期疑似有誤，起日改用登記核准日 ${c.approved || '？'}）` : '' }),
      el('td', { className: 'ch-amt', textContent: wan(c.amount) }),
    ]));
    const total = sorted.reduce((sum, c) => sum + (c.amount || 0), 0);
    const toggle = sorted.length > SHOW ? el('button', { className: 'link-btn chattel-more', type: 'button',
      textContent: open ? '收起 ▴' : `其他 ${sorted.length - SHOW} 件 ▾`,
      onclick: () => { if (open) openCases.delete(r.cust.id); else openCases.add(r.cust.id); render(); } }) : '';
    return el('div', { className: 'chattel-cases' }, [
      el('div', { className: 'muted chattel-cases-head', textContent: `這家共 ${sorted.length} 件動保，擔保合計 ${Math.round(total / 1e4).toLocaleString()} 萬` }),   // 合計用萬，不四捨五入成「1.1 億」
      el('table', { className: 'chattel-table' }, [el('tbody', {}, rows)]),
      toggle,
    ]);
  }

  function chips(host, options, set, single) {
    host.textContent = '';
    options.forEach(([value, label, count]) => {
      const on = single ? f.due === value : set.has(value);
      const b = el('button', { className: 'chip', type: 'button' }, [document.createTextNode(label), count != null ? el('small', { textContent: String(count) }) : '']);
      b.setAttribute('aria-pressed', String(on));
      b.onclick = () => {
        if (single) f.due = value;
        else if (set.has(value)) set.delete(value); else set.add(value);
        limit = PAGE;
        render();
      };
      host.append(b);
    });
  }

  /** 篩選籤上的數字：套用其他條件之後這一顆會剩幾家。 */
  function drawChips(c) {
    const facet = (except, pred) => { let n = 0; rows.forEach((r) => { if (pred(r) && passes(r, c, except)) n += 1; }); return n; };
    chips($('#chattel-fDue'), DUE.map(([k, label]) => [k, label, facet('due', (r) => passesDue(k, r.days))]), null, true);
    {
      const host = $('#chattel-fRecent');
      host.textContent = '';
      RECENT.forEach(([k, label]) => {
        const b = el('button', { className: 'chip', type: 'button' }, [document.createTextNode(label), el('small', { textContent: String(facet('recent', (r) => passesRecent(k, r.sinceDays))) })]);
        b.setAttribute('aria-pressed', String(f.recent === k));
        b.onclick = () => { f.recent = k; limit = PAGE; render(); };
        host.append(b);
      });
    }
    chips($('#chattel-fLender'), LENDERS.map(([k, label]) => [k, k === 'chailease' ? '中租（自家，預設藏起來）' : label, facet('lenders', (r) => r.family === k)]), f.lenders);
    const types = [...new Set(rows.map((r) => r.type))].sort();
    chips($('#chattel-fType'), types.map((t) => [t, typeShort(t), facet('types', (r) => r.type === t)]), f.types);
    chips($('#chattel-fAge'), AGE.map(([k, label]) => [k, label, facet('ages', (r) => ageOf(r) === k)]), f.ages);
    chips($('#chattel-fRate'), [['Y', '利率不敏感'], ['N', '其他']].map(([k, label]) => [k, label, facet('rate', (r) => rateKey(r) === k)]), f.rate);
    chips($('#chattel-fPhone'), PHONE_CHIPS.map(([k, label]) => [k, label, facet('phone', (r) => phoneKindsOf(r).has(k))]), f.phone);
    chips($('#chattel-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label,
      facet('mine', (r) => { const m = mineOf(r, c.cm); return k === 'out' ? !m : k === 'in' ? (m && !declined(m)) : (m && declined(m)); })]), f.mine);
    // 分公司與區：籤是從資料長出來的，分公司在前、共同區在後、劃分表外最後
    const count = (key, except) => { const m = new Map(); rows.forEach((r) => { const k = key(r); if (k && passes(r, c, except)) m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const bc = count((r) => r.branch.key, 'branches');
    const order = (k) => (/分公司$/.test(k) ? 0 : /共同區$/.test(k) ? 1 : 2);
    const bkeys = [...new Set([...bc.keys(), ...f.branches])].sort((a, b) => order(a) - order(b) || (bc.get(b) || 0) - (bc.get(a) || 0));
    chips($('#chattel-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    const dc = count((r) => r.branch.district, 'districts');
    const dkeys = [...new Set([...dc.keys(), ...f.districts])].sort((a, b) => (dc.get(b) || 0) - (dc.get(a) || 0)).slice(0, 24);
    chips($('#chattel-fDistrict'), dkeys.map((k) => [k, k.replace(/^新北市(.)/, '$1'), dc.get(k) || 0]), f.districts);
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#chattel-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const soon = current.filter((r) => r.days != null && r.days >= 0 && r.days <= 92).length;
    const unknown = current.filter((r) => !r.founded).length;
    const inList = current.filter((r) => mineOf(r, c.cm)).length;
    $('#chattel-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">　／ ${soon ? `3 個月內到期 ${soon} 家` : ''}${inList ? `${soon ? '、' : ''}已在名單 ${inList} 家` : ''}${!soon && !inList ? `清冊未註銷共 ${rows.length.toLocaleString()} 筆` : ''}${unknown ? `　·　${unknown} 家還沒查到成立年` : ''}</span>`;
    const del = rows.filter((r) => deletedOf(r.cust.name, r.cust.id)).length;
    const hid = rows.filter((r) => hidden.has(r.key)).length + del;
    const hb = $('#chattel-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    $('#chattel-more').hidden = current.length <= limit;
    $('#chattel-empty').hidden = !!current.length;
    $('#chattel-empty').textContent = rows.length ? '沒有符合條件的案件，把到期時間放寬、或把金主的籤都取消試試。' : '';
    const addable = current.filter((r) => !mineOf(r, c.cm)).length;
    $('#chattel-add').disabled = !addable;
    $('#chattel-add').textContent = `加入客戶名單${addable ? `（${addable} 家）` : ''}`;
    $('#chattel-export').disabled = !current.length;
    $('#chattel-copy').disabled = !current.length;
    const pill = document.getElementById('countChattel');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /** 標準欄位的 CSV：主站匯入認得「公司名稱、統編、地址、訪談內容、下次聯絡日」，不會當成登記清冊再問一次條件。 */
  function toCsv(list, dates) {
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.cust.name, r.cust.id, '', r.founded ? String(r.founded.y) : '', '', typed.get(r.key) || '', '', '', '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.addr, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `\uFEFF${lines.join('\n')}\n`;
  }
  const toStandardCsv = toCsv;
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  /** 希望的下次聯絡日：到期前 N 天；沒有迄日、已過期、太近的都回空白（＝明天起）。 */
  function wantedDate(r, daysBefore) {
    const e = parseYmd(r.end);
    if (!e || !daysBefore) return '';
    const d = new Date(e.getFullYear(), e.getMonth(), e.getDate() - daysBefore);
    return d > new Date() ? isoOf(d) : '';
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const csvName = (n) => `動產擔保名單-${todayIso()}-${n}家.csv`;

  /*
   * 單張與整批都走這裡：已在名單的先剔掉；每一家希望排在「到期前 N 天」（畫面上選），
   * 再由主站 planNewDates 照「一天最多幾家、其中新名單幾家」往後找位子。加進來就有下次聯絡日。
   */
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const c = criteria();
    const fresh = list.filter((r) => !mineOf(r, c.cm));
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const before = Number(($('#chattel-when') && $('#chattel-when').value) || 60) || 0;
    const wants = fresh.map((r) => wantedDate(r, before));
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(wants) : wants;
    const file = new File([toCsv(fresh, dates)], csvName(fresh.length), { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    fresh.forEach((r) => typed.delete(r.key));
    openJustAdded(file.name, fresh.length === 1);
    // 匯入時靠名稱比對到已在名單的會被略過，不能再說「N 家排在…」（使用者：昨天加的「昨天新增」看不到——早就在名單上）
    const got = (typeof global.customerViews === 'function' ? global.customerViews() : []).filter((v) => v.source === file.name).length;
    const lost = fresh.length - got;
    const sorted = dates.filter(Boolean).sort();
    if (!got) toast(`${fresh.length === 1 ? '這家' : `這 ${fresh.length} 家`}早就在名單上了（同名或同統編），沒有再加一次；卡片上的「已在名單」有寫哪天加的`);
    else if (sorted.length) toast(`${got} 家排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}${lost > 0 ? `；另外 ${lost} 家早就在名單上（同名），略過` : ''}`);
    render();   // 匯進去之後卡片就變成「已在名單」
  }

  /*
   * 每日自動挑名單的優先順序（使用者定的，跟畫面上的篩選無關；是順序不是門檻）：
   *   3 個月內到期 → 同業（中租自家、同業之間的融資不算）→ 我的分公司 → 500 萬以上
   *   （擔保金額原本 100 萬以上；使用者說案件多半 1,000 萬，選了 500 萬以上）
   * 到期時間是分級的：3 個月內 → 6 個月內 → 12 個月內 → 更久 → 已過期／沒迄日。其餘各打勾，
   * 照順序比，全部一樣就快到期的先。全符合的先挑，不夠就往下補。名單裡有的、藏起來的不挑。
   */
  const myBranch = () => { let b = ''; try { b = localStorage.getItem('my-branch') || ''; } catch (e) { /* 無痕 */ } return `${b || '新莊'}分公司`; };
  /*
   * 每日挑選的優先順序（使用者：「這個挑選標準不是定式，是優先順序而已」、
   * 「我只要成立 5 年內的公司」、「以上挑選的條件都不是寫死的，只要找不到都可以再挑選其他條件的名單」）：
   * 成立 5 年內排最前面，但不是門檻——5 年內的挑完了就往下挑 5 年以上、成立年不明的。
   * 每一項：布林值 true 在前；數字越小越好（到期等級）。
   */
  // 使用者：「每天補給我的名單優先給我加入利率不敏感的客群」——跟同業（租賃／融資，不含銀行）借的排最前面，
  // 原本第三條的「同業」併進去（銀行借的不算：會拿銀行利率來比）
  // 使用者：「以最近有買設備進來的公司優先提供名單給我」——契約起算越近越前面（3 個月內 → 6 個月內 → 1 年內 → 更早），排在利率不敏感之前
  const DAILY_PRIORITY = ['3 個月內買設備', '利率不敏感', '成立 5 年內', '3 個月內到期', '有電話', '我的分公司', '500 萬以上'];
  const RECENT_GRADE = { m3: 0, m6: 1, y1: 2, old: 3, none: 3 };
  const rateFreeOf = (r) => (isPeerCase(r) ? lenderShort(r.lender.name) : peerLenderOf(r.cust.id));
  // 分頁篩選的「利率不敏感」：跟每日新名單同一套
  const rateKey = (r) => (rateFreeOf(r) ? 'Y' : 'N');
  // 有電話＝貿易署出進口廠商登記裡對得到（使用者：新增的名單撈不到電話就得自己 Google，所以有電話的先挑）
  const hasPhone = (r) => !!(global.Trade && global.Trade.hasPhone && global.Trade.hasPhone(r.cust && r.cust.id));
  const phoneKindsOf = (r) => (global.Trade && global.Trade.phoneKindsOf ? global.Trade.phoneKindsOf(r.cust && r.cust.id) : new Set(['N']));
  // 電話籤：出進口廠商登記的電話表對得到的；手機是有電話的一部分，籤是「或」的關係
  const PHONE_CHIPS = [['Y', '有電話'], ['M', '手機'], ['N', '沒電話']];
  const DUE_GRADE = { m3: 0, m6: 1, m12: 2, later: 3, expired: 4, none: 4 };
  const dailyChecks = (r) => [
    RECENT_GRADE[r.recent] == null ? 3 : RECENT_GRADE[r.recent],   // 數字越小越好
    !!rateFreeOf(r),
    ageOf(r) === 'lt5',
    DUE_GRADE[r.due] == null ? 4 : DUE_GRADE[r.due],   // 數字越小越好
    hasPhone(r),
    branchRank(r),   // 分公司遠近：我的 0 → 共同區 1 → 鄰近 2… → 其他 9（新莊挑完接新北）
    r.amount >= 5000000,
  ];
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return (a.days == null ? 1e9 : a.days) - (b.days == null ? 1e9 : b.days);
  }
  async function dailyCandidates() {
    if (!root) root = document.getElementById('paneChattel');
    if (!root) return [];
    await start();
    if (!ready) return [];
    if (global.Trade && global.Trade.ensurePhones) { try { await global.Trade.ensurePhones(); } catch (e) { /* 沒電話表就當都沒有 */ } }
    const cm = customerMap();
    return rows.filter((r) => !mineOf(r, cm) && !hidden.has(r.key) && !deletedOf(r.cust.name, r.cust.id))
      .map((r) => {
        r._checks = dailyChecks(r);
        const hit = DAILY_PRIORITY.filter((_, i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : r._checks[i]))
          .map((x) => (x === '利率不敏感' ? `利率不敏感（跟${rateFreeOf(r)}借）` : x));
        const rk = r._checks[DAILY_PRIORITY.indexOf('我的分公司')];
        r._why = [hit.length ? `符合：${hit.join('、')}` : '基準都不符，補位', rk > 0 && rk < 9 ? `分公司放寬到 ${r.branch.key}` : ''].filter(Boolean).join('；');
        return r;
      })
      .sort(dailyCompare);
  }

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'chattel-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。金主沒勾＝同業全部（中租自家不算）。' }),
      group('最近買設備（契約起算）', el('div', { className: 'chips', id: 'chattel-fRecent' })),
      group('契約到期時間', el('div', { className: 'chips', id: 'chattel-fDue' })),
      group('金主（債權人）', el('div', { className: 'chips', id: 'chattel-fLender' })),
      group('案件類別', el('div', { className: 'chips', id: 'chattel-fType' })),
      group('歸屬分公司（依標的物所在地，同「規則」的劃分表）', el('div', { className: 'chips', id: 'chattel-fBranch' })),
      group('標的物所在地', el('div', { className: 'chips', id: 'chattel-fDistrict' })),
      group('成立年數（查商工登記來的，Actions 每月補）', el('div', { className: 'chips', id: 'chattel-fAge' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'chattel-fMine' })),
      group('利率（跟同業借、剛擴張的，比較不在乎利率）', el('div', { className: 'chips', id: 'chattel-fRate' })),
      group('電話（貿易署出進口廠商登記對得到的）', el('div', { className: 'chips', id: 'chattel-fPhone' })),
      group('擔保債權金額（萬元）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'chattel-amtMin', type: 'number', min: '0', step: '100', placeholder: '下限', value: '100' }), '～',
        el('input', { id: 'chattel-amtMax', type: 'number', min: '0', step: '100', placeholder: '上限' })])),
      el('div', { className: 'leads-group' }, [el('label', {}, [el('input', { type: 'checkbox', id: 'chattel-hideFin', checked: true }), ' 藏起客戶那一方也是租賃／銀行的案件（同業之間的融資，不是要打的對象）'])]),
      group('關鍵字', el('input', { id: 'chattel-q', type: 'search', placeholder: '公司、統編、金主、地址、登記編號', autocomplete: 'off' }), 'chattel-q'),
      group('排序', el('select', { id: 'chattel-sort' }, [
        el('option', { value: 'start', textContent: '契約起（最新到最舊）' }),   // 使用者：「該分頁排序以契約最新到最舊排序」
        el('option', { value: 'amount', textContent: '擔保金額（高到低）' }),
        el('option', { value: 'end', textContent: '到期日（近的在前）' }),
        el('option', { value: 'company', textContent: '公司名稱' })]), 'chattel-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'chattel-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'chattel-hidden', type: 'button', hidden: true })]),
    ]);
    // 使用者：「找名單的預設篩選畫面都先收起來，我每次點進來都要自己關」；leads-filters-open＝'1' 是預設打開（測試用）
    filters.open = (() => { try { return localStorage.getItem('leads-filters-open') === '1'; } catch (e) { return false; } })();
    root.append(
      el('p', { className: 'muted leads-sub', id: 'chattel-sub', textContent: '新北市動產擔保登記清冊：同業客戶的契約什麼時候到期' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'chattel-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的公司下次聯絡日排在到期前幾天，照「每天打得完幾家」的上限與新名單額度往後找位子' }, [
            el('span', { className: 'muted', textContent: '排進日程：' }),
            el('select', { id: 'chattel-when' }, WHEN.map(([v, label]) => el('option', { value: v, textContent: label })))]),
          el('button', { className: 'btn btn-primary', id: 'chattel-add', type: 'button', title: '把目前篩出來、還不在名單裡的公司送進匯入流程，每家排一個下次聯絡日；動保的金主、金額、到期日會寫在訪談內容', textContent: '加入客戶名單' }),
          el('button', { className: 'btn', id: 'chattel-copy', type: 'button', textContent: '複製統編' }),
          el('button', { className: 'btn', id: 'chattel-export', type: 'button', textContent: '匯出 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'chattel-loading', hidden: true }),
      el('div', { className: 'cards', id: 'chattel-cards' }),
      el('div', { className: 'empty', id: 'chattel-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'chattel-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [
        el('span', {}, [el('i', { className: 'swatch is-overdue' }), ' 30 天內到期']),
        el('span', {}, [el('i', { className: 'swatch is-due' }), ' 90 天內到期']),
        el('span', {}, [el('i', { className: 'swatch is-mine' }), ' 已在你的名單裡'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：新北市政府經濟發展局「動產擔保登記清冊」（每月更新，是從 1995 年累積到現在的全部案件），GitHub Actions 每月 10 日自動抓、只留未註銷的。動產抵押的客戶在債務人欄、附條件買賣的客戶在債權人欄，抓的時候已經翻正，畫面上一律寫「金主」。成立年是 Actions 拿統編查商工登記補的（快到期的先查，每月接著查），清冊本身沒有。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳；「這家不用了」也只記在這台裝置。' }),
    );
  }

  /*
   * 資料載入獨立出來：主站（重點推廣名單）要拿這份清冊對客戶的統編，不需要畫這一頁。
   * 同一個 promise 共用，分頁跟主站誰先要都只抓一次。
   */
  let dataPromise = null;
  function ensureData() {
    if (!dataPromise) {
      dataPromise = (async () => {
        const res = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { noData: true });
        index = await res.json();
        for (const file of index.files || []) {
          const r = await fetch(`${DATA_BASE}${file.path}?t=${index.generatedAt}`, { cache: 'force-cache' });
          if (!r.ok) throw new Error(`${file.path}：HTTP ${r.status}`);
          const table = parseCsv(await r.text());
          const head = table[0] || [];
          table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(toRecord(o)); });
        }
        byTax = null;
        return rows;
      })().catch((err) => { dataPromise = null; throw err; });
    }
    return dataPromise;
  }
  /** 統編 → 這家在清冊上的案件（到期日近的在前）。給主站的客戶卡片用。 */
  let byTax = null;
  function casesOf(taxId) {
    const id = String(taxId || '').replace(/\D/g, '');
    if (!id || !rows.length) return [];
    if (!byTax) {
      byTax = new Map();
      rows.forEach((r) => { if (r.cust.id) { if (!byTax.has(r.cust.id)) byTax.set(r.cust.id, []); byTax.get(r.cust.id).push(r); } });
      byTax.forEach((list) => list.sort((x, y) => (x.days == null ? 1e9 : x.days) - (y.days == null ? 1e9 : y.days)));
    }
    return byTax.get(id) || [];
  }
  /**
   * 跟同業借的：金主是租賃／融資公司（不是中租、不是銀行、不是保險），客戶自己也不是金融業。
   * 使用者問「什麼樣的客群不在乎資金成本」——本來就接受租賃利率的，比的是額度、速度、服務。
   */
  const PEER_FAMILIES = new Set(['sinxin', 'hotai', 'hedi', 'jih', 'orix', 'taishin', 'first', 'yulon']);
  const isPeerCase = (r) => !r.custIsFin && r.family !== 'chailease' && r.family !== 'bank'
    && (PEER_FAMILIES.has(r.family) || /租賃|融資|資融/.test(r.lender.name || ''));
  /** 統編 → 跟哪家同業借（短名，沒有就空字串）；每日新名單「利率不敏感」用 */
  const peerLenderOf = (taxId) => { const c = casesOf(taxId).find(isPeerCase); return c ? lenderShort(c.lender.name) : ''; };
  /** 金主的短名：新鑫股份有限公司 → 新鑫 */
  const lenderShort = (name) => String(name || '').replace(/股份有限公司|有限公司|國際租賃|企業|股份/g, '').trim() || '不明';

  async function start() {
    if (started) return;
    started = true;
    build();
    try {
      await ensureData();
    } catch (err) {
      $('#chattel-empty').hidden = false;
      $('#chattel-empty').textContent = err.noData
        ? '還沒有抓好的清冊。GitHub Actions 每月 10 日會自動抓，也可以到 repo 的 Actions 頁手動執行「每月動保清冊」。'
        : `清冊下載失敗：${err.message}`;
      return;
    }
    const through = String(index.dataThrough || '').slice(0, 7);
    $('#chattel-sub').textContent = `新北市動產擔保登記清冊（新北市經發局，每月更新）　·　資料截到 ${through || '？'}　·　上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}`;
    $('#chattel-loading').hidden = true;
    ready = true;
    if (global.Trade && global.Trade.ensurePhones) global.Trade.ensurePhones().then(() => { if (ready) render(); }).catch(() => {});   // 電話表載好再補上 📞
    const rerender = () => { limit = PAGE; render(); };
    ['#chattel-amtMin', '#chattel-amtMax'].forEach((s) => { $(s).oninput = rerender; });
    $('#chattel-hideFin').onchange = rerender;
    $('#chattel-sort').onchange = rerender;
    let qt = null;
    $('#chattel-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
    $('#chattel-more').onclick = () => { limit += PAGE; render(); };
    $('#chattel-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
    $('#chattel-reset').onclick = () => {
      f.due = 'all'; f.recent = 'all'; f.lenders.clear(); f.types.clear(); f.branches.clear(); f.districts.clear(); f.mine.clear(); f.ages.clear(); f.phone.clear(); f.rate.clear(); rateDefault().forEach((k) => f.rate.add(k)); f.q = '';
      $('#chattel-q').value = ''; $('#chattel-amtMin').value = '100'; $('#chattel-amtMax').value = ''; $('#chattel-hideFin').checked = true; $('#chattel-sort').value = 'start';
      showHidden = false;
      rerender();
    };
    $('#chattel-add').onclick = () => addToList(current);
    $('#chattel-export').onclick = () => {
      const blob = new Blob([toCsv(current)], { type: 'text/csv;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: csvName(current.length) });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`已匯出 ${current.length} 家`);
    };
    $('#chattel-copy').onclick = async () => {
      const text = current.map((r) => r.cust.id).filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(text); toast(`已複製 ${current.length} 個統編`); }
      catch (e) { toast('這個瀏覽器不讓網頁複製'); }
    };
    rerender();
  }

  /** 主站切到「動產擔保名單」分頁時叫這個；第一次才真的去抓資料，之後每次切過來重畫（名單可能變了）。 */
  function show() {
    if (!root) root = document.getElementById('paneChattel');
    if (!root) return;
    if (started) { render(); return; }
    start().catch((err) => { console.error(err); toast(`動產擔保名單載入失敗：${err.message}`); });
  }

  /*
   * 每日新名單揉合用（使用者：「除了商行那頁外其他五頁揉在一起，照總分挑但每分頁至少保底」）：
   * 這一家在這一頁看得到的訊號與排序要素，格式五頁一樣，app.js 的 dailyFeed 依統編合併成一家再算總分。
   */
  function dailyFacts(r) {
    return { key: String(r.cust.id || '').replace(/\D/g, '') || String(r.cust.name || '').replace(/\s/g, ''), name: r.cust.name, signals: [],
      ageRank: global.Rules && global.Rules.ageRank ? global.Rules.ageRank(r.years) : 4, capOk: null, phone: hasPhone(r), branchRank: branchRank(r) };
  }
  /** 統編 → 這家最近一次買設備（契約起，日期不合理改用登記核准日）：grade 0＝3 個月內、1＝6 個月內、2＝1 年內、3＝更早或沒有 */
  function recentBuyOf(taxId) {
    let best = null;
    casesOf(taxId).forEach((c) => {
      const g = RECENT_GRADE[c.recent] == null ? 3 : RECENT_GRADE[c.recent];
      if (!best || g < best.grade || (g === best.grade && startKey(c) > startKey(best.c))) best = { grade: g, c };
    });
    return best ? { grade: best.grade, ym: ymOf(best.c.startUse), lender: lenderShort(best.c.lender.name) } : { grade: 3, ym: '', lender: '' };
  }
  /*
   * 「新名單」合併頁用（使用者：「除了上市櫃、商行維持獨立名單外，其餘都能合併」）：這一家在這一頁的卡片資料，
   * 六頁同一種格式（地址、資本額〔元〕、成立幾年、電話、歸屬分公司、這一頁看到的那一句），加入名單走這一頁自己的流程。
   */
  function cardFacts(r) {
    const tel = global.Trade && global.Trade.telOf ? global.Trade.telOf(r.cust.id) : '';
    return { name: r.cust.name, taxId: String(r.cust.id || '').replace(/\D/g, ''), address: r.addr || '', capital: 0, years: r.years, tel, branchKey: r.branch.key,
      info: `${lenderShort(r.lender.name)} ${ymOf(r.startUse)} 擔保 ${wan(r.amount)}${r.end && r.days != null ? `，${ymOf(r.end)} 到期` : ''}`, add: () => addToList([r]) };
  }
  global.Chattel = { show, dailyFacts, cardFacts, recentBuyOf, ensureData, casesOf, isPeerCase, peerLenderOf, lenderShort, dailyCandidates, DAILY_PRIORITY, toStandardCsv, wantedDate, parseYmd, daysLeft, dueOf, lenderFamily, lenderLabel, typeShort, noteFor, toRecord, toCsv, parseFounded, yearsSince, LENDER_RE };
})(window);
