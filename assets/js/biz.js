/*
 * 「商行／企業社」分頁：財政部營業（稅籍）登記裡的獨資、合夥，做企金推廣的名單。
 *
 * 使用者：「我想找商行或企業社的老闆做企金推廣，可以怎麼找名單」。
 * 資料由 GitHub Actions 每月抓好放在 leads/biz/（tools/fetch-biz.mjs：新北市、獨資／合夥、資本額 50 萬以上）；
 * 這裡只讀、篩、畫。稅籍資料沒有負責人，有查到商業登記的才有；電話一律沒有（打前用 104 或 Google）。
 * 跟客戶名單的交集跟其他分頁一樣：瀏覽器裡拿統編比對，加入走主站現成匯入流程並排好日期。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/biz/';
  const HIDDEN_KEY = 'biz-hidden-v1';
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
  const f = { branches: new Set(), districts: new Set(), orgs: new Set(), ages: new Set(), inds: new Set(), mine: new Set(), invoice: new Set(), q: '' };
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
      && (except === 'mine' || !f.mine.size || f.mine.has(mineKey(r, c.cm)))
      && r.capital >= c.min && r.capital <= c.max
      && (showHidden || !hidden.has(r.key))
      && c.terms.every((t) => r.blob.includes(t));
  }
  function visible(c) {
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#biz-sort').value;
    const setupKey = (r) => (r.setup ? `${r.setup.y}${String(r.setup.m).padStart(2, '0')}${String(r.setup.d).padStart(2, '0')}` : '0');
    list.sort((a, b) => (sort === 'newest' ? setupKey(b).localeCompare(setupKey(a)) || b.capital - a.capital
      : sort === 'name' ? a.name.localeCompare(b.name, 'zh-Hant')
        : (b.reg ? 1 : 0) - (a.reg ? 1 : 0) || b.capital - a.capital || setupKey(b).localeCompare(setupKey(a))));   // 只有稅籍登記的資本額不可信，排後面
    return list;
  }

  /* ---------------- 畫面 ---------------- */

  /* 商業（獨資／合夥）在 findbiz 的頁面是 /fts/business/統編/序號，序號（banKey）稅籍與清冊都沒有，湊不出直達連結；
   * /fts/company/統編 是公司用的，商業開不到（使用者回報）。改連查詢結果頁，帶統編當條件（欄位照 findbiz 查詢表單），
   * 點結果那一列就是商業登記頁。findbiz 有 Cloudflare，開發環境與 Actions 都連不到，這條是使用者實際點過確認的。 */
  const findbiz = (taxId, text) => el('a', { href: `https://findbiz.nat.gov.tw/fts/query/QueryList/queryList.do?qryCond=${encodeURIComponent(taxId)}&infoType=D&qryType=cmpyType&cmpyType=true&brCmpyType=true&busmType=true&factType=true&lmtdType=true&isAlive=all`, target: '_blank', rel: 'noopener', textContent: text, title: '商工登記公示資料：用統編查商業登記' });

  function card(r, c) {
    const mine = mineOf(r, c.cm);
    const isHidden = hidden.has(r.key);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [r.reg ? findbiz(r.taxId, r.name) : el('span', { textContent: r.name, title: '只有稅籍登記，商工登記查不到' })]),
      el('span', { className: 'badge badge-new', textContent: r.org }),
      r.reg ? '' : el('span', { className: 'badge badge-own', textContent: '只有稅籍登記', title: '沒辦商業登記（小規模營業人可免辦）：商工登記查不到、沒有負責人，資本額是稅籍上自己填的' }),
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      r.invoice ? el('span', { className: 'badge badge-ind', textContent: '開發票' }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}` })) : '',
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      el('span', { textContent: `💰 資本額 ${money(r.capital)}${r.reg ? '' : '（稅籍自填）'}` }),
      r.setup ? el('span', { textContent: `🎂 設立 ${r.setup.y}/${String(r.setup.m).padStart(2, '0')}（${r.years} 年）` }) : el('span', { className: 'muted', textContent: '🎂 設立不明' }),
      r.owner ? el('span', { textContent: `👤 負責人 ${r.owner}` }) : '',
      r.inds.length ? el('span', { textContent: `🏭 ${r.inds.join('、')}` }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      el('span', { textContent: `#${r.taxId}` }),
    ]);
    const actions = el('div', { className: 'card-actions' }, [
      mine ? '' : el('button', { className: 'btn btn-tiny btn-primary biz-add-one', type: 'button', textContent: '加入客戶名單', onclick: () => addToList([r]) }),
      isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(r.key); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny biz-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(r.key); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    return el('article', { className: `card leads-card biz-card${r.branch.key === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, meta, actions]);
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
    const count = (except, keyOf) => { const m = new Map(); rows.forEach((r) => { if (!passes(r, c, except)) return; (Array.isArray(keyOf(r)) ? keyOf(r) : [keyOf(r)]).forEach((k) => { if (k) m.set(k, (m.get(k) || 0) + 1); }); }); return m; };
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
    const hid = rows.filter((r) => hidden.has(r.key)).length;
    const hb = $('#biz-hidden');
    hb.hidden = !hid;
    hb.textContent = showHidden ? `收起藏起來的 ${hid} 家` : `顯示藏起來的 ${hid} 家`;
    $('#biz-more').hidden = current.length <= limit;
    $('#biz-empty').hidden = !!current.length;
    $('#biz-empty').textContent = rows.length ? '沒有符合條件的，把篩選放寬試試。' : '';
    $('#biz-add').disabled = !fresh;
    $('#biz-add').textContent = `把篩出來的加入客戶名單${fresh ? `（${Math.min(fresh, 200)} 家）` : ''}`;
    $('#biz-export').disabled = !current.length;
    const pill = document.getElementById('countBiz');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單 ---------------- */

  function noteFor(r) {
    return [`商行／企業社（稅籍登記）：${r.org}`, `資本額 ${money(r.capital)}${r.reg ? '' : '（稅籍自填）'}`, r.setup ? `設立 ${r.setup.y}-${String(r.setup.m).padStart(2, '0')}-${String(r.setup.d).padStart(2, '0')}` : '',
      r.inds.length ? `行業 ${r.inds.join('、')}` : '', r.invoice ? '開統一發票' : '免用統一發票', !r.reg ? '只有稅籍登記、沒辦商業登記，資本額是稅籍自填的' : (r.owner ? '' : '負責人清冊還沒有，打前查商工登記')].filter(Boolean).join('，');
  }
  const thousands = (yuan) => (yuan ? Math.round(yuan / 1000).toLocaleString() : '');
  function toStandardCsv(list, dates) {
    const lines = [CSV_HEAD, ...list.map((r, i) => [r.name, r.taxId, '', r.setup ? String(r.setup.y) : '', thousands(r.capital), '', r.owner || '', '', r.inds[0] || '', (dates && dates[i]) || '', '', [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, todayIso(), ''])].map((row) => row.map(csvCell).join(','));
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
    const sorted = dates.filter(Boolean).sort();
    if (sorted.length) toast(`${fresh.length} 家排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}`);
    render();
  }

  /* ---------------- 每日挑選（給 app.js 的每日新名單用） ---------------- */

  // 有商業登記排最前：只有稅籍登記的沒負責人、資本額是自填的，排最後補位
  // 分公司是遠近（Rules.branchRank：我的 0 → 共同區 1 → 鄰近 2… → 其他 9），新莊挑完就接新北，不是門檻
  const DAILY_PRIORITY = ['有商業登記', '我的分公司', '設立 5 年內', '開發票', '資本額 100 萬以上'];
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  const dailyChecks = (r) => [!!r.reg, branchRank(r), ageOf(r) === 'lt5', r.invoice, r.capital >= 1000000];
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return b.capital - a.capital;
  }
  /** 「符合：…」那串；分公司放寬到鄰近的也寫出來 */
  const whyOf = (r, hitAt) => {
    const hit = DAILY_PRIORITY.filter((_, i) => hitAt(i));
    const rk = r._checks[DAILY_PRIORITY.indexOf('我的分公司')];
    const relax = rk > 0 && rk < 9 ? `分公司放寬到 ${r.branch.key}` : '';
    return [hit.length ? `符合：${hit.join('、')}` : '基準都不符，補位', relax].filter(Boolean).join('；');
  };
  async function dailyCandidates() {
    if (!root) root = document.getElementById('paneBiz');
    if (!root) return [];
    await start();
    if (!ready) return [];
    const cm = customerMap();
    return rows.filter((r) => !mineOf(r, cm) && !hidden.has(r.key))
      .map((r) => { r._checks = dailyChecks(r); r._why = whyOf(r, (i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : r._checks[i])); return r; })
      .sort(dailyCompare);
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'biz-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。稅籍資料沒有電話，打前用 104 或 Google 查。' }),
      group('歸屬分公司（同「規則」的劃分表）', el('div', { className: 'chips', id: 'biz-fBranch' })),
      group('區', el('div', { className: 'chips', id: 'biz-fDistrict' })),
      group('組織別', el('div', { className: 'chips', id: 'biz-fOrg' })),
      group('設立', el('div', { className: 'chips', id: 'biz-fAge' })),
      group('統一發票', el('div', { className: 'chips', id: 'biz-fInvoice' })),
      group('行業（最多的 24 種；其他用關鍵字）', el('div', { className: 'chips', id: 'biz-fInd' })),
      group('跟我的名單比對', el('div', { className: 'chips', id: 'biz-fMine' })),
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
    filters.open = !matchMedia('(max-width: 760px)').matches;
    root.append(
      el('p', { className: 'muted leads-sub', id: 'biz-sub', textContent: '財政部營業（稅籍）登記裡的商行、企業社（獨資、合夥）' }),
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
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'biz-loading', hidden: true }),
      el('div', { className: 'cards', id: 'biz-cards' }),
      el('div', { className: 'empty', id: 'biz-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'biz-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [el('span', {}, [el('i', { className: 'swatch is-up' }), ' 在我的分公司轄區'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：財政部財政資訊中心「全國營業（稅籍）登記資料」（每月更新），只留新北市、獨資或合夥、資本額 50 萬以上、非分公司；GitHub Actions 每月抓。負責人與正式資本額來自新北市商業登記清冊；「只有稅籍登記」的是沒辦商業登記的（小規模營業人可免辦），商工登記查不到、資本額是自填的。電話一律沒有。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳。' }),
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
      $('#biz-sub').textContent = `${(index.cities || []).join('、')}的商行、企業社 ${Number(index.total || 0).toLocaleString()} 家（獨資 ${(index.byOrg || {})['獨資'] || 0}、合夥 ${(index.byOrg || {})['合夥'] || 0}）　·　資本額 ${money(index.minCapital || 0)} 以上　·　稅籍資料 ${index.fileDate || ''}，上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}${index.withOwner ? `　·　查到負責人的 ${index.withOwner} 家` : ''}`;
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
      ready = true;
      const rerender = () => { limit = PAGE; render(); };
      ['#biz-capMin', '#biz-capMax'].forEach((s) => { $(s).oninput = rerender; });
      $('#biz-sort').onchange = rerender;
      let qt = null;
      $('#biz-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
      $('#biz-more').onclick = () => { limit += PAGE; render(); };
      $('#biz-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
      $('#biz-reset').onclick = () => {
        Object.values(f).forEach((v) => { if (v instanceof Set) v.clear(); }); f.q = '';
        $('#biz-q').value = ''; $('#biz-capMin').value = ''; $('#biz-capMax').value = ''; $('#biz-sort').value = 'capital'; showHidden = false;
        rerender();
      };
      $('#biz-add').onclick = () => { const c = criteria(); addToList(current.filter((r) => !mineOf(r, c.cm))); };
      $('#biz-export').onclick = () => {
        const blob = new Blob([toStandardCsv(current)], { type: 'text/csv;charset=utf-8' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `商行企業社-${todayIso()}-${current.length}家.csv` });
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

  global.Biz = { show, toRecord, toStandardCsv, noteFor, money, parseYmd, yearsSince, ageOf, dailyCandidates, DAILY_PRIORITY };
})(window);
