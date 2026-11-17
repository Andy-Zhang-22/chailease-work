// 一次性探路（版本 432 之前；看完就刪，結論寫進 README）：data.gov.tw 資料集 26131「小型企業創新研發計畫（SBIR）核定補助名單」
// 只印欄位、筆數、統計；不印公司名。
const META = 'https://data.gov.tw/api/v2/rest/dataset/26131';
const r = await fetch(META, { headers: { 'User-Agent': 'Mozilla/5.0' } });
console.log('metadata HTTP', r.status);
const meta = await r.json().catch(() => null);
if (!meta) { console.log('metadata 不是 JSON'); process.exit(1); }
const dist = meta.result && meta.result.distribution ? meta.result.distribution : [];
console.log('distribution 數', dist.length, dist.map((d) => `${d.resourceFormat || ''}:${d.resourceDescription || ''}`).join(' | ').slice(0, 300));
console.log('更新頻率', (meta.result || {}).updateFrequency, '最後更新', (meta.result || {}).modified);
for (const d of dist.slice(0, 3)) {
  const url = d.resourceDownloadUrl;
  if (!url) continue;
  const host = new URL(url).host;
  console.log('下載 host', host, '格式', d.resourceFormat);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('  HTTP', res.status, res.headers.get('content-type'));
  if (!res.ok) continue;
  const text = (await res.text()).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  console.log('  列數', lines.length, '表頭', lines[0].slice(0, 300));
  if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
    try { const j = JSON.parse(text); const arr = Array.isArray(j) ? j : (j.data || j.result || []); console.log('  JSON 筆數', arr.length, '鍵', Object.keys(arr[0] || {}).join(',')); 
      const years = {}; arr.forEach((x) => { const y = String(x['核定日期'] || x['核定年度'] || x['年度'] || '').slice(0, 4); years[y] = (years[y] || 0) + 1; }); console.log('  年份分布', JSON.stringify(years).slice(0, 300));
      const keys = Object.keys(arr[0] || {}); console.log('  有統編欄位？', keys.some((k) => /統一編號|統編|BAN/i.test(k)), '有地址／縣市欄位？', keys.some((k) => /地址|縣市|所在/.test(k)));
    } catch (e) { console.log('  JSON 解析失敗', e.message); }
  } else {
    const head = lines[0].split(',');
    console.log('  有統編欄位？', head.some((k) => /統一編號|統編|BAN/i.test(k)), '有地址／縣市欄位？', head.some((k) => /地址|縣市|所在/.test(k)));
    const yi = head.findIndex((k) => /核定日期|年度/.test(k));
    if (yi >= 0) { const years = {}; lines.slice(1).forEach((l) => { const y = (l.split(',')[yi] || '').slice(0, 4); years[y] = (years[y] || 0) + 1; }); console.log('  年份分布', JSON.stringify(years).slice(0, 300)); }
  }
  break;
}
