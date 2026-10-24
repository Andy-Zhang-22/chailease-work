// 一次性探路（看完就刪）：g0v 標案 API 的鍵名。只印 brief.type 的種類與筆數、detail 的鍵名，不印標案或廠商內容。
const BASE = 'https://pcc-api.openfun.app';
const date = process.argv[2] || '20261023';
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); console.log(`GET ${u.replace(BASE, '')} → ${r.status} ${r.headers.get('content-type')}`); return r.json(); };
const list = await get(`${BASE}/api/listbydate?date=${date}`);
console.log('listbydate 頂層鍵：', Object.keys(list));
const recs = list.records || [];
console.log('records 筆數：', recs.length, '；一筆的鍵：', recs[0] ? Object.keys(recs[0]) : '-', '；brief 的鍵：', recs[0] && recs[0].brief ? Object.keys(recs[0].brief) : '-');
const types = {};
recs.forEach((r) => { const t = (r.brief || {}).type || '?'; types[t] = (types[t] || 0) + 1; });
console.log('brief.type 種類與筆數：', types);
const awards = recs.filter((r) => /決標公告/.test(String((r.brief || {}).type || '')));
console.log('決標公告（含更正）筆數：', awards.length);
for (const a of awards.slice(0, 3)) {
  await nap(1000);
  const t = await get(`${BASE}/api/tender?unit_id=${encodeURIComponent(a.unit_id)}&job_number=${encodeURIComponent(a.job_number)}`);
  const trs = t.records || [];
  console.log('tender 頂層鍵：', Object.keys(t), '；records 筆數：', trs.length, '；各筆 brief.type：', trs.map((x) => (x.brief || {}).type));
  const hit = trs.find((x) => x.filename === a.filename) || trs[trs.length - 1];
  const d = (hit && hit.detail) || {};
  const keys = Object.keys(d);
  console.log(`對到 filename 的那筆：一筆的鍵 ${Object.keys(hit || {})}；detail 鍵數 ${keys.length}`);
  const groups = {};
  keys.forEach((k) => { const g = k.split(':')[0]; groups[g] = (groups[g] || 0) + 1; });
  console.log('detail 區塊與鍵數：', groups);
  console.log('detail 非投標廠商的鍵（全部）：', keys.filter((k) => !/^投標廠商/.test(k)));
  const v1 = keys.filter((k) => /^投標廠商:投標廠商1:/.test(k));
  console.log('投標廠商1 的鍵：', v1);
  const vendorN = new Set(keys.map((k) => (k.match(/^投標廠商:投標廠商(\d+):/) || [])[1]).filter(Boolean));
  console.log('投標廠商家數：', vendorN.size, '；是否得標 的值種類：', [...new Set([...vendorN].map((n) => d[`投標廠商:投標廠商${n}:是否得標`]))], '；組織型態 的值種類：', [...new Set([...vendorN].map((n) => d[`投標廠商:投標廠商${n}:組織型態`]))]);
}
