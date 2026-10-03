/** 探路：像健保「新成立投保單位」這種「成立公司一定會留下紀錄」的公開資料還有哪些。一次性，看完刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u, init = {}) => { const r = await fetch(u, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', url: r.url, text: await r.text() }; };
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
const I = { id: col('資料集識別碼'), title: col('資料集名稱'), fields: col('主要欄位說明'), org: col('提供機關'), url: col('資料下載網址'), freq: col('更新頻率'), n: col('資料量'), desc: col('資料集描述'), fmt: col('檔案格式') };
show('目錄', `${cat.length} 列`);
const NO = /統計|家數|概況|報表|醫院|診所|長照|幼兒|托嬰|學校|社區|公園|活動|課程|補助|津貼|志工|社團|協會|宗教|停車|公車|景點|農產|市集|攤販|夜市|美食|小吃|餐廳|民宿|旅館|飯店|觀光|圖書|博物|藝文|展覽|講座|法規|申請書|表單|範本|流程|電話簿|通訊錄|機關|學會|基金會|志願|服務站|據點|關懷|照顧|身心|老人|兒童|婦女|青年|原住民|客家|新住民|眷村|軍|警|衛生所|防疫|疫苗|評鑑|得獎|優良|績優|表揚|獎勵|友善|績效|裁處|處分|違規|稽查結果/;
const TOPICS = [
  ['食品業者登錄（非登不可）', /食品業者登錄|食品業者|食品製造|食品工廠/],
  ['商標申請／公告（有新品牌）', /商標/],
  ['專利申請／公告', /專利/],
  ['建造執照／使用執照（起造人是公司＝蓋廠房辦公室）', /建造執照|使用執照|建照|使照|雜項執照/],
  ['工廠登記', /工廠登記|工廠名錄|工廠清冊|工廠基本|工廠公示|登記工廠/],
  ['稅籍登記（公司也在裡面）', /稅籍|營業登記|營業人/],
  ['統一發票／電子發票營業人', /統一發票|電子發票/],
  ['勞工退休金／就業保險／勞保投保單位', /退休金提繳|就業保險|投保單位|勞工保險/],
  ['聘僱外籍／移工許可', /聘僱|外籍|移工|外國人工作/],
  ['消防安全設備申報', /消防安全|防火管理|公共安全申報/],
  ['藥商／化粧品／醫療器材業者登錄', /藥商|化粧品|醫療器材/],
  ['商品檢驗登錄／報驗義務人', /商品檢驗|報驗|驗證登錄/],
  ['汽車運輸業／貨運業許可', /汽車運輸業|貨運業|運輸業/],
  ['事業廢棄物清除處理許可', /廢棄物清除|廢棄物處理|清除機構/],
  ['營造業登記', /營造業|土木包工/],
  ['公司分公司／外國公司認許', /分公司|外國公司/],
  ['電信／第二類電信事業登記', /電信事業|第二類電信/],
  ['電子支付／第三方支付', /第三方支付|電子支付/],
];
const NATIONAL = /部|署|局|委員會|中心|總處|處$/;
const LOCAL = /新北市|臺北市|台北市/;
for (const [name, re] of TOPICS) {
  const hits = cat.slice(1).filter((x) => { const t = String(x[I.title]); return re.test(t) && !NO.test(t); });
  const rows = hits.map((x) => ({ id: x[I.id], title: x[I.title], org: x[I.org], fields: String(x[I.fields]).slice(0, 200), url: String(x[I.url]).split(/[;\n]/)[0].trim(), n: Number(String(x[I.n]).split(';')[0]) || 0, fmt: String(x[I.fmt]).slice(0, 14), freq: String(x[I.freq]).slice(0, 8), tax: /統編|統一編號|BAN|ban_no|UBN/i.test(String(x[I.fields])), tel: /電話|TEL|Tel|tel/.test(String(x[I.fields])), date: /日期|年月|date|Date/.test(String(x[I.fields])), local: LOCAL.test(String(x[I.org])) || LOCAL.test(String(x[I.title])), national: NATIONAL.test(String(x[I.org])) && !/縣|市政府|市$/.test(String(x[I.org])) }));
  rows.sort((a, b) => Number(b.tax) - Number(a.tax) || Number(b.local || b.national) - Number(a.local || a.national) || b.n - a.n);
  show(`主題：${name}（${rows.length} 個；有統編欄 ${rows.filter((x) => x.tax).length}）`, rows.slice(0, 25).map((x) => `#${x.id}　${x.title}　【${x.org}｜${x.freq}｜${x.fmt}｜${x.n}筆${x.tax ? '｜統編' : ''}${x.tel ? '｜電話' : ''}${x.date ? '｜日期' : ''}】\n   欄位：${x.fields}\n   下載：${x.url.slice(0, 160)}`).join('\n'));
}
// 直接看幾個特定來源
const DIRECT = [
  ['經濟部商工行政資料開放平臺：分類目錄（找工廠）', 'https://data.gcis.nat.gov.tw/od/datacategory'],
  ['食藥署 食品業者登錄資料集（data.gov.tw 6951）', 'https://data.gov.tw/api/v2/rest/dataset/6951'],
  ['智慧局 商標開放資料（data.gov.tw 搜尋頁）', 'https://data.gov.tw/api/v2/rest/dataset/26349'],
  ['新北市 建造執照 開放資料（data.gov.tw 搜尋）', 'https://data.gov.tw/api/v2/rest/dataset/118945'],
];
for (const [t, u] of DIRECT) {
  try { const s = await get(u); const body = s.text.replace(/\s+/g, ' ');
    const m = /gcis/.test(u) ? [...body.matchAll(/[^<>]{0,40}工廠[^<>]{0,60}/g)].map((x) => x[0]).slice(0, 40).join('\n   ') : body.slice(0, 1500);
    show(t, `HTTP ${s.status} ${s.type}\n   ${m}`); } catch (e) { show(t, `✗ ${e.message}`); }
  await nap(500);
}
// 試抓：有統編欄、筆數 ≥ 1000 的，每個主題抓前兩個，看表頭、縣市、日期欄分佈
const tried = new Set();
for (const [name, re] of TOPICS) {
  const hits = cat.slice(1).filter((x) => re.test(String(x[I.title])) && !NO.test(String(x[I.title])) && /統編|統一編號|BAN|ban_no|UBN/i.test(String(x[I.fields])) && (Number(String(x[I.n]).split(';')[0]) || 0) >= 1000).slice(0, 2);
  for (const x of hits) {
    const url = String(x[I.url]).split(/[;\n]/)[0].trim(); if (tried.has(url)) continue; tried.add(url);
    try {
      const s = await get(url, { headers: { Range: 'bytes=0-400000' } }); const t = s.text.replace(/^﻿/, '');
      let table = null;
      if (/json/.test(s.type) || /^\s*[[{]/.test(t)) { let j = null; try { j = JSON.parse(t); } catch (e) { j = null; } const arr = j ? (Array.isArray(j) ? j : (j.result && (j.result.records || j.result.results)) || j.data || j.records || []) : []; if (Array.isArray(arr) && arr.length) { const keys = Object.keys(arr[0]); table = [keys, ...arr.map((o) => keys.map((k) => String(o[k] == null ? '' : o[k])))]; } }
      else if (!/html/.test(s.type)) table = parseCsv(t);
      if (!table) { show(`  試抓【${name}】#${x[I.id]} ${x[I.title]}`, `HTTP ${s.status} ${s.type}（不是表格）${t.slice(0, 200)}`); continue; }
      const h = table[0]; const body = table.slice(1, 3000);
      const ai = h.findIndex((k) => /地址|住址|所在地|address/i.test(k)); const di = h.findIndex((k) => /日期|年月|date/i.test(k)); const pi = h.findIndex((k) => /電話|TEL|Tel|tel/.test(k));
      const local = ai >= 0 ? body.filter((c) => /新北市|臺北市|台北市/.test(String(c[ai]))).length : -1;
      const dates = di >= 0 ? body.map((c) => String(c[di] || '').trim()).filter(Boolean) : [];
      const recent = dates.filter((d) => /^(2026|115|2025|114)/.test(d.replace(/\D/g, '').slice(0, 4)) || /^(2026|2025|115|114)/.test(d)).length;
      show(`  試抓【${name}】#${x[I.id]} ${x[I.title]}`, `HTTP ${s.status} ${s.type}；表頭：${h.join(' | ').slice(0, 320)}\n前 ${body.length} 列：新北／臺北 ${local}；日期欄 ${di >= 0 ? h[di] : '無'}（近兩年 ${recent}／${dates.length}；例 ${dates.slice(0, 3).join(',')}）；電話欄 ${pi >= 0 ? h[pi] : '無'}；例：${body.slice(0, 2).map((c) => c.slice(0, 8).join('｜')).join('　／　').slice(0, 400)}`);
    } catch (e) { show(`  試抓【${name}】#${x[I.id]} ${x[I.title]}`, `✗ ${e.message}`); }
    await nap(600);
  }
}
console.log('\n完成。');
