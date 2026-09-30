/**
 * 探路第四輪。看完連同 workflow 一起刪。
 * 第三輪：twbuying 的 /api/v1/tenders 只有機關、標案名、金額，沒有得標廠商；每筆有 url（/index/case/…）。
 * 出進口廠商登記資料在 https://fbfh.trade.gov.tw/opendata/companyData.csv（12 欄，含電話、傳真，代表人中間字遮掉）。
 * 這輪：(1) twbuying 的標案頁、得標廠商頁有沒有廠商名稱／統編；(2) companyData.csv 整份多大、新北市幾筆、有電話幾筆、核發日期分布。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length'), url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
const page = async (title, url, from, len = 3000) => {
  try {
    const r = await get(url);
    const t = strip(r.text);
    const i = from ? Math.max(0, t.indexOf(from)) : 0;
    show(title, `HTTP ${r.status} ${r.type} ${r.text.length} 字 → ${r.url}\n${t.slice(i, i + len)}`);
    return r;
  } catch (e) { show(title, `✗ ${e.message}`); return null; }
};

// ---------- 一、twbuying 標案頁 ----------
const c = await page('twbuying 標案頁（找得標廠商）', 'https://twbuying.org/index/case/3.82.1/1150921-1/20260929/BDM-1-71291996', '決標', 3500);
if (c) {
  const links = [...new Set([...c.text.matchAll(/href="([^"]*(?:company|vendor|supplier|firm)[^"]*)"/g)].map((m) => m[1]))];
  show('標案頁上像廠商的連結', links.slice(0, 15).join('\n'));
  const idish = [...new Set((c.text.match(/\b\d{8}\b/g) || []))].slice(0, 20);
  show('標案頁上像統編的 8 位數字', idish.join(' '));
}
await nap(1500);
await page('twbuying 得標廠商一覽', 'https://twbuying.org/company', '得標廠商', 2500);
await nap(1500);
// 說明頁沒寫，但試一下有沒有給廠商用的 API（回什麼記什麼）
for (const u of ['https://twbuying.org/api/v1/tenders?q=%E6%96%B0%E5%8C%97%E5%B8%82%E6%94%BF%E5%BA%9C%E4%B8%89%E9%87%8D%E5%B8%82%E6%94%BF%E5%A4%A7%E6%A8%93%E6%98%87%E9%99%8D&type=award&limit=2&detail=1', 'https://twbuying.org/api/v1/case?id=BDM-1-71291996', 'https://twbuying.org/api/v1/companies?county=%E6%96%B0%E5%8C%97%E5%B8%82&limit=3']) {
  try { const r = await get(u); show(`twbuying 試 ${u}`, `HTTP ${r.status} ${r.type}\n${(/json/.test(r.type) ? r.text : strip(r.text)).slice(0, 800)}`); } catch (e) { show(`twbuying 試 ${u}`, `✗ ${e.message}`); }
  await nap(1500);
}

// ---------- 二、companyData.csv 整份統計（串流，不存檔） ----------
try {
  const r = await fetch('https://fbfh.trade.gov.tw/opendata/companyData.csv', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(600000) });
  show('companyData.csv 表頭資訊', `HTTP ${r.status} ${r.headers.get('content-type')} content-length=${r.headers.get('content-length')} last-modified=${r.headers.get('last-modified')}`);
  const dec = new TextDecoder('utf-8');
  let buf = ''; let n = 0; let bytes = 0; let ntpc = 0; let ntpcPhone = 0; let phone = 0; const byYear = {}; const byDist = {}; let head = ''; const samples = [];
  const cell = (line) => { const out = []; let cur = ''; let q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const handle = (line) => {
    if (!line.trim()) return;
    if (!head) { head = line; return; }
    n++;
    const c = cell(line);
    const addr = c[5] || ''; const tel = c[8] || ''; const issued = c[2] || '';
    if (tel.trim()) phone++;
    const y = issued.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1;
    if (/^(新北市|臺北縣|台北縣)/.test(addr)) {
      ntpc++; if (tel.trim()) ntpcPhone++;
      const d = (addr.match(/^(?:新北市|臺北縣|台北縣)(.{1,3}?(?:區|市|鄉|鎮))/) || [])[1] || '?'; byDist[d] = (byDist[d] || 0) + 1;
      if (samples.length < 3 && tel.trim()) samples.push(`${c[0]} ${c[3]} ${addr} ${c[7]} ${tel} 原始登記 ${c[1]} 核發 ${issued} 進${c[10]}出${c[11]}`);
    }
  };
  for await (const chunk of r.body) {
    bytes += chunk.length; buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
  }
  handle(buf);
  const years = Object.entries(byYear).sort().filter(([y]) => y >= '2018').map(([y, k]) => `${y}:${k}`).join(' ');
  const dists = Object.entries(byDist).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, k]) => `${d}:${k}`).join(' ');
  show('companyData.csv 整份統計', `${(bytes / 1e6).toFixed(1)} MB、${n} 筆、有電話 ${phone} 筆\n新北市 ${ntpc} 筆、其中有電話 ${ntpcPhone} 筆\n核發日期年份（2018 起）：${years}\n新北市各區前 12：${dists}\n表頭：${head.slice(0, 300)}\n新北市樣本（有電話）：\n${samples.join('\n')}`);
} catch (e) { show('companyData.csv 整份統計', `✗ ${e.message}`); }
console.log('\n完成。');
