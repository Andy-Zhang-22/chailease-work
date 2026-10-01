/**
 * 探路第二輪：DuckDuckGo 第一個主題之後就被限流（202），改走兩條不靠搜尋的路。看完連同 workflow 一起刪。
 *  1. data.gov.tw 資料集 6564「政府資料開放平臺資料集清單」：整份目錄 CSV，用關鍵字在標題／說明裡找。
 *  2. 勞動部 apiservice.mol.gov.tw/OdService 的 OpenAPI 文件（第一輪看到的）：列全部資料集，找台灣就業通的職缺、減班休息。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length'), url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1 || (r[0] || '').trim());
}
async function sample(title, u) {
  try {
    const s = await get(u, { headers: { Range: 'bytes=0-200000' } });
    const t = s.text.replace(/^﻿/, '');
    let body = `HTTP ${s.status} ${s.type} content-length=${s.len} → ${s.url}\n`;
    if (/json/.test(s.type) || /^\s*[[{]/.test(t)) {
      let j = null; try { j = JSON.parse(t); } catch (e) { /* 截斷 */ }
      const rows = j ? (Array.isArray(j) ? j : (j.records || j.data || j.result || j.results || j.items || [])) : null;
      const row = rows && Array.isArray(rows) ? rows[0] : null;
      body += row ? `JSON ${Array.isArray(rows) ? rows.length : '?'} 筆（前 200KB）；第一筆的鍵：${Object.keys(row).join(' | ')}\n第一筆：${JSON.stringify(row).slice(0, 700)}` : `${t.slice(0, 700)}`;
    } else if (/html/.test(s.type)) body += strip(t).slice(0, 500);
    else { const lines = t.split(/\r?\n/); body += `${lines.length} 列（前 200KB）\n表頭：${lines[0].slice(0, 600)}\n第 2 列：${(lines[1] || '').slice(0, 500)}`; }
    show(`  試抓 ${title}`, body);
  } catch (e) { show(`  試抓 ${title}`, `✗ ${e.message}`); }
}

// ---------- 1. data.gov.tw 整份目錄 ----------
let catalog = [];
try {
  const page = await get('https://data.gov.tw/dataset/6564');
  const links = [...new Set([...page.text.matchAll(/https?:\/\/[^"'<>\s]+/g)].map((m) => m[0].replace(/&amp;/g, '&')).filter((u) => /datasets_download|\.csv|download/i.test(u) && !/google|facebook/.test(u)))];
  show('目錄資料集 6564 的下載連結', links.slice(0, 10).join('\n'));
  for (const u of links.slice(0, 4)) {
    try {
      const r = await get(u);
      if (!/csv|text|octet/i.test(r.type) && !/^﻿?[^\n]*,[^\n]*\n/.test(r.text)) { show(`目錄 ${u}`, `HTTP ${r.status} ${r.type}（不是 CSV）${strip(r.text).slice(0, 200)}`); continue; }
      const rows = parseCsv(r.text);
      show(`目錄 ${u}`, `HTTP ${r.status} ${r.type} ${rows.length} 列\n表頭：${(rows[0] || []).join(' | ')}`);
      if (rows.length > 100) { catalog = rows; break; }
    } catch (e) { show(`目錄 ${u}`, `✗ ${e.message}`); }
    await nap(800);
  }
} catch (e) { show('目錄資料集 6564', `✗ ${e.message}`); }

const TOPICS = [
  ['求才職缺（公司名、電話）', /求才|職缺|徵才|就業通/, /統計|人數|倍數|按.*分|調查|指標|概況|報表/],
  ['產業園區廠商', /園區.*廠商|廠商.*園區|工業區.*廠商|廠商名錄|進駐廠商/, /統計|用電|用水|污水/],
  ['工廠登記', /工廠.*(登記|名錄|清冊|基本資料|公示)/, /統計|家數|用電|用水|筆數|產值/],
  ['SBIR／補助通過', /SBIR|創新研發.*計畫|補助.*(名單|核定|通過)|核定.*補助/, /統計|金額.*統計/],
  ['投資核准', /投資.*(核准|名單)|核准.*投資|投資臺灣|投資台灣/, /統計|金額/],
  ['固定污染源', /固定污染源.*(基本|公私|名單|清冊)/, /排放量|統計|費/],
  ['拒絕往來', /拒絕往來|退票/, /統計/],
  ['減班休息／無薪假', /減班休息|無薪假|大量解僱/, /統計/],
  ['勞保投保單位', /投保單位/, /統計|人數/],
];
if (catalog.length) {
  const head = catalog[0].map((h) => h.trim());
  const col = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iId = col(['資料集識別碼', '識別碼', 'id']); const iTitle = col(['資料集名稱', '名稱']); const iDesc = col(['資料集描述', '描述']); const iFields = col(['主要欄位說明', '欄位']); const iOrg = col(['提供機關']); const iUrl = col(['資料下載網址', '下載網址']); const iFreq = col(['更新頻率']); const iFmt = col(['檔案格式']);
  show('目錄欄位對應', `id=${iId} title=${iTitle} desc=${iDesc} fields=${iFields} org=${iOrg} url=${iUrl} freq=${iFreq} fmt=${iFmt}`);
  for (const [topic, re, bad] of TOPICS) {
    const hits = catalog.slice(1).filter((r) => re.test(`${r[iTitle] || ''}`) && !bad.test(`${r[iTitle] || ''}`));
    show(`主題：${topic}（標題符合 ${hits.length} 個）`, hits.slice(0, 14).map((r) => `#${r[iId]}　${r[iTitle]}　【${r[iOrg]}｜${r[iFreq] || ''}｜${(r[iFmt] || '').slice(0, 20)}】\n   欄位：${String(r[iFields] || '').slice(0, 220)}\n   下載：${String(r[iUrl] || '').split(/[;\n]/)[0].slice(0, 200)}`).join('\n'));
    // 有「電話」欄位的優先試抓
    const withPhone = hits.filter((r) => /電話|聯絡/.test(String(r[iFields] || '')));
    const tryList = [...withPhone, ...hits.filter((r) => !withPhone.includes(r))].slice(0, 2);
    for (const r of tryList) {
      const u = String(r[iUrl] || '').split(/[;\n]/)[0].trim();
      if (u) { await sample(`#${r[iId]} ${r[iTitle]}`, u); await nap(800); }
    }
  }
}

// ---------- 2. 勞動部 OdService 的目錄 ----------
try {
  const r = await get('https://apiservice.mol.gov.tw/OdService/doc/v3.json');
  let j = null; try { j = JSON.parse(r.text); } catch (e) { j = null; }
  if (!j) show('勞動部 OdService doc', `HTTP ${r.status} ${r.type}\n${strip(r.text).slice(0, 600)}`);
  else {
    const paths = Object.keys(j.paths || {});
    const items = paths.map((p) => { const op = j.paths[p]; const m = op.get || op.post || Object.values(op)[0] || {}; return `${p}　${m.summary || m.description || ''}`; });
    show(`勞動部 OdService：${paths.length} 條`, items.filter((x) => /求才|職缺|就業通|徵才|減班|無薪|解僱|投保單位|事業單位/.test(x)).slice(0, 40).join('\n') || items.slice(0, 40).join('\n'));
  }
} catch (e) { show('勞動部 OdService doc', `✗ ${e.message}`); }
console.log('\n完成。');
