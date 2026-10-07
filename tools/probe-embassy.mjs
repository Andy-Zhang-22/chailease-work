/** 探路（一次性，看完刪）：外交部駐外館處網站。用 Playwright 的 Chromium 開（直接抓回來的是同一頁擋機器人的頁面）。只印館名、網址、檔名，不印名錄內容。 */
import { chromium } from 'playwright';
const raw = await (await fetch('https://www.taiwanembassy.org/portalOfDiplomaticMission_tc.html', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
console.log(`直接抓回來的頁面開頭：${raw.slice(0, 600).replace(/\s+/g, ' ')}`);
console.log(`<title>：${(raw.match(/<title>([^<]*)/) || [])[1] || ''}`);
const br = await chromium.launch();
const pg = await br.newPage({ locale: 'zh-TW' });
await pg.goto('https://www.taiwanembassy.org/portalOfDiplomaticMission_tc.html#ALL', { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => console.log(`goto：${e.message}`));
await pg.waitForTimeout(5000);
console.log(`\n瀏覽器標題：${await pg.title()}`);
const links = await pg.$$eval('a', (a) => a.map((x) => ({ href: x.href, text: x.textContent.replace(/\s+/g, ' ').trim() })));
console.log(`連結 ${links.length}`);
const sites = links.filter((l) => /taiwanembassy\.org\/[a-z]{2,8}\/?$|roc-taiwan\.org\/[a-z]{2,8}\/?$/.test(l.href));
console.log(`館網站 ${sites.length}：\n${sites.map((l) => `${l.text} | ${l.href}`).join('\n')}`);
const want = sites.filter((l) => /泰|越|胡志明/.test(l.text));
for (const l of want) {
  const base = l.href.replace(/\/$/, '');
  for (const q of ['台商名錄', '臺商名錄', '名錄']) {
    const p2 = await br.newPage();
    const url = `${base}/wp-json/wp/v2/media?search=${encodeURIComponent(q)}&per_page=100`;
    const resp = await p2.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
    const body = resp ? await resp.text().catch(() => '') : '';
    let arr = null; try { arr = JSON.parse(body); } catch (e) { arr = null; }
    console.log(`\n${l.text} media「${q}」HTTP ${resp ? resp.status() : 0}：${Array.isArray(arr) ? `${arr.length} 筆` : `不是 JSON（${body.slice(0, 80).replace(/\s+/g, ' ')}）`}`);
    if (Array.isArray(arr)) arr.forEach((m) => console.log(`  ${(m.date || '').slice(0, 10)}｜${(m.title && m.title.rendered || '').slice(0, 80)}｜${m.source_url}`));
    if (!Array.isArray(arr)) {
      // 用站內搜尋頁
      await p2.goto(`${base}/?s=${encodeURIComponent(q)}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      const hits = await p2.$$eval('a', (a) => a.map((x) => ({ href: x.href, text: x.textContent.replace(/\s+/g, ' ').trim() })).filter((x) => /名錄|台商|臺商|\.pdf|\.xls/i.test(x.text + x.href)));
      console.log(`  站內搜尋：${hits.length} 個相關連結`); hits.slice(0, 30).forEach((h) => console.log(`  ${h.text.slice(0, 60)}｜${h.href}`));
    }
    await p2.close();
  }
}
await br.close();
console.log('\n完成。');
