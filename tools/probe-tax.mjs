/**
 * 探路：財政部「全國營業（稅籍）登記資料」在哪裡、能不能下載、欄位長怎樣。一次性的，看完連同 workflow 一起刪。
 * 不猜網址：先從 data.gov.tw 的搜尋與資料集頁面把下載連結挖出來，再對每一個試 HEAD 與前 2MB。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = (url, init = {}) => fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' });
const show = (label, text) => console.log(`\n=========== ${label} ===========\n${text}`);
const found = new Set();
const harvest = (html, base) => {
  const re = /https?:\/\/[^\s"'<>]+/g; let m;
  while ((m = re.exec(html))) { const u = m[0].replace(/&amp;/g, '&'); if (/\.(csv|zip|json|xml|txt)(\?|$)/i.test(u) || /fia\.gov\.tw|download|Download/.test(u)) found.add(u); }
  const rel = /href="(\/[^"]+)"/g; while ((m = rel.exec(html))) { if (/dataset\/\d+/.test(m[1])) found.add(new URL(m[1], base).href); }
};
// 1. data.gov.tw 搜尋
for (const q of ['營業(稅籍)登記', '營業稅籍登記資料集', '全國營業 稅籍 登記']) {
  const url = `https://data.gov.tw/datasets/search?p=1&size=10&s=_score_desc&q=${encodeURIComponent(q)}`;
  try { const r = await get(url); const t = await r.text(); show(`搜尋 ${q}`, `HTTP ${r.status} ${t.length} bytes`); harvest(t, url);
    const titles = [...t.matchAll(/dataset\/(\d+)[^>]*>([^<]{4,80})</g)].slice(0, 15).map((x) => `${x[1]} ${x[2].trim()}`); console.log(titles.join('\n')); }
  catch (e) { show(`搜尋 ${q}`, `✗ ${e.message}`); }
}
// 2. 資料集頁面（9400 是印象中的編號，不對也沒關係，上面搜尋會補）
for (const id of [9400, ...[...found].map((u) => (u.match(/dataset\/(\d+)/) || [])[1]).filter(Boolean)].slice(0, 6)) {
  for (const url of [`https://data.gov.tw/api/v2/rest/dataset/${id}`, `https://data.gov.tw/dataset/${id}`]) {
    try { const r = await get(url); const t = await r.text(); show(url, `HTTP ${r.status} ${t.length} bytes`);
      if (/api\/v2/.test(url)) { try { const j = JSON.parse(t); console.log(JSON.stringify({ title: j.title, org: j.providerAttribute, dist: (j.distribution || []).map((d) => ({ desc: d.resourceDescription, url: d.downloadURL, fmt: d.resourceFormat })) }, null, 1).slice(0, 3000)); (j.distribution || []).forEach((d) => d.downloadURL && found.add(d.downloadURL)); } catch (e) { console.log(t.slice(0, 500)); } }
      else { harvest(t, url); const title = (t.match(/<title>([^<]+)</) || [])[1]; console.log('title:', title); }
    } catch (e) { show(url, `✗ ${e.message}`); }
  }
}
// 3. 對每個看起來像檔案的連結試 HEAD 與前 2MB
const files = [...found].filter((u) => /fia\.gov\.tw|\.(csv|zip)(\?|$)/i.test(u));
show('候選下載連結', files.join('\n') || '（沒有）');
for (const u of files.slice(0, 8)) {
  try {
    const h = await get(u, { method: 'HEAD' });
    console.log(`\n--- ${u}\nHEAD ${h.status} type=${h.headers.get('content-type')} length=${h.headers.get('content-length')} ranges=${h.headers.get('accept-ranges')}`);
    if (/\.zip(\?|$)/i.test(u)) continue;
    const r = await get(u, { headers: { Range: 'bytes=0-2000000' } });
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(`GET ${r.status} got ${buf.length} bytes`);
    let text = buf.toString('utf8'); let enc = 'utf8';
    if ((text.match(/�/g) || []).length > 20) { try { text = new TextDecoder('big5').decode(buf); enc = 'big5'; } catch (e) { /* 沒有 big5 */ } }
    const lines = text.split(/\r?\n/);
    console.log(`encoding=${enc} 前 2MB 約 ${lines.length} 列`);
    console.log('表頭：', lines[0].slice(0, 500));
    lines.slice(1, 4).forEach((l) => console.log('列：', l.slice(0, 300)));
  } catch (e) { console.log(`\n--- ${u}\n✗ ${e.message}`); }
}
console.log('\n完成。');
