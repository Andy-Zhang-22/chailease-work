/*
 * 一次性探路第三輪（看完就刪）：臺北市產業發展獎勵補助網站。
 * 前兩輪：Actions 連得到；核定結果公告（news_detail/N）是一張「序｜類型｜公司」的表，沒統編、沒金額；補助企業資料庫的明細頁（database_detail/N）有統編。
 * 這輪看：資料庫明細頁有哪些欄位；列表一頁幾家、共幾頁、明細編號是不是越新越大；最近兩次公告的公司有幾家已經在資料庫裡（只印家數）。
 * 公司名、統編一律遮掉。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = 'https://www.industry-incentive.taipei';
const strip = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t\r\n]+/g, ' ').trim();
const mask = (s) => String(s || '').replace(/[一-鿿A-Za-z0-9（）()．·\-]{1,30}?((股份)?有限公司|商行|企業社|工作室|事務所)/g, '○○$1').replace(/(?<!\d)\d{8}(?!\d)/g, '########');
const key = (s) => String(s || '').normalize('NFKC').replace(/\s/g, '').replace(/台/g, '臺');
async function get(url, quiet) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(40000) });
    const text = await res.text();
    if (!quiet) console.log(`\nGET ${url} → HTTP ${res.status}，${text.length} 字`);
    return res.ok ? text : '';
  } catch (err) { console.log(`\nGET ${url} → 失敗 ${err.message}`); return ''; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noScript = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const linesOf = (h) => noScript(h).replace(/<(br|\/p|\/li|\/tr|\/div|\/h\d|\/dt|\/dd|\/th|\/td|\/span)\b[^>]*>/gi, '\n').split('\n').map(strip).filter((x) => x.length > 1);

// 一、明細頁的欄位：找「統一編號」前後各 14 行
{
  const h = await get(`${BASE}/database_detail/514`);
  const ls = linesOf(h); const i = ls.findIndex((x) => /統一編號|統編/.test(x));
  console.log(`  共 ${ls.length} 行，「統一編號」在第 ${i} 行；前後（遮掉）：`);
  ls.slice(Math.max(0, i - 14), i + 15).forEach((x) => console.log(`    ${mask(x).slice(0, 120)}`));
  console.log(`  冒號開頭的欄名：${[...new Set(ls.map((x) => (x.match(/^([一-鿿（）()／/]{2,12})\s*[：:]/) || [])[1]).filter(Boolean))].join('｜')}`);
}

// 二、列表：一頁幾家、明細編號、每家那一塊長什麼樣、最後一頁
const dbNames = new Map();   // 名稱 key → 明細編號
let pagesSeen = 0;
for (const [year, id] of [['2026', 7]]) {
  let last = 1;
  for (let p = 1; p <= last && p <= 40; p += 1) {
    const h = await get(`${BASE}/database/${id}?p=${p}`, p > 1);
    if (!h) break;
    pagesSeen += 1;
    const body = noScript(h);
    const ids = [...new Set([...body.matchAll(/database_detail\/(\d+)/g)].map((m) => Number(m[1])))];
    const pnums = [...body.matchAll(/database\/\d+\?p=(\d+)/g)].map((m) => Number(m[1]));
    if (pnums.length) last = Math.max(last, ...pnums);
    // 每個明細連結裡的文字當公司名
    for (const m of body.matchAll(/<a\b[^>]*href\s*=\s*["'][^"']*database_detail\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = strip(m[2]); const nm = (t.match(/[一-鿿A-Za-z0-9（）()．·\-]+?(股份有限公司|有限公司|商行|企業社)/) || [])[0];
      if (nm) dbNames.set(key(nm), Number(m[1]));
    }
    if (p === 1) {
      console.log(`  ${year} 補助年度第 1 頁：明細 ${ids.length} 筆，編號 ${ids.join('、')}；看得到的最後頁碼 ${last}`);
      const first = body.match(/<a\b[^>]*href\s*=\s*["'][^"']*database_detail\/\d+["'][^>]*>[\s\S]*?<\/a>/i);
      console.log(`  第一筆那一塊（遮掉）：${first ? mask(strip(first[0])).slice(0, 200) : ''}`);
      const i = body.search(/database_detail\/\d+/); const blk = linesOf(body.slice(Math.max(0, i - 1500), i + 1500));
      console.log('  明細連結附近的行（遮掉）：'); blk.slice(0, 22).forEach((x) => console.log(`    ${mask(x).slice(0, 110)}`));
    }
    if (p === last) console.log(`  第 ${p} 頁（最後）：明細 ${ids.length} 筆，編號 ${ids.join('、')}`);
    await sleep(600);
  }
  console.log(`  ${year} 補助年度共翻 ${pagesSeen} 頁，抓到公司名 ${dbNames.size} 家；明細編號 ${Math.min(...dbNames.values())}～${Math.max(...dbNames.values())}`);
}

// 三、最近兩次公告的公司，有幾家已經在 2026 補助年度的資料庫裡
for (const nid of [502, 499]) {
  const h = await get(`${BASE}/news_detail/${nid}`, true);
  const rows = [...noScript(h).matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => [...m[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1])));
  const data = rows.filter((r) => r.length >= 3 && /公司|商行|企業社/.test(r[2]) && r[2] !== '公司');
  const types = {}; data.forEach((r) => { types[r[1]] = (types[r[1]] || 0) + 1; });
  const hit = data.filter((r) => dbNames.has(key(r[2]))).length;
  const title = strip((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 40);
  const date = (strip(noScript(h)).match(/20\d{2}-\d{2}-\d{2}/) || [''])[0];
  console.log(`\n公告 ${nid}「${title}」${date}：${data.length} 家，類型 ${JSON.stringify(types)}；已在 2026 資料庫 ${hit} 家`);
}
console.log('\n完成');
