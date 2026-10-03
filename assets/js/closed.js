/*
 * 已停業的公司：leads/closed/closed.csv（統編,名稱,狀態,日期；GitHub Actions 每月抓財政部稅籍的停業、非營業中與健保的停歇業投保單位，
 * 只留新北市、臺北市）。使用者：「已停業自動藏」——六個名單分頁把這些當藏起來的（不挑、不列），客戶名單上的卡片標「已停業」。
 * 比對用統編，沒統編才比名稱。載不到就當都沒停業，不擋任何功能。
 */
(function (global) {
  'use strict';

  const DATA_BASE = 'leads/closed/';
  let byTax = null;
  let byName = null;
  let index = null;
  let loading = null;
  const parseCsv = (text) => (global.Leads && global.Leads.parseCsv ? global.Leads.parseCsv(text) : [[]]);

  /** 載停業表；只載一次，失敗就當空表 */
  function ensure() {
    if (byTax) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      const t = new Map(); const n = new Map();
      try {
        let key = Date.now();
        try { const ir = await fetch(`${DATA_BASE}index.json?t=${Date.now()}`, { cache: 'no-store' }); if (ir.ok) { index = await ir.json(); key = index.generatedAt || key; } } catch (e) { /* 沒 index 就照抓 */ }
        const res = await fetch(`${DATA_BASE}closed.csv?t=${key}`, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const table = parseCsv(await res.text());
        const head = table[0] || [];
        const ti = head.indexOf('統編'); const ni = head.indexOf('名稱'); const ki = head.indexOf('狀態'); const di = head.indexOf('日期');
        if (ti < 0 || ki < 0) throw new Error('表頭對不上');
        table.slice(1).forEach((c) => {
          const tax = String(c[ti] || '').replace(/\D/g, '');
          const rec = { taxId: tax, name: String(ni < 0 ? '' : c[ni] || '').trim(), kind: String(c[ki] || '').trim(), date: String(di < 0 ? '' : c[di] || '').trim() };
          if (tax.length === 8) t.set(tax, rec);
          if (rec.name && !n.has(rec.name)) n.set(rec.name, rec);
        });
      } catch (err) { console.warn('停業表載不到', err); }
      byTax = t; byName = n;
    })();
    return loading;
  }
  /** 這家停業了嗎：有統編比統編，沒有才比名稱；還沒載就當沒有 */
  function of(name, taxId) {
    if (!byTax) return null;
    const tax = String(taxId || '').replace(/\D/g, '');
    if (tax.length === 8) return byTax.get(tax) || null;
    const nm = String(name || '').trim();
    return (nm && byName.get(nm)) || null;
  }
  const label = (c) => (c ? `${c.kind}${c.date ? ` ${c.date}` : ''}` : '');

  global.Closed = { ensure, of, label, ready: () => !!byTax, count: () => (byTax ? byTax.size : 0), info: () => index };
})(window);
