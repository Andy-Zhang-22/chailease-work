/*
 * 一次性探路第四輪（看完就刪）：臺北市產業發展獎勵補助網站的「審議委員大會核定結果」公告。
 * 看：公告列表（/news/）怎麼翻頁、兩年內有幾則核定公告；公告裡那張表的 HTML（rowspan）照規則拆出來每次幾家、各類型幾家。
 * 公司名一律遮掉，只印結構、標題、日期、家數。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = 'https://www.industry-incentive.taipei';
const noScript = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t\r\n]+/g, ' ').trim();
const mask = (s) => String(s || '').replace(/[一-鿿A-Za-z0-9（）()．·\-]{1,30}?((股份)?有限公司|商行|企業社|工作室|事務所)/g, '○○$1').replace(/(?<!\d)\d{8}(?!\d)/g, '########');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(40000) });
    const text = await res.text();
    return { status: res.status, text: res.ok ? text : '' };
  } catch (err) { return { status: 0, text: '', err: err.message }; }
}
/** 列表頁 → [{ id, title, date }]：連到 news_detail/N 的連結，文字裡的 YYYY-MM-DD 當日期 */
function listOf(html) {
  const out = []; const seen = new Set();
  for (const m of noScript(html).matchAll(/<a\b[^>]*href\s*=\s*["'][^"']*news_detail\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = Number(m[1]); const t = strip(m[2]);
    if (seen.has(id) || !t) continue; seen.add(id);
    out.push({ id, title: t.slice(0, 70), date: (t.match(/20\d{2}-\d{2}-\d{2}/) || [''])[0] });
  }
  return out;
}
/** 公告那張表 → [{ type, name }]：類型那格用 rowspan 跨好幾列，往下帶 */
function rowsOf(html) {
  const tbl = (noScript(html).match(/<table\b[\s\S]*?<\/table>/i) || [''])[0];
  const out = []; let carry = { type: '', left: 0 };
  for (const tr of tbl.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((c) => ({ span: Number((c[1].match(/rowspan\s*=\s*["']?(\d+)/i) || [0, 1])[1]), text: strip(c[2]) }));
    if (!cells.length) continue;
    const name = cells[cells.length - 1].text;
    if (!/公司|商行|企業社|工作室|事務所|社$/.test(name) || name === '公司') { continue; }
    let type = '';
    const typed = cells.find((c) => /補助|獎勵|計畫/.test(c.text) && c.text !== name);
    if (typed) { type = typed.text; carry = { type, left: typed.span - 1 }; }
    else if (carry.left > 0) { type = carry.type; carry.left -= 1; }
    else type = carry.type;
    out.push({ type, name });
  }
  return out;
}

// 一、列表怎麼翻頁
const first = await get(`${BASE}/news/`);
console.log(`GET /news/ → HTTP ${first.status}，${first.text.length} 字`);
const body = noScript(first.text);
const pageLinks = [...new Set([...body.matchAll(/href\s*=\s*["']([^"']*(?:[?&]p=\d+|\/page\/\d+|news\/\d*\/?\?[^"']*)[^"']*)["']/gi)].map((m) => m[1]))];
console.log(`  像翻頁的連結 ${pageLinks.length}：${pageLinks.slice(0, 8).join('、')}`);
const items1 = listOf(first.text);
console.log(`  第 1 頁 ${items1.length} 則，編號 ${items1.map((x) => x.id).join('、')}，日期 ${items1.map((x) => x.date).join('、')}`);
const one = body.match(/<a\b[^>]*href\s*=\s*["'][^"']*news_detail\/\d+["'][^>]*>[\s\S]*?<\/a>/i);
console.log(`  一則的 HTML（前 500 字）：${one ? mask(one[0].replace(/\s+/g, ' ')).slice(0, 500) : ''}`);

// 二、往後翻，收兩年內的核定公告
const cut = new Date(Date.now() - 25 * 30 * 86400000).toISOString().slice(0, 10);
const ann = new Map(); let pages = 0; let lastP = Math.max(1, ...pageLinks.map((x) => Number((x.match(/[?&]p=(\d+)/) || [0, 0])[1])));
let allSeen = new Set();
for (let p = 1; p <= 60; p += 1) {
  const r = p === 1 ? first : await get(`${BASE}/news/?p=${p}`);
  if (!r.text) { console.log(`  第 ${p} 頁 HTTP ${r.status}，停`); break; }
  const items = listOf(r.text); pages += 1;
  const fresh = items.filter((x) => !allSeen.has(x.id)); items.forEach((x) => allSeen.add(x.id));
  if (!fresh.length) { console.log(`  第 ${p} 頁沒有新的（?p= 沒作用或到底了），停`); break; }
  fresh.filter((x) => /核定/.test(x.title) && /審議|委員/.test(x.title)).forEach((x) => ann.set(x.id, x));
  const oldest = fresh.map((x) => x.date).filter(Boolean).sort()[0] || '';
  if (p <= 3 || p % 5 === 0) console.log(`  第 ${p} 頁 ${fresh.length} 則，最舊 ${oldest}`);
  if (oldest && oldest < cut) { console.log(`  第 ${p} 頁最舊 ${oldest} 早於 ${cut}，停`); break; }
  await sleep(500);
}
const list = [...ann.values()].filter((x) => !x.date || x.date >= cut).sort((a, b) => b.id - a.id);
console.log(`\n翻了 ${pages} 頁、看過 ${allSeen.size} 則；兩年內的核定公告 ${list.length} 則：`);
list.forEach((x) => console.log(`  ${x.id} ${x.date} ${x.title.replace(/\s*20\d{2}-\d{2}-\d{2}[\s\S]*$/, '').slice(0, 50)}`));

// 三、每則拆表（只印家數與類型）
let total = 0; const typeAll = {}; const names = new Set(); let shown = false;
for (const x of list.slice(0, 40)) {
  const r = await get(`${BASE}/news_detail/${x.id}`);
  if (!r.text) { console.log(`  ${x.id} HTTP ${r.status}`); continue; }
  if (!shown) {
    shown = true;
    const tbl = (noScript(r.text).match(/<table\b[\s\S]*?<\/table>/i) || [''])[0];
    console.log(`\n${x.id} 那張表的 HTML（遮掉，前 1,400 字）：\n${mask(tbl.replace(/\s+/g, ' ').replace(/ style="[^"]*"/g, '').replace(/ class="[^"]*"/g, '')).slice(0, 1400)}`);
    const tables = (noScript(r.text).match(/<table\b/gi) || []).length; console.log(`  這則有 ${tables} 張表`);
  }
  const rows = rowsOf(r.text); const t = {};
  rows.forEach((y) => { t[y.type || '（沒類型）'] = (t[y.type || '（沒類型）'] || 0) + 1; typeAll[y.type || '（沒類型）'] = (typeAll[y.type || '（沒類型）'] || 0) + 1; names.add(y.name.replace(/\s/g, '')); });
  total += rows.length;
  console.log(`  ${x.id} ${x.date}：${rows.length} 家 ${JSON.stringify(t)}`);
  await sleep(500);
}
console.log(`\n合計 ${total} 列、不重複 ${names.size} 家；類型 ${JSON.stringify(typeAll)}`);
console.log('完成');
