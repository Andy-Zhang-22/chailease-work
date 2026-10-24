/*
 * 「政府標案得標」分頁：g0v 標案 API（pcc-api.openfun.app，政府電子採購網的鏡像）裡最近決標、得標廠商在新北市、臺北市的公司。
 *
 * 使用者（2026/10/24）：「在現有的電推系統新增一個案源來源『政府標案得標廠商』」。剛標到政府案子＝接下來要付履約保證金、
 * 買料、買設備、墊工程款，週轉金與設備融資的需求就在這一兩個月；得標廠商多是營造、工程、資訊設備、物流，本來就在打的行業。
 * 資料由 GitHub Actions 每天抓前一天的決標公告放 leads/pcc/（tools/fetch-pcc.mjs，只留新北市、臺北市、公司登記／商業登記的得標廠商）：
 *   pcc.csv：統編,名稱,組織型態,地址,電話,最近決標日,標案名稱,招標機關,決標金額,得標件數,首次決標日,案號,成立日期,資本額
 *   一家公司一列（同一家得好幾標只留最近那一標，件數另外記；跨期同統編不重複列）。電話、地址是決標公告裡廠商自己填的。
 *   成立日期、資本額是 fill-founded.mjs 查商工登記填的。
 * 程式照「新設工廠」（factory.js）那一頁：篩選、加入名單、每日新名單揉合都同一套。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/pcc/';
  const HIDDEN_KEY = 'pcc-hidden-v1';
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  const WHEN = [['m3', '3 個月內'], ['m6', '3～6 個月'], ['y1', '半年以上']];   // 最近一次決標距今
  const AGE = [['lt1', '未滿 1 年（新公司）'], ['lt5', '1～5 年'], ['5to10', '5～10 年'], ['ge10', '10 年以上'], ['unknown', '不明']];
  const ORG = [['company', '公司登記'], ['biz', '商業登記'], ['other', '其他']];

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
  const copyTel = (t) => (typeof global.copyTel === 'function' ? global.copyTel(t) : '');   // 電話後面的複製鈕
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
  // 組織：決標公告的「組織型態」是「公司登記」「商業登記」「財團法人」「學校」等（抓的時候只留前兩種，這裡仍照字判斷）
  const orgOf = (r) => (/公司登記|公司$/.test(r.orgType) && !/分公司/.test(r.orgType) ? 'company' : /商業登記|獨資|合夥/.test(r.orgType) ? 'biz' : r.orgType ? 'other' : (/公司/.test(r.name) ? 'company' : 'other'));
  /** 決標日 2026-10-23／20261023／115/10/23 → { y, m, d }；也收年月 202610 → { y, m } */
  function parseYm(s) {
    const t = String(s || '').replace(/\D/g, '');
    if (t.length === 8) return { y: +t.slice(0, 4), m: +t.slice(4, 6), d: +t.slice(6) };
    if (t.length === 7) return { y: +t.slice(0, 3) + 1911, m: +t.slice(3, 5), d: +t.slice(5) };
    if (t.length === 6) return { y: +t.slice(0, 4), m: +t.slice(4) };
    return null;
  }
  const ymLabel = (ym) => (ym ? `${ym.y}/${String(ym.m).padStart(2, '0')}${ym.d ? `/${String(ym.d).padStart(2, '0')}` : ''}` : '');
  const ymIso = (ym) => (ym ? `${ym.y}-${String(ym.m).padStart(2, '0')}` : '');   // factsOf 的 ym 給 app.js 比月份（ymKey 另有用途）
  /** 決標距今幾個月（同一個月＝0） */
  const monthsSinceYm = (ym, today) => { const t = today || new Date(); return Math.max(0, (t.getFullYear() - ym.y) * 12 + (t.getMonth() + 1 - ym.m)); };
  const whenOf = (r) => (r.regMonths == null ? 'y1' : r.regMonths < 3 ? 'm3' : r.regMonths < 6 ? 'm6' : 'y1');
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
  /** pcc.csv 一列 → 卡片資料 */
  function toRecord(o, today) {
    const r = {
      taxId: String(o['統編'] || '').replace(/\D/g, ''), name: String(o['名稱'] || '').trim(),
      address: String(o['地址'] || '').trim(), indCode: '', industry: '',
      tel: String(o['電話'] || '').trim(),
      founded: parseAnyDate(o['成立日期']),
      ym: parseYm(o['最近決標日']),
      capital: Number(String(o['資本額'] || '').replace(/\D/g, '')) || 0,   // 元；fill-founded 查商工登記填的，0＝還沒查到
      tender: String(o['標案名稱'] || '').trim(), agency: String(o['招標機關'] || '').trim(),
      amount: Number(String(o['決標金額'] || '').replace(/\D/g, '')) || 0,   // 元；這家在這一標的決標金額
      awards: Number(o['得標件數']) || 1, firstYm: parseYm(o['首次決標日']), caseNo: String(o['案號'] || '').trim(),
      orgType: String(o['組織型態'] || '').trim(),
    };
    r.years = r.founded ? yearsSince(r.founded, today) : null;
    r.regMonths = r.ym ? monthsSinceYm(r.ym, today) : null;
    r.branch = branchOf(r.address);
    r.district = r.branch.district || '';
    r.key = r.taxId || r.name;
    r.blob = [r.name, r.taxId, r.address, r.tender, r.agency, r.tel].join(' ').toLowerCase();
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
  const f = { rate: new Set(rateDefault()), branches: new Set(), districts: new Set(), when: new Set(), ages: new Set(), org: new Set(), phone: new Set(), mine: new Set(), q: '' };
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

  const criteria = () => ({ min: (Number($('#pcc-capMin').value) || 0) * 1e4, max: (Number($('#pcc-capMax').value) || 0) * 1e4 || Infinity, terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean), cm: customerMap() });
  function passes(r, c, except) {
    return (except === 'branches' || !f.branches.size || f.branches.has(r.branch.key))
      && (except === 'districts' || !f.districts.size || f.districts.has(r.district))
      && (except === 'when' || !f.when.size || f.when.has(whenOf(r)))
      && (except === 'ages' || !f.ages.size || f.ages.has(ageOf(r)))
      && (except === 'org' || !f.org.size || f.org.has(orgOf(r)))
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
    const sort = $('#pcc-sort').value;
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
  // 加一家就直接打開詳細頁；那家其實早就在名單上（名稱寫法不同、別份名單加過）就打開名單上那一筆
  function openJustAdded(fileName, single, who) {
    if (!single || typeof global.customerViews !== 'function' || typeof global.openCustomer !== 'function') return;
    const v = global.customerViews().find((x) => x.source === fileName)
      || (who && typeof global.findCustomer === 'function' ? global.findCustomer(who.name, who.taxId) : null);
    if (v) global.openCustomer(v.id);
  }
  // 公司直達登記頁、商業連用統編查的結果頁（規則在 Normalize.findbizUrl）
  const findbiz = (taxId, text) => (taxId
    ? el('a', { href: global.Normalize.findbizUrl(taxId, text), target: '_blank', rel: 'noopener', textContent: text, title: '商工登記公示資料（開新分頁）' })
    : el('span', { textContent: text }));
  const whenText = (r) => (r.regMonths == null ? '' : r.regMonths < 1 ? '這個月' : `${r.regMonths} 個月前`);

  function card(r, c) {
    const mine = mineOf(r, c.cm);
    const isHidden = isHid(r) || deletedOf(r.name, r.taxId);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [findbiz(r.taxId, r.name), copyName(r.name)]),
      r.regMonths != null && r.regMonths < 3 ? el('span', { className: 'badge badge-up', textContent: '剛得標', title: '最近 3 個月才決標：要付履約保證金、買料、買設備、墊工程款' }) : '',
      r.awards > 1 ? el('span', { className: 'badge badge-ind', textContent: `得標 ${r.awards} 件`, title: '抓到的期間內這家得標的件數' }) : '',
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine is-log', textContent: `已在名單${mine.addedDate ? `・${mmdd(mine.addedDate)} 加入` : ''}${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}　📝 記錄`, title: '點一下打開名單上這一筆，直接記這通電話', onclick: () => openLog(mine.id) })) : '',
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      r.tel ? el('span', {}, ['📞 ', el('a', { href: `tel:${r.tel.replace(/[^\d+#]/g, '')}`, textContent: r.tel }), copyTel(r.tel), el('small', { className: 'muted', textContent: isMobile(r.tel) ? '（決標公告廠商填的，手機，多半是老闆本人）' : '（決標公告廠商填的）' })]) : el('span', { className: 'muted', textContent: '📞 決標公告沒有電話' }),
      r.tender ? el('span', { textContent: `📜 ${r.tender}`, title: '標案名稱（決標公告）' }) : '',
      r.agency ? el('span', { textContent: `🏛 ${r.agency}`, title: '招標機關' }) : '',
      r.amount ? el('span', { textContent: `💵 決標 ${money(r.amount)}`, title: '這家在這一標的決標金額' }) : '',
      r.capital ? el('span', { textContent: `💰 資本額 ${money(r.capital)}`, title: '資本總額，查商工登記來的' }) : el('span', { className: 'muted', textContent: '💰 資本額還沒查到' }),
      r.founded ? el('span', { textContent: `🎂 成立 ${r.founded.y}/${String(r.founded.m).padStart(2, '0')}（${r.years} 年）` }) : el('span', { className: 'muted', textContent: '🎂 成立日不明' }),
      r.ym ? el('span', { textContent: `🏆 ${ymLabel(r.ym)} 決標（${whenText(r)}）`, title: '決標公告的決標日期' }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      r.taxId ? el('span', { textContent: `#${r.taxId}` }) : '',
    ]);
    const actions = el('div', { className: 'card-actions' }, [
      mine ? '' : el('button', { className: 'btn btn-tiny btn-primary pcc-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
      deletedOf(r.name, r.taxId) ? restoreBtn(r.name, r.taxId) : isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { unhide(r); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny pcc-hide', type: 'button', textContent: '這家不用了', onclick: () => { hide(r); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    return el('article', { className: `card leads-card pcc-card${r.branch.key === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, phoneBox(r, r.key, !!r.tel || !!mine), meta, typeof global.crossLine === 'function' ? global.crossLine(r.taxId, 'pcc') : '', actions]);
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
    chips($('#pcc-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    const dc = count('districts', (r) => r.district);
    const dkeys = [...new Set([...dc.keys(), ...f.districts])].sort((a, b) => (dc.get(b) || 0) - (dc.get(a) || 0));
    chips($('#pcc-fDistrict'), dkeys.map((k) => [k, k, dc.get(k) || 0]), f.districts);
    chips($('#pcc-fWhen'), WHEN.map(([k, label]) => [k, label, facet('when', (r) => whenOf(r) === k)]), f.when);
    chips($('#pcc-fAge'), AGE.map(([k, label]) => [k, label, facet('ages', (r) => ageOf(r) === k)]), f.ages);
    chips($('#pcc-fOrg'), ORG.map(([k, label]) => [k, label, facet('org', (r) => orgOf(r) === k)]), f.org);
    chips($('#pcc-fRate'), [['Y', '利率不敏感'], ['N', '其他']].map(([k, label]) => [k, label, facet('rate', (r) => rateKey(r) === k)]), f.rate);
    chips($('#pcc-fPhone'), [['Y', '有電話'], ['M', '手機'], ['N', '沒電話']].map(([k, label]) => [k, label, facet('phone', (r) => phoneKinds(r).has(k))]), f.phone);
    chips($('#pcc-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#pcc-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const fresh = current.filter((r) => !mineOf(r, c.cm)).length;
    $('#pcc-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">${current.length - fresh ? `　／ 其中 ${current.length - fresh} 家已在名單` : ''}</span>`;
    const del = rows.filter((r) => deletedOf(r.name, r.taxId)).length;
    const hid = rows.filter((r) => isHid(r)).length + del;
    const hb = $('#pcc-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    $('#pcc-more').hidden = current.length <= limit;
    $('#pcc-empty').hidden = !!current.length;
    $('#pcc-empty').textContent = rows.length ? '沒有符合條件的，把篩選放寬試試。' : '';
    $('#pcc-add').disabled = !fresh;
    $('#pcc-add').textContent = `把篩出來的加入客戶名單${fresh ? `（${Math.min(fresh, 200)} 家）` : ''}`;
    $('#pcc-export').disabled = !current.length;
    const pill = document.getElementById('countPcc');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單 ---------------- */

  const ymFull = (ym) => (ym ? `${ym.y}-${String(ym.m).padStart(2, '0')}${ym.d ? `-${String(ym.d).padStart(2, '0')}` : ''}` : '');
  function noteFor(r) {
    // 使用者：「備註欄放：標案名稱、招標機關、決標金額、決標日期」；只留重點，一行
    return [`政府標案得標 ${ymFull(r.ym)}`, r.tender, r.agency ? `招標機關 ${r.agency}` : '', r.amount ? `決標 ${money(r.amount)}` : '', r.awards > 1 ? `共 ${r.awards} 件` : ''].filter(Boolean).join('，');
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function toStandardCsv(list, dates) {
    // 15 欄：對得上的填（名稱、統編、成立、資本額、電話、地址），對不上的（分級、負責人、KEYMAN、產業別）留空不猜
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.name, r.taxId, '', r.founded ? String(r.founded.y) : '', thousands(r.capital), r.tel || typed.get(r.key) || '', '', '', '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  const fromDate = () => { const v = $('#pcc-from') && $('#pcc-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm)).slice(0, 200);
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], `政府標案得標-${todayIso()}-${fresh.length}家.csv`, { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    fresh.forEach((r) => typed.delete(r.key));
    openJustAdded(file.name, fresh.length === 1, { name: fresh[0].name, taxId: fresh[0].taxId });
    const got = (typeof global.customerViews === 'function' ? global.customerViews() : []).filter((v) => v.source === file.name).length;
    const lost = fresh.length - got;
    const sorted = dates.filter(Boolean).sort();
    if (!got) toast(`${fresh.length === 1 ? '這家' : `這 ${fresh.length} 家`}早就在名單上了（同名或同統編），沒有再加一次；卡片上的「已在名單」有寫哪天加的`);
    else if (sorted.length) toast(`${got} 家排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}${lost > 0 ? `；另外 ${lost} 家早就在名單上（同名），略過` : ''}`);
    render();
  }

  /* ---------------- 每日挑選（給 app.js 的每日新名單用） ---------------- */

  /*
   * 優先順序（是順序不是門檻）：有電話 → 資本額 300～6,000 萬 → 我的分公司（遠近）→ 成立 2～7 年 → 最近 3 個月才決標；全一樣最近決標的先。
   */
  const DAILY_PRIORITY = ['利率不敏感', '有電話', '資本額 300～6,000 萬', '我的分公司', '成立 2～7 年', '剛得標 3 個月內'];
  // 利率不敏感：動產擔保上跟同業借的，或剛得標的（要付履約保證金、墊款，缺的是錢，不是便宜的錢）
  const peerOf = (id) => (global.Chattel && global.Chattel.peerLenderOf ? global.Chattel.peerLenderOf(id) : '');
  const rateFreeOf = (r) => {
    const peer = peerOf(r.taxId);
    if (peer) return `跟${peer}借`;
    if (r.regMonths != null && r.regMonths < 3) return '剛得標';
    return '';
  };
  // 分頁篩選的「利率不敏感」：跟每日新名單同一套
  const rateKey = (r) => (rateFreeOf(r) ? 'Y' : 'N');
  const capRank = (r) => (r.capital >= 3000000 && r.capital <= 60000000 ? 0 : 1);
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  const ageRankOf = (r) => (global.Rules && global.Rules.ageRank ? global.Rules.ageRank(r.years) : (ageOf(r) === '5to10' ? 0 : 3));
  const dailyChecks = (r) => [!!rateFreeOf(r), !!r.tel, capRank(r), branchRank(r), ageRankOf(r), r.regMonths != null && r.regMonths < 3];
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return ymKey(b.ym).localeCompare(ymKey(a.ym)) || b.capital - a.capital;
  }
  const whyOf = (r, hitAt) => {
    const hit = DAILY_PRIORITY.filter((_, i) => hitAt(i)).map((x) => (x === '利率不敏感' ? `利率不敏感（${rateFreeOf(r)}）` : x));
    const rk = r._checks[DAILY_PRIORITY.indexOf('我的分公司')];
    const relax = rk > 0 && rk < 9 ? `分公司放寬到 ${r.branch.key}` : '';
    return [hit.length ? `符合：${hit.join('、')}` : '基準都不符，補位', relax].filter(Boolean).join('；');
  };
  // withMine：合併頁要連名單裡已經有的也列（卡片標「已在名單」）；每日新名單照舊不要
  async function dailyCandidates({ withMine = false } = {}) {
    if (!root) root = document.getElementById('panePcc');
    if (!root) return [];
    await start();
    if (!ready) return [];
    if (global.Chattel && global.Chattel.ensureData) { try { await global.Chattel.ensureData(); } catch (e) { /* 沒動保資料就不看同業 */ } }
    const cm = customerMap();
    return rows.filter((r) => (withMine || !mineOf(r, cm)) && !isHid(r) && !deletedOf(r.name, r.taxId))
      .map((r) => { r._checks = dailyChecks(r); r._why = whyOf(r, (i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : r._checks[i])); return r; })
      .sort(dailyCompare);
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'pcc-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。預設篩資本額 300～6,000 萬、公司登記、我的分公司；要看全部就把數字清掉、籤按掉。' }),
      group('歸屬分公司（同「規則」的劃分表）', el('div', { className: 'chips', id: 'pcc-fBranch' })),
      group('區', el('div', { className: 'chips', id: 'pcc-fDistrict' })),
      group('什麼時候決標', el('div', { className: 'chips', id: 'pcc-fWhen' })),
      group('公司成立', el('div', { className: 'chips', id: 'pcc-fAge' })),
      group('組織', el('div', { className: 'chips', id: 'pcc-fOrg' })),
      group('利率（跟同業借、剛得標的，比較不在乎利率）', el('div', { className: 'chips', id: 'pcc-fRate' })),
      group('電話（決標公告裡廠商填的）', el('div', { className: 'chips', id: 'pcc-fPhone' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'pcc-fMine' })),
      group('資本額（萬元；查商工登記來的）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'pcc-capMin', type: 'number', min: '0', step: '10', placeholder: '下限' }), '～',
        el('input', { id: 'pcc-capMax', type: 'number', min: '0', step: '10', placeholder: '上限' })])),
      group('關鍵字', el('input', { id: 'pcc-q', type: 'search', placeholder: '名稱、統編、地址、標案名稱、招標機關、電話', autocomplete: 'off' }), 'pcc-q'),
      group('排序', el('select', { id: 'pcc-sort' }, [
        el('option', { value: 'capital', textContent: '資本額（高到低）' }),
        el('option', { value: 'ym', textContent: '最近決標在前' }),
        el('option', { value: 'founded', textContent: '最新成立在前' }),
        el('option', { value: 'name', textContent: '名稱' })]), 'pcc-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'pcc-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'pcc-hidden', type: 'button', hidden: true })]),
    ]);
    // 使用者：「找名單的預設篩選畫面都先收起來，我每次點進來都要自己關」；leads-filters-open＝'1' 是預設打開（測試用）
    filters.open = (() => { try { return localStorage.getItem('leads-filters-open') === '1'; } catch (e) { return false; } })();
    root.append(
      el('p', { className: 'muted leads-sub', id: 'pcc-sub', textContent: '政府電子採購網決標公告（新北市、臺北市）：最近得標的廠商' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'pcc-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'pcc-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'pcc-add', type: 'button', title: '把目前篩出來、還不在名單裡的全部送進匯入流程（一次最多 200 家）', textContent: '把篩出來的加入客戶名單' }),
          el('button', { className: 'btn', id: 'pcc-export', type: 'button', textContent: '匯出 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'pcc-loading', hidden: true }),
      el('div', { className: 'cards', id: 'pcc-cards' }),
      el('div', { className: 'empty', id: 'pcc-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'pcc-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [el('span', {}, [el('i', { className: 'swatch is-up' }), ' 在我的分公司轄區'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：政府電子採購網的決標公告（經 g0v 標案 API，pcc-api.openfun.app），GitHub Actions 每天抓前一天的，只留得標廠商地址在新北市、臺北市、組織型態是公司登記或商業登記的；一家一列，同一家得好幾標只列最近那一標。電話、地址是公告裡廠商自己填的。公司成立日、資本額是查商工登記補的。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳。' }),
    );
  }

  /*
   * 資料載入跟畫面分開：名單頁的卡片要標「🏆 剛得標」（名單上已經有的客戶剛標到政府案子），
   * 不用打開這一頁也要載得到（app.js 一開網站就呼叫 ensureData）。
   */
  let loading = null;
  function ensureData() {
    if (loading) return loading;
    loading = (async () => {
      const res = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.noIndex = true; throw e; }
      index = await res.json();
      const csvRes = await fetch(`${DATA_BASE}pcc.csv?t=${index.generatedAt}`, { cache: 'force-cache' });
      if (!csvRes.ok) throw new Error(`pcc.csv：HTTP ${csvRes.status}`);
      const table = parseCsv(await csvRes.text());
      const head = table[0] || [];
      rows = [];
      table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(toRecord(o)); });
      byTax = new Map(rows.filter((r) => r.taxId).map((r) => [r.taxId, r]));
    })();
    loading.catch(() => { loading = null; });   // 失敗下次再試
    return loading;
  }
  let byTax = new Map();
  /** 名單上的客戶：統編 → 這家最近得標的那一列（沒有回 null） */
  const lookup = (taxId) => byTax.get(String(taxId || '').replace(/\D/g, '')) || null;

  let starting = null;
  function start() {
    if (starting) return starting;
    starting = (async () => {
      build();
      $('#pcc-loading').hidden = false;
      $('#pcc-loading').textContent = '下載資料…';
      try { await ensureData(); }
      catch (err) {
        $('#pcc-loading').hidden = true;
        $('#pcc-empty').hidden = false;
        if (!err.noIndex) { $('#pcc-empty').textContent = `資料下載失敗：${err.message}`; return; }
        $('#pcc-empty').textContent = '還沒有抓好的資料。GitHub Actions 每天清晨會自動抓前一天的決標公告，也可以到 repo 的 Actions 頁手動執行「每日政府標案得標」。';
        return;
      }
      $('#pcc-loading').hidden = true;
      $('#pcc-sub').textContent = `${(index.cities || []).join('、')}最近 ${index.days || ''} 天得標的廠商 ${Number(index.total || 0).toLocaleString()} 家（有電話 ${Number(index.withPhone || 0).toLocaleString()}）　·　資料到 ${index.latestDate || ''}，上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}`;
      $('#pcc-loading').hidden = true;
      ready = true;
      if (global.Chattel && global.Chattel.ensureData) global.Chattel.ensureData().then(() => { if (ready) render(); }).catch(() => {});   // 動保載好才知道誰跟同業借（利率不敏感）
      const rerender = () => { limit = PAGE; render(); };
      $('#pcc-sort').onchange = rerender;
      ['#pcc-capMin', '#pcc-capMax'].forEach((s) => { $(s).oninput = rerender; });
      let qt = null;
      $('#pcc-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
      $('#pcc-more').onclick = () => { limit += PAGE; render(); };
      $('#pcc-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
      // 預設篩成最值得打的那批：資本額 300～6,000 萬、公司登記、我的分公司。電話不預設篩（公告裡多半有，沒有的也留著）
      const defaults = () => {
        Object.values(f).forEach((v) => { if (v instanceof Set) v.clear(); }); f.q = ''; rateDefault().forEach((k) => f.rate.add(k));
        f.org.add('company'); f.branches.add(myBranch());
        $('#pcc-q').value = ''; $('#pcc-capMin').value = '300'; $('#pcc-capMax').value = '6000'; $('#pcc-sort').value = 'capital'; showHidden = false;
      };
      $('#pcc-reset').onclick = () => { defaults(); rerender(); };
      $('#pcc-reset').textContent = '回到預設篩選';
      defaults();
      $('#pcc-add').onclick = () => { const c = criteria(); addToList(current.filter((r) => !mineOf(r, c.cm))); };
      $('#pcc-export').onclick = () => {
        const blob = new Blob([toStandardCsv(current)], { type: 'text/csv;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `政府標案得標-${todayIso()}-${current.length}家.csv` });
        document.body.append(a); a.click(); a.remove();
      };
      render();
    })();
    return starting;
  }
  function show() {
    if (!root) root = document.getElementById('panePcc');
    if (!root) return;
    if (!starting) { start().catch((err) => { console.error(err); toast(`政府標案得標：${err.message}`); }); return; }
    render();
  }

  /*
   * 每日新名單揉合用（使用者：「除了商行那頁外其他五頁揉在一起，照總分挑但每分頁至少保底」）：
   * 這一家在這一頁看得到的訊號與排序要素，格式五頁一樣，app.js 的 dailyFeed 依統編合併成一家再算總分。
   */
  function dailyFacts(r) {
    return { key: String(r.taxId || '').replace(/\D/g, '') || String(r.name || '').replace(/\s/g, ''), name: r.name, signals: (r.regMonths != null && r.regMonths < 3) ? [`剛得標${r.amount ? `（${money(r.amount)}）` : ''}`] : [],
      ageRank: ageRankOf(r), capOk: capRank(r) === 0, phone: !!r.tel, branchRank: branchRank(r), industry: '', mobile: phoneKinds(r).has('M') };
  }
  /*
   * 「新名單」合併頁用（使用者：「除了上市櫃、商行維持獨立名單外，其餘都能合併」）：這一家在這一頁的卡片資料，
   * 六頁同一種格式（地址、資本額〔元〕、成立幾年、電話、歸屬分公司、這一頁看到的那一句），加入名單走這一頁自己的流程。
   */
  function cardFacts(r) {
    return { name: r.name, taxId: r.taxId, address: r.address, capital: r.capital || 0, years: r.years, tel: r.tel, branchKey: r.branch.key,
      info: `${r.ym ? `${ymLabel(r.ym)} ` : ''}得標${r.agency ? ` ${r.agency}` : ''}${r.tender ? `「${r.tender}」` : ''}${r.amount ? `，決標 ${money(r.amount)}` : ''}`, ym: ymIso(r.ym), add: () => addToList([r]) };
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
  global.Pcc = { show, ensureData, lookup, dailyFacts, cardFacts, factsOf, toRecord, parseYm, monthsSinceYm, whenOf, ageOf, orgOf, toStandardCsv, noteFor, dailyCandidates, DAILY_PRIORITY };
})(window);
