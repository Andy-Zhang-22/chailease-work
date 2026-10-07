/** 探路：使用者要的六種新資料（醫療機構、營造業、汽車貨運／遊覽車、食品業者登錄、環保列管工廠、出進口實績）。一次性，看完刪。只印資料集名稱、表頭、筆數，不印任何公司名稱。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u, init = {}) => { const r = await fetch(u, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length') || '', text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (t, b) => console.log(`\n=========== ${t} ===========\n${b}`);
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
const r = await get('https://data.gov.tw/api/front/dataset/export?format=csv');
const cat = parseCsv(r.text); const head = cat[0].map((h) => h.trim());
const col = (n) => head.findIndex((h) => h.includes(n));
const I = { id: col('資料集識別碼'), title: col('資料集名稱'), fields: col('主要欄位說明'), org: col('提供機關'), url: col('資料下載網址'), freq: col('更新頻率'), n: col('資料量'), fmt: col('檔案格式') };
show('目錄', `${cat.length} 列；欄 ${JSON.stringify(I)}`);
const NO = /統計|家數|概況|報表|分析|件數|人數|比率|趨勢|預算|決算|補助|津貼|志工|活動|課程/;
const TAX = /統編|統一編號|BAN|ban_no|UBN|營利事業/i;
const TOPICS = [
  ['醫療機構／診所（開業）', /醫事機構|醫療機構|診所|醫療院所/],
  ['營造業登記', /營造業|土木包工|專業營造/],
  ['汽車貨運／遊覽車／汽車運輸業', /汽車貨運|貨運業|遊覽車|汽車運輸業|運輸業者|貨櫃/],
  ['食品業者登錄', /食品業者登錄|食品業者/],
  ['環保列管事業／許可', /列管|固定污染源|操作許可|排放許可|事業廢棄物|環境保護許可|水污染/],
  ['出進口實績／貿易商規模', /實績|進出口廠商|出進口廠商|貿易商/],
];
const LOCAL = /新北市|臺北市|台北市/;
const picks = [];
for (const [name, re] of TOPICS) {
  const hits = cat.slice(1).filter((x) => { const t = String(x[I.title]); return re.test(t) && !NO.test(t); });
  const rows = hits.map((x) => ({ id: x[I.id], title: x[I.title], org: x[I.org], fields: String(x[I.fields]).replace(/\s+/g, ' ').slice(0, 220), url: String(x[I.url]).split(/[;\n]/)[0].trim(), n: Number(String(x[I.n]).split(';')[0]) || 0, freq: x[I.freq], fmt: String(x[I.fmt]).split(';')[0], tax: TAX.test(String(x[I.fields])) }));
  rows.sort((a, b) => Number(b.tax) - Number(a.tax) || b.n - a.n);
  show(`主題：${name}（${rows.length} 個；有統編欄 ${rows.filter((x) => x.tax).length}）`, rows.slice(0, 30).map((x) => `#${x.id}　${x.title}　【${x.org}｜${x.freq}｜${x.fmt}｜${x.n}筆${x.tax ? '｜統編' : ''}】\n   欄位：${x.fields}\n   ${x.url}`).join('\n'));
  rows.filter((x) => x.tax || /醫療|營造|貨運|遊覽|實績/.test(name)).slice(0, 4).forEach((x) => picks.push([name, x]));
}
// 試抓：每個主題前幾個，看表頭、新北臺北列數、日期欄最近的比例（不印內容）
for (const [name, x] of picks) {
  try {
    const s = await get(x.url, { headers: { Range: 'bytes=0-600000' } }); const t = s.text.replace(/^﻿/, '');
    let table = null;
    if (/json/.test(s.type) || /^\s*[[{]/.test(t)) { let j = null; try { j = JSON.parse(t); } catch (e) { j = null; } const arr = j ? (Array.isArray(j) ? j : (j.result && (j.result.records || j.result.results)) || j.data || j.records || null) : null; if (arr && arr.length && typeof arr[0] === 'object') { const h = Object.keys(arr[0]); table = [h, ...arr.map((o) => h.map((k) => String(o[k] ?? '')))]; } }
    else if (!/html|zip|octet/.test(s.type)) table = parseCsv(t);
    if (!table) { show(`  試抓【${name}】#${x.id} ${x.title}`, `HTTP ${s.status} ${s.type} ${s.len}（不是表格，前 120 字：${t.slice(0, 120).replace(/[一-鿿]{2,}(有限公司|股份|診所|醫院|企業社|商行)/g, '＊')}）`); continue; }
    const h = table[0]; const body = table.slice(1, 4000);
    const ai = h.findIndex((k) => /地址|住址|所在地|address/i.test(k)); const ti = h.findIndex((k) => TAX.test(k));
    const dis = h.map((k, i) => (/日期|年月|date|開業|核准|登記|發照/i.test(k) ? i : -1)).filter((i) => i >= 0);
    const local = ai >= 0 ? body.filter((c) => LOCAL.test(String(c[ai]))).length : -1;
    const taxOk = ti >= 0 ? body.filter((c) => /^\d{8}$/.test(String(c[ti]).trim())).length : -1;
    const dateInfo = dis.map((i) => { const ds = body.map((c) => String(c[i] || '').replace(/\D/g, '')).filter(Boolean); const recent = ds.filter((d) => /^(2026|2025|115|114)/.test(d)).length; return `${h[i]}：有值 ${ds.length}、最近兩年 ${recent}、樣式 ${ds.slice(0, 3).map((d) => d.replace(/\d/g, '9')).join('/')}`; }).join('；');
    show(`  試抓【${name}】#${x.id} ${x.title}`, `HTTP ${s.status} ${s.type} ${s.len}\n表頭：${h.join(' | ').slice(0, 400)}\n前 ${body.length} 列：新北／臺北 ${local}；統編 8 碼 ${taxOk}\n日期欄：${dateInfo || '無'}`);
  } catch (e) { show(`  試抓【${name}】#${x.id} ${x.title}`, `✗ ${e.message}`); }
  await nap(600);
}
console.log('\n完成。');
