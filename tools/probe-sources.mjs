/**
 * 探路第三輪：第二輪拿到的目錄下載是 HTML 不是 CSV；勞動部那邊是 CKAN 式 API。看完連同 workflow 一起刪。
 *  1. data.gov.tw：試 API（/api/v2/rest/dataset/{id}）、搜尋頁 SSR、目錄下載加 Accept。
 *  2. 勞動部 OdService：/rest/dataset 列全部、/rest/tag 找標籤、抓一兩個像職缺的看欄位。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length'), disp: r.headers.get('content-disposition') || '', url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
const peek = async (title, url, init) => {
  try {
    const r = await get(url, init);
    const t = r.text.replace(/^﻿/, '');
    const body = `HTTP ${r.status} ${r.type} len=${r.len} disp=${r.disp} → ${r.url}\n` + (/html/.test(r.type) ? strip(t).slice(0, 900) : t.slice(0, 1400));
    show(title, body);
    return r;
  } catch (e) { show(title, `✗ ${e.message}`); return null; }
};

// ---------- 1. data.gov.tw ----------
await peek('data.gov.tw API v2 dataset 6564', 'https://data.gov.tw/api/v2/rest/dataset/6564');
await nap(600);
await peek('data.gov.tw API v2 dataset 6564（Accept json）', 'https://data.gov.tw/api/v2/rest/dataset/6564', { headers: { Accept: 'application/json' } });
await nap(600);
await peek('目錄下載（Accept csv）', 'https://data.gov.tw/datasets/datasets_download', { headers: { Accept: 'text/csv,application/octet-stream;q=0.9,*/*;q=0.8' } });
await nap(600);
await peek('目錄下載 api/front', 'https://data.gov.tw/api/front/dataset/export?format=csv');
await nap(600);
for (const q of ['工廠登記', '求才', '產業園區 廠商', '減班休息']) {
  const r = await peek(`搜尋頁 ${q}`, `https://data.gov.tw/datasets/search?p=1&size=10&s=_score_desc&q=${encodeURIComponent(q)}`);
  if (r) {
    const ids = [...new Set([...r.text.matchAll(/\/dataset\/(\d+)/g)].map((m) => m[1]))];
    const titles = [...r.text.matchAll(/<a[^>]+href="\/dataset\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => `#${m[1]} ${strip(m[2]).trim()}`);
    show(`  搜尋頁 ${q} 裡的資料集`, `${ids.length} 個：${ids.slice(0, 30).join(', ')}\n${titles.slice(0, 20).join('\n')}`);
  }
  await nap(800);
}
for (const id of ['6903', '23489', '155234', '161139', '9608', '125540']) {
  await peek(`API v2 dataset ${id}`, `https://data.gov.tw/api/v2/rest/dataset/${id}`, { headers: { Accept: 'application/json' } });
  await nap(600);
}

// ---------- 2. 勞動部 OdService ----------
const base = 'https://apiservice.mol.gov.tw/OdService';
const list = await peek('MOL /rest/dataset', `${base}/rest/dataset`);
await nap(600);
await peek('MOL /rest/tag', `${base}/rest/tag`);
await nap(600);
await peek('MOL /rest/group', `${base}/rest/group`);
await nap(600);
let ids = [];
try { const j = JSON.parse(list.text); ids = Array.isArray(j) ? j : (j.result || j.data || j.datasets || Object.values(j).find(Array.isArray) || []); } catch (e) { /* 不是 JSON */ }
show('MOL 資料集識別碼', `${ids.length} 個；前 20：${JSON.stringify(ids.slice(0, 20)).slice(0, 600)}`);
const hits = [];
for (const id of ids.slice(0, 400)) {
  const key = typeof id === 'string' ? id : (id.id || id.identifier || id.datasetId || JSON.stringify(id));
  try {
    const r = await get(`${base}/rest/dataset/${encodeURIComponent(key)}`);
    const t = r.text;
    const title = (t.match(/"(?:title|name|資料集名稱)"\s*:\s*"([^"]+)"/) || [])[1] || t.slice(0, 80);
    if (/求才|職缺|徵才|就業|減班|無薪|解僱|投保單位|事業單位|工會|廠商/.test(t)) hits.push(`${key}　${title}\n   ${t.replace(/\s+/g, ' ').slice(0, 500)}`);
  } catch (e) { /* 略 */ }
  await nap(150);
}
show(`MOL 看起來相關的資料集（掃了 ${Math.min(ids.length, 400)} 個）`, hits.slice(0, 25).join('\n') || '（沒有）');
console.log('\n完成。');
