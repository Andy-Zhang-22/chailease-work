/*
 * 「104 徵才中」當第九個來源（版本 410；使用者 11/07：「把 104 的名單放在這裡讓我跟後台每天都能挑選，因為我的 Mac 不會每天都打開，
 * 只有假日才會開啟，趁著假日時把當下 104 有在徵才的名單一次找好放在這」→「好的」）。
 *
 * 資料不在 repo：Mac 每週在使用者的 Chrome 抓 104「找公司」臺北＋新北徵才中的公司（tools/hire104-weekly.py），
 * 對稅籍登記拿統編、地址、資本額、設立年，電話用 leads/ 的公開名單，組成標準 15 欄寫進雲端硬碟同步檔的設定 hiring-pool-104
 * （{ at, head, list: [{ key＝統編, name, count＝職缺數, row＝15 欄一列（下次聯絡日放 __DAY__）}] }）。
 * 每台裝置同步到就有；後台清晨也是同步完才挑名單。這裡把它讀成跟其他八頁一樣的候選（dailyCandidates／dailyFacts／cardFacts），
 * 「找名單 → 全部（合併）」列得到、來源籤「104 徵才中」、訊號「104 徵才中（N 件）」，每日新名單跟其他八份一起揉（每頁保底一家）。
 * 沒有自己的分頁（使用者定的「不另開一塊」）。104 的內容只有職缺數；公司資料是政府登記、電話是公開名單。
 */
