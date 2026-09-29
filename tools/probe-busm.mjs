/** 探路：商業（獨資／合夥）每月設立／變更清冊在哪、長什麼樣。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type') || '', url: r.url, buf, text: buf.toString('utf8') }; };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (label, r) => console.log(`\n== ${label}\n   ${r.url}\n   HTTP ${r.status} ${r.type} ${r.buf.length} bytes`);

// 1. 商業每月登記資料清冊下載
for (const u of ['https://serv.gcis.nat.gov.tw/moeadsBF/bms/report.jsp', 'https://serv.gcis.nat.gov.tw/moeadsBF/bms/reportCity.jsp']) {
  try {
    const r = await get(u); show('商業清冊頁', r);
    console.log(`   文字：${strip(r.text).slice(0, 1500)}`);
    const links = [...new Set([...r.text.matchAll(/(?:href|action)=["']([^"']+)["']/g)].map((m) => m[1]))].filter((x) => !/\.(css|js|png|gif|jpg)/.test(x)).slice(0, 40);
    console.log(`   連結／表單：\n   ${links.join('\n   ')}`);
    const selects = [...r.text.matchAll(/<select[^>]*name=["']([^"']+)["'][\s\S]*?<\/select>/g)].map((m) => `${m[1]}: ${[...m[0].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)/g)].map((o) => `${o[1]}=${o[2].trim()}`).slice(0, 12).join(' | ')}`);
    console.log(`   下拉：\n   ${selects.join('\n   ')}`);
    const inputs = [...r.text.matchAll(/<input[^>]*>/g)].map((m) => m[0]).slice(0, 25);
    console.log(`   input：\n   ${inputs.join('\n   ')}`);
  } catch (e) { console.log(`\n== ${u}\n   ✗ ${e.message}`); }
  await nap(500);
}
// 2. 開放平臺的商業設立／變更／歇業清冊
try {
  const r = await get('https://data.gcis.nat.gov.tw/od/datacategory'); show('商工行政資料開放平臺 目錄', r);
  const rows = [...r.text.matchAll(/<a[^>]*href=["']([^"']*detail\?oid=[^"']+)["'][^>]*>([^<]*)</g)].map((m) => [m[2].trim(), m[1]]).filter(([t]) => /商業/.test(t));
  console.log(`   有「商業」的資料集：\n   ${rows.map(([t, h]) => `${t} → ${h}`).join('\n   ')}`);
  for (const [t, h] of rows.filter(([t]) => /設立|變更|歇業/.test(t)).slice(0, 4)) {
    const d = await get(h.startsWith('http') ? h : `https://data.gcis.nat.gov.tw${h}`); show(`資料集：${t}`, d);
    const files = [...new Set([...d.text.matchAll(/od\/file\?oid=[0-9A-F-]+/gi)].map((m) => m[0]))].slice(0, 6);
    const text = strip(d.text);
    console.log(`   說明：${(text.match(/欄位[^。]{0,300}/) || [])[0] || text.slice(0, 400)}\n   檔案：${files.join(' ')}`);
    for (const f of files.slice(0, 2)) {
      const c = await get(`https://data.gcis.nat.gov.tw/${f}`); show(`  檔案 ${f}`, c);
      const t2 = c.text.replace(/^﻿/, '');
      const lines = t2.split(/\r?\n/);
      console.log(`   列數 ${lines.length}\n   表頭：${lines[0].slice(0, 300)}\n   第一列：${(lines[1] || '').slice(0, 300)}\n   新北市的列：${lines.filter((l) => l.includes('新北市')).length}`);
      await nap(500);
    }
    await nap(500);
  }
} catch (e) { console.log(`\n== 開放平臺\n   ✗ ${e.message}`); }
console.log('\n完成。');
