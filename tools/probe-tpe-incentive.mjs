/*
 * 一次性探路（看完就刪）：臺北市產業發展獎勵補助網站（README 版本 435 記的 industry-incentive.taipei）在 Actions 上連不連得到、
 * 每月審議委員會的核定公告在哪一頁、公告裡有沒有逐家名單（公司名、統編、核定日、金額）。
 * 只印 HTTP 狀態、長度、標題、連結文字與路徑、筆數；不印公司名。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const KEY = /公告|核定|審議|最新消息|消息|名單|資料庫|補助企業|獲補助|通過|news|bulletin|announce|database|company|result/i;
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function get(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', 'Accept-Language': 'zh-TW,zh;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(40000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const text = /text|json|xml|javascript/.test(ct) || !ct ? buf.toString('utf8') : '';
    console.log(`GET ${url}\n  → HTTP ${res.status}，${ct}，${buf.length} bytes，${Date.now() - started}ms${res.url !== url ? `，轉到 ${res.url}` : ''}`);
    return { ok: res.ok, status: res.status, url: res.url, ct, text, bytes: buf.length };
  } catch (err) {
    console.log(`GET ${url}\n  → 失敗：${err.name} ${err.message}${err.cause ? `（${err.cause.code || err.cause.message}）` : ''}，${Date.now() - started}ms`);
    return { ok: false, status: 0, url, ct: '', text: '', bytes: 0 };
  }
}
const linksOf = (html, base) => {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href; try { href = new URL(m[1], base).href; } catch (e) { continue; }
    out.push({ href, text: strip(m[2]).slice(0, 60) });
  }
  return out;
};
function describe(page, label) {
  const html = page.text;
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const body = strip(html);
  const files = [...html.matchAll(/href\s*=\s*["']([^"']+\.(pdf|ods|odt|xlsx?|docx?|csv|zip))["']/gi)].map((m) => m[2].toLowerCase());
  const fileCount = files.reduce((a, x) => { a[x] = (a[x] || 0) + 1; return a; }, {});
  console.log(`  [${label}] 標題「${title}」；文字 ${body.length} 字；<tr> ${(html.match(/<tr\b/gi) || []).length}；<li> ${(html.match(/<li\b/gi) || []).length}；附件 ${JSON.stringify(fileCount)}`);
  console.log(`  有「統一編號／統編」${/統一編號|統編/.test(body)}；「公司」字樣 ${(body.match(/(股份)?有限公司/g) || []).length} 次；「核定」${(body.match(/核定/g) || []).length} 次；「第…次」${(body.match(/第\s*\d+\s*次/g) || []).length} 次；8 碼數字 ${(body.match(/(?<!\d)\d{8}(?!\d)/g) || []).length} 個`);
  const scripts = [...html.matchAll(/<script[^>]*src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const apis = [...new Set([...html.matchAll(/["'`](\/?(?:api|Api|API)\/[A-Za-z0-9_\-\/.?=&]+)["'`]/g)].map((m) => m[1]))];
  console.log(`  <script src> ${scripts.length} 個${scripts.length ? `（${scripts.slice(0, 6).join('、')}）` : ''}；HTML 裡像 API 的路徑 ${apis.length} 個${apis.length ? `：${apis.slice(0, 10).join('、')}` : ''}`);
  return { title, body };
}

let home = null;
for (const base of ['https://www.industry-incentive.taipei/', 'https://industry-incentive.taipei/', 'http://www.industry-incentive.taipei/']) {
  const p = await get(base);
  if (p.ok && p.text) { home = p; break; }
}
if (!home) { console.log('\n結論：Actions 連不到（或被擋）。'); process.exit(0); }
describe(home, '首頁');
const all = linksOf(home.text, home.url);
const host = new URL(home.url).host;
const same = all.filter((l) => { try { return new URL(l.href).host === host; } catch (e) { return false; } });
console.log(`\n首頁連結 ${all.length} 個（同站 ${same.length}）。跟公告／核定／名單有關的：`);
const seen = new Set();
const cands = same.filter((l) => KEY.test(l.text) || KEY.test(decodeURIComponent(l.href))).filter((l) => (seen.has(l.href) ? false : seen.add(l.href)));
cands.slice(0, 40).forEach((l) => console.log(`  「${l.text}」 ${l.href}`));
if (!cands.length) { console.log('  （沒有；列前 40 個同站連結）'); same.slice(0, 40).forEach((l) => console.log(`  「${l.text}」 ${l.href}`)); }

// 往下一層：每個候選頁看長相，並列出裡面像「第 N 次…核定」的公告標題（只印標題與路徑）
const second = [];
for (const l of cands.slice(0, 8)) {
  console.log('');
  const p = await get(l.href);
  if (!p.ok || !p.text) continue;
  describe(p, l.text || '候選頁');
  const inner = linksOf(p.text, p.url).filter((x) => /核定|審議|第\s*\d+\s*次|通過|獲補助|名單/.test(x.text));
  const uniq = []; const s2 = new Set();
  inner.forEach((x) => { if (!s2.has(x.href)) { s2.add(x.href); uniq.push(x); } });
  console.log(`  裡面像核定公告的連結 ${uniq.length} 個：`);
  uniq.slice(0, 12).forEach((x) => console.log(`    「${x.text}」 ${x.href}`));
  second.push(...uniq.slice(0, 2));
}
// 第三層：打開最多 3 則公告，看裡面是表格還是附件、有沒有統編（不印內容）
const s3 = new Set();
for (const l of second.filter((x) => (s3.has(x.href) ? false : s3.add(x.href))).slice(0, 3)) {
  console.log('');
  const p = await get(l.href);
  if (!p.ok) continue;
  if (!p.text) { console.log(`  [公告] 不是文字（${p.ct}），${p.bytes} bytes`); continue; }
  const d = describe(p, `公告：${l.text}`);
  const heads = [...p.text.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => strip(m[1])).filter(Boolean).slice(0, 20);
  console.log(`  表頭（<th>）：${heads.join('｜') || '（沒有）'}`);
  const att = linksOf(p.text, p.url).filter((x) => /\.(pdf|ods|odt|xlsx?|docx?|csv|zip)(\?|$)/i.test(x.href));
  console.log(`  附件連結 ${att.length} 個：${att.slice(0, 5).map((x) => `「${x.text}」${x.href.split('/').pop().slice(0, 50)}`).join('、')}`);
}
console.log('\n完成');
