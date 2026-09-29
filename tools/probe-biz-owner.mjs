/** 探路第五輪：那幾個 data.gov.tw 資料集頁面裡的下載連結與欄位（找負責人姓名）。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type'), url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
for (const id of ['125322', '53657', '139211', '37352', '52930', '123399', '139649', '6668', '108372', '143241', '144855', '144016']) {
  try {
    const r = await get(`https://data.gov.tw/dataset/${id}`);
    const title = (r.text.match(/<title>([^<]+)</) || [])[1] || '';
    const text = strip(r.text);
    const fieldDesc = (text.match(/主要欄位說明\s*([^※]{0,400})/) || [])[1] || (text.match(/欄位說明\s*(.{0,400})/) || [])[1] || '';
    const links = [...new Set([...r.text.matchAll(/https?:\/\/[^"'<>\s]+/g)].map((m) => m[0].replace(/&amp;/g, '&')).filter((u) => !/data\.gov\.tw|google|facebook|w3\.org|schema\.org|gstatic|cloudflare|jquery|bootstrap|fonts\./.test(u) && /\.(csv|json|xml|zip)(\?|$)|download|api|ntpc|gcis|fia\.gov/i.test(u)))];
    console.log(`\n=========== ${id} ${title} ===========\n欄位：${fieldDesc}\n連結：\n${links.slice(0, 15).join('\n')}`);
    for (const u of links.filter((x) => /\.(csv|json)(\?|$)|download|datasets\/[0-9a-f-]{36}/i.test(x)).slice(0, 3)) {
      try {
        const s = await get(u, { headers: { Range: 'bytes=0-300000' } });
        const t = s.text.replace(/^﻿/, '');
        if (t.trim().startsWith('[') || t.trim().startsWith('{')) { let j; try { j = JSON.parse(t); } catch (e) { j = null; } const row = j ? (Array.isArray(j) ? j[0] : (j.data || j.result || [])[0] || j) : null; console.log(`  ${u}\n  HTTP ${s.status} ${s.type} JSON 欄位：${row ? Object.keys(row).join(' | ') : t.slice(0, 200)}\n  第一筆：${JSON.stringify(row).slice(0, 300)}`); }
        else { const lines = t.split(/\r?\n/); console.log(`  ${u}\n  HTTP ${s.status} ${s.type} 前 300KB ${lines.length} 列\n  表頭：${lines[0].slice(0, 400)}\n  列：${(lines[1] || '').slice(0, 300)}`); }
      } catch (e) { console.log(`  ${u}\n  ✗ ${e.message}`); }
      await nap(500);
    }
  } catch (e) { console.log(`\n=========== ${id} ===========\n✗ ${e.message}`); }
  await nap(600);
}
console.log('\n完成。');
