/*
 * 「上市櫃公司」分頁：上市／上櫃／興櫃公司基本資料，重點是董事長名下的投資公司。
 *
 * 使用者：「我可以透過這些上市櫃公司老闆另外持有的投資公司去給他額度」。上市櫃公司本身
 * 多半是大企部的範圍，這一頁真正要打的是老闆名下的投資／控股公司：卡片下面列出來，
 * 每一家都能「加入客戶名單」（加進去的是那家投資公司，備註寫清楚它是哪個上市櫃老闆的）。
 *
 * 資料由 GitHub Actions 每天抓好放在 leads/listed/（tools/fetch-listed.mjs 基本資料與董事長名下公司、
 * fetch-listed-daily.mjs 重大訊息與每月營收）；這裡只讀、篩、畫。使用者：「這些上市櫃名單每天都能
 * 及時更新他的動態面資訊」——每張卡片下面有「動態」：最新營收與年增、基本資料異動（董事長換人、
 * 增資、搬家…）、近期重大訊息（主旨分成資產設備／籌資／投資併購／人事…，做租賃業務最在意的那幾種）。
 * 跟客戶名單的交集跟另外兩頁一樣：瀏覽器裡拿統編比對，加入走主站現成匯入流程並排好日期。
 * 「同名同姓」是這一頁最大的陷阱：負責人查詢只能用姓名，常見名字會撈到別人的公司。
 * 「與上市公司同址」是最可靠的線索，畫面上特別標出來，篩選也有這一顆。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const DATA_BASE = 'leads/listed/';
  const HIDDEN_KEY = 'listed-hidden-v1';
  const MARKETS = ['上市', '上櫃', '興櫃'];
  const BIG_CAPITAL = 50e8;   // 使用者：實收資本額 50 億以上的企業剔除（預設藏起來，篩選裡可以打開）
  const CSV_HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];

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
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const parseCsv = (text) => (global.Leads && global.Leads.parseCsv ? global.Leads.parseCsv(text) : [[]]);

  /* ---------------- 純邏輯 ---------------- */

  /** 2012/10/01 或 20121001 → {y,m,d} */
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
  /** 實收資本額（元）→ 「77.2 億」「4,644 萬」 */
  function money(n) {
    const v = Number(n) || 0;
    if (v >= 1e8) return `${(v / 1e8).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 億`;
    return `${Math.round(v / 1e4).toLocaleString()} 萬`;
  }
  /** 商工登記的資本額是仟元（「50,000」）→ 元 */
  const thousandsToYuan = (s) => (Number(String(s || '').replace(/\D/g, '')) || 0) * 1000;

  function branchOf(address) {
    if (!global.Rules || !global.Normalize) return { key: '', label: '', kind: '', city: '' };
    const { city, district } = global.Normalize.parseAddress(address);
    const b = global.Rules.branchOf(city, district);
    const key = b.kind === 'branch' ? `${b.branches[0]}分公司`
      : b.kind === 'common' ? `${b.branches.join('／')}共同區`
      : b.kind === 'shared' ? '全公司共同區域'
      : (city ? '不在劃分表上' : '無中文地址');
    return { key, label: b.label || key, kind: b.kind, city };
  }

  function toRecord(o, owners, today) {
    const r = {
      market: o['市場別'] || '', code: o['公司代號'] || '', name: o['公司名稱'] || '', abbr: o['公司簡稱'] || '',
      taxId: (o['統一編號'] || '').replace(/\D/g, ''), industry: o['產業別'] || '', address: o['住址'] || '',
      chairman: o['董事長'] || '', gm: o['總經理'] || '', phone: o['總機電話'] || '',
      founded: parseYmd(o['成立日期']), listedOn: parseYmd(o['上市櫃日期']),
      capital: Number(String(o['實收資本額'] || '').replace(/\D/g, '')) || 0, web: o['網址'] || '',
    };
    r.years = r.founded ? yearsSince(r.founded, today) : null;
    r.branch = branchOf(r.address);
    r.others = (owners && owners[r.chairman]) || [];
    r.invest = r.others.filter((x) => x.invest);
    r.sameSpot = r.invest.filter((x) => x.sameSpot);
    r.key = r.taxId || r.code;
    r.blob = [r.code, r.name, r.abbr, r.taxId, r.chairman, r.gm, r.industry, r.address, ...r.others.map((x) => `${x.name} ${x.taxId}`)].join(' ').toLowerCase();
    return r;
  }

  /* ---------------- 動態：重大訊息分類、掛到公司上 ---------------- */

  const NEWS_DAYS = 30;      // 篩選、標記算「近期」的天數
  const CHANGE_DAYS = 90;    // 基本資料異動算「近期」的天數
  /** 重大訊息主旨 → 類別（前面的先比；租賃業務最在意設備／不動產、籌資、老闆換人） */
  const NEWS_KINDS = [
    // 更名先比：「世紀離岸風電設備…更名為…」有「設備」兩個字，不是買設備
    ['rename', '更名', (s) => /更名|名稱變更|公司名稱/.test(s)],
    ['people', '人事異動', (s) => /董事長|總經理|發言人|主管|經理人|董事|監察人|執行長|財務長|負責人/.test(s) && /異動|變更|辭|新任|解任|改選|補選|更換|任命|委任|選任|當選|逝世|接任/.test(s)],
    ['fund', '籌資', (s) => /增資|減資|發行新股|募集|公司債|籌資|聯貸|借款|融資|背書保證|資金貸與|私募|股份轉換|籌措|借貸/.test(s)],
    // 「代子公司公告取得機器設備」是子公司買設備，不是投資併購：設備、不動產先比，買賣股權的才算投資
    ['asset', '資產設備', (s) => /不動產|廠房|土地|設備|機器|建廠|廠區|興建|租賃|使用權|房屋|辦公室|倉儲/.test(s) || (/購置|購買|買賣|出售|標售|處分|取得|資產/.test(s) && !/股權|股票|股份|公司債|基金|受益憑證/.test(s))],
    ['deal', '投資併購', (s) => /股權|股票|合併|收購|分割|子公司|轉投資|投資|認購|持股|出資|合資/.test(s) && !/面額/.test(s)],
    ['meeting', '股東會股利', (s) => /股東會|除權|除息|股利|股息|配息|配股/.test(s)],
    ['ops', '營運財務', (s) => /營收|自結|財務報告|財報|盈餘|虧損|法說|法人說明|營業|訂單|接單/.test(s)],
  ];
  const KIND_LABEL = Object.fromEntries(NEWS_KINDS.map(([k, label]) => [k, label]));
  KIND_LABEL.other = '其他';
  function newsKind(subject) {
    const s = String(subject || '');
    const hit = NEWS_KINDS.find(([, , test]) => test(s));
    return hit ? hit[0] : 'other';
  }
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAgoIso = (today, n) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n); return isoOf(d); };
  /** 把重大訊息、營收、基本資料異動掛到一家公司上：r.news / r.rev / r.changes / r.dynKeys / r.active */
  function attachDyn(r, dyn, today) {
    const t = today || new Date();
    r.news = ((dyn.news && dyn.news[r.code]) || []).map((n) => ({ ...n, kind: newsKind(n.s) }));
    r.rev = (dyn.revenue && dyn.revenue[r.code]) || null;
    r.changes = (dyn.changes && dyn.changes[r.code]) || [];
    // 董監持股與設質（使用者：「能加入個別的董監事設質比嗎」）：董事長本人與每位有設質的董監
    r.pledge = (dyn.pledge && dyn.pledge[r.code]) || null;
    r.chairPledge = r.pledge ? (r.pledge.people || []).find((x) => /^董事長/.test(x.t)) || null : null;
    const newsFloor = daysAgoIso(t, NEWS_DAYS); const changeFloor = daysAgoIso(t, CHANGE_DAYS);
    const keys = new Set();
    if (r.pledge && r.pledge.pledgers > 0) keys.add('pledge');
    if (r.chairPledge && r.chairPledge.p > 0) keys.add('pledge-chair');
    if (r.pledge && (r.pledge.people || []).some((x) => (x.r || 0) >= 50)) keys.add('pledge-50');
    if (r.pledge && r.pledge.pct >= 30) keys.add('pledge-total');
    r.news.forEach((n) => { if (n.d >= newsFloor) { keys.add('news'); keys.add(n.kind); } });
    if (r.rev && r.rev.yoy != null) { if (r.rev.yoy >= 20) keys.add('rev-up'); if (r.rev.yoy <= -20) keys.add('rev-down'); }
    if (r.changes.some((c) => c.d >= changeFloor)) keys.add('basic');
    r.dynKeys = keys;
    r.active = [r.news[0] && r.news[0].d, r.changes[0] && r.changes[0].d].filter(Boolean).sort().pop() || '';
    r.recentNews = r.news.filter((n) => n.d >= newsFloor).length;
    return r;
  }
  /** 「2026-08」→「115/8」 */
  const ymLabel = (ym) => { const m = String(ym || '').match(/^(\d{4})-(\d{2})$/); return m ? `${+m[1] - 1911}/${+m[2]}` : ''; };
  const pctLabel = (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${v.toLocaleString('zh-TW', { maximumFractionDigits: 1 })}%`);

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
  const mineOfTax = (taxId, name, cm) => (taxId && cm.byTax.get(taxId)) || (name && cm.byName.get(name)) || null;
  const declined = (v) => !!v && (v.blocked || v.outcome === 'blocked');
  const mmdd = (iso) => { const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };

  /* ---------------- 狀態 ---------------- */

  let index = null;
  let rows = [];
  let owners = {};
  let dyn = { news: {}, revenue: {}, changes: {} };
  let limit = PAGE;
  let started = false;
  let ready = false;
  let showHidden = false;
  const expanded = new Set();   // 哪幾張卡片的投資公司清單展開了
  const newsOpen = new Set();   // 哪幾張卡片的重大訊息全部展開了
  const pledgeOpen = new Set(); // 哪幾張卡片的董監設質名單全部展開了
  const f = { markets: new Set(), inds: new Set(), branches: new Set(), invest: new Set(), mine: new Set(), dyn: new Set(), pledge: new Set(), q: '' };
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };

  function criteria() {
    return {
      hideBig: $('#listed-hideBig').checked,
      min: (Number($('#listed-capMin').value) || 0) * 1e8,
      max: (Number($('#listed-capMax').value) || 0) * 1e8 || Infinity,
      terms: f.q.trim().toLowerCase().split(/\s+/).filter(Boolean),
      cm: customerMap(),
    };
  }
  /** 名下投資公司的狀態：有／同址／已在名單／沒有 */
  function investKeys(r, cm) {
    const keys = new Set();
    if (r.invest.length) keys.add('has'); else keys.add('none');
    if (r.sameSpot.length) keys.add('same');
    if (r.invest.some((x) => mineOfTax(x.taxId, x.name, cm))) keys.add('in');
    return keys;
  }
  const mineKey = (r, cm) => { const m = mineOfTax(r.taxId, r.name, cm); return m ? (declined(m) ? 'declined' : 'in') : 'out'; };
  function passes(r, c, except) {
    return (except === 'markets' || !f.markets.size || f.markets.has(r.market))
      && (except === 'inds' || !f.inds.size || f.inds.has(r.industry))
      && (except === 'branches' || !f.branches.size || f.branches.has(r.branch.key))
      && (except === 'invest' || !f.invest.size || [...f.invest].some((k) => investKeys(r, c.cm).has(k)))
      && (except === 'mine' || !f.mine.size || f.mine.has(mineKey(r, c.cm)))
      && (except === 'dyn' || !f.dyn.size || [...f.dyn].some((k) => r.dynKeys && r.dynKeys.has(k)))
      && (except === 'pledge' || !f.pledge.size || [...f.pledge].some((k) => r.dynKeys && r.dynKeys.has(k)))
      && r.capital >= c.min && r.capital <= c.max
      && (!c.hideBig || r.capital < BIG_CAPITAL)
      && (showHidden || !(hidden.has(r.key) || deletedOf(r.name, r.taxId)))
      && c.terms.every((t) => r.blob.includes(t));
  }
  function visible(c) {
    const list = rows.filter((r) => passes(r, c, null));
    const sort = $('#listed-sort').value;
    list.sort((a, b) => (sort === 'invest' ? (b.sameSpot.length - a.sameSpot.length) || (b.invest.length - a.invest.length) || b.capital - a.capital
      : sort === 'active' ? (b.active || '').localeCompare(a.active || '') || (b.recentNews || 0) - (a.recentNews || 0) || b.capital - a.capital
      : sort === 'code' ? a.code.localeCompare(b.code)
        : sort === 'company' ? a.name.localeCompare(b.name, 'zh-Hant')
          : b.capital - a.capital));
    return list;
  }

  /* ---------------- 畫面 ---------------- */
  // 名單上刪掉的公司（公司排除）：各分頁一起當「藏起來」，放回來＝收回排除（app.js 的 deletedCompany／liftCompany）
  const deletedOf = (name, tax) => (typeof global.deletedCompany === 'function' ? global.deletedCompany(name, tax) : false);
  const restoreBtn = (name, tax) => el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來（名單刪過）', title: '這家你在名單上刪過，匯入與每日挑選都會跳過；放回來就收回排除', onclick: async () => { if (typeof global.liftCompany === 'function') await global.liftCompany(name, tax); render(); toast('放回來了，之後匯入與每日挑選會再出現'); } });

  const findbiz = (taxId, text, title) => el('a', { href: `https://findbiz.nat.gov.tw/fts/company/${encodeURIComponent(taxId)}`, target: '_blank', rel: 'noopener', textContent: text, title: title || '商工登記公示資料' });

  function investRow(x, r, c) {
    const mine = mineOfTax(x.taxId, x.name, c.cm);
    const name = el('span', { className: 'owner-name' }, [x.taxId ? findbiz(x.taxId, x.name) : document.createTextNode(x.name)]);
    const badges = [
      x.sameSpot ? el('span', { className: 'badge badge-mine', textContent: '與上市公司同址', title: '地址跟上市櫃公司一樣，幾乎可以確定是同一位老闆' }) : '',
      x.listed ? el('span', { className: 'badge', textContent: '也是上市櫃公司' }) : '',
      mine ? (declined(mine)
        ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' })
        : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}` })) : '',
    ];
    const meta = el('span', { className: 'owner-meta', textContent: [
      x.capital ? `資本 ${money(thousandsToYuan(x.capital))}` : '',
      x.founded ? `成立 ${String(x.founded).slice(0, 4)}` : '',
      x.address || '',
    ].filter(Boolean).join('　') });
    // 一列一家、按鈕放右邊、字小一點：一位董事長名下十幾家的時候才不會一整面都是藍色大按鈕
    const btn = mine
      ? el('button', { className: 'btn btn-tiny btn-ghost', type: 'button', textContent: '打開', title: '打開名單上這一家', onclick: () => { if (typeof global.openCustomer === 'function') global.openCustomer(mine.id); } })
      : el('button', { className: 'btn btn-tiny listed-add-one', type: 'button', textContent: '＋ 加入', title: '加入客戶名單', onclick: () => addToList([{ x, r }]) });
    return el('div', { className: `owner-row${x.sameSpot ? ' is-same' : ''}` }, [
      el('div', { className: 'owner-main' }, [el('div', { className: 'owner-top' }, [name, ...badges]), meta]),
      btn]);
  }

  function card(r, c) {
    const mine = mineOfTax(r.taxId, r.name, c.cm);
    const isHidden = hidden.has(r.key) || deletedOf(r.name, r.taxId);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [r.taxId ? findbiz(r.taxId, r.name) : document.createTextNode(r.name), typeof global.copyDot === 'function' ? global.copyDot(r.name, '複製公司名稱', `已複製：${r.name}`) : '']),
      el('span', { className: 'badge badge-new', textContent: `${r.market} ${r.code}` }),
      r.industry ? el('span', { className: 'badge badge-ind', textContent: r.industry }) : '',
      r.invest.length ? el('span', { className: 'badge badge-peer', textContent: `名下投資公司 ${r.invest.length} 家${r.sameSpot.length ? `（同址 ${r.sameSpot.length}）` : ''}` }) : '',
      r.branch.key && r.branch.kind ? el('span', { className: `badge badge-branch${r.branch.kind === 'common' ? ' badge-branch-common' : ''}`, textContent: r.branch.key, title: r.branch.label }) : '',
      mine ? (declined(mine) ? el('span', { className: 'badge badge-own', textContent: '名單上是禁止推廣' }) : el('span', { className: 'badge badge-mine', textContent: `已在名單${mine.lastDate ? `・上次 ${mmdd(mine.lastDate)}` : ''}` })) : '',
      r.recentNews ? el('span', { className: 'badge badge-dyn', textContent: `近 ${NEWS_DAYS} 天 ${r.recentNews} 則重大訊息` }) : '',
      r.dynKeys && r.dynKeys.has('basic') ? el('span', { className: 'badge badge-dyn', textContent: '基本資料有異動' }) : '',
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      el('span', { textContent: `💰 實收資本 ${money(r.capital)}` }),
      r.chairman ? el('span', { textContent: `👤 董事長 ${r.chairman}${r.gm && r.gm !== r.chairman ? `・總經理 ${r.gm}` : ''}` }) : '',
      r.phone ? el('span', { textContent: `📞 ${r.phone}` }) : '',
      r.address ? el('span', {}, ['📍 ', el('a', { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`, target: '_blank', rel: 'noopener', textContent: r.address })]) : '',
      r.founded ? el('span', { textContent: `🎂 成立 ${r.founded.y}（${r.years} 年）` }) : '',
      r.listedOn ? el('span', { textContent: `📈 ${r.market} ${r.listedOn.y}` }) : '',
      r.taxId ? el('span', { textContent: `#${r.taxId}` }) : '',
    ]);
    const others = r.others.filter((x) => !x.invest);
    // 同址的排前面，再照資本額。整個名下公司清單預設收起來，點標題才展開
    const investSorted = r.invest.slice().sort((a, b) => (b.sameSpot ? 1 : 0) - (a.sameSpot ? 1 : 0) || thousandsToYuan(b.capital) - thousandsToYuan(a.capital));
    const open = expanded.has(r.key);
    const headText = `董事長 ${r.chairman} 名下其他公司（${r.others.length} 家${r.invest.length ? `，投資公司 ${r.invest.length} 家${r.sameSpot.length ? `、同址 ${r.sameSpot.length} 家` : ''}` : ''}）`;
    const ownerBox = r.chairman && r.others.length ? el('div', { className: `owner-box${open ? ' is-open' : ''}` }, [
      el('button', { className: 'owner-head owner-toggle', type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { if (open) expanded.delete(r.key); else expanded.add(r.key); render(); } }, [
        el('span', { className: 'owner-caret', textContent: open ? '▾' : '▸' }),
        el('span', { textContent: headText }),
        el('span', { className: 'muted owner-hint', textContent: open ? '收起' : '展開' }),
      ]),
      ...(open ? [
        ...investSorted.map((x) => investRow(x, r, c)),
        others.length ? el('p', { className: 'leads-items', textContent: `其他：${others.slice(0, 8).map((x) => x.name).join('、')}${others.length > 8 ? `…共 ${others.length} 家` : ''}` }) : '',
        el('p', { className: 'muted owner-note', textContent: '負責人查詢只能用姓名，同名同姓的會混進來；「與上市公司同址」的最可靠。' }),
      ] : []),
    ]) : (r.chairman ? el('p', { className: 'muted owner-note', textContent: `董事長 ${r.chairman} 名下沒查到其他公司${index && index.chairmenLeft ? '（或還沒查到，Actions 還在補）' : ''}` }) : '');
    const dynBox = dynBoxOf(r);
    // 使用者：整張卡的「把 N 家投資公司加入客戶名單」用不到；要加就在展開的清單裡一家一家加，或用上面的整批按鈕
    const actions = el('div', { className: 'card-actions' }, [
      deletedOf(r.name, r.taxId) ? restoreBtn(r.name, r.taxId) : isHidden
        ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { hidden.delete(r.key); saveHidden(); render(); } })
        : el('button', { className: 'btn btn-tiny listed-hide', type: 'button', textContent: '這家不用了', onclick: () => { hidden.add(r.key); saveHidden(); render(); toast('藏起來了'); } }),
    ]);
    return el('article', { className: `card leads-card listed-card${r.sameSpot.length ? ' is-same' : r.invest.length ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': r.key }, [top, meta, dynBox, ownerBox, actions]);
  }

  /** 卡片上的「動態」：營收、基本資料異動、重大訊息（先 3 則，點開全部） */
  function dynBoxOf(r) {
    const lines = [];
    if (r.rev && r.rev.cur != null) {
      lines.push(el('div', { className: 'dyn-line' }, [
        el('span', { textContent: `📊 ${ymLabel(r.rev.ym)} 營收 ${money(r.rev.cur * 1000)}` }),
        r.rev.yoy != null ? el('span', { className: `dyn-pct ${r.rev.yoy >= 0 ? 'is-up' : 'is-down'}`, textContent: `年增 ${pctLabel(r.rev.yoy)}` }) : '',
        r.rev.mom != null ? el('span', { className: 'muted', textContent: `月增 ${pctLabel(r.rev.mom)}` }) : '',
        r.rev.cumPct != null ? el('span', { className: 'muted', textContent: `累計 ${pctLabel(r.rev.cumPct)}` }) : '',
      ]));
    }
    if (r.pledge && r.pledge.pledgers > 0) {
      const open = pledgeOpen.has(r.key);
      const list = r.pledge.people.filter((x) => x.p > 0);
      const shown = open ? list : list.slice(0, 3);
      const cp = r.chairPledge;
      lines.push(el('div', { className: 'dyn-line dyn-pledge' }, [
        el('span', { textContent: `🔒 ${ymLabel(r.pledge.ym)} 董監設質 ${r.pledge.pledgers} 人，合計 ${pctLabel(r.pledge.pct).replace('+', '')}` }),
        cp ? el('span', { className: cp.p > 0 ? 'dyn-pct is-down' : 'muted', textContent: cp.p > 0 ? `董事長本人設質 ${pctLabel(cp.r).replace('+', '')}` : '董事長本人沒設質' }) : '',
      ]));
      lines.push(el('div', { className: 'dyn-people' }, [
        ...shown.map((x) => el('div', { className: 'dyn-item dyn-person' }, [
          el('span', { className: 'dyn-date', textContent: pctLabel(x.r).replace('+', '') }),
          el('span', { className: `tag${/^董事長/.test(x.t) ? ' tag-people' : ''}`, textContent: x.t }),
          el('span', { className: 'dyn-subj', textContent: `${x.n}　持股 ${x.s.toLocaleString()} 股，設質 ${x.p.toLocaleString()} 股` }),
        ])),
        list.length > 3 ? el('button', { className: 'btn btn-tiny btn-ghost dyn-more', type: 'button', textContent: open ? '收起' : `還有 ${list.length - 3} 人…`, onclick: () => { if (open) pledgeOpen.delete(r.key); else pledgeOpen.add(r.key); render(); } }) : '',
      ]));
    } else if (r.pledge && r.chairPledge) {
      lines.push(el('div', { className: 'dyn-line muted' }, [el('span', { textContent: `🔒 ${ymLabel(r.pledge.ym)} 董監都沒設質（董事長本人持股 ${r.chairPledge.s.toLocaleString()} 股）` })]));
    }
    r.changes.slice(0, 4).forEach((ch) => {
      const what = ch.field === '新掛牌' ? `新掛牌（${ch.to}）` : ch.field === '下市櫃' ? `下市櫃（原${ch.from}）`
        : ch.field === '實收資本額' ? `實收資本額 ${money(ch.from)} → ${money(ch.to)}` : `${ch.field} ${ch.from} → ${ch.to}`;
      lines.push(el('div', { className: 'dyn-line dyn-change' }, [el('span', { textContent: `🔁 ${mmdd(ch.d)} ${what}` })]));
    });
    if (r.news.length) {
      const open = newsOpen.has(r.key);
      const shown = open ? r.news.slice(0, 30) : r.news.slice(0, 3);
      lines.push(el('div', { className: 'dyn-news' }, [
        ...shown.map((n) => el('div', { className: 'dyn-item' }, [
          el('span', { className: 'dyn-date', textContent: mmdd(n.d) }),
          el('span', { className: `tag tag-${n.kind}`, textContent: KIND_LABEL[n.kind] || '其他' }),
          el('span', { className: 'dyn-subj', textContent: n.s, title: `${n.d} ${n.t}${n.c ? `　${n.c}` : ''}${n.f ? `　事實發生日 ${n.f}` : ''}` }),
        ])),
        r.news.length > 3 ? el('button', { className: 'btn btn-tiny btn-ghost dyn-more', type: 'button', textContent: open ? '收起' : `還有 ${r.news.length - 3} 則…`, onclick: () => { if (open) newsOpen.delete(r.key); else newsOpen.add(r.key); render(); } }) : '',
      ]));
    }
    if (!lines.length) return '';
    return el('div', { className: 'dyn-box' }, [el('div', { className: 'dyn-head', textContent: '動態' }), ...lines]);
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
    chips($('#listed-fMarket'), MARKETS.map((m) => [m, m, facet('markets', (r) => r.market === m)]), f.markets);
    const ic = new Map(); rows.forEach((r) => { if (r.industry && passes(r, c, 'inds')) ic.set(r.industry, (ic.get(r.industry) || 0) + 1); });
    const inds = [...new Set([...ic.keys(), ...f.inds])].sort((a, b) => (ic.get(b) || 0) - (ic.get(a) || 0));
    chips($('#listed-fInd'), inds.map((k) => [k, k, ic.get(k) || 0]), f.inds);
    const bc = new Map(); rows.forEach((r) => { if (r.branch.key && passes(r, c, 'branches')) bc.set(r.branch.key, (bc.get(r.branch.key) || 0) + 1); });
    const order = (k) => (/分公司$/.test(k) ? 0 : /共同區$/.test(k) ? 1 : 2);
    const bkeys = [...new Set([...bc.keys(), ...f.branches])].sort((a, b) => order(a) - order(b) || (bc.get(b) || 0) - (bc.get(a) || 0));
    chips($('#listed-fBranch'), bkeys.map((k) => [k, k, bc.get(k) || 0]), f.branches);
    chips($('#listed-fInvest'), [['has', '有投資公司'], ['same', '與上市公司同址'], ['in', '投資公司已在我的名單'], ['none', '沒查到投資公司']]
      .map(([k, label]) => [k, label, facet('invest', (r) => investKeys(r, c.cm).has(k))]), f.invest);
    chips($('#listed-fPledge'), [['pledge', '董監有設質'], ['pledge-chair', '董事長本人有設質'], ['pledge-50', '有人設質 50% 以上'], ['pledge-total', '董監合計設質 30% 以上']]
      .map(([k, label]) => [k, label, facet('pledge', (r) => r.dynKeys && r.dynKeys.has(k))]), f.pledge);
    chips($('#listed-fDyn'), [['news', `近 ${NEWS_DAYS} 天有重大訊息`], ['asset', '資產設備'], ['fund', '籌資'], ['deal', '投資併購'], ['people', '人事異動'], ['rename', '更名'], ['rev-up', '營收年增 20% 以上'], ['rev-down', '營收年減 20% 以上'], ['basic', `近 ${CHANGE_DAYS} 天基本資料異動`]]
      .map(([k, label]) => [k, label, facet('dyn', (r) => r.dynKeys && r.dynKeys.has(k))]), f.dyn);
    chips($('#listed-fMine'), [['out', '名單裡沒有'], ['in', '已在我的名單裡'], ['declined', '名單上禁止推廣']].map(([k, label]) => [k, label, facet('mine', (r) => mineKey(r, c.cm) === k)]), f.mine);
  }

  let current = [];
  function render() {
    if (!ready) return;
    const c = criteria();
    drawChips(c);
    current = visible(c);
    const host = $('#listed-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((r) => host.append(card(r, c)));
    const invest = current.reduce((n, r) => n + r.invest.length, 0);
    const fresh = current.reduce((n, r) => n + r.invest.filter((x) => !mineOfTax(x.taxId, x.name, c.cm)).length, 0);
    $('#listed-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家上市櫃公司<span class="muted">　／ 名下投資公司 ${invest.toLocaleString()} 家${invest - fresh ? `，其中 ${invest - fresh} 家已在名單` : ''}</span>`;
    const del = rows.filter((r) => deletedOf(r.name, r.taxId)).length;
    const hid = rows.filter((r) => hidden.has(r.key)).length + del;
    const hb = $('#listed-hidden');
    hb.hidden = !hid;
    hb.textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家${del ? `（含名單刪過的 ${del} 家）` : ''}`;
    $('#listed-more').hidden = current.length <= limit;
    $('#listed-empty').hidden = !!current.length;
    $('#listed-empty').textContent = rows.length ? '沒有符合條件的公司，把篩選放寬試試。' : '';
    $('#listed-add').disabled = !fresh;
    $('#listed-add').textContent = `把投資公司加入客戶名單${fresh ? `（${fresh} 家）` : ''}`;
    $('#listed-export').disabled = !current.length;
    const pill = document.getElementById('countListed');
    if (pill) pill.textContent = current.length.toLocaleString();
  }

  /* ---------------- 加入客戶名單（加的是投資公司） ---------------- */

  const dash = (s) => String(s || '').replace(/\//g, '-');
  function noteFor(x, r) {
    return [`上市櫃老闆的投資公司：${r.chairman} 是${r.market} ${r.name}（${r.code}）董事長`,
      x.sameSpot ? '與上市公司同址' : '同名同姓查到的，先確認是不是同一位',
      r.phone ? `上市公司總機 ${r.phone}` : '', r.address ? `上市公司地址 ${r.address}` : '',
      x.founded ? `投資公司設立 ${dash(x.founded).slice(0, 10)}` : ''].filter(Boolean).join('，');
  }
  function toStandardCsv(items, dates) {
    const lines = [CSV_HEAD, ...items.map(({ x, r }, i) => [x.name, x.taxId, '', x.founded ? String(x.founded).slice(0, 4) : '', x.capital || '', '', x.owner || r.chairman, '', '投資控股', (dates && dates[i]) || '', '', noteFor(x, r), x.address || '', todayIso(), ''])].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\n')}\n`;
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fromDate = () => { const v = $('#listed-from') && $('#listed-from').value; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; };
  async function addToList(items) {
    if (typeof global.importLeadsFile !== 'function') { toast('主站還沒準備好匯入，請重新整理再試'); return; }
    const cm = customerMap();
    const seen = new Set();
    const fresh = items.filter(({ x }) => x.taxId && !mineOfTax(x.taxId, x.name, cm) && !seen.has(x.taxId) && seen.add(x.taxId));
    if (!fresh.length) { toast('這些都已經在名單裡了'); return; }
    const from = fromDate();
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => from)) : fresh.map(() => from);
    const file = new File([toStandardCsv(fresh, dates)], `上市櫃投資公司-${todayIso()}-${fresh.length}家.csv`, { type: 'text/csv' });
    try { await global.importLeadsFile(file); } catch (err) { toast(`加入失敗：${err.message}`); }
    const sorted = dates.filter(Boolean).sort();
    if (sorted.length) toast(`${fresh.length} 家投資公司排在 ${sorted[0].replace(/-/g, '/')}${sorted.length > 1 && sorted[sorted.length - 1] !== sorted[0] ? `～${sorted[sorted.length - 1].replace(/-/g, '/')}` : ''}`);
    render();
  }

  /* ---------------- 建畫面、載資料 ---------------- */

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'listed-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      el('p', { className: 'muted leads-hint', textContent: '籤上的數字＝套用其他條件後這一顆會剩幾家。要打的是老闆名下的投資公司，不是上市櫃公司本身。' }),
      group('市場別', el('div', { className: 'chips', id: 'listed-fMarket' })),
      group('名下投資公司', el('div', { className: 'chips', id: 'listed-fInvest' })),
      group('動態（重大訊息、營收、基本資料異動）', el('div', { className: 'chips', id: 'listed-fDyn' })),
      group('董監事設質（股票拿去質押＝需要資金）', el('div', { className: 'chips', id: 'listed-fPledge' })),
      group('歸屬分公司（依上市櫃公司地址，同「規則」的劃分表）', el('div', { className: 'chips', id: 'listed-fBranch' })),
      group('產業別', el('div', { className: 'chips', id: 'listed-fInd' })),
      group('上市櫃公司本身跟我的名單比對', el('div', { className: 'chips', id: 'listed-fMine' })),
      el('div', { className: 'leads-group' }, [el('label', {}, [el('input', { type: 'checkbox', id: 'listed-hideBig', checked: true }), ' 剔除實收資本額 50 億以上的企業'])]),
      group('實收資本額（億元）', el('div', { className: 'leads-row' }, [
        el('input', { id: 'listed-capMin', type: 'number', min: '0', step: '1', placeholder: '下限' }), '～',
        el('input', { id: 'listed-capMax', type: 'number', min: '0', step: '1', placeholder: '上限' })])),
      group('關鍵字', el('input', { id: 'listed-q', type: 'search', placeholder: '公司、代號、統編、董事長、總經理、地址、投資公司名稱', autocomplete: 'off' }), 'listed-q'),
      group('排序', el('select', { id: 'listed-sort' }, [
        el('option', { value: 'capital', textContent: '實收資本額（高到低）' }),   // 使用者：找名單的分頁預設都照資本額高到低
        el('option', { value: 'invest', textContent: '投資公司多的在前（同址優先）' }),
        el('option', { value: 'active', textContent: '最新動態在前' }),
        el('option', { value: 'code', textContent: '公司代號' }),
        el('option', { value: 'company', textContent: '公司名稱' })]), 'listed-sort'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'listed-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'listed-hidden', type: 'button', hidden: true })]),
    ]);
    filters.open = !matchMedia('(max-width: 760px)').matches;
    root.append(
      el('p', { className: 'muted leads-sub', id: 'listed-sub', textContent: '上市／上櫃／興櫃公司，以及董事長名下的投資公司' }),
      filters,
      el('div', { className: 'leads-head' }, [
        el('div', { className: 'leads-count', id: 'listed-count', textContent: '—' }),
        el('div', { className: 'leads-row' }, [
          el('label', { className: 'leads-from', title: '加進來的投資公司從這天起排下次聯絡日，照「每天打得完幾家」的上限與新名單額度往後找位子；空白＝明天' }, [
            el('span', { className: 'muted', textContent: '排進日程：從' }),
            el('input', { id: 'listed-from', type: 'date' }),
            el('span', { className: 'muted', textContent: '起' })]),
          el('button', { className: 'btn btn-primary', id: 'listed-add', type: 'button', title: '把目前篩出來的上市櫃公司名下、還不在名單裡的投資公司全部送進匯入流程', textContent: '把投資公司加入客戶名單' }),
          el('button', { className: 'btn', id: 'listed-export', type: 'button', textContent: '匯出投資公司 CSV' }),
        ]),
      ]),
      el('div', { className: 'leads-loading', id: 'listed-loading', hidden: true }),
      el('div', { className: 'cards', id: 'listed-cards' }),
      el('div', { className: 'empty', id: 'listed-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'listed-more', type: 'button', textContent: '載入更多', hidden: true })]),
      el('div', { className: 'chattel-legend' }, [
        el('span', {}, [el('i', { className: 'swatch is-mine' }), ' 名下有與上市公司同址的投資公司']),
        el('span', {}, [el('i', { className: 'swatch is-up' }), ' 名下有投資公司'])]),
      el('p', { className: 'muted leads-foot', textContent: '資料來源：證交所、櫃買中心的開放 API——公司基本資料、每日重大訊息（上市、上櫃；興櫃沒有）、每月營收，GitHub Actions 每天早上抓，基本資料跟前一天比出異動；董事長名下公司是拿姓名查經濟部「公司負責人資料」，投資公司的地址、資本額查商工登記。負責人查詢只能用姓名，同名同姓的會混進來，「與上市公司同址」的最可靠。「已在名單」是在這台瀏覽器裡比對的，名單不會上傳。' }),
    );
  }

  /** 三個動態檔 → 依公司代號分好（都是新的在前） */
  function groupDyn(newsJ, revJ, chJ, plJ) {
    const news = {}; const changes = {};
    ((newsJ && newsJ.items) || []).forEach((n) => { if (n && n.code) (news[n.code] = news[n.code] || []).push(n); });
    ((chJ && chJ.items) || []).forEach((c) => { if (c && c.code) (changes[c.code] = changes[c.code] || []).push(c); });
    return { news, revenue: (revJ && revJ.by) || {}, changes, pledge: (plJ && plJ.by) || {} };
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
      $('#listed-empty').hidden = false;
      $('#listed-empty').textContent = '還沒有抓好的資料。GitHub Actions 每天早上會自動抓，也可以到 repo 的 Actions 頁手動執行「每日上市櫃公司」。';
      return;
    }
    $('#listed-sub').textContent = `上市 ${(index.markets || {})['上市'] || 0}、上櫃 ${(index.markets || {})['上櫃'] || 0}、興櫃 ${(index.markets || {})['興櫃'] || 0} 家　·　名下有投資公司的 ${index.withInvest || 0} 家（投資公司 ${index.investCompanies || 0} 家）　·　上次抓取 ${String(index.generatedAt || '').slice(0, 10).replace(/-/g, '/')}${index.chairmenLeft ? `　·　還有 ${index.chairmenLeft} 位董事長沒查完` : ''}${index.dailyAt ? `　·　動態更新 ${String(index.dailyAt).slice(0, 10).replace(/-/g, '/')}（重大訊息到 ${String(index.newsAt || '').slice(5).replace(/-/g, '/') || '—'}、營收到 ${ymLabel(index.revenueYm) || '—'}${index.pledgeYm ? `、董監設質到 ${ymLabel(index.pledgeYm)}` : ''}）` : ''}`;
    $('#listed-loading').hidden = false;
    $('#listed-loading').textContent = '下載資料…';
    try {
      const optional = (file, key) => fetch(`${DATA_BASE}${file}?t=${key}`, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [csvRes, ownRes, newsJ, revJ, chJ, plJ] = await Promise.all([
        fetch(`${DATA_BASE}companies.csv?t=${index.generatedAt}`, { cache: 'force-cache' }),
        fetch(`${DATA_BASE}owners.json?t=${index.generatedAt}`, { cache: 'force-cache' }),
        optional('news.json', index.dailyAt || index.generatedAt),
        optional('revenue.json', index.dailyAt || index.generatedAt),
        optional('changes.json', index.generatedAt),
        optional('pledge.json', index.dailyAt || index.generatedAt),
      ]);
      if (!csvRes.ok) throw new Error(`companies.csv：HTTP ${csvRes.status}`);
      owners = ownRes.ok ? await ownRes.json() : {};
      dyn = groupDyn(newsJ, revJ, chJ, plJ);
      const table = parseCsv(await csvRes.text());
      const head = table[0] || [];
      table.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; }); rows.push(attachDyn(toRecord(o, owners), dyn)); });
    } catch (err) {
      $('#listed-loading').hidden = true;
      $('#listed-empty').hidden = false;
      $('#listed-empty').textContent = `資料下載失敗：${err.message}`;
      return;
    }
    $('#listed-loading').hidden = true;
    ready = true;
    const rerender = () => { limit = PAGE; render(); };
    ['#listed-capMin', '#listed-capMax'].forEach((s) => { $(s).oninput = rerender; });
    $('#listed-hideBig').onchange = rerender;
    $('#listed-sort').onchange = rerender;
    let qt = null;
    $('#listed-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; rerender(); }, 120); };
    $('#listed-more').onclick = () => { limit += PAGE; render(); };
    $('#listed-hidden').onclick = () => { showHidden = !showHidden; rerender(); };
    $('#listed-reset').onclick = () => {
      f.markets.clear(); f.inds.clear(); f.branches.clear(); f.invest.clear(); f.mine.clear(); f.dyn.clear(); f.pledge.clear(); f.q = '';
      $('#listed-q').value = ''; $('#listed-capMin').value = ''; $('#listed-capMax').value = ''; $('#listed-hideBig').checked = true; $('#listed-sort').value = 'capital'; showHidden = false;
      rerender();
    };
    $('#listed-add').onclick = () => { const c = criteria(); addToList(current.flatMap((r) => r.invest.filter((x) => !mineOfTax(x.taxId, x.name, c.cm)).map((x) => ({ x, r })))); };
    $('#listed-export').onclick = () => {
      const items = current.flatMap((r) => r.invest.map((x) => ({ x, r })));
      const blob = new Blob([toStandardCsv(items)], { type: 'text/csv;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `上市櫃投資公司-${todayIso()}-${items.length}家.csv` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`已匯出 ${items.length} 家投資公司`);
    };
    rerender();
  }

  function show() {
    if (!root) root = document.getElementById('paneListed');
    if (!root) return;
    if (started) { if (ready) render(); return; }
    start().catch((err) => { console.error(err); toast(`上市櫃公司載入失敗：${err.message}`); });
  }

  global.Listed = { show, toRecord, toStandardCsv, noteFor, money, parseYmd, yearsSince, thousandsToYuan, newsKind, attachDyn, groupDyn };
})(window);
