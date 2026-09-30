/*
 * 「出進口廠商」分頁 ＋ 補電話：經濟部國際貿易署的出進口廠商登記資料。
 *
 * 使用者：「政府採購決標公告、出進口廠商登記這兩個做看看」。決標那條走不通（見 README），這條通，而且是唯一有電話的
 * 公開整批檔：統編、名稱、地址、代表人（中間字遮掉）、電話、傳真、原始登記日期、核發日期（最後異動）、進／出口資格。
 * 資料由 GitHub Actions 每月抓好放 leads/trade/（tools/fetch-trade.mjs，只留新北市）：
 *   trade.csv＝原始登記在最近 24 個月內的（剛開始做進出口的公司，開信用狀、押貨款正是週轉金需求）→ 這個分頁；
 *   phones.csv＝整個新北市的統編→電話 → phoneOf()，主站匯入清冊、動保、商行的名單時用統編對，對得到就直接填電話。
 * 跟客戶名單的交集跟其他分頁一樣：瀏覽器裡拿統編比對，加入走主站現成匯入流程並排好日期。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/trade/';
  const HIDDEN_KEY = 'trade-hidden-v1';
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  const WHEN = [['m3', '3 個月內'], ['m6', '3～6 個月'], ['y1', '半年～1 年'], ['y2', '1 年以上']];
  const QUAL = [['both', '進口＋出口'], ['exp', '只有出口'], ['imp', '只有進口'], ['none', '都沒有']];

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

  const parseYmd = (s) => (global.Biz && global.Biz.parseYmd ? global.Biz.parseYmd(s) : null);
  const ymd = (dt) => (dt ? `${dt.y}/${String(dt.m).padStart(2, '0')}/${String(dt.d).padStart(2, '0')}` : '');
  /** 距今幾個月（不足一個月算 0） */
  function monthsSince(dt, today) {
    const t = today || new Date();
    let n = (t.getFullYear() - dt.y) * 12 + (t.getMonth() + 1 - dt.m);
    if (t.getDate() < dt.d) n -= 1;
    return Math.max(0, n);
  }
  const whenOf = (r) => (r.firstMonths == null ? 'y2' : r.firstMonths < 3 ? 'm3' : r.firstMonths < 6 ? 'm6' : r.firstMonths < 12 ? 'y1' : 'y2');
  const qualOf = (r) => (r.imp && r.exp ? 'both' : r.exp ? 'exp' : r.imp ? 'imp' : 'none');
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
  /** trade.csv 一列 → 卡片資料 */
  function toRecord(o, today) {
    const r = {
      taxId: String(o['統編'] || '').replace(/\D/g, ''), name: o['名稱'] || '', ename: o['英文名稱'] || '',
      address: o['地址'] || '', rep: o['代表人'] || '', tel: String(o['電話'] || '').trim(), fax: String(o['傳真'] || '').trim(),
      first: parseYmd(o['原始登記日期']), issued: parseYmd(o['核發日期']),
      imp: o['進口'] === 'Y', exp: o['出口'] === 'Y',
    };
    r.firstMonths = r.first ? monthsSince(r.first, today) : null;
    r.branch = branchOf(r.address);
    r.district = r.branch.district || '';
    r.key = r.taxId;
    r.blob = [r.name, r.ename, r.taxId, r.rep, r.address, r.tel].join(' ').toLowerCase();
    return r;
  }

  /* ---------------- 補電話：統編 → 電話（phones.csv，整個新北市） ---------------- */

  let phones = null;          // Map 統編 → { tel, fax, issued }
  let phonesLoading = null;
  /** 載電話表；抓不到就當空表（補電話是加分，不能擋匯入） */
  function ensurePhones() {
    if (phones) return Promise.resolve(phones);
    if (phonesLoading) return phonesLoading;
    phonesLoading = (async () => {
      const m = new Map();
      try {
        let key = Date.now();
        try { const ir = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' }); if (ir.ok) key = (await ir.json()).generatedAt || key; } catch (e) { /* 沒 index 就照抓 */ }
        const res = await fetch(`${DATA_BASE}phones.csv?t=${key}`, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const table = parseCsv(await res.text());
        const head = table[0] || [];
        const ti = head.indexOf('統編'); const pi = head.indexOf('電話'); const fi = head.indexOf('傳真'); const di = head.indexOf('核發日期');
        if (ti < 0 || pi < 0) throw new Error('表頭對不上');
        table.slice(1).forEach((c) => { const tax = String(c[ti] || '').replace(/\D/g, ''); if (tax.length === 8) m.set(tax, { tel: String(c[pi] || '').trim(), fax: fi < 0 ? '' : String(c[fi] || '').trim(), issued: di < 0 ? '' : String(c[di] || '').trim() }); });
      } catch (err) { console.warn('出進口廠商電話表載不到', err); }
      phones = m;
      return m;
    })();
    return phonesLoading;
  }
  /** 這個統編在出進口廠商登記裡的電話；沒有回 null */
  async function phoneOf(taxId) {
    const tax = String(taxId || '').replace(/\D/g, '');
    if (tax.length !== 8) return null;
    const m = await ensurePhones();
    const p = m.get(tax);
    return p && (p.tel || p.fax) ? p : null;
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
  const f = { branches: new Set(), districts: new Set(), when: new Set(), qual: new Set(), phone: new Set(), mine: new Set(), q: '' };
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };

  const criteria = () => ({ terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean), cm: customerMap() });
  function passes(r, c, except) {
    return (except === 'branches' || !f.branches.size || f.branches.has(r.branch.key))
      && (except === 'districts' || !f.districts.size || f.districts.has(r.district))
      && (except === 'when' || !f.when.size || f.when.has(whenOf(r)))
      && (except === 'qual' || !f.qual.size || f.qual.has(qualOf(r)))
      && (except === 'phone' || !f.phone.size || f.phone.has(r.tel ? 'Y' : 'N'))
      && (except === 'mine' || !f.mine.size || f.mine.has(mineKey(r, c.cm)))
      && (showHidden || !hidden.has(r.key))
      && c.terms.every((t) => r.blob.includes(t));
  }
  function visible(c) {
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#trade-sort').value;
    const k = (dt) => (dt ? `${dt.y}${String(dt.m).padStart(2, '0')}${String(dt.d).padStart(2, '0')}` : '0');
    list.sort((a, b) => (sort === 'issued' ? k(b.issued).localeCompare(k(a.issued)) || k(b.first).localeCompare(k(a.first))
      : sort === 'name' ? a.name.localeCompare(b.name, 'zh-Hant')
        : k(b.first).localeCompare(k(a.first)) || k(b.issued).localeCompare(k(a.issued))));
    return list;
  }

  /* ---------------- 畫面 ---------------- */

  const findbiz = (taxId, text) => el('a', { href: `https://findbiz.nat.gov.tw/fts/query/QueryList/queryList.do?qryCond=${encodeURIComponent(taxId)}&infoType=D&qryType=cmpyType&cmpyType=true&brCmpyType=true&busmType=true&factType=true&lmtdType=true&isAlive=all`, target: '_blank', rel: 'noopener', textContent: text, title: '商工登記公示資料：用統編查' });
  const whenLabel = (r) => (r.firstMonths == null ? '' : r.firstMonths < 1 ? '這個月' : r.firstMonths < 12 ? `${r.firstMonths} 個月前` : `${Math.floor(r.firstMonths / 12)} 年${r.firstMonths % 12 ? `${r.firstMonths % 12} 個月` : ''}前`);

  function card(r, c) {
    const mine = mineOf(r, c.cm);
    const isHidden = hidden.has(r.key);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [findbiz(r.taxId, r.name)]),
      r.firstMonths != null && r.firstMonths < 6 ? el('span', { className: 'badge badge-up', textContent: '新登記', title: '原始登記在 6 個月內：剛開始做進出口' }) : '',
      el('span', { className: 'badge badge-ind', textContent: QUAL.find(([k]) => k === qualOf(r))[1] }),
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}` })) : '',
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      r.tel ? el('span', {}, ['📞 ', el('a', { href: `tel:${r.tel.replace(/[^\d+#]/g, '')}`, textContent: r.tel })]) : el('span', { className: 'muted', textContent: '📞 登記上沒有電話' }),
      r.fax ? el('span', { textContent: `📠 ${r.fax}` }) : '',
      r.rep ? el('span', { textContent: `👤 代表人 ${r.rep}`, title: '貿易署公開檔把中間字遮掉' }) : '',
      r.first ? el('span', { textContent: `🛳 原始登記 ${ymd(r.first)}（${whenLabel(r)}）` }) : '',
      r.issued && (!r.first || ymd(r.issued) !== ymd(r.first)) ? el('span', { textContent: `🔁 最近異動 ${ymd(r.issued)}` }) : '',
      r.ename ? el('span', { className: 'muted', textContent: r.ename }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      el('span', { textContent: `#${r.taxId}` }),
    ]);
    const actions = el('div', { className: 'card-actions' }, [
      mine ? '' : el('button', { className: 'btn btn-tiny btn-primary trade-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
      isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(r.key); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny trade-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(r.key); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    return el('article', { className: `card leads-card trade-card${r.branch.key === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, meta, actions]);
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
    chips($('#trade-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    const dc = count('districts', (r) => r.district);
    const dkeys = [...new Set([...dc.keys(), ...f.districts])].sort((a, b) => (dc.get(b) || 0) - (dc.get(a) || 0));
    chips($('#trade-fDistrict'), dkeys.map((k) => [k, k, dc.get(k) || 0]), f.districts);
    chips($('#trade-fWhen'), WHEN.map(([k, label]) => [k, label, facet('when', (r) => whenOf(r) === k)]), f.when);
    chips($('#trade-fQual'), QUAL.map(([k, label]) => [k, label, facet('qual', (r) => qualOf(r) === k)]), f.qual);
    chips($('#trade-fPhone'), [['Y', '有電話'], ['N', '沒電話']].map(([k, label]) => [k, label, facet('phone', (r) => (r.tel ? 'Y' : 'N') === k)]), f.phone);
    chips($('#trade-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#trade-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const fresh = current.filter((r) => !mineOf(r, c.cm)).length;
    $('#trade-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">${current.length - fresh ? `　／ 其中 ${current.length - fresh} 家已在名單` : ''}</span>`;
    const hid = rows.filter((r) => hidden.has(r.key)).length;
    const hb = $('#trade-hidden');
    hb.hidden = !hid;
    hb.textContent = showHidden ? `收起藏起來的 ${hid} 家` : `顯示藏起來的 ${hid} 家`;
    $('#trade-more').hidden = current.length <= limit;
    $('#trade-empty').hidden = !!current.length;
    $('#trade-empty').textContent = rows.length ? '沒有符合條件的，把篩選放寬試試。' : '';
    $('#trade-add').disabled = !fresh;
    $('#trade-add').textContent = `把篩出來的加入客戶名單${fresh ? `（${Math.min(fresh, 200)} 家）` : ''}`;
    $('#trade-export').disabled = !current.length;
    const pill = document.getElementById('countTrade');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單 ---------------- */

  function noteFor(r) {
    return [`出進口廠商登記（貿易署）：${QUAL.find(([k]) => k === qualOf(r))[1]}`, r.first ? `原始登記 ${ymd(r.first).replace(/\//g, '-')}` : '',
      r.issued && (!r.first || ymd(r.issued) !== ymd(r.first)) ? `最近異動 ${ymd(r.issued).replace(/\//g, '-')}` : '',
      r.fax ? `傳真 ${r.fax}` : '', r.ename || '', r.rep ? '代表人是貿易署公開檔（中間字遮掉），打前查商工登記' : ''].filter(Boolean).join('，');
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function toStandardCsv(list, dates) {
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.name, r.taxId, '', '', '', r.tel, r.rep || '', '', '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  const fromDate = () => { const v = $('#trade-from') && $('#trade-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm)).slice(0, 200);
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], `出進口廠商-${todayIso()}-${fresh.length}家.csv`, { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    const sorted = dates.filter(Boolean).sort();
    if (sorted.length) toast(`${fresh.length} 家排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}`);
    render();
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'trade-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。這份資料有電話，加入名單時一起帶進去。' }),
      group('歸屬分公司（同「規則」的劃分表）', el('div', { className: 'chips', id: 'trade-fBranch' })),
      group('區', el('div', { className: 'chips', id: 'trade-fDistrict' })),
      group('原始登記（開始做進出口）', el('div', { className: 'chips', id: 'trade-fWhen' })),
      group('進出口資格', el('div', { className: 'chips', id: 'trade-fQual' })),
      group('電話', el('div', { className: 'chips', id: 'trade-fPhone' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'trade-fMine' })),
      group('關鍵字', el('input', { id: 'trade-q', type: 'search', placeholder: '名稱、英文名、統編、代表人、地址、電話', autocomplete: 'off' }), 'trade-q'),
      group('排序', el('select', { id: 'trade-sort' }, [
        el('option', { value: 'first', textContent: '最新登記在前' }),
        el('option', { value: 'issued', textContent: '最近異動在前' }),
        el('option', { value: 'name', textContent: '名稱' })]), 'trade-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'trade-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'trade-hidden', type: 'button', hidden: true })]),
    ]);
    filters.open = !matchMedia('(max-width: 760px)').matches;
    root.append(
      el('p', { className: 'muted leads-sub', id: 'trade-sub', textContent: '經濟部國際貿易署的出進口廠商登記（新北市，最近兩年登記的）' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'trade-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'trade-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'trade-add', type: 'button', title: '把目前篩出來、還不在名單裡的全部送進匯入流程（一次最多 200 家）', textContent: '把篩出來的加入客戶名單' }),
          el('button', { className: 'btn', id: 'trade-export', type: 'button', textContent: '匯出 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'trade-loading', hidden: true }),
      el('div', { className: 'cards', id: 'trade-cards' }),
      el('div', { className: 'empty', id: 'trade-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'trade-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [el('span', {}, [el('i', { className: 'swatch is-up' }), ' 在我的分公司轄區'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：經濟部國際貿易署「出進口廠商登記資料」（政府資料開放平臺 79641，每日更新），GitHub Actions 每月抓，只留新北市；這個分頁列原始登記在最近兩年內的（剛開始做進出口）。代表人中間字是貿易署遮的。整個新北市的電話表另外留著：登記清冊、動產擔保、商行的名單加進來時，用統編對得到就自動填電話。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳。' }),
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
        $('#trade-empty').hidden = false;
        $('#trade-empty').textContent = '還沒有抓好的資料。GitHub Actions 每月會自動抓，也可以到 repo 的 Actions 頁手動執行「每月出進口廠商」。';
        return;
      }
      $('#trade-sub').textContent = `${(index.cities || []).join('、')}的出進口廠商 ${Number(index.total || 0).toLocaleString()} 家（有電話 ${Number(index.withPhone || 0).toLocaleString()}）　·　這裡列原始登記在最近 ${index.months || 24} 個月內的 ${Number(index.recent || 0).toLocaleString()} 家　·　貿易署檔案 ${String(index.lastModified || '').replace(/^\w+, /, '').slice(0, 11)}，上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}`;
      $('#trade-loading').hidden = false;
      $('#trade-loading').textContent = '下載資料…';
      try {
        const csvRes = await fetch(`${DATA_BASE}trade.csv?t=${index.generatedAt}`, { cache: 'force-cache' });
        if (!csvRes.ok) throw new Error(`trade.csv：HTTP ${csvRes.status}`);
        const table = parseCsv(await csvRes.text());
        const head = table[0] || [];
        table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(toRecord(o)); });
      } catch (err) {
        $('#trade-loading').hidden = true;
        $('#trade-empty').hidden = false;
        $('#trade-empty').textContent = `資料下載失敗：${err.message}`;
        return;
      }
      $('#trade-loading').hidden = true;
      ready = true;
      const rerender = () => { limit = PAGE; render(); };
      $('#trade-sort').onchange = rerender;
      let qt = null;
      $('#trade-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
      $('#trade-more').onclick = () => { limit += PAGE; render(); };
      $('#trade-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
      $('#trade-reset').onclick = () => {
        Object.values(f).forEach((v) => { if (v instanceof Set) v.clear(); }); f.q = '';
        $('#trade-q').value = ''; $('#trade-sort').value = 'first'; showHidden = false;
        rerender();
      };
      $('#trade-add').onclick = () => { const c = criteria(); addToList(current.filter((r) => !mineOf(r, c.cm))); };
      $('#trade-export').onclick = () => {
        const blob = new Blob([toStandardCsv(current)], { type: 'text/csv;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `出進口廠商-${todayIso()}-${current.length}家.csv` });
        document.body.append(a); a.click(); a.remove();
      };
      render();
    })();
    return starting;
  }
  /** 主站切到這個分頁時呼叫：第一次載資料，之後重比對名單 */
  function show() {
    if (!root) root = document.getElementById('paneTrade');
    if (!root) return;
    if (!starting) { start().catch((err) => { console.error(err); toast(`出進口廠商：${err.message}`); }); return; }
    render();
  }

  global.Trade = { show, toRecord, monthsSince, whenOf, qualOf, toStandardCsv, noteFor, phoneOf, ensurePhones };
})(window);
