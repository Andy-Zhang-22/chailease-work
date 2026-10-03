/** 探路第二輪：把第一輪看起來有料的幾個來源量一量（筆數、新北／臺北、欄位）。一次性，看完刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (u, init = {}) => { const r = await fetch(u, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(180000), redirect: 'follow' }); const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type') || '', url: r.url, buf, text: buf.toString('utf8') }; };
const show = (t, b) => console.log(`\n=========== ${t} ===========\n${b}`);
const LOCAL = /新北市|臺北市|台北市/;
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
const top = (arr, n = 12) => { const m = new Map(); arr.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${v}`).join('、'); };
async function dist(id) { try { const r = await get(`https://data.gov.tw/api/v2/rest/dataset/${id}`); const j = JSON.parse(r.text); const d = (j.result && j.result.distribution) || []; return d.map((x) => ({ desc: x.resourceDescription, url: x.resourceDownloadUrl || x.downloadURL, fmt: x.resourceFormat, mod: x.resourceModified })); } catch (e) { return [{ desc: `✗ ${e.message}` }]; } }
const showDist = (t, d) => show(t, d.map((x) => `${x.desc}｜${x.fmt}｜${x.mod}｜${String(x.url).slice(0, 150)}`).join('\n'));

// 1. 導入電子發票營業人清單
try {
  showDist('電子發票 #31869 的檔案', await dist(31869));
  const r = await get('https://dataset.einvoice.nat.gov.tw/ods/portal/ODS303W/download/3886F055-EB77-4DF9-98E2-F3F49A7D3434/1/8B227A99-042A-4901-8B34-5715442A227C/0/?fileType=csv');
  const t = parseCsv(r.text); const h = t[0]; const body = t.slice(1);
  const ai = h.findIndex((k) => /地址/.test(k)); const ni = h.findIndex((k) => /名稱/.test(k)); const ki = h.findIndex((k) => /屬性/.test(k));
  const local = body.filter((c) => LOCAL.test(String(c[ai])));
  show('電子發票導入名單', `HTTP ${r.status} ${r.type} ${(r.buf.length / 1e6).toFixed(1)}MB；表頭 ${h.join('|')}；共 ${body.length} 列；新北／臺北 ${local.length}（公司字尾 ${local.filter((c) => /公司$/.test(String(c[ni]))).length}）；屬性：${top(body.map((c) => c[ki]))}；新北／臺北屬性：${top(local.map((c) => c[ki]))}`);
} catch (e) { show('電子發票導入名單', `✗ ${e.message}`); }

// 2. 臺北市建造執照摘要（115 年度、歷年）
for (const id of [128200, 128199, 128204]) {
  const d = await dist(id); showDist(`臺北市建照 #${id} 的檔案`, d);
  const u = d.find((x) => x.url && /xml|XML/.test(String(x.fmt) + String(x.url))) || d[0];
  if (!u || !u.url) continue;
  try {
    const r = await get(u.url); const x = r.text;
    const rows = [...x.matchAll(/<(?:row|item|record|Data|DATA)[^>]*>([\s\S]*?)<\/(?:row|item|record|Data|DATA)>/gi)].map((m) => m[1]);
    const field = (s, n) => { const m = s.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
    const tags = [...new Set([...(rows[0] || '').matchAll(/<([^\s>\/!]+)[^>]*>/g)].map((m) => m[1]))];
    const owners = rows.map((s) => field(s, '起造人')).filter(Boolean);
    const co = owners.filter((o) => /公司|企業社|商行|工廠|工業社/.test(o));
    const notDev = co.filter((o) => !/建設|開發|營造|建築|資產|投資|不動產|地產|置業|建築經理|都市更新/.test(o));
    const money = rows.map((s) => Number(String(field(s, '工程金額')).replace(/\D/g, '')) || 0);
    const dates = rows.map((s) => field(s, '發照日期')).filter(Boolean);
    show(`臺北市建照 #${id} 內容`, `HTTP ${r.status} ${r.type} ${(r.buf.length / 1e6).toFixed(1)}MB；列 ${rows.length}；標籤：${tags.join('|').slice(0, 400)}\n起造人有值 ${owners.length}；像公司的 ${co.length}；不是建設／開發／營造的 ${notDev.length}；工程金額 ≥1,000 萬 ${money.filter((m) => m >= 1e7).length}、≥1 億 ${money.filter((m) => m >= 1e8).length}；發照日期例 ${dates.slice(0, 3).join(',')}～${dates.slice(-2).join(',')}\n不是建設公司的起造人例（前 15）：${notDev.slice(0, 15).join('、')}`);
  } catch (e) { show(`臺北市建照 #${id} 內容`, `✗ ${e.message}`); }
}

// 3. 食品業者登錄
try {
  const r = await get('https://data.fda.gov.tw/data/opendata/export/97/csv');
  const t = parseCsv(r.text); const h = t[0]; const body = t.slice(1);
  const ai = h.findIndex((k) => /地址/.test(k)); const ni = h.findIndex((k) => /名稱/.test(k)); const ii = h.findIndex((k) => /登錄項目/.test(k)); const ti = h.findIndex((k) => /統一編號/.test(k));
  const local = body.filter((c) => LOCAL.test(String(c[ai])));
  show('食品業者登錄', `HTTP ${r.status} ${r.type} ${(r.buf.length / 1e6).toFixed(1)}MB；表頭 ${h.join('|')}；共 ${body.length} 列；有統編 ${body.filter((c) => String(c[ti]).replace(/\D/g, '').length === 8).length}；新北／臺北 ${local.length}（公司字尾 ${local.filter((c) => /公司$/.test(String(c[ni]))).length}）；登錄項目：${top(body.map((c) => String(c[ii]).split(/[;,、]/)[0]), 15)}；例：${body.slice(0, 2).map((c) => c.join('｜')).join('　／　').slice(0, 300)}`);
} catch (e) { show('食品業者登錄', `✗ ${e.message}`); }

// 4. 健保停歇業投保單位：只看有哪些檔
showDist('健保停歇業 #26767 的檔案', await dist(26767));

// 5. 稅籍：停業、非營業中（負面訊號）
for (const [name, id] of [['稅籍停業', 75140], ['稅籍非營業中', 75141]]) {
  const d = await dist(id); showDist(`${name} #${id} 的檔案`, d);
  const u = d.find((x) => x.url); if (!u) continue;
  try {
    const r = await get(u.url, { headers: { Range: 'bytes=0-600000' } });
    const t = parseCsv(r.text); const h = t[0]; const body = t.slice(1, -1);
    const ai = h.findIndex((k) => /地址/.test(k)); const di = h.findIndex((k) => /日期/.test(k));
    show(`${name} 內容`, `HTTP ${r.status} ${r.type}；表頭 ${h.join('|')}；前 ${body.length} 列：新北／臺北 ${body.filter((c) => LOCAL.test(String(c[ai]))).length}；日期欄 ${di >= 0 ? h[di] : '無'} 例 ${body.slice(0, 3).map((c) => c[di]).join(',')}`);
  } catch (e) { show(`${name} 內容`, `✗ ${e.message}`); }
}

// 6. 標檢局 驗證登錄授權（統編＋電話）
try {
  const r = await get('https://www.bsmi.gov.tw/wSite/public/Data/BSMI_CI_AUTH.xml').catch(() => null);
  const d = await dist(41584); showDist('標檢局驗證登錄授權 #41584 的檔案', d);
  const u = d.find((x) => x.url); const rr = r && r.status === 200 ? r : await get(u.url);
  const x = rr.text; const rows = [...x.matchAll(/<row>([\s\S]*?)<\/row>/g)].map((m) => m[1]);
  const field = (s, n) => { const m = s.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)); return m ? m[1].trim() : ''; };
  const tels = rows.map((s) => field(s, '被授權人電話')).filter(Boolean);
  const mob = tels.filter((v) => /^0?9\d{8}$/.test(v.replace(/\D/g, '').replace(/^886/, '0')));
  const local = rows.filter((s) => LOCAL.test(field(s, '被授權人地址')));
  const taxes = new Set(rows.map((s) => field(s, '被授權人統編')).filter(Boolean));
  const valid = rows.filter((s) => Number(field(s, '授權有效時間')) >= 20261003);
  show('標檢局驗證登錄授權 內容', `HTTP ${rr.status} ${(rr.buf.length / 1e6).toFixed(1)}MB；列 ${rows.length}；不重複統編 ${taxes.size}；有電話 ${tels.length}、手機 ${mob.length}；新北／臺北 ${local.length}；授權還有效 ${valid.length}`);
} catch (e) { show('標檢局驗證登錄授權 內容', `✗ ${e.message}`); }

console.log('\n完成。');
