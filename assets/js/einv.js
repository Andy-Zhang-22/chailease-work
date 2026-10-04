/*
 * 「剛開電子發票」分頁：財政部「導入電子發票營業人清單」。
 *
 * 使用者：「幫我找一下像健保這樣的資料，還有沒有成立公司必要的指標？」→ 探路（見 README）找到這份：開始開電子發票
 * ＝真的在營運、有進銷項，是「成立之後開始做生意」的腳印。清單本身沒有日期，誰是剛導入的是抓資料的腳本自己記的
 * （首見年月：第一次出現在清單的月份；第一次抓的那個月是起算月，那批只知道「起算時已導入」）。
 * 資料由 GitHub Actions 每月抓好放 leads/einv/（tools/fetch-einv.mjs，只留新北市、臺北市；剛導入的全留，其餘留成立幾年內的）：
 *   einv.csv：統編,名稱,屬性,地址,首見年月,設立日期,組織別,資本額,行業代號,行業,開發票,電話
 *   設立日期、組織別、資本額、行業是對財政部稅籍檔來的（資本額是稅籍上登記的）；電話是對貿易署的出進口廠商電話表填的。
 * 跟客戶名單的交集跟其他分頁一樣：瀏覽器裡拿統編比對，加入走主站現成匯入流程並排好日期。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/einv/';
  const HIDDEN_KEY = 'einv-hidden-v1';
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  const WHEN = [['new', '剛導入（這個月）'], ['m3', '3 個月內'], ['m6', '3～6 個月'], ['old', '半年以上'], ['base', '起算時就已導入']];
  const KIND = [['B2B', 'B2B（開給公司）'], ['B2C', 'B2C（開給消費者）']];
  const AGE = [['lt1', '未滿 1 年（新公司）'], ['lt5', '1～5 年'], ['5to10', '5～10 年'], ['ge10', '10 年以上'], ['unknown', '不明']];
  const ORG = [['company', '公司'], ['biz', '商行／企業社'], ['other', '其他']];

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

  const parseAnyDate = (s) => (global.Biz && global.Biz.parseAnyDate ? global.Biz.parseAnyDate(s) : null);
  const yearsSince = (dt, today) => (global.Biz && global.Biz.yearsSince ? global.Biz.yearsSince(dt, today) : null);
  const money = (n) => (global.Biz && global.Biz.money ? global.Biz.money(n) : String(n));
  const thousands = (yuan) => (yuan ? Math.round(yuan / 1000).toLocaleString() : '');
  const ageOf = (r) => (!r.founded ? 'unknown' : r.years < 1 ? 'lt1' : r.years < 5 ? 'lt5' : r.years < 10 ? '5to10' : 'ge10');
  const orgOf = (r) => (/公司$/.test(r.name) ? 'company' : /(商行|企業社|工作室|商號|工程行|行|社)$/.test(r.name) ? 'biz' : 'other');
  /** 首見年月 202510／2025-10 → { y, m } */
  function parseYm(s) {
    const t = String(s || '').replace(/\D/g, '');
    if (t.length === 6) return { y: +t.slice(0, 4), m: +t.slice(4) };
    if (t.length === 5) return { y: +t.slice(0, 3) + 1911, m: +t.slice(3) };
    return null;
  }
  const ymLabel = (ym) => (ym ? `${ym.y}/${String(ym.m).padStart(2, '0')}` : '');
  /** 首見年月距今幾個月（同一個月＝0） */
  const monthsSinceYm = (ym, today) => { const t = today || new Date(); return Math.max(0, (t.getFullYear() - ym.y) * 12 + (t.getMonth() + 1 - ym.m)); };
  const whenOf = (r) => (!r.isNew || r.firstMonths == null ? 'base' : r.firstMonths < 1 ? 'new' : r.firstMonths < 3 ? 'm3' : r.firstMonths < 6 ? 'm6' : 'old');
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
  /** einv.csv 一列 → 卡片資料 */
  /** einv.csv 一列 → 卡片資料；baseline＝起算月（index.json），首見晚於起算月的才是「剛導入」 */
  function toRecord(o, today, baseline) {
    const r = {
      taxId: String(o['統編'] || '').replace(/\D/g, ''), name: String(o['名稱'] || '').trim(), kind: String(o['屬性'] || '').trim(),
      address: String(o['地址'] || '').trim(), indCode: String(o['行業代號'] || '').trim(), industry: String(o['行業'] || '').trim(),
      org: String(o['組織別'] || '').trim(), invoice: String(o['開發票'] || '').trim(),
      tel: String(o['電話'] || '').trim(),
      founded: parseAnyDate(o['設立日期']),
      ym: parseYm(o['首見年月']),
      capital: Number(String(o['資本額'] || '').replace(/\D/g, '')) || 0,   // 元；稅籍上登記的，0＝稅籍檔沒對到
    };
    const base = String(baseline || '').replace(/\D/g, '');
    r.isNew = !!(r.ym && base && `${r.ym.y}${String(r.ym.m).padStart(2, '0')}` > base);
    r.years = r.founded ? yearsSince(r.founded, today) : null;
    r.firstMonths = r.ym ? monthsSinceYm(r.ym, today) : null;
    r.branch = branchOf(r.address);
    r.district = r.branch.district || '';
    r.key = r.taxId || r.name;
    r.blob = [r.name, r.taxId, r.address, r.industry, r.tel, r.kind, r.org].join(' ').toLowerCase();
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
  const f = { rate: new Set(rateDefault()), branches: new Set(), districts: new Set(), when: new Set(), ages: new Set(), org: new Set(), kind: new Set(), phone: new Set(), mine: new Set(), q: '' };
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };

  const criteria = () => ({ min: (Number($('#einv-capMin').value) || 0) * 1e4, max: (Number($('#einv-capMax').value) || 0) * 1e4 || Infinity, terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean), cm: customerMap() });
  function passes(r, c, except) {
    return (except === 'branches' || !f.branches.size || f.branches.has(r.branch.key))
      && (except === 'districts' || !f.districts.size || f.districts.has(r.district))
      && (except === 'when' || !f.when.size || f.when.has(whenOf(r)))
      && (except === 'ages' || !f.ages.size || f.ages.has(ageOf(r)))
      && (except === 'org' || !f.org.size || f.org.has(orgOf(r)))
      && (except === 'kind' || !f.kind.size || f.kind.has(r.kind))
      && (except === 'cap' || ((c.min <= 0 && c.max === Infinity) || (r.capital >= c.min && r.capital <= c.max)))   // 沒設門檻時沒查到資本額的也列
      && (except === 'rate' || !f.rate.size || f.rate.has(rateKey(r)))
      && (except === 'phone' || !f.phone.size || [...f.phone].some((k) => phoneKinds(r).has(k)))
      && (except === 'mine' || !f.mine.size || f.mine.has(mineKey(r, c.cm)))
      && (showHidden || !(hidden.has(r.key) || deletedOf(r.name, r.taxId)))
      && c.terms.every((t) => r.blob.includes(t));
  }
  const ymKey = (ym) => (ym ? `${ym.y}${String(ym.m).padStart(2, '0')}` : '0');
  const dtKey = (dt) => (dt ? `${dt.y}${String(dt.m).padStart(2, '0')}${String(dt.d).padStart(2, '0')}` : '0');
  function visible(c) {
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#einv-sort').value;
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
  function phoneBox(r, key, hasAuto) {
    if (hasAuto) return '';
    const stop = (e) => e.stopPropagation();
    const input = el('input', { type: 'tel', className: 'phone-paste', placeholder: '找到電話貼這裡，加入時一起帶', autocomplete: 'off', value: typed.get(key) || '', onclick: stop });
    input.oninput = () => { const v = input.value.trim(); if (v) typed.set(key, v); else typed.delete(key); };
    return el('div', { className: 'card-actions phone-search', onclick: stop }, [
      el('span', { className: 'muted', textContent: '找電話：' }),
      ...(typeof global.phoneSearchLinks === 'function' ? global.phoneSearchLinks(r.name, r.address) : []),
      input,
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
  const whenText = (r) => (r.firstMonths == null ? '' : r.firstMonths < 1 ? '這個月' : `${r.firstMonths} 個月前`);
  const baseLabel = () => ymLabel(parseYm(index && index.baseline));

  function card(r, c) {
    const mine = mineOf(r, c.cm);
    const isHidden = hidden.has(r.key) || deletedOf(r.name, r.taxId);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [findbiz(r.taxId, r.name), copyName(r.name)]),
      r.isNew && r.firstMonths != null && r.firstMonths < 3 ? el('span', { className: 'badge badge-up', textContent: '剛開電子發票', title: '最近 3 個月才出現在財政部的導入電子發票營業人清單' }) : '',
      r.kind ? el('span', { className: 'badge badge-ind', textContent: r.kind, title: r.kind === 'B2B' ? '開給公司的電子發票（做企業生意）' : '開給消費者的電子發票' }) : '',
      r.isNew && r.years != null && r.years >= 1 ? el('span', { className: 'badge badge-ind', textContent: `成立 ${r.years} 年才導入`, title: '老公司最近才開始開電子發票' }) : '',
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.addedDate ? `・${mmdd(mine.addedDate)} 加入` : ''}${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}`, title: '哪天加進名單的（名單新增日期）；點一下打開名單上這一筆', onclick: () => { if (typeof global.openCustomer === 'function') global.openCustomer(mine.id); } })) : '',
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      r.tel ? el('span', {}, ['📞 ', el('a', { href: `tel:${r.tel.replace(/[^\d+#]/g, '')}`, textContent: r.tel }), el('small', { className: 'muted', textContent: isMobile(r.tel) ? '（出進口登記，手機，多半是老闆本人）' : '（出進口登記）' })]) : el('span', { className: 'muted', textContent: '📞 清單沒有電話' }),
      r.industry ? el('span', { textContent: `🏷 ${r.industry}${r.indCode ? ` (${r.indCode})` : ''}` }) : '',
      r.capital ? el('span', { textContent: `💰 資本額 ${money(r.capital)}${r.org ? `・${r.org}` : ''}`, title: '稅籍上登記的資本額與組織別' }) : el('span', { className: 'muted', textContent: '💰 稅籍檔沒對到' }),
      r.founded ? el('span', { textContent: `🎂 成立 ${r.founded.y}/${String(r.founded.m).padStart(2, '0')}（${r.years} 年）` }) : el('span', { className: 'muted', textContent: '🎂 成立日不明' }),
      r.ym ? el('span', { textContent: r.isNew ? `🧾 ${ymLabel(r.ym)} 出現在導入名單（${whenText(r)}）` : `🧾 起算（${ymLabel(r.ym)}）時已導入電子發票`, title: '財政部導入電子發票營業人清單：第一次出現在清單的月份（清單本身沒有日期，是抓資料時記的）' }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      r.taxId ? el('span', { textContent: `#${r.taxId}` }) : '',
    ]);
    const actions = el('div', { className: 'card-actions' }, [
      mine ? '' : el('button', { className: 'btn btn-tiny btn-primary einv-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
      deletedOf(r.name, r.taxId) ? restoreBtn(r.name, r.taxId) : isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(r.key); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny einv-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(r.key); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    return el('article', { className: `card leads-card einv-card${r.branch.key === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, meta, mine ? '' : phoneBox(r, r.key, !!r.tel), actions]);
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
    chips($('#einv-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    const dc = count('districts', (r) => r.district);
    const dkeys = [...new Set([...dc.keys(), ...f.districts])].sort((a, b) => (dc.get(b) || 0) - (dc.get(a) || 0));
    chips($('#einv-fDistrict'), dkeys.map((k) => [k, k, dc.get(k) || 0]), f.districts);
    chips($('#einv-fWhen'), WHEN.map(([k, label]) => [k, label, facet('when', (r) => whenOf(r) === k)]), f.when);
    chips($('#einv-fAge'), AGE.map(([k, label]) => [k, label, facet('ages', (r) => ageOf(r) === k)]), f.ages);
    chips($('#einv-fOrg'), ORG.map(([k, label]) => [k, label, facet('org', (r) => orgOf(r) === k)]), f.org);
    chips($('#einv-fKind'), KIND.map(([k, label]) => [k, label, facet('kind', (r) => r.kind === k)]), f.kind);
    chips($('#einv-fRate'), [['Y', '利率不敏感'], ['N', '其他']].map(([k, label]) => [k, label, facet('rate', (r) => rateKey(r) === k)]), f.rate);
    chips($('#einv-fPhone'), [['Y', '有電話'], ['M', '手機'], ['N', '沒電話']].map(([k, label]) => [k, label, facet('phone', (r) => phoneKinds(r).has(k))]), f.phone);
    chips($('#einv-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#einv-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const fresh = current.filter((r) => !mineOf(r, c.cm)).length;
    $('#einv-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">${current.length - fresh ? `　／ 其中 ${current.length - fresh} 家已在名單` : ''}</span>`;
    const del = rows.filter((r) => deletedOf(r.name, r.taxId)).length;
    const hid = rows.filter((r) => hidden.has(r.key)).length + del;
    const hb = $('#einv-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    $('#einv-more').hidden = current.length <= limit;
    $('#einv-empty').hidden = !!current.length;
    $('#einv-empty').textContent = rows.length ? '沒有符合條件的，把篩選放寬試試。' : '';
    $('#einv-add').disabled = !fresh;
    $('#einv-add').textContent = `把篩出來的加入客戶名單${fresh ? `（${Math.min(fresh, 200)} 家）` : ''}`;
    $('#einv-export').disabled = !current.length;
    const pill = document.getElementById('countEinv');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單 ---------------- */

  function noteFor(r) {
    return [`電子發票 ${r.ym ? `${r.ym.y}-${String(r.ym.m).padStart(2, '0')}` : ''}（財政部導入電子發票營業人清單：${r.isNew ? '剛導入' : '起算時已導入'}${r.kind ? `，${r.kind}` : ''}）`.replace(' （', '（'),
      r.industry ? `行業 ${r.industry}` : '', r.capital ? `資本額 ${money(r.capital)}` : '',
      r.founded ? `成立 ${r.founded.y}-${String(r.founded.m).padStart(2, '0')}-${String(r.founded.d).padStart(2, '0')}` : ''].filter(Boolean).join('，');
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function toStandardCsv(list, dates) {
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.name, r.taxId, '', r.founded ? String(r.founded.y) : '', thousands(r.capital), r.tel || typed.get(r.key) || '', '', '', r.industry || '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  const fromDate = () => { const v = $('#einv-from') && $('#einv-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm)).slice(0, 200);
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], `剛開電子發票-${todayIso()}-${fresh.length}家.csv`, { type: 'text/csv' });
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
   * （Rules.ageRank，成交多半 7～8 年）→ 最近 3 個月才導入；全一樣最近導入的先。
   */
  const DAILY_PRIORITY = ['利率不敏感', '有電話', '資本額 500～6,000 萬', '我的分公司', '成立 6～10 年', '剛導入 3 個月內'];
  // 使用者：「每天補給我的名單優先給我加入利率不敏感的客群」——排最前面：動產擔保上跟同業（租賃／融資，不含銀行）借的，或剛開電子發票的（擴張期缺的是錢，不是便宜的錢）
  const peerOf = (id) => (global.Chattel && global.Chattel.peerLenderOf ? global.Chattel.peerLenderOf(id) : '');
  const rateFreeOf = (r) => {
    const peer = peerOf(r.taxId);
    if (peer) return `跟${peer}借`;
    if (r.isNew && r.firstMonths != null && r.firstMonths < 3) return '剛開電子發票';
    return '';
  };
  // 分頁篩選的「利率不敏感」：跟每日新名單同一套
  const rateKey = (r) => (rateFreeOf(r) ? 'Y' : 'N');
  const capRank = (r) => (r.capital >= 5000000 && r.capital <= 60000000 ? 0 : 1);
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  const ageRankOf = (r) => (global.Rules && global.Rules.ageRank ? global.Rules.ageRank(r.years) : (ageOf(r) === '5to10' ? 0 : 3));
  const dailyChecks = (r) => [!!rateFreeOf(r), !!r.tel, capRank(r), branchRank(r), ageRankOf(r), !!(r.isNew && r.firstMonths != null && r.firstMonths < 3)];
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
  async function dailyCandidates() {
    if (!root) root = document.getElementById('paneEinv');
    if (!root) return [];
    await start();
    if (!ready) return [];
    if (global.Chattel && global.Chattel.ensureData) { try { await global.Chattel.ensureData(); } catch (e) { /* 沒動保資料就不看同業 */ } }
    const cm = customerMap();
    return rows.filter((r) => !mineOf(r, cm) && !hidden.has(r.key) && !deletedOf(r.name, r.taxId))
      .map((r) => { r._checks = dailyChecks(r); r._why = whyOf(r, (i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : r._checks[i])); return r; })
      .sort(dailyCompare);
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'einv-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。預設篩資本額 500～6,000 萬、公司、我的分公司；要看全部就把數字清掉、籤按掉。「剛導入」要等起算之後下個月的資料才有。' }),
      group('歸屬分公司（同「規則」的劃分表）', el('div', { className: 'chips', id: 'einv-fBranch' })),
      group('區', el('div', { className: 'chips', id: 'einv-fDistrict' })),
      group('什麼時候導入電子發票（第一次出現在清單）', el('div', { className: 'chips', id: 'einv-fWhen' })),
      group('公司成立', el('div', { className: 'chips', id: 'einv-fAge' })),
      group('組織', el('div', { className: 'chips', id: 'einv-fOrg' })),
      group('電子發票開給誰', el('div', { className: 'chips', id: 'einv-fKind' })),
      group('利率（跟同業借、剛擴張的，比較不在乎利率）', el('div', { className: 'chips', id: 'einv-fRate' })),
      group('電話（對出進口廠商登記來的）', el('div', { className: 'chips', id: 'einv-fPhone' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'einv-fMine' })),
      group('資本額（萬元；稅籍上登記的）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'einv-capMin', type: 'number', min: '0', step: '10', placeholder: '下限' }), '～',
        el('input', { id: 'einv-capMax', type: 'number', min: '0', step: '10', placeholder: '上限' })])),
      group('關鍵字', el('input', { id: 'einv-q', type: 'search', placeholder: '名稱、統編、地址、行業、電話', autocomplete: 'off' }), 'einv-q'),
      group('排序', el('select', { id: 'einv-sort' }, [
        el('option', { value: 'capital', textContent: '資本額（高到低）' }),
        el('option', { value: 'ym', textContent: '最近導入在前' }),
        el('option', { value: 'founded', textContent: '最新成立在前' }),
        el('option', { value: 'name', textContent: '名稱' })]), 'einv-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'einv-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'einv-hidden', type: 'button', hidden: true })]),
    ]);
    // 使用者：「找名單的預設篩選畫面都先收起來，我每次點進來都要自己關」；leads-filters-open＝'1' 是預設打開（測試用）
    filters.open = (() => { try { return localStorage.getItem('leads-filters-open') === '1'; } catch (e) { return false; } })();
    root.append(
      el('p', { className: 'muted leads-sub', id: 'einv-sub', textContent: '財政部的導入電子發票營業人清單（新北市、臺北市）：剛開始開電子發票的公司' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'einv-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'einv-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'einv-add', type: 'button', title: '把目前篩出來、還不在名單裡的全部送進匯入流程（一次最多 200 家）', textContent: '把篩出來的加入客戶名單' }),
          el('button', { className: 'btn', id: 'einv-export', type: 'button', textContent: '匯出 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'einv-loading', hidden: true }),
      el('div', { className: 'cards', id: 'einv-cards' }),
      el('div', { className: 'empty', id: 'einv-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'einv-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [el('span', {}, [el('i', { className: 'swatch is-up' }), ' 在我的分公司轄區'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：財政部「導入電子發票營業人清單」（政府資料開放平臺 31869，每月；統編、名稱、B2B／B2C、地址，沒有日期），GitHub Actions 每月抓，只留新北市、臺北市，記每個統編第一次出現的月份：起算之後才出現的就是「剛導入」，起算那批只知道已導入。剛導入的全留，其餘只留成立幾年內的。設立日期、組織別、資本額、行業是對財政部稅籍檔來的；清單沒有電話，抓的時候拿統編對貿易署的出進口廠商登記填，對不到的用卡片上的「找電話」。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳。' }),
    );
  }

  let starting = null;
  function start() {
    if (starting) return starting;
    starting = (async () => {
      build();
      try {
        const res = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        index = await res.json();
      } catch (err) {
        $('#einv-empty').hidden = false;
        $('#einv-empty').textContent = '還沒有抓好的資料。GitHub Actions 每月會自動抓，也可以到 repo 的 Actions 頁手動執行「每月電子發票導入名單」。';
        return;
      }
      $('#einv-sub').textContent = `${(index.cities || []).join('、')}剛導入電子發票 ${Number(index.newTotal || 0).toLocaleString()} 家（這個月新出現 ${Number(index.newThisMonth || 0).toLocaleString()}）、成立 ${index.years || ''} 年內已導入的 ${Math.max(0, Number(index.total || 0) - Number(index.newTotal || 0)).toLocaleString()} 家（對到電話 ${Number(index.withPhone || 0).toLocaleString()}）　·　清單 ${ymLabel(parseYm(index.dataYm))}，起算 ${ymLabel(parseYm(index.baseline))}，上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}`;
      $('#einv-loading').hidden = false;
      $('#einv-loading').textContent = '下載資料…';
      try {
        const csvRes = await fetch(`${DATA_BASE}einv.csv?t=${index.generatedAt}`, { cache: 'force-cache' });
        if (!csvRes.ok) throw new Error(`einv.csv：HTTP ${csvRes.status}`);
        const table = parseCsv(await csvRes.text());
        const head = table[0] || [];
        table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(toRecord(o, undefined, index.baseline)); });
      } catch (err) {
        $('#einv-loading').hidden = true;
        $('#einv-empty').hidden = false;
        $('#einv-empty').textContent = `資料下載失敗：${err.message}`;
        return;
      }
      $('#einv-loading').hidden = true;
      ready = true;
      if (global.Chattel && global.Chattel.ensureData) global.Chattel.ensureData().then(() => { if (ready) render(); }).catch(() => {});   // 動保載好才知道誰跟同業借（利率不敏感）
      const rerender = () => { limit = PAGE; render(); };
      $('#einv-sort').onchange = rerender;
      ['#einv-capMin', '#einv-capMax'].forEach((s) => { $(s).oninput = rerender; });
      let qt = null;
      $('#einv-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
      $('#einv-more').onclick = () => { limit += PAGE; render(); };
      $('#einv-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
      // 預設篩成最值得打的那批：資本額 500～6,000 萬、公司（商行多半小）、我的分公司。電話不預設篩：這份對到電話的本來就少
      const defaults = () => {
        Object.values(f).forEach((v) => { if (v instanceof Set) v.clear(); }); f.q = ''; rateDefault().forEach((k) => f.rate.add(k));
        f.org.add('company'); f.branches.add(myBranch());
        $('#einv-q').value = ''; $('#einv-capMin').value = '500'; $('#einv-capMax').value = '6000'; $('#einv-sort').value = 'capital'; showHidden = false;
      };
      $('#einv-reset').onclick = () => { defaults(); rerender(); };
      $('#einv-reset').textContent = '回到預設篩選';
      defaults();
      $('#einv-add').onclick = () => { const c = criteria(); addToList(current.filter((r) => !mineOf(r, c.cm))); };
      $('#einv-export').onclick = () => {
        const blob = new Blob([toStandardCsv(current)], { type: 'text/csv;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `剛開電子發票-${todayIso()}-${current.length}家.csv` });
        document.body.append(a); a.click(); a.remove();
      };
      render();
    })();
    return starting;
  }
  function show() {
    if (!root) root = document.getElementById('paneEinv');
    if (!root) return;
    if (!starting) { start().catch((err) => { console.error(err); toast(`剛開電子發票：${err.message}`); }); return; }
    render();
  }

  global.Einv = { show, toRecord, parseYm, monthsSinceYm, whenOf, ageOf, orgOf, toStandardCsv, noteFor, dailyCandidates, DAILY_PRIORITY };
})(window);
