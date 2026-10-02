/** 探路：行業執照／許可的公開名冊，哪幾種有電話（甚至負責人）。一次性，看完刪。 */
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
const NO = /統計|家數|概況|報表|醫|診所|藥局|長照|幼兒|托嬰|學校|國小|國中|高中|大學|社區|公園|公廁|活動|課程|補助|津貼|志工|社團|協會|宗教|寺廟|教會|停車|路燈|公車|景點|步道|農產|市集|攤販|夜市|美食|小吃|餐廳|民宿|旅館|飯店|觀光|導覽|圖書|博物|藝文|展覽|講座|公告|問答|法規|申請書|表單|範本|流程|電話簿|聯絡表|通訊錄|機關|學會|基金會|會員名單|志願|服務站|據點|關懷|照顧|身心|老人|兒童|婦女|青年|原住民|客家|新住民|移民|外勞|移工|眷村|軍|警|消防|衛生所|防疫|疫苗|檢驗|實驗室|認證機構|評鑑|得獎|優良|績優|表揚|獎勵|標章|友善|績效/;
const YES = /名冊|名錄|清冊|登記|許可|執照|業者|廠商|公司|商號|登錄|核准|立案|備查/;
const NATIONAL = /部|署|局|委員會|中心|總處|處$/;
const LOCAL = /新北市|臺北市|台北市/;
const hits = cat.slice(1).filter((x) => {
  const t = String(x[I.title]); const f = String(x[I.fields]); const o = String(x[I.org]);
  if (!YES.test(t) || NO.test(t)) return false;
  if (!/電話|TEL|Tel|tel/.test(f)) return false;
  if (!(LOCAL.test(o) || LOCAL.test(t) || (NATIONAL.test(o) && !/縣|市政府|市$/.test(o)))) return false;
  return true;
});
const rows = hits.map((x) => ({ id: x[I.id], title: x[I.title], org: x[I.org], fields: String(x[I.fields]).slice(0, 220), url: String(x[I.url]).split(/[;\n]/)[0].trim(), n: Number(String(x[I.n]).split(';')[0]) || 0, fmt: String(x[I.fmt]).slice(0, 12), owner: /負責人|代表人|負責者|業主/.test(String(x[I.fields])) }));
rows.sort((a, b) => Number(b.owner) - Number(a.owner) || b.n - a.n);
show(`標題像名冊、欄位有電話（${rows.length} 個；有負責人欄的 ${rows.filter((x) => x.owner).length} 個）`, rows.slice(0, 120).map((x) => `#${x.id}　${x.title}　【${x.org}｜${x.n}筆｜${x.fmt}${x.owner ? '｜有負責人' : ''}】\n   欄位：${x.fields}\n   下載：${x.url.slice(0, 180)}`).join('\n'));
// 試抓有負責人欄、筆數多的前 12 個，看電話欄填了幾成、手機幾成
for (const x of rows.filter((v) => v.owner && v.n >= 100).slice(0, 12)) {
  try {
    const s = await get(x.url, { headers: { Range: 'bytes=0-300000' } }); const t = s.text.replace(/^﻿/, '');
    let table = null;
    if (/json/.test(s.type) || /^\s*[[{]/.test(t)) { let j = null; try { j = JSON.parse(t); } catch (e) { j = null; } const arr = j ? (Array.isArray(j) ? j : (j.result && (j.result.records || j.result.results)) || j.data || j.records || []) : []; if (Array.isArray(arr) && arr.length) { const keys = Object.keys(arr[0]); table = [keys, ...arr.map((o) => keys.map((k) => String(o[k] == null ? '' : o[k])))]; } }
    else if (!/html/.test(s.type)) table = parseCsv(t);
    if (!table) { show(`  試抓 #${x.id} ${x.title}`, `HTTP ${s.status} ${s.type}（不是表格）${t.slice(0, 200)}`); continue; }
    const h = table[0]; const pi = h.findIndex((k) => /電話|TEL|Tel|tel/.test(k)); const oi = h.findIndex((k) => /負責人|代表人|負責者|業主/.test(k)); const ni = h.findIndex((k) => /名稱|公司|商號|業者|廠商/.test(k));
    const body = table.slice(1, 2000); const tel = body.map((c) => String(c[pi] || '').trim()).filter(Boolean); const mob = tel.filter((v) => v.replace(/\D/g, '').replace(/^886/, '0').startsWith('09'));
    show(`  試抓 #${x.id} ${x.title}`, `HTTP ${s.status} ${s.type}；表頭：${h.join(' | ').slice(0, 300)}\n前 ${body.length} 列：有電話 ${tel.length}、手機 ${mob.length}；負責人欄 ${oi >= 0 ? h[oi] : '無'}；例：${body.slice(0, 2).map((c) => `${c[ni]}｜${oi >= 0 ? c[oi] : ''}｜${c[pi]}`).join('　／　')}`);
  } catch (e) { show(`  試抓 #${x.id} ${x.title}`, `✗ ${e.message}`); }
  await nap(600);
}
console.log('\n完成。');
