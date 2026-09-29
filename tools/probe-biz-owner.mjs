/** 探路第四輪：data.gov.tw 上「新北市商業登記資料-〇〇業」那一組資料集：編號、下載連結、欄位（有沒有負責人）。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type'), url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (t, s) => console.log(`\n=========== ${t} ===========\n${s}`);
const ids = new Map();
for (const q of ['site:data.gov.tw 新北市商業登記資料', 'site:data.gov.tw 新北市商業登記資料 製造業', 'site:data.gov.tw 新北市商業登記資料 營造業', 'site:data.gov.tw "商業登記資料" 縣市 負責人', 'site:data.gov.tw 商業設立登記清冊 月份']) {
  try {
    const r = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const hrefs = [...r.text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).map((h) => { const u = h.match(/uddg=([^&]+)/); return u ? decodeURIComponent(u[1]) : h; }).filter((h) => /data\.gov\.tw\/dataset\/\d+/.test(h));
    const titles = [...r.text.matchAll(/class="result__a"[^>]*>([^<]{3,120})</g)].map((m) => m[1].trim());
    hrefs.forEach((h, i) => { const id = h.match(/dataset\/(\d+)/)[1]; if (!ids.has(id)) ids.set(id, titles[i] || ''); });
    show(`duckduckgo ${q}`, `HTTP ${r.status}\n${hrefs.map((h, i) => `${h} ｜ ${titles[i] || ''}`).slice(0, 12).join('\n')}`);
  } catch (e) { show(`duckduckgo ${q}`, `✗ ${e.message}`); }
  await nap(1200);
}
for (const [id, title] of [...ids].slice(0, 12)) {
  try {
    const r = await get(`https://data.gov.tw/api/v2/rest/dataset/${id}`);
    let j = {}; try { j = JSON.parse(r.text); } catch (e) { /* */ }
    const dist = (j.distribution || []).map((d) => ({ fmt: d.resourceFormat, url: d.downloadURL, desc: String(d.resourceDescription || '').slice(0, 60) }));
    show(`${id} ${j.title || title}`, `提供機關：${j.providerAttribute || ''}　更新：${j.modified || ''}\n欄位：${String(j.fieldDescription || '').slice(0, 500)}\n${dist.map((d) => `${d.fmt} ${d.url} ｜ ${d.desc}`).join('\n')}`);
    const csv = dist.find((d) => /csv/i.test(d.fmt || '') || /\.csv/i.test(d.url || ''));
    if (csv) {
      const s = await get(csv.url, { headers: { Range: 'bytes=0-300000' } });
      const text = s.text.replace(/^﻿/, '');
      const lines = text.split(/\r?\n/);
      console.log(`  下載 HTTP ${s.status} ${s.type} 前 300KB ${lines.length} 列\n  表頭：${lines[0].slice(0, 400)}\n  列：${(lines[1] || '').slice(0, 300)}\n  列：${(lines[2] || '').slice(0, 300)}`);
    }
  } catch (e) { show(`${id} ${title}`, `✗ ${e.message}`); }
  await nap(600);
}
console.log('\n完成。');
