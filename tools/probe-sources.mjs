/**
 * 探路第三輪：第二輪拿到的目錄下載是 HTML 不是 CSV；勞動部那邊是 CKAN 式 API。看完連同 workflow 一起刪。
 *  1. data.gov.tw：試 API（/api/v2/rest/dataset/{id}）、搜尋頁 SSR、目錄下載加 Accept。
 *  2. 勞動部 OdService：/rest/dataset 列全部、/rest/tag 找標籤、抓一兩個像職缺的看欄位。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length'), disp: r.headers.get('content-disposition') || '', url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
const peek = async (title, url, init) => {
  try {
    const r = await get(url, init);
    const t = r.text.replace(/^﻿/, '');
    const body = `HTTP ${r.status} ${r.type} len=${r.len} disp=${r.disp} → ${r.url}\n` + (/html/.test(r.type) ? strip(t).slice(0, 900) : t.slice(0, 1400));
    show(title, body);
    return r;
  } catch (e) { show(title, `✗ ${e.message}`); return null; }
};

// ---------- 1. data.gov.tw 整份目錄（第三輪找到：api/front/dataset/export?format=csv 是真的 CSV） ----------
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
async function sample(title, u) {
  try {
    const s = await get(u, { headers: { Range: 'bytes=0-200000' } });
    const t = s.text.replace(/^\uFEFF/, '');
    let body = `HTTP ${s.status} ${s.type} content-length=${s.len} → ${s.url}\n`;
    if (/json/.test(s.type) || /^\s*[[{]/.test(t)) {
      let j = null; try { j = JSON.parse(t); } catch (e) { /* 截斷 */ }
      const rows = j ? (Array.isArray(j) ? j : (j.records || j.data || j.result || j.results || j.items || (j.result && j.result.records) || [])) : null;
      const row = rows && Array.isArray(rows) ? rows[0] : null;
      body += row ? `JSON ${rows.length} 筆（前 200KB）；第一筆的鍵：${Object.keys(row).join(' | ')}\n第一筆：${JSON.stringify(row).slice(0, 700)}` : `${t.slice(0, 700)}`;
    } else if (/html/.test(s.type)) body += strip(t).slice(0, 400);
    else { const lines = t.split(/\r?\n/); body += `${lines.length} 列（前 200KB）\n表頭：${lines[0].slice(0, 600)}\n第 2 列：${(lines[1] || '').slice(0, 500)}`; }
    show(`  試抓 ${title}`, body);
  } catch (e) { show(`  試抓 ${title}`, `✗ ${e.message}`); }
}
let catalog = [];
try {
  const r = await get('https://data.gov.tw/api/front/dataset/export?format=csv');
  catalog = parseCsv(r.text);
  show('整份目錄', `HTTP ${r.status} ${r.type} ${catalog.length} 列\n表頭：${(catalog[0] || []).join(' | ')}`);
} catch (e) { show('整份目錄', `✗ ${e.message}`); }
const TOPICS = [
  ['求才職缺（公司名、電話）', /求才|職缺|徵才|就業通|人才需求|缺工/, /統計|人數|倍數|按.*分|調查|指標|概況|報表|博覽會|電子報|期刊/],
  ['產業園區／工業區廠商', /園區.*廠商|廠商.*園區|工業區.*(廠商|名錄|事業)|廠商名錄|進駐(廠商|事業)|入區/, /統計|用電|用水|污水|土地|租金/],
  ['工廠登記', /工廠.*(登記|名錄|清冊|基本資料|公示|資料)/, /統計|家數|用電|用水|筆數|產值|調查/],
  ['SBIR／補助通過', /SBIR|創新研發.*計畫|補助.*(名單|核定|通過|廠商)|核定.*補助|受補助/, /統計|金額.*統計|個人|學生|農/],
  ['投資核准', /投資.*(核准|名單|案件)|核准.*投資|投資臺灣|投資台灣|擴大投資|外人投資/, /統計|金額|概況/],
  ['固定污染源', /固定污染源.*(基本|公私|名單|清冊|資料)|列管.*事業/, /排放量|統計|費|裁罰/],
  ['拒絕往來', /拒絕往來|退票/, /統計/],
  ['減班休息／無薪假', /減班休息|無薪假|大量解僱/, /統計/],
  ['勞保投保單位', /投保單位/, /統計|人數|e化|申報/],
  ['公司／商業登記（有電話的）', /(公司|商業).*(登記|基本資料).*/, /統計|家數|筆數|解散|撤銷|廢止/],
];
if (catalog.length) {
  const head = catalog[0].map((h) => h.trim());
  const col = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iId = col(['資料集識別碼']); const iTitle = col(['資料集名稱']); const iDesc = col(['資料集描述']); const iFields = col(['主要欄位說明']); const iOrg = col(['提供機關']); const iUrl = col(['資料下載網址']); const iFreq = col(['更新頻率']); const iFmt = col(['檔案格式']); const iN = col(['資料量']);
  show('目錄欄位對應', `id=${iId} title=${iTitle} desc=${iDesc} fields=${iFields} org=${iOrg} url=${iUrl} freq=${iFreq} fmt=${iFmt} n=${iN}`);
  for (const [topic, re, bad] of TOPICS) {
    const hits = catalog.slice(1).filter((r) => re.test(`${r[iTitle] || ''}`) && !bad.test(`${r[iTitle] || ''}`));
    const withPhone = hits.filter((r) => /電話|聯絡|TEL|Tel/.test(String(r[iFields] || '')));
    show(`主題：${topic}（標題符合 ${hits.length} 個，欄位有電話的 ${withPhone.length} 個）`, [...withPhone, ...hits.filter((r) => !withPhone.includes(r))].slice(0, 16).map((r) => `#${r[iId]}　${r[iTitle]}　【${r[iOrg]}｜${r[iFreq] || ''}｜${(r[iFmt] || '').slice(0, 20)}｜${r[iN] || ''}筆】\n   欄位：${String(r[iFields] || '').slice(0, 240)}\n   下載：${String(r[iUrl] || '').split(/[;\n]/)[0].slice(0, 200)}`).join('\n'));
    for (const r of [...withPhone, ...hits.filter((r) => !withPhone.includes(r))].slice(0, 3)) {
      const u = String(r[iUrl] || '').split(/[;\n]/)[0].trim();
      if (u) { await sample(`#${r[iId]} ${r[iTitle]}`, u); await nap(700); }
    }
  }
}

