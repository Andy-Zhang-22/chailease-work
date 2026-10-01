/** 探路：臺北市有沒有「商業登記」的開放檔（要有負責人）。一次性，看完刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u, init = {}) => { const r = await fetch(u, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', url: r.url, text: await r.text() }; };
const show = (t, b) => console.log(`\n=========== ${t} ===========\n${b}`);
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
async function sample(title, u) {
  try {
    const s = await get(u, { headers: { Range: 'bytes=0-200000' } }); const t = s.text.replace(/^﻿/, '');
    let body = `HTTP ${s.status} ${s.type} → ${s.url}\n`;
    if (/json/.test(s.type) || /^\s*[[{]/.test(t)) { let j = null; try { j = JSON.parse(t); } catch (e) { /* 截斷 */ } const rows = j ? (Array.isArray(j) ? j : (j.result && j.result.results) || j.result || j.data || j.records || []) : null; const row = Array.isArray(rows) ? rows[0] : null; body += row ? `JSON；第一筆的鍵：${Object.keys(row).join(' | ')}\n第一筆：${JSON.stringify(row).slice(0, 600)}` : t.slice(0, 600); }
    else if (/html/.test(s.type)) body += strip(t).slice(0, 400);
    else { const lines = t.split(/\r?\n/); body += `${lines.length} 列（前 200KB）\n表頭：${lines[0].slice(0, 500)}\n第 2 列：${(lines[1] || '').slice(0, 400)}`; }
    show(`  試抓 ${title}`, body);
  } catch (e) { show(`  試抓 ${title}`, `✗ ${e.message}`); }
}
const r = await get('https://data.gov.tw/api/front/dataset/export?format=csv');
const cat = parseCsv(r.text); const head = cat[0].map((h) => h.trim());
const col = (n) => head.findIndex((h) => h.includes(n));
const iId = col('資料集識別碼'); const iTitle = col('資料集名稱'); const iFields = col('主要欄位說明'); const iOrg = col('提供機關'); const iUrl = col('資料下載網址'); const iFreq = col('更新頻率'); const iN = col('資料量'); const iDesc = col('資料集描述');
show('目錄', `${cat.length} 列`);
const hits = cat.slice(1).filter((x) => /商業登記|商業名稱|商號|營利事業|公司登記/.test(x[iTitle]) && /臺北|台北/.test(`${x[iTitle]}${x[iOrg]}${x[iDesc]}`) && !/統計|家數|概況/.test(x[iTitle]));
show(`臺北市 商業／公司登記（${hits.length} 個）`, hits.slice(0, 40).map((x) => `#${x[iId]}　${x[iTitle]}　【${x[iOrg]}｜${x[iFreq]}｜${x[iN]}筆】\n   欄位：${String(x[iFields]).slice(0, 260)}\n   下載：${String(x[iUrl]).split(/[;\n]/)[0].slice(0, 200)}`).join('\n'));
const owner = hits.filter((x) => /負責人|代表人/.test(x[iFields]));
show(`其中欄位有負責人的（${owner.length} 個）`, owner.map((x) => `#${x[iId]} ${x[iTitle]}`).join('\n'));
for (const x of [...owner, ...hits.filter((x) => !owner.includes(x))].slice(0, 6)) { const u = String(x[iUrl]).split(/[;\n]/)[0].trim(); if (u) await sample(`#${x[iId]} ${x[iTitle]}`, u); }
// data.taipei 自己的搜尋頁
for (const q of ['商業登記', '公司登記']) { try { const p = await get(`https://data.taipei/api/v1/dataset/search?q=${encodeURIComponent(q)}&limit=20`); show(`data.taipei 搜尋 ${q}`, `HTTP ${p.status} ${p.type}\n${p.text.slice(0, 2500)}`); } catch (e) { show(`data.taipei 搜尋 ${q}`, `✗ ${e.message}`); } }
console.log('\n完成。');
