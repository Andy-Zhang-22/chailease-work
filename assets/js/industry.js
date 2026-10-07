/*
 * 「產業名單」分頁：經濟部「公司登記（依營業項目別）」裡的車輛相關業者（汽車貨運、遊覽車客運、計程車客運、小客車租賃），
 * 加上食藥署食品業者登錄的食品工廠、環境部列管的工廠（空污／水污）與營造業（有工地）（版本 308）。
 *
 * 使用者：「還有什麼資料是能幫我能找到更多客戶的？」→「這些資料都做，同個統編的公司依資料都合在一起」。
 * 車輛相關的公司一直在換車、買車，跟中租的車輛租賃最對口；食品工廠、列管工廠要設備，營造業要機具。類別用篩選切換。
 * 資料由 GitHub Actions 每月抓好放 leads/industry/（tools/fetch-industry.mjs，只留新北市、臺北市的總公司）：
 *   industry.csv：統編,名稱,類別,地址,資本額,實收資本額,首見年月,設立日期,組織別,行業代號,行業,電話,場所,新場所年月,新場所
 *   類別可能好幾個（「汽車貨運業、小客車租賃業」）；首見年月晚於 index.json 的 baseline 就是「剛出現」的。
 *   場所＝「工地 3 處；列管廠 1 處（空污）」；新場所年月／新場所＝這家最近多了新工地／新廠（每月比對環境部、食藥署的場所）。
 * 程式照「新設工廠」（factory.js）那一頁：篩選、加入名單、每日新名單揉合、合併頁、互通都同一套。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/industry/';
  const HIDDEN_KEY = 'industry-hidden-v1';
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  const WHEN = [['m3', '3 個月內出現'], ['m6', '3～6 個月'], ['y1', '半年以上'], ['base', '起算時就有']];
  // 類別的短名與圖示（卡片、篩選用）
  const KIND_SHORT = { 汽車貨運業: '🚚 汽車貨運', 遊覽車客運業: '🚌 遊覽車', 計程車客運業: '🚕 計程車', 小客車租賃業: '🚗 租車', 食品製造業: '🍱 食品工廠', 環保列管工廠: '🏭 環保列管', 營造業: '🏗 營造工地' };
  const VEHICLE = /貨運|客運|租賃/;
  // 每日新名單揉合的訊號：一類一個（同一家好幾類就好幾個訊號）
  const groupSignal = (k) => (VEHICLE.test(k) ? '車輛業者' : k === '食品製造業' ? '食品工廠' : k === '環保列管工廠' ? '環保列管工廠' : k === '營造業' ? '營造業（有工地）' : k);
  const kindLabel = (k) => KIND_SHORT[k] || k;
  const kindRank = (k) => { const i = Object.keys(KIND_SHORT).indexOf(k); return i < 0 ? 99 : i; };
  const AGE = [['lt1', '未滿 1 年（新公司）'], ['lt5', '1～5 年'], ['5to10', '5～10 年'], ['ge10', '10 年以上'], ['unknown', '不明']];

  let root = null;
  const $ = (sel) => root.querySelector(sel);
  // 「已在名單　📝 記錄」：打開名單上那一筆、直接捲到「記錄這通電話」（使用者：在新名單打完電話不用再回重點名單搜尋）
  const openLog = (id) => { if (typeof global.openCustomerLog === 'function') global.openCustomerLog(id); else if (typeof global.openCustomer === 'function') global.openCustomer(id); };
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

  const parseAnyDate = (s) => (global.Biz && global.Biz.parseAnyDate ? global.Biz.parseAnyDate(s) : null);
  const yearsSince = (dt, today) => (global.Biz && global.Biz.yearsSince ? global.Biz.yearsSince(dt, today) : null);
  const money = (n) => (global.Biz && global.Biz.money ? global.Biz.money(n) : String(n));
  const thousands = (yuan) => (yuan ? Math.round(yuan / 1000).toLocaleString() : '');
  const ageOf = (r) => (!r.founded ? 'unknown' : r.years < 1 ? 'lt1' : r.years < 5 ? 'lt5' : r.years < 10 ? '5to10' : 'ge10');
  /** 登記年月 11508／202508／2025-08 → { y, m } */
  function parseYm(s) {
    const t = String(s || '').replace(/\D/g, '');
    if (t.length === 6) return { y: +t.slice(0, 4), m: +t.slice(4) };
    if (t.length === 5) return { y: +t.slice(0, 3) + 1911, m: +t.slice(3) };
    return null;
  }
  const ymLabel = (ym) => (ym ? `${ym.y}/${String(ym.m).padStart(2, '0')}` : '');
  /** 登記年月距今幾個月（同一個月＝0） */
  const monthsSinceYm = (ym, today) => { const t = today || new Date(); return Math.max(0, (t.getFullYear() - ym.y) * 12 + (t.getMonth() + 1 - ym.m)); };
  // 起算那個月就在名單上的（不知道什麼時候開始做的）算 base；之後才出現的照出現了幾個月
  const whenOf = (r) => (!r.isNew || r.regMonths == null ? 'base' : r.regMonths < 3 ? 'm3' : r.regMonths < 6 ? 'm6' : 'y1');
  const isFresh = (r) => r.isNew && r.regMonths != null && r.regMonths < 3;
  // 最近 3 個月多了新工地／新廠（起算之後才出現的場所）
  const isNewSite = (r) => !!r.newSite && r.newSite.months < 3;
  /*
   * 電話的種類：有電話／手機／沒電話。「手機」是「有電話」的一部分（使用者：「還有哪邊可以精準找到公司負責人的手機」——
   * 登記上填手機當聯絡電話的，多半就是老闆本人）。籤是「或」的關係：只按「手機」就只剩手機的。
   */
  const isMobile = (tel) => /^0?9\d{8}$/.test(String(tel || '').replace(/\D/g, '').replace(/^886/, '0'));
  const phoneKinds = (r) => (r.tel ? (isMobile(r.tel) ? new Set(['Y', 'M']) : new Set(['Y'])) : new Set(['N']));
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
  /** industry.csv 一列 → 卡片資料；baseline＝起算月（YYYYMM），首見年月晚於它才算剛出現 */
  function toRecord(o, today, baseline) {
    const r = {
      taxId: String(o['統編'] || '').replace(/\D/g, ''), name: String(o['名稱'] || '').trim(),
      kinds: String(o['類別'] || '').split(/[、,]/).map((x) => x.trim()).filter(Boolean),
      address: String(o['地址'] || '').trim(), indCode: String(o['行業代號'] || '').trim(), industry: String(o['行業'] || '').trim(),
      tel: String(o['電話'] || '').trim(),
      founded: parseAnyDate(o['設立日期']),
      ym: parseYm(o['首見年月']),
      capital: Number(String(o['資本額'] || '').replace(/\D/g, '')) || 0,   // 元（資本總額）
      orgType: String(o['組織別'] || '').trim(),
      sites: String(o['場所'] || '').trim(),
    };
    const ns = parseYm(o['新場所年月']);
    r.newSite = ns ? { ym: ns, what: String(o['新場所'] || '').trim() || '新場所', months: monthsSinceYm(ns, today) } : null;
    r.years = r.founded ? yearsSince(r.founded, today) : null;
    r.isNew = !!(r.ym && baseline && `${r.ym.y}${String(r.ym.m).padStart(2, '0')}` > String(baseline));
    r.regMonths = r.ym ? monthsSinceYm(r.ym, today) : null;
    r.branch = branchOf(r.address);
    r.district = r.branch.district || '';
    r.key = r.taxId || r.name;
    r.blob = [r.name, r.taxId, r.address, r.industry, r.kinds.join(' '), r.sites, r.tel].join(' ').toLowerCase();
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
  let ready = false;
  let showHidden = false;
  // 「利率不敏感」預設勾（使用者：「在各來源的分頁裡也預設篩選利率不敏感的」）；rate-filter-default＝'0' 是預設不勾（測試用）
  const rateDefault = () => { try { return localStorage.getItem('rate-filter-default') === '0' ? [] : ['Y']; } catch (e) { return ['Y']; } };
  const f = { rate: new Set(rateDefault()), kinds: new Set(), branches: new Set(), districts: new Set(), when: new Set(), ages: new Set(), phone: new Set(), mine: new Set(), q: '' };
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };
  /*
   * 「這家不用了」各頁互通（使用者：「分頁各自的資訊都能互通」）：除了這一頁自己的清單，也記在共用的那份（依統編，app.js 的 srcHide），
   * 在任何一頁藏，六頁與合併頁都藏；放回來也一起。
   */
  const taxOfRec = (r) => String(r.taxId || '').replace(/\D/g, '');
  const isHid = (r) => hidden.has(r.key) || (typeof global.srcHidden === 'function' && global.srcHidden(taxOfRec(r)));
  // 有統編就只記共用那份（不然別頁「放回來」收不回這一頁自己的）；沒統編才記在這一頁
  const hide = (r) => { if (taxOfRec(r).length === 8 && typeof global.srcHide === 'function') global.srcHide(taxOfRec(r)); else hidden.add(r.key); };
  const unhide = (r) => { hidden.delete(r.key); if (typeof global.srcUnhide === 'function') global.srcUnhide(taxOfRec(r)); };

  const criteria = () => ({ min: (Number($('#industry-capMin').value) || 0) * 1e4, max: (Number($('#industry-capMax').value) || 0) * 1e4 || Infinity, terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean), cm: customerMap() });
  function passes(r, c, except) {
    return (except === 'branches' || !f.branches.size || f.branches.has(r.branch.key))
      && (except === 'districts' || !f.districts.size || f.districts.has(r.district))
      && (except === 'when' || !f.when.size || f.when.has(whenOf(r)))
      && (except === 'ages' || !f.ages.size || f.ages.has(ageOf(r)))
      && (except === 'kinds' || !f.kinds.size || r.kinds.some((k) => f.kinds.has(k)))
      && (except === 'cap' || ((c.min <= 0 && c.max === Infinity) || (r.capital >= c.min && r.capital <= c.max)))   // 沒設門檻時沒查到資本額的也列
      && (except === 'rate' || !f.rate.size || f.rate.has(rateKey(r)))
      && (except === 'phone' || !f.phone.size || [...f.phone].some((k) => phoneKinds(r).has(k)))
      && (except === 'mine' || !f.mine.size || f.mine.has(mineKey(r, c.cm)))
      && (showHidden || !(isHid(r) || deletedOf(r.name, r.taxId)))
      && c.terms.every((t) => r.blob.includes(t));
  }
  const ymKey = (ym) => (ym ? `${ym.y}${String(ym.m).padStart(2, '0')}` : '0');
  const dtKey = (dt) => (dt ? `${dt.y}${String(dt.m).padStart(2, '0')}${String(dt.d).padStart(2, '0')}` : '0');
  function visible(c) {
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#industry-sort').value;
    list.sort((a, b) => (sort === 'capital' ? b.capital - a.capital || ymKey(b.ym).localeCompare(ymKey(a.ym))
      : sort === 'founded' ? dtKey(b.founded).localeCompare(dtKey(a.founded))
      : sort === 'name' ? a.name.localeCompare(b.name, 'zh-Hant')
        : ymKey(b.ym).localeCompare(ymKey(a.ym)) || b.capital - a.capital));
    return list;
  }

  /* ---------------- 畫面 ---------------- */

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
      ...(typeof global.phoneSearchLinks === 'function' ? global.phoneSearchLinks(r.name, r.address) : []),
      hasAuto ? '' : input,
    ]);
  }
  const copyName = (name) => (typeof global.copyDot === 'function' ? global.copyDot(name, '複製公司名稱', `已複製：${name}`) : '');
  function openJustAdded(fileName, single) {
    if (!single || typeof global.customerViews !== 'function' || typeof global.openCustomer !== 'function') return;
    const v = global.customerViews().find((x) => x.source === fileName);
    if (v) global.openCustomer(v.id);
  }
  // 公司直達登記頁、商業連用統編查的結果頁（規則在 Normalize.findbizUrl）
  const findbiz = (taxId, text) => (taxId
    ? el('a', { href: global.Normalize.findbizUrl(taxId, text), target: '_blank', rel: 'noopener', textContent: text, title: '商工登記公示資料（開新分頁）' })
    : el('span', { textContent: text }));
  const whenText = (r) => (!r.isNew || r.regMonths == null ? '' : r.regMonths < 1 ? '這個月' : `${r.regMonths} 個月前`);

  function card(r, c) {
    const mine = mineOf(r, c.cm);
    const isHidden = isHid(r) || deletedOf(r.name, r.taxId);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [findbiz(r.taxId, r.name), copyName(r.name)]),
      isFresh(r) ? el('span', { className: 'badge badge-up', textContent: '剛出現', title: '最近 3 個月才出現在這份名單：剛開始做這一行' }) : '',
      isNewSite(r) ? el('span', { className: 'badge badge-up', textContent: r.newSite.what, title: `${ymLabel(r.newSite.ym)} 環境部／食藥署多了這家的${r.newSite.what.replace(/^新/, '')}：在擴張` }) : '',
      ...r.kinds.map((k) => el('span', { className: 'badge badge-ind', textContent: kindLabel(k), title: `公司登記的營業項目有「${k}」` })),
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine is-log', textContent: `已在名單${mine.addedDate ? `・${mmdd(mine.addedDate)} 加入` : ''}${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}　📝 記錄`, title: '點一下打開名單上這一筆，直接記這通電話', onclick: () => openLog(mine.id) })) : '',
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      r.tel ? el('span', {}, ['📞 ', el('a', { href: `tel:${r.tel.replace(/[^\d+#]/g, '')}`, textContent: r.tel }), el('small', { className: 'muted', textContent: isMobile(r.tel) ? '（出進口登記，手機，多半是老闆本人）' : '（出進口登記）' })]) : el('span', { className: 'muted', textContent: '📞 這份名單沒有電話' }),
      r.industry ? el('span', { textContent: `🏷 ${r.industry}${r.indCode ? ` (${r.indCode})` : ''}` }) : '',
      r.capital ? el('span', { textContent: `💰 資本額 ${money(r.capital)}`, title: '資本總額，查商工登記來的' }) : el('span', { className: 'muted', textContent: '💰 資本額還沒查到' }),
      r.founded ? el('span', { textContent: `🎂 成立 ${r.founded.y}/${String(r.founded.m).padStart(2, '0')}（${r.years} 年）` }) : el('span', { className: 'muted', textContent: '🎂 成立日不明' }),
      r.sites ? el('span', { textContent: `🏗 ${r.sites}`, title: '食藥署登錄的食品工廠、環境部列管的工地與工廠（還沒解除列管的）' }) : '',
      r.newSite ? el('span', { textContent: `🆕 ${ymLabel(r.newSite.ym)} 多了${r.newSite.what}`, title: '跟上個月比，這個月才出現的場所' }) : '',
      r.isNew && r.ym ? el('span', { textContent: `🆕 ${ymLabel(r.ym)} 出現在產業名單（${whenText(r)}）`, title: '跟上個月的名單比，這個月才出現' }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      r.taxId ? el('span', { textContent: `#${r.taxId}` }) : '',
    ]);
    const actions = el('div', { className: 'card-actions' }, [
      mine ? '' : el('button', { className: 'btn btn-tiny btn-primary industry-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
      deletedOf(r.name, r.taxId) ? restoreBtn(r.name, r.taxId) : isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { unhide(r); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny industry-hide', type: 'button', textContent: '這家不用了', onclick: () => { hide(r); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    return el('article', { className: `card leads-card industry-card${r.branch.key === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, phoneBox(r, r.key, !!r.tel || !!mine), meta, typeof global.crossLine === 'function' ? global.crossLine(r.taxId, 'industry') : '', actions]);
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
    const facet = (except, pred) => { let n = 0; rows.forEach((r) => { if (pred(r) && passes(r, c, except)) n += 1; }); return n; };
    const count = (except, keyOf) => { const m = new Map(); rows.forEach((r) => { if (!passes(r, c, except)) return; const k = keyOf(r); if (k) m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const bc = count('branches', (r) => r.branch.key);
    const order = (k) => (k === myBranch() ? -1 : /分公司$/.test(k) ? 0 : /共同區$/.test(k) ? 1 : 2);
    const bkeys = [...new Set([...bc.keys(), ...f.branches])].sort((a, b) => order(a) - order(b) || (bc.get(b) || 0) - (bc.get(a) || 0));
    chips($('#industry-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    const dc = count('districts', (r) => r.district);
    const dkeys = [...new Set([...dc.keys(), ...f.districts])].sort((a, b) => (dc.get(b) || 0) - (dc.get(a) || 0));
    chips($('#industry-fDistrict'), dkeys.map((k) => [k, k, dc.get(k) || 0]), f.districts);
    chips($('#industry-fWhen'), WHEN.map(([k, label]) => [k, label, facet('when', (r) => whenOf(r) === k)]), f.when);
    chips($('#industry-fAge'), AGE.map(([k, label]) => [k, label, facet('ages', (r) => ageOf(r) === k)]), f.ages);
    const kindKeys = [...new Set([...rows.flatMap((r) => r.kinds), ...f.kinds])].sort((a, b) => kindRank(a) - kindRank(b));
    chips($('#industry-fKind'), kindKeys.map((k) => [k, kindLabel(k), facet('kinds', (r) => r.kinds.includes(k))]), f.kinds);
    chips($('#industry-fRate'), [['Y', '利率不敏感'], ['N', '其他']].map(([k, label]) => [k, label, facet('rate', (r) => rateKey(r) === k)]), f.rate);
    chips($('#industry-fPhone'), [['Y', '有電話'], ['M', '手機'], ['N', '沒電話']].map(([k, label]) => [k, label, facet('phone', (r) => phoneKinds(r).has(k))]), f.phone);
    chips($('#industry-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#industry-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const fresh = current.filter((r) => !mineOf(r, c.cm)).length;
    $('#industry-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">${current.length - fresh ? `　／ 其中 ${current.length - fresh} 家已在名單` : ''}</span>`;
    const del = rows.filter((r) => deletedOf(r.name, r.taxId)).length;
    const hid = rows.filter((r) => isHid(r)).length + del;
    const hb = $('#industry-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    $('#industry-more').hidden = current.length <= limit;
    $('#industry-empty').hidden = !!current.length;
    $('#industry-empty').textContent = rows.length ? '沒有符合條件的，把篩選放寬試試。' : '';
    $('#industry-add').disabled = !fresh;
    $('#industry-add').textContent = `把篩出來的加入客戶名單${fresh ? `（${Math.min(fresh, 200)} 家）` : ''}`;
    $('#industry-export').disabled = !current.length;
    const pill = document.getElementById('countIndustry');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單 ---------------- */

  function noteFor(r) {
    // 只留重點：哪一類、什麼時候出現在名單上（來源漏斗看開頭「產業名單：」）
    const ymIso = (ym) => `${ym.y}-${String(ym.m).padStart(2, '0')}`;
    return [`產業名單：${r.kinds.join('、')}`, r.newSite ? `${ymIso(r.newSite.ym)} ${r.newSite.what}` : '', r.isNew && r.ym ? `${ymIso(r.ym)} 新出現` : '', r.industry || ''].filter(Boolean).join('，');
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function toStandardCsv(list, dates) {
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.name, r.taxId, '', r.founded ? String(r.founded.y) : '', thousands(r.capital), r.tel || typed.get(r.key) || '', '', '', r.industry || '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  const fromDate = () => { const v = $('#industry-from') && $('#industry-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm)).slice(0, 200);
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], `產業名單-${todayIso()}-${fresh.length}家.csv`, { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    fresh.forEach((r) => typed.delete(r.key));
    openJustAdded(file.name, fresh.length === 1);
    const got = (typeof global.customerViews === 'function' ? global.customerViews() : []).filter((v) => v.source === file.name).length;
    const lost = fresh.length - got;
    const sorted = dates.filter(Boolean).sort();
    if (!got) toast(`${fresh.length === 1 ? '這家' : `這 ${fresh.length} 家`}早就在名單上了（同名或同統編），沒有再加一次；卡片上的「已在名單」有寫哪天加的`);
    else if (sorted.length) toast(`${got} 家排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}${lost > 0 ? `；另外 ${lost} 家早就在名單上（同名），略過` : ''}`);
    render();
  }

  /* ---------------- 每日挑選（給 app.js 的每日新名單用） ---------------- */

  /*
   * 優先順序（是順序不是門檻）：有電話（沒電話等於沒用）→ 資本額 500～6,000 萬 → 我的分公司（遠近）→ 成立 6～10 年
   * （Rules.ageRank，成交多半 7～8 年）→ 最近 3 個月才出現；全一樣資本額高的先。
   */
  const DAILY_PRIORITY = ['利率不敏感', '有電話', '資本額 500～6,000 萬', '我的分公司', '成立 6～10 年', '剛出現或剛有新工地／新廠（3 個月內）'];
  // 使用者：「每天補給我的名單優先給我加入利率不敏感的客群」——排最前面：動產擔保上跟同業（租賃／融資，不含銀行）借的，或剛登記工廠的（在擴廠，缺的是錢，不是便宜的錢）
  const peerOf = (id) => (global.Chattel && global.Chattel.peerLenderOf ? global.Chattel.peerLenderOf(id) : '');
  const rateFreeOf = (r) => {
    const peer = peerOf(r.taxId);
    if (peer) return `跟${peer}借`;
    if (isNewSite(r)) return `剛有${r.newSite.what}`;
    if (isFresh(r)) return `剛做${r.kinds[0] || '這一行'}`;
    return '';
  };
  // 分頁篩選的「利率不敏感」：跟每日新名單同一套
  const rateKey = (r) => (rateFreeOf(r) ? 'Y' : 'N');
  const capRank = (r) => (r.capital >= 5000000 && r.capital <= 60000000 ? 0 : 1);
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  const ageRankOf = (r) => (global.Rules && global.Rules.ageRank ? global.Rules.ageRank(r.years) : (ageOf(r) === '5to10' ? 0 : 3));
  const dailyChecks = (r) => [!!rateFreeOf(r), !!r.tel, capRank(r), branchRank(r), ageRankOf(r), isFresh(r) || isNewSite(r)];
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return b.capital - a.capital || ymKey(b.ym).localeCompare(ymKey(a.ym));
  }
  const whyOf = (r, hitAt) => {
    const hit = DAILY_PRIORITY.filter((_, i) => hitAt(i)).map((x) => (x === '利率不敏感' ? `利率不敏感（${rateFreeOf(r)}）` : x));
    const rk = r._checks[DAILY_PRIORITY.indexOf('我的分公司')];
    const relax = rk > 0 && rk < 9 ? `分公司放寬到 ${r.branch.key}` : '';
    return [hit.length ? `符合：${hit.join('、')}` : '基準都不符，補位', relax].filter(Boolean).join('；');
  };
  async function dailyCandidates() {
    if (!root) root = document.getElementById('paneIndustry');
    if (!root) return [];
    await start();
    if (!ready) return [];
    if (global.Chattel && global.Chattel.ensureData) { try { await global.Chattel.ensureData(); } catch (e) { /* 沒動保資料就不看同業 */ } }
    const cm = customerMap();
    return rows.filter((r) => !mineOf(r, cm) && !isHid(r) && !deletedOf(r.name, r.taxId))
      .map((r) => { r._checks = dailyChecks(r); r._why = whyOf(r, (i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : r._checks[i])); return r; })
      .sort(dailyCompare);
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'industry-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。預設篩資本額 500～6,000 萬、我的分公司；要看全部就把數字清掉、籤按掉。' }),
      group('歸屬分公司（同「規則」的劃分表）', el('div', { className: 'chips', id: 'industry-fBranch' })),
      group('區', el('div', { className: 'chips', id: 'industry-fDistrict' })),
      group('類別', el('div', { className: 'chips', id: 'industry-fKind' })),
      group('什麼時候出現在名單上', el('div', { className: 'chips', id: 'industry-fWhen' })),
      group('公司成立', el('div', { className: 'chips', id: 'industry-fAge' })),
      group('利率（跟同業借、剛擴張的，比較不在乎利率）', el('div', { className: 'chips', id: 'industry-fRate' })),
      group('電話（對出進口廠商登記來的）', el('div', { className: 'chips', id: 'industry-fPhone' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'industry-fMine' })),
      group('資本額（萬元；公司登記的資本總額）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'industry-capMin', type: 'number', min: '0', step: '10', placeholder: '下限' }), '～',
        el('input', { id: 'industry-capMax', type: 'number', min: '0', step: '10', placeholder: '上限' })])),
      group('關鍵字', el('input', { id: 'industry-q', type: 'search', placeholder: '名稱、統編、地址、類別、行業、電話', autocomplete: 'off' }), 'industry-q'),
      group('排序', el('select', { id: 'industry-sort' }, [
        el('option', { value: 'capital', textContent: '資本額（高到低）' }),
        el('option', { value: 'ym', textContent: '最近出現在前' }),
        el('option', { value: 'founded', textContent: '最新成立在前' }),
        el('option', { value: 'name', textContent: '名稱' })]), 'industry-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'industry-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'industry-hidden', type: 'button', hidden: true })]),
    ]);
    // 使用者：「找名單的預設篩選畫面都先收起來，我每次點進來都要自己關」；leads-filters-open＝'1' 是預設打開（測試用）
    filters.open = (() => { try { return localStorage.getItem('leads-filters-open') === '1'; } catch (e) { return false; } })();
    root.append(
      el('p', { className: 'muted leads-sub', id: 'industry-sub', textContent: '新北市、臺北市的車輛相關業者、食品工廠、環保列管工廠、營造業' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'industry-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'industry-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'industry-add', type: 'button', title: '把目前篩出來、還不在名單裡的全部送進匯入流程（一次最多 200 家）', textContent: '把篩出來的加入客戶名單' }),
          el('button', { className: 'btn', id: 'industry-export', type: 'button', textContent: '匯出 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'industry-loading', hidden: true }),
      el('div', { className: 'cards', id: 'industry-cards' }),
      el('div', { className: 'empty', id: 'industry-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'industry-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [el('span', {}, [el('i', { className: 'swatch is-up' }), ' 在我的分公司轄區'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源（政府資料開放平臺，每月）：經濟部「公司登記（依營業項目別）」36719 汽車貨運業、36720 遊覽車客運業、36711 計程車客運業、36715 小客車租賃業；食藥署「食品業者登錄」8938（工廠／製造場所）；環境部「環境保護許可管理系統對象」118447（還在列管的工地、空污／水污工廠）。GitHub Actions 每月 14 日抓，只留新北市、臺北市的總公司；成立日期、行業、食品與環保那兩份的名稱地址對財政部稅籍檔，電話對貿易署出進口廠商登記。' }),
    );
  }

  /*
   * 資料載入跟畫面分開：合併頁、「🔗 也在」、找不到電話的比對不用打開這一頁也要載得到。
   */
  let loading = null;
  function ensureData() {
    if (loading) return loading;
    loading = (async () => {
      const res = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.noIndex = true; throw e; }
      index = await res.json();
      const csvRes = await fetch(`${DATA_BASE}industry.csv?t=${index.generatedAt}`, { cache: 'force-cache' });
      if (!csvRes.ok) throw new Error(`industry.csv：HTTP ${csvRes.status}`);
      const table = parseCsv(await csvRes.text());
      const head = table[0] || [];
      rows = [];
      table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(toRecord(o, undefined, index.baseline)); });
      byTax = new Map(rows.filter((r) => r.taxId).map((r) => [r.taxId, r]));
    })();
    loading.catch(() => { loading = null; });   // 失敗下次再試
    return loading;
  }
  let byTax = new Map();
  /** 統編 → 這一家（沒有回 null） */
  const lookup = (taxId) => byTax.get(String(taxId || '').replace(/\D/g, '')) || null;

  let starting = null;
  function start() {
    if (starting) return starting;
    starting = (async () => {
      build();
      $('#industry-loading').hidden = false;
      $('#industry-loading').textContent = '下載資料…';
      try { await ensureData(); }
      catch (err) {
        $('#industry-loading').hidden = true;
        $('#industry-empty').hidden = false;
        if (!err.noIndex) { $('#industry-empty').textContent = `資料下載失敗：${err.message}`; return; }
        $('#industry-empty').textContent = '還沒有抓好的資料。GitHub Actions 每月 14 日會自動抓，也可以到 repo 的 Actions 頁手動執行「每月產業名單」。';
        return;
      }
      $('#industry-loading').hidden = true;
      $('#industry-sub').textContent = `${(index.cities || []).join('、')} ${Number(index.total || 0).toLocaleString()} 家（${Object.entries(index.byKind || {}).sort((a, b) => kindRank(a[0]) - kindRank(b[0])).map(([k, n]) => `${kindLabel(k).replace(/^\S+ /, '')} ${n}`).join('、')}；對到電話 ${Number(index.withPhone || 0).toLocaleString()}）　·　起算 ${String(index.baseline || '').replace(/^(\d{4})(\d{2})$/, '$1/$2')}，之後新出現的標「剛出現」`;
      $('#industry-loading').hidden = true;
      ready = true;
      if (global.Chattel && global.Chattel.ensureData) global.Chattel.ensureData().then(() => { if (ready) render(); }).catch(() => {});   // 動保載好才知道誰跟同業借（利率不敏感）
      const rerender = () => { limit = PAGE; render(); };
      $('#industry-sort').onchange = rerender;
      ['#industry-capMin', '#industry-capMax'].forEach((s) => { $(s).oninput = rerender; });
      let qt = null;
      $('#industry-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
      $('#industry-more').onclick = () => { limit += PAGE; render(); };
      $('#industry-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
      // 預設篩成最值得打的那批：資本額 500～6,000 萬、公司（商行多半小）、我的分公司。電話不預設篩：這份對到電話的本來就少
      const defaults = () => {
        Object.values(f).forEach((v) => { if (v instanceof Set) v.clear(); }); f.q = ''; rateDefault().forEach((k) => f.rate.add(k));
        f.branches.add(myBranch());
        $('#industry-q').value = ''; $('#industry-capMin').value = '500'; $('#industry-capMax').value = '6000'; $('#industry-sort').value = 'capital'; showHidden = false;
      };
      $('#industry-reset').onclick = () => { defaults(); rerender(); };
      $('#industry-reset').textContent = '回到預設篩選';
      defaults();
      $('#industry-add').onclick = () => { const c = criteria(); addToList(current.filter((r) => !mineOf(r, c.cm))); };
      $('#industry-export').onclick = () => {
        const blob = new Blob([toStandardCsv(current)], { type: 'text/csv;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `產業名單-${todayIso()}-${current.length}家.csv` });
        document.body.append(a); a.click(); a.remove();
      };
      render();
    })();
    return starting;
  }
  function show() {
    if (!root) root = document.getElementById('paneIndustry');
    if (!root) return;
    if (!starting) { start().catch((err) => { console.error(err); toast(`產業名單：${err.message}`); }); return; }
    render();
  }

  /*
   * 每日新名單揉合用（使用者：「除了商行那頁外其他五頁揉在一起，照總分挑但每分頁至少保底」）：
   * 這一家在這一頁看得到的訊號與排序要素，格式五頁一樣，app.js 的 dailyFeed 依統編合併成一家再算總分。
   */
  function dailyFacts(r) {
    const signals = [...new Set(r.kinds.map(groupSignal))];
    if (isFresh(r)) signals.push(r.kinds.some((k) => VEHICLE.test(k)) ? '剛做車輛業' : '剛出現在產業名單');
    if (isNewSite(r)) signals.push(`剛有${r.newSite.what}`);
    return { key: String(r.taxId || '').replace(/\D/g, '') || String(r.name || '').replace(/\s/g, ''), name: r.name, signals,
      ageRank: ageRankOf(r), capOk: capRank(r) === 0, phone: !!r.tel, branchRank: branchRank(r) };
  }
  /*
   * 「新名單」合併頁用（使用者：「除了上市櫃、商行維持獨立名單外，其餘都能合併」）：這一家在這一頁的卡片資料，
   * 六頁同一種格式（地址、資本額〔元〕、成立幾年、電話、歸屬分公司、這一頁看到的那一句），加入名單走這一頁自己的流程。
   */
  function cardFacts(r) {
    return { name: r.name, taxId: r.taxId, address: r.address, capital: r.capital || 0, years: r.years, tel: r.tel, branchKey: r.branch.key,
      info: `${r.kinds.join('、')}${r.newSite ? `（${ymLabel(r.newSite.ym)} ${r.newSite.what}）` : r.isNew && r.ym ? `（${ymLabel(r.ym)} 新出現）` : ''}`, add: () => addToList([r]) };
  }
  /** 統編 → 這一頁看到的那一句（別的分頁卡片上「🔗 也在」用；名單裡有沒有都算） */
  let factIdx = null; let factIdxN = -1;
  function factsOf(taxId) {
    if (factIdxN !== rows.length) {
      const idx = new Map();
      rows.forEach((r) => { const t = taxOfRec(r); if (t.length !== 8) return; const have = idx.get(t); if (!have) idx.set(t, r); });
      factIdx = idx; factIdxN = rows.length;
    }
    const r = factIdx.get(String(taxId || '').replace(/\D/g, ''));
    return r ? cardFacts(r) : null;
  }
  global.Industry = { show, ensureData, lookup, dailyFacts, cardFacts, factsOf, toRecord, parseYm, monthsSinceYm, whenOf, ageOf, toStandardCsv, noteFor, dailyCandidates, DAILY_PRIORITY, kindLabel, isNewSite };
})(window);