// ---------- 2. 勞動部 OdService ----------
const base = 'https://apiservice.mol.gov.tw/OdService';
const list = await peek('MOL /rest/dataset', `${base}/rest/dataset`);
await nap(600);
await peek('MOL /rest/tag', `${base}/rest/tag`);
await nap(600);
await peek('MOL /rest/group', `${base}/rest/group`);
await nap(600);
let ids = [];
try { const j = JSON.parse(list.text); ids = Array.isArray(j) ? j : (j.result || j.data || j.datasets || Object.values(j).find(Array.isArray) || []); } catch (e) { /* 不是 JSON */ }
show('MOL 資料集識別碼', `${ids.length} 個；前 20：${JSON.stringify(ids.slice(0, 20)).slice(0, 600)}`);
const hits = [];
for (const id of ids.slice(400)) {
  const key = typeof id === 'string' ? id : (id.id || id.identifier || id.datasetId || JSON.stringify(id));
  try {
    const r = await get(`${base}/rest/dataset/${encodeURIComponent(key)}`);
    const t = r.text;
    const title = (t.match(/"(?:title|name|資料集名稱)"\s*:\s*"([^"]+)"/) || [])[1] || t.slice(0, 80);
    if (/求才|職缺|徵才|就業通|減班|無薪|解僱|投保單位|廠商名/.test(t)) hits.push(`${key}　${title}\n   ${t.replace(/\s+/g, ' ').slice(0, 500)}`);
  } catch (e) { /* 略 */ }
  await nap(150);
}
show(`MOL 看起來相關的資料集（掃第 400 個之後的 ${Math.max(0, ids.length - 400)} 個）`, hits.slice(0, 25).join('\n') || '（沒有）');
console.log('\n完成。');