(function (global) {
  const taxOnly = (t) => String(t || '').replace(/\D/g, '');
  const HEAD = ['公司名稱', '統編', '分級', '成立', '資本額', '電話', '負責人', 'KEYMAN', '產業別', '下次聯絡日', '最近聯絡日', '訪談內容', '地址', '名單新增日期', '國家'];
  const DAY = '__DAY__';
  /** 一列 CSV → 欄位（引號、逗號、引號裡的換行照 CSV 規則） */
  function parseLine(line) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const thousands = (yuan) => (yuan ? Math.round(yuan / 1000).toLocaleString() : '');
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const myBranch = () => { let b = ''; try { b = localStorage.getItem('my-branch') || ''; } catch (e) { /* 無痕 */ } return `${b || '新莊'}分公司`; };
  function branchOf(address) {
    if (!global.Rules || !global.Normalize) return { key: '', label: '', kind: '', city: '', district: '', b: null };
    const { city, district } = global.Normalize.parseAddress(address);
    const b = global.Rules.branchOf(city, district);
    const key = b.kind === 'branch' ? `${b.branches[0]}分公司` : b.kind === 'common' ? `${b.branches.join('／')}共同區` : '';
    return { key, label: b.label || key, kind: b.kind, city, district, b };
  }
  const isMobile = (tel) => /^0?9\d{8}$/.test(String(tel || '').replace(/\D/g, '').replace(/^886/, '0'));
  const capRank = (r) => (r.capital >= 3000000 && r.capital <= 60000000 ? 0 : 1);
  const branchRank = (r) => (global.Rules && global.Rules.branchRank ? global.Rules.branchRank(r.branch.b, myBranch()) : (r.branch.key === myBranch() ? 0 : 9));
  const ageRankOf = (r) => (global.Rules && global.Rules.ageRank ? global.Rules.ageRank(r.years) : 3);

  /* ---------------- 讀同步檔的候選池 ---------------- */
  let rows = []; let at = 0; let loadedV = null;
  /** 池子裡一家（row 是 15 欄一列）→ 卡片資料；對不上 15 欄或沒統編的不收 */
  function toRecord(c, head) {
    const cells = parseLine(String(c.row || ''));
    const col = (name) => { const i = head.indexOf(name); return i >= 0 ? String(cells[i] || '').trim() : ''; };
    const taxId = taxOnly(c.key || col('統編'));
    if (taxId.length !== 8) return null;
    const note = col('訪談內容');
    const m = /104 徵才中：(\d+) 件（([^）]*)查）/.exec(note);
    const fm = /徵財務主管：([^\n；]+)/.exec(note);
    const am = /徵 AI 人才：([^\n；]+)/.exec(note);
    const gm = /徵才擴編：(\d+)→(\d+) 件/.exec(note);
    const year = Number(col('成立')) || 0;
    // 徵才擴編（版本 430）：Mac 每週把件數記成 hist=[[週, 件數], …]，最新一週比第一週多＝在擴編；舊格式沒 hist 就看備註那行
    const hist = Array.isArray(c.hist) ? c.hist.filter((h) => Array.isArray(h) && h.length === 2) : [];
    const grow = hist.length >= 2 && Number(hist[hist.length - 1][1]) > Number(hist[0][1]) ? { from: Number(hist[0][1]), to: Number(hist[hist.length - 1][1]) } : gm ? { from: Number(gm[1]), to: Number(gm[2]) } : null;
    const r = {
      key: taxId, taxId, name: String(c.name || col('公司名稱')).trim(), tel: col('電話'), address: col('地址'), industry: col('產業別'),
      capital: (Number(col('資本額').replace(/\D/g, '')) || 0) * 1000,   // 仟元 → 元
      foundedYear: year, years: year ? new Date().getFullYear() - year : null,
      count: Number(c.count) || (m ? Number(m[1]) : 0), checked: m ? m[2].trim() : '',
      fin: String(c.fin || (fm ? fm[1] : '')).trim(),   // 徵財務主管的職稱（版本 417）
      ai: String(c.ai || (am ? am[1] : '')).trim(),   // 徵 AI 人才的職稱（版本 440；使用者：「想找這幾年有買 GPU 的客戶」→ 徵 AI 職缺當代理訊號，先只掛訊號不動排序）
      grow,
    };
    r.branch = branchOf(r.address);
    return r;
  }
  async function ensureData() {
    let v = '';
    try { const all = (await global.Store.getMeta('settings')) || {}; v = (all['hiring-pool-104'] && all['hiring-pool-104'].v) || ''; } catch (e) { v = ''; }
    if (v === loadedV) return;
    loadedV = v; rows = []; at = 0;
    if (!v) return;
    try {
      const o = JSON.parse(v);
      const head = parseLine(String(o.head || '').replace(/^﻿/, ''));
      if (!HEAD.every((h) => head.includes(h))) return;
      at = Number(o.at) || 0;
      rows = (o.list || []).map((c) => toRecord(c, head)).filter((r) => r && r.count > 0);
    } catch (e) { rows = []; }
  }
  const lookup = (taxId) => rows.find((r) => r.taxId === taxOnly(taxId)) || null;
  const poolInfo = () => ({ n: rows.length, at });

  /* ---------------- 跟名單比對、每日挑選 ---------------- */
  function customerMap() {
    const byTax = new Map(); const byName = new Map();
    const views = typeof global.customerViews === 'function' ? global.customerViews() : [];
    views.forEach((v) => { const t = taxOnly(v.taxId); if (t && !byTax.has(t)) byTax.set(t, v); if (v.company && !byName.has(v.company)) byName.set(v.company, v); });
    return { byTax, byName };
  }
  const mineOf = (r, cm) => cm.byTax.get(r.taxId) || cm.byName.get(r.name) || null;
  const deletedOf = (r) => (typeof global.deletedCompany === 'function' ? global.deletedCompany(r.name, r.taxId) : false);
  const isHid = (r) => (typeof global.srcHidden === 'function' ? global.srcHidden(r.taxId) : false);
  // 優先順序（是順序不是門檻）：104 徵才中（都有）→ 資本額 300～6,000 萬 → 有電話 → 我的分公司（遠近）→ 成立 2～7 年；全一樣職缺多的先
  const DAILY_PRIORITY = ['104 徵才中', '徵財務主管', '資本額 300～6,000 萬', '有電話', '我的分公司', '成立 2～7 年'];
  const dailyChecks = (r) => [true, !r.fin, capRank(r), !!r.tel, branchRank(r), ageRankOf(r)];   // !r.fin：有徵財務主管的 false 排前面（數字越小越前）
  function dailyCompare(a, b) {
    for (let i = 0; i < a._checks.length; i++) {
      const x = a._checks[i]; const y = b._checks[i];
      if (x === y) continue;
      if (typeof x === 'number') return x - y;
      return x ? -1 : 1;
    }
    return b.count - a.count || b.capital - a.capital;
  }
  const whyOf = (r) => {
    const hit = DAILY_PRIORITY.filter((_, i) => (typeof r._checks[i] === 'number' ? r._checks[i] === 0 : i === 1 ? !!r.fin : r._checks[i])).map((x) => (x === '104 徵才中' ? `104 徵才中（${r.count} 件）` : x === '徵財務主管' ? `徵財務主管（${r.fin}）` : x));
    const rk = r._checks[DAILY_PRIORITY.indexOf('我的分公司')];
    const relax = rk > 0 && rk < 9 ? `分公司放寬到 ${r.branch.key}` : '';
    return [`符合：${hit.join('、')}`, relax].filter(Boolean).join('；');
  };
  async function dailyCandidates({ withMine = false } = {}) {
    await ensureData();
    const cm = customerMap();
    return rows.filter((r) => (withMine || !mineOf(r, cm)) && !isHid(r) && !deletedOf(r))
      .map((r) => { r._checks = dailyChecks(r); r._why = whyOf(r); return r; })
      .sort(dailyCompare);
  }
  function dailyFacts(r) {
    return { key: r.taxId, name: r.name, signals: [`104 徵才中（${r.count} 件）`, ...(r.fin ? [`104 徵財務主管（${r.fin}）`] : []), ...(r.ai ? [`104 徵 AI 人才（${r.ai}）`] : []), ...(r.grow ? [`徵才擴編（${r.grow.from}→${r.grow.to} 件）`] : [])], ageRank: ageRankOf(r), capOk: capRank(r) === 0, phone: !!r.tel, branchRank: branchRank(r), industry: r.industry, mobile: isMobile(r.tel) };
  }
  function cardFacts(r) {
    return { name: r.name, taxId: r.taxId, address: r.address, capital: r.capital || 0, years: r.years, tel: r.tel, branchKey: r.branch.key,
      info: `104 徵才中 ${r.count} 件${r.checked ? `（${r.checked}查）` : ''}${r.grow ? `，徵才擴編 ${r.grow.from}→${r.grow.to} 件` : ''}${r.fin ? `，徵財務主管：${r.fin}` : ''}${r.ai ? `，徵 AI 人才：${r.ai}` : ''}`, ym: '', add: () => addToList([r]) };
  }
  const factsOf = (taxId) => { const r = lookup(taxId); return r ? cardFacts(r) : null; };

  /* ---------------- 加入客戶名單 ---------------- */
  const noteFor = (r) => `104 徵才中：${r.count} 件${r.checked ? `（${r.checked}查）` : ''}${r.grow ? `\n徵才擴編：${r.grow.from}→${r.grow.to} 件` : ''}${r.fin ? `\n徵財務主管：${r.fin}` : ''}${r.ai ? `\n徵 AI 人才：${r.ai}` : ''}`;
  function toStandardCsv(list, dates) {
    const today = todayIso();
    const lines = [HEAD.join(','), ...list.map((r, i) => [r.name, r.taxId, '', r.foundedYear || '', thousands(r.capital), r.tel, '', '', r.industry, (dates && dates[i]) || '', '',
      [noteFor(r), r._why ? `每日新名單，${r._why}` : ''].filter(Boolean).join('\n'), r.address, today, ''].map(csvCell).join(','))];
    return `﻿${lines.join('\n')}\n`;
  }
  async function addToList(list) {
    if (typeof global.importLeadsFile !== 'function') return;
    const cm = customerMap();
    const fresh = list.filter((r) => !mineOf(r, cm)).slice(0, 200);
    if (!fresh.length) return;
    const dates = typeof global.planNewDates === 'function' ? global.planNewDates(fresh.map(() => '')) : fresh.map(() => '');
    const file = new File([toStandardCsv(fresh, dates)], (global.uniqueSourceName || ((x) => x))(`104徵才中-${todayIso()}-${fresh.length}家.csv`), { type: 'text/csv' });
    await global.importLeadsFile(file);
  }

  /* ---------------- 沒電話的：後台讓 Claude 上網找（版本 442） ----------------
   * Mac 每週把「合格但公開名單沒電話」的公司寫在設定 hiring-pool-104-nophone；後台清晨拿幾家（版本 446：資本額 1,000 萬以上未達 5 億、成立 10 年內，徵財務主管的先、再來新北）
   * 用 Claude＋網路搜尋找電話，找到的搬進池子（15 欄一列、備註記電話來源），沒找到的記今天查過不重查。
   * 使用者 11/18：點數是每月送的 US$100、不另外儲值、別浪費 → 後台每天最多 HUNT104 家、每月估價到 HUNT104_USD 就停（花費記在設定 hunt104-usage）。 */
  const NOPHONE_KEY = 'hiring-pool-104-nophone'; const USAGE_KEY = 'hunt104-usage';
  const HUNT_CAP_MIN = 10000; const HUNT_CAP_MAX = 500000;   // 仟元：1,000 萬～未達 5 億，跟每日新名單的規模門檻一樣（版本 436）
  const readSetting = async (key) => { try { const all = (await global.Store.getMeta('settings')) || {}; const v = all[key] && all[key].v; return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  async function huntBatch(n) {
    const np = await readSetting(NOPHONE_KEY); if (!np || !Array.isArray(np.list)) return [];
    const tried = np.tried || {};
    // 版本 446（使用者 11/19 選「只找用得到的」）：只找每日新名單會挑的——資本額 1,000 萬以上、未達 5 億（cap 是仟元），成立明顯超過 10 年的不找；
    // 徵財務主管的排最前（有電話就進需求證據第四層，一個月內打得到），再來新北、職缺多的
    const year = new Date().getFullYear();
    const usable = (x) => { const cap = Number(x.cap) || 0; const y = Number(x.setup) || 0; return cap >= HUNT_CAP_MIN && cap < HUNT_CAP_MAX && !(y && year - y >= 11); };
    const rank = (x) => (x.fin ? 0 : /^新北市/.test(String(x.city || x.addr || '')) ? 1 : 2);
    return np.list.filter((x) => x && x.key && !tried[x.key] && usable(x)).sort((a, b) => rank(a) - rank(b) || (Number(b.count) || 0) - (Number(a.count) || 0))
      .slice(0, Math.max(0, Number(n) || 0)).map((x) => ({ key: x.key, name: x.name, taxId: x.key, address: x.addr || '' }));
  }
  const huntSpent = async (month) => { const u = await readSetting(USAGE_KEY); return u && u.month === month ? Number(u.usd) || 0 : 0; };
  /** 今天找過了沒（版本 446）：後台一天可能跑兩次（06:35 備援＋GitHub 延後的排程），找電話一天只做一次 */
  const huntedToday = async () => { const u = await readSetting(USAGE_KEY); return !!(u && u.day === todayIso()); };
  async function adoptHunted(results, { usd = 0, month = '' } = {}) {
    const np = await readSetting(NOPHONE_KEY); if (!np || !Array.isArray(np.list)) return { found: 0, tried: 0 };
    const pool = (await readSetting('hiring-pool-104')) || { head: HEAD.join(','), list: [] };
    if (!Array.isArray(pool.list)) pool.list = [];
    if ((pool.head || HEAD.join(',')) !== HEAD.join(',')) return { found: 0, tried: 0, badHead: true };
    const today = todayIso(); const tried = np.tried || {}; const inPool = new Set(pool.list.map((e) => e.key));
    let found = 0; let miss = 0; const keep = [];
    for (const x of np.list) {
      const r = results && results[x.key];
      if (r === undefined) { keep.push(x); continue; }
      if (r && r.phone) {
        if (!inPool.has(x.key)) {
          const who = String(r.who || '').trim(); let host = ''; try { host = new URL(r.source).hostname; } catch (e) { host = ''; }
          const note = [`104 徵才中：${Number(x.count) || 1} 件（${x.day || ''} 查）`, x.fin ? `徵財務主管：${x.fin}` : '', x.ai ? `徵 AI 人才：${x.ai}` : '',
            `電話：Claude 上網找到${who ? `（${who}）` : ''}${host ? ` ${host}` : ''}`, '每日新名單，符合：104 徵才中'].filter(Boolean).join('\n');
          const row = [x.name, x.key, '', x.setup || '', x.cap ? Number(x.cap).toLocaleString() : '', r.phone, '', '', x.ind || '', DAY, '', note, x.addr || '', today, ''].map(csvCell).join(',');
          const e = { key: x.key, name: x.name, src: '104 徵才中', count: Number(x.count) || 1, week: x.week || '', row, hunted: today };
          if (x.fin) e.fin = x.fin;
          if (x.ai) e.ai = x.ai;
          pool.list.push(e); inPool.add(x.key);
        }
        found += 1;
      } else { tried[x.key] = today; miss += 1; keep.push(x); }
    }
    pool.head = HEAD.join(','); pool.at = Date.now();
    await global.Store.setSetting('hiring-pool-104', JSON.stringify(pool));
    await global.Store.setSetting(NOPHONE_KEY, JSON.stringify({ at: Date.now(), list: keep, tried }));
    const u = (await readSetting(USAGE_KEY)) || {}; const same = u.month === month;
    await global.Store.setSetting(USAGE_KEY, JSON.stringify({ month, day: today, usd: Math.round(((same ? Number(u.usd) || 0 : 0) + (Number(usd) || 0)) * 100) / 100,
      asked: (same ? Number(u.asked) || 0 : 0) + found + miss, found: (same ? Number(u.found) || 0 : 0) + found }));
    return { found, tried: miss };
  }

  global.Hire104 = { ensureData, lookup, poolInfo, dailyCandidates, dailyFacts, cardFacts, factsOf, toStandardCsv, addToList, huntBatch, huntSpent, huntedToday, adoptHunted, DAILY_PRIORITY, DAY };
})(window);
