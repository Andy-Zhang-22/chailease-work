/** 探路（一次性，看完刪）：外交部駐外館處入口 → 各館網站；泰國、越南的館找「台商名錄」檔案。只印館名、網址、檔名，不印任何名錄內容。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; } catch (e) { return { status: 0, type: '', text: '', err: e.message }; } };
const portal = await get('https://www.taiwanembassy.org/portalOfDiplomaticMission_tc.html');
console.log(`入口 HTTP ${portal.status} ${portal.type} ${portal.text.length} 字 ${portal.err || ''}`);
const urls = [...new Set([...portal.text.matchAll(/https?:\/\/[^"'\s<>\\)]+/g)].map((m) => m[0]))];
console.log(`網址 ${urls.length} 個；含 taiwanembassy/roc-taiwan 的：`);
console.log(urls.filter((u) => /taiwanembassy|roc-taiwan/.test(u)).slice(0, 80).join('\n'));
// 「泰」「越」附近的文字與網址
for (const kw of ['泰國', '越南', '胡志明']) {
  let i = -1; let n = 0;
  while ((i = portal.text.indexOf(kw, i + 1)) >= 0 && n < 4) { n++; console.log(`\n…${kw} 附近：${portal.text.slice(Math.max(0, i - 300), i + 300).replace(/\s+/g, ' ')}`); }
}
const links = [...portal.text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }));
const sites = links.filter((l) => /taiwanembassy\.org\/[a-z]{2,6}\/?/.test(l.href) || /roc-taiwan\.org\/[a-z]{2,6}/.test(l.href));
console.log(`連結 ${links.length}，館網站 ${sites.length}`);
console.log(sites.slice(0, 200).map((l) => `${l.text} | ${l.href}`).join('\n'));
// 有沒有其他資料來源（json）
const js = [...portal.text.matchAll(/(?:src|href)="([^"]+\.(?:js|json)[^"]*)"/g)].map((m) => m[1]);
console.log(`\njs/json：${js.slice(0, 20).join(' , ')}`);
const want = sites.filter((l) => /泰|越|胡志明|Thai|Viet|Ho Chi/i.test(l.text));
const bases = [...new Set([...want.map((l) => (l.href.match(/^(https?:\/\/[^/]+\/[a-z]{2,6})/) || [])[1]).filter(Boolean), 'https://www.taiwanembassy.org/th', 'https://www.roc-taiwan.org/th', 'https://www.roc-taiwan.org/vn', 'https://www.roc-taiwan.org/vnsgn', 'https://www.taiwanembassy.org/vn', 'https://www.taiwanembassy.org/vnsgn'])];
for (const b of bases) { const r = await get(`${b}/wp-json/`); console.log(`探 ${b}/wp-json/ HTTP ${r.status} ${r.text.length} 字 ${(r.text.match(/"name":"([^"]{0,60})/) || [])[1] || ''}`); }
console.log(`\n泰國／越南的館：${bases.join(' , ')}`);
for (const b of bases) {
  for (const q of ['台商名錄', '名錄', '臺商', '台商', 'directory']) {
    const r = await get(`${b}/wp-json/wp/v2/media?search=${encodeURIComponent(q)}&per_page=100`);
    let arr = []; try { arr = JSON.parse(r.text); } catch (e) { arr = []; }
    console.log(`\n${b} media「${q}」HTTP ${r.status}：${Array.isArray(arr) ? arr.length : '非陣列'} 筆`);
    if (Array.isArray(arr)) arr.forEach((m) => console.log(`  ${(m.date || '').slice(0, 10)}｜${(m.title && m.title.rendered || '').slice(0, 80)}｜${m.mime_type}｜${m.source_url}`));
    const s = await get(`${b}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=50`);
    let sr = []; try { sr = JSON.parse(s.text); } catch (e) { sr = []; }
    if (Array.isArray(sr) && sr.length) { console.log(`  頁面搜尋 ${sr.length} 筆`); sr.slice(0, 20).forEach((x) => console.log(`  頁｜${String(x.title || '').slice(0, 80)}｜${x.url}`)); }
  }
}
console.log('\n完成。');
