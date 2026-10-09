/** 探路（一次性，看完刪）：經濟部投資審議司「核准對外投資」公開資料有沒有公司名稱。只印資料集名稱、欄位、筆數、狀態碼，不印任何公司名。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; } catch (e) { return { status: 0, type: '', text: '', err: e.message }; } };
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
const cat = await get('https://data.gov.tw/api/front/dataset/export?format=csv');
console.log(`data.gov.tw 目錄 HTTP ${cat.status}，${cat.text.length} 字`);
const t = parseCsv(cat.text); const h = t[0] || [];
const col = (n) => h.findIndex((x) => x.includes(n));
const I = { id: col('資料集識別碼'), title: col('資料集名稱'), fields: col('主要欄位說明'), org: col('提供機關'), url: col('資料下載網址'), freq: col('更新頻率'), n: col('資料量'), fmt: col('檔案格式') };
const hits = t.slice(1).filter((x) => /對外投資|國外投資|海外投資|赴.*投資|對東南亞|新南向/.test(String(x[I.title])) || (/投資審議|投資業務處/.test(String(x[I.org])) && /投資/.test(String(x[I.title]))));
console.log(`\n相關資料集 ${hits.length} 個：`);
hits.slice(0, 40).forEach((x) => console.log(`#${x[I.id]}｜${x[I.title]}｜${x[I.org]}｜${x[I.freq]}｜${String(x[I.fmt]).split(';')[0]}｜${String(x[I.n]).split(';')[0]}筆\n   欄位：${String(x[I.fields]).replace(/\s+/g, ' ').slice(0, 220)}\n   ${String(x[I.url]).split(/[;\n]/)[0]}`));
// 試抓前幾個：只印表頭、筆數，以及有沒有像公司名的欄位
for (const x of hits.filter((x) => /csv|json|xls/i.test(String(x[I.fmt]))).slice(0, 8)) {
  const u = String(x[I.url]).split(/[;\n]/)[0].trim();
  const r = await get(u);
  let head = ''; let rows = 0;
  if (/^\s*[[{]/.test(r.text)) { try { const j = JSON.parse(r.text); const a = Array.isArray(j) ? j : (j.data || j.records || j.result || []); rows = a.length; head = a[0] ? Object.keys(a[0]).join(' | ') : ''; } catch (e) { head = 'JSON 解析失敗'; } }
  else { const tt = parseCsv(r.text); rows = Math.max(0, tt.length - 1); head = (tt[0] || []).join(' | '); }
  console.log(`\n試抓 #${x[I.id]}：HTTP ${r.status} ${r.type}｜${rows} 列｜表頭：${head.slice(0, 300)}｜有公司名欄位：${/公司|名稱|投資人|事業/.test(head)}`);
}
// 投審司網站（新聞稿裡的重大案件）：只看連不連得上
for (const u of ['https://www.moeaic.gov.tw/', 'https://dir.moea.gov.tw/', 'https://www.moea.gov.tw/']) {
  const r = await get(u);
  console.log(`\n${u}：HTTP ${r.status}｜${r.text.length} 字｜標題 ${(r.text.match(/<title>([^<]{0,60})/) || [])[1] || ''}｜含「國外投資」${(r.text.match(/國外投資|對外投資/g) || []).length} 次 ${r.err || ''}`);
}
console.log('\n完成。');
