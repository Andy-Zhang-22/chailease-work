/** 探路第二輪：依營業項目別公司登記有哪些營業項目、健保特約醫事機構、固定污染源許可。一次性，看完刪。只印資料集名稱、表頭、筆數，不印任何資料列。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u, init = {}) => { const r = await fetch(u, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(180000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length') || '', text: await r.text() }; };
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
const rowOf = (x) => ({ id: x[I.id], title: x[I.title], org: x[I.org], fields: String(x[I.fields]).replace(/\s+/g, ' ').slice(0, 200), url: String(x[I.url]).split(/[;\n]/)[0].trim(), n: Number(String(x[I.n]).split(';')[0]) || 0, freq: x[I.freq], fmt: String(x[I.fmt]).split(';')[0] });
// 1. 依營業項目別：列出全部標題（只要跟客群有關的關鍵字）
const byItem = cat.slice(1).filter((x) => /公司登記\(依營業項目別\)|公司登記（依營業項目別）/.test(String(x[I.title]))).map(rowOf);
show(`公司登記(依營業項目別) 共 ${byItem.length} 個`, byItem.filter((x) => /營造|土木|工程|貨運|運輸|遊覽|計程|機械|設備|醫療|食品|塑膠|金屬|模具|印刷|物流|倉儲|冷凍|租賃|汽車|機車|電子|半導體|化學|紡織/.test(x.title)).map((x) => `#${x.id}　${x.title}　【${x.freq}｜${x.n}筆】`).join('\n'));
// 2. 健保特約／醫事機構有日期的
const med = cat.slice(1).filter((x) => /特約|醫事機構|醫療機構|院所/.test(String(x[I.title])) && /健保|保險|醫事|醫療/.test(String(x[I.org]) + String(x[I.title])) && /日期|起日|開業/.test(String(x[I.fields]))).map(rowOf).sort((a, b) => b.n - a.n);
show(`醫事機構（欄位有日期）${med.length} 個`, med.slice(0, 20).map((x) => `#${x.id}　${x.title}　【${x.org}｜${x.freq}｜${x.fmt}｜${x.n}筆】\n   欄位：${x.fields}\n   ${x.url}`).join('\n'));
// 3. 固定污染源／空污許可
const air = cat.slice(1).filter((x) => /固定污染源|空氣污染.*許可|操作許可|設置許可/.test(String(x[I.title]))).map(rowOf).sort((a, b) => b.n - a.n);
show(`固定污染源許可 ${air.length} 個`, air.slice(0, 12).map((x) => `#${x.id}　${x.title}　【${x.org}｜${x.freq}｜${x.fmt}｜${x.n}筆】\n   欄位：${x.fields}\n   ${x.url}`).join('\n'));
// 試抓：只印表頭、筆數、日期欄
const trial = [...med.slice(0, 3), ...air.slice(0, 3), ...byItem.filter((x) => /綜合營造|土木包工|專業營造/.test(x.title)).slice(0, 3)];
for (const x of trial) {
  try {
    const s = await get(x.url, { headers: { Range: 'bytes=0-800000' } }); const t = s.text.replace(/^﻿/, '');
    let table = null;
    if (/^\s*[[{]/.test(t)) { let j = null; try { j = JSON.parse(t); } catch (e) { j = null; } const arr = j ? (Array.isArray(j) ? j : (j.result && (j.result.records || j.result.results)) || j.data || j.records || null) : null; if (arr && arr.length && typeof arr[0] === 'object') { const h = Object.keys(arr[0]); table = [h, ...arr.map((o) => h.map((k) => String(o[k] ?? '')))]; } }
    else if (!/zip/.test(s.type) && !/^PK/.test(t)) table = parseCsv(t);
    if (!table) { show(`  試抓 #${x.id} ${x.title}`, `HTTP ${s.status} ${s.type} ${s.len}（不是表格${/^PK/.test(t) ? '，是 zip' : ''}）`); continue; }
    const h = table[0]; const body = table.slice(1, 6000);
    const ai = h.findIndex((k) => /地址|住址|所在地|address|addr/i.test(k)); const ti = h.findIndex((k) => /統編|統一編號|ban|uniform/i.test(k));
    const dis = h.map((k, i) => (/日期|年月|date|開業|核准|起|發照/i.test(k) ? i : -1)).filter((i) => i >= 0);
    const local = ai >= 0 ? body.filter((c) => /新北市|臺北市|台北市/.test(String(c[ai]))).length : -1;
    const taxOk = ti >= 0 ? body.filter((c) => /^\d{8}$/.test(String(c[ti]).trim())).length : -1;
    const dateInfo = dis.map((i) => { const ds = body.map((c) => String(c[i] || '').replace(/\D/g, '')).filter(Boolean); return `${h[i]}：有值 ${ds.length}、最近兩年 ${ds.filter((d) => /^(2026|2025|115|114)/.test(d)).length}`; }).join('；');
    show(`  試抓 #${x.id} ${x.title}`, `HTTP ${s.status} ${s.type} ${s.len}\n表頭：${h.join(' | ').slice(0, 400)}\n前 ${body.length} 列：新北／臺北 ${local}；統編 8 碼 ${taxOk}\n日期欄：${dateInfo || '無'}`);
  } catch (e) { show(`  試抓 #${x.id} ${x.title}`, `✗ ${e.message}`); }
  await nap(600);
}
console.log('\n完成。');
