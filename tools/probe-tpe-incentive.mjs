/*
 * 一次性探路第五輪（看完就刪）：臺北市產業發展獎勵補助網站。
 * 看兩件事：(1) 第 165 次核定公告（news_detail/502）首頁有、/news 列表第 1 頁沒有——它在列表頁的哪裡、什麼標記；各分類（/news/1…6）第 1 頁有哪些編號。
 * (2) 第 159 次以前的公告沒有「類型」欄——表格幾張、表頭、表格前面的文字（類型是不是寫在表格外面）。公司名遮掉。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = 'https://www.industry-incentive.taipei';
const noScript = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t\r\n]+/g, ' ').trim();
const mask = (s) => String(s || '').replace(/[一-鿿A-Za-z0-9（）()．·\-]{1,30}?((股份)?有限公司|商行|企業社|工作室|事務所)/g, '○○$1').replace(/(?<!\d)\d{8}(?!\d)/g, '########');
const slim = (h) => h.replace(/\s+/g, ' ').replace(/ (style|class|width|height|cellspacing|cellpadding|lang|valign|align|border)="[^"]*"/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  try { const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(40000) }); const text = await res.text(); return { status: res.status, text: res.ok ? text : '' }; }
  catch (err) { return { status: 0, text: '' }; }
}
// (1) 各列表頁的編號、502 在哪
for (const p of ['/', '/news', '/news/1', '/news/2', '/news/3', '/news/4', '/news/5', '/news/6']) {
  const r = await get(`${BASE}${p}`); const b = noScript(r.text);
  const ids = [...new Set([...b.matchAll(/news_detail\/(\d+)/g)].map((m) => Number(m[1])))];
  const cat = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 30);
  console.log(`${p} → HTTP ${r.status}「${cat}」；news_detail 編號 ${ids.join('、') || '（沒有）'}`);
  const i = b.indexOf('news_detail/502');
  if (i >= 0) console.log(`  502 前後的 HTML：${mask(slim(b.slice(Math.max(0, i - 260), i + 420)))}`);
  await sleep(400);
}
// (2) 舊格式的公告
for (const id of [502, 492, 457, 447, 426, 34]) {
  const r = await get(`${BASE}/news_detail/${id}`); const b = noScript(r.text);
  const title = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 50);
  const date = (strip(b).match(/20\d{2}-\d{2}-\d{2}/) || [''])[0];
  const tables = [...b.matchAll(/<table\b[\s\S]*?<\/table>/gi)];
  console.log(`\n${id}「${title}」${date}：${tables.length} 張表`);
  // 內容區：從日期那個元素到第一張表之前、每張表之間的文字
  const t0 = tables.length ? tables[0].index : -1;
  const di = b.indexOf(date);
  if (t0 > 0) console.log(`  第一張表之前（日期之後）的文字：${mask(strip(b.slice(di > 0 && di < t0 ? di : Math.max(0, t0 - 1500), t0))).slice(-320)}`);
  tables.forEach((t, k) => {
    const rows = [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((tr) => [...tr[0].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((c) => `${(c[1].match(/rowspan\s*=\s*["']?(\d+)/i) || [0, ''])[1] ? `[跨${(c[1].match(/rowspan\s*=\s*["']?(\d+)/i))[1]}]` : ''}${mask(strip(c[2])).slice(0, 18)}`));
    console.log(`  表 ${k + 1}：${rows.length} 列；各列格數 ${[...new Set(rows.map((x) => x.length))].join('/')}；前 4 列：${rows.slice(0, 4).map((x) => x.join('｜')).join(' ‖ ')}`);
    if (k + 1 < tables.length) { const between = strip(b.slice(t.index + t[0].length, tables[k + 1].index)); console.log(`    到下一張表之間的文字：${mask(between).slice(0, 120)}`); }
  });
  if (!tables.length) { const i = b.search(/(股份)?有限公司/); console.log(`  沒有表；第一個「公司」前後：${mask(slim(b.slice(Math.max(0, i - 500), i + 500)))}`); }
  await sleep(400);
}
console.log('\n完成');
