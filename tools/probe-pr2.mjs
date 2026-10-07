/** 探路第二輪：食品 zip 手動解、環境部 API 總筆數與分頁、能不能用 filters。一次性，看完刪。只印表頭、筆數、統計。 */
import fs from 'node:fs';
import zlib from 'node:zlib';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const show = (t, b) => console.log(`\n=========== ${t} ===========\n${b}`);
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(600000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) }; };
const CITY = /新北|臺北|台北/;
const top = (arr, n = 15) => { const m = new Map(); arr.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, k]) => `${String(v).slice(0, 24) || '（空）'} ${k}`).join('、'); };
const ymHist = (arr) => { const m = new Map(); arr.map((d) => String(d).replace(/\D/g, '').slice(0, 6)).filter((x) => x.length === 6).forEach((y) => m.set(y, (m.get(y) || 0) + 1)); const k = [...m.keys()].sort(); return `最早 ${k[0]} 最晚 ${k[k.length - 1]}；最近 14 個月：${k.slice(-14).map((y) => `${y}:${m.get(y)}`).join(' ')}`; };

// 1. 食品：zip 用本地檔頭手動解（unzip 說沒有中央目錄，可能是串流產生的 zip）
for (const u of ['https://data.fda.gov.tw/data/opendata/export/97/csv', 'https://data.fda.gov.tw/data/opendata/export/97/json']) {
  try {
    const r = await get(u);
    console.log(`\n${u}：HTTP ${r.status} ${r.type} ${r.buf.length} bytes；開頭 ${r.buf.slice(0, 4).toString('hex')}；結尾 ${r.buf.slice(-22).toString('hex')}`);
    if (r.buf.readUInt32LE(0) !== 0x04034b50) continue;
    const flags = r.buf.readUInt16LE(6); const method = r.buf.readUInt16LE(8); const nlen = r.buf.readUInt16LE(26); const xlen = r.buf.readUInt16LE(28);
    const name = r.buf.slice(30, 30 + nlen).toString();
    console.log(`  第一個檔 ${name}；flags ${flags.toString(16)} method ${method}`);
    let text = '';
    try { text = zlib.inflateRawSync(r.buf.slice(30 + nlen + xlen), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8'); } catch (e) { console.log(`  inflate：${e.message}`); }
    console.log(`  解出 ${text.length} 字`);
    if (!text) continue;
    if (/json/.test(u)) { const j = JSON.parse(text.replace(/^﻿/, '')); const a = Array.isArray(j) ? j : []; show('食品 json', `筆數 ${a.length}；欄位 ${Object.keys(a[0] || {}).join(' | ')}`); continue; }
    const t = parseCsv(text); const h = t[0].map((x) => x.trim()); const body = t.slice(1);
    const ai = h.findIndex((k) => /地址/.test(k)); const ti = h.findIndex((k) => /統一編號|統編/.test(k));
    const local = body.filter((c) => CITY.test(String(c[ai] || '')));
    const lines = [`表頭（${h.length}）：${h.join(' | ')}`, `筆數 ${body.length}；雙北 ${local.length}；統編 8 碼（雙北）${ti >= 0 ? local.filter((c) => /^\d{8}$/.test(String(c[ti]).trim())).length : '無統編欄'}；雙北不重複統編 ${ti >= 0 ? new Set(local.map((c) => String(c[ti]).trim()).filter((x) => /^\d{8}$/.test(x))).size : '-'}`];
    h.forEach((k, i) => {
      if (/業別|類別|狀態|登錄項目|縣市|產品|組織|形態|型態/.test(k)) lines.push(`  [${k}] ${top(local.map((c) => String(c[i] || '').trim()))}`);
      if (/日期|年月/.test(k)) lines.push(`  [${k}] ${ymHist(local.map((c) => c[i]))}`);
    });
    show('食品 csv', lines.join('\n'));
  } catch (e) { show(`食品 ${u}`, `✗ ${e.message}`); }
}

// 2. 環境部 API：總筆數、filters 能不能用、整份要幾頁
const API = { s01: 'https://data.moenv.gov.tw/api/v2/ems_s_01?api_key=e75b1660-e564-4107-aad5-a8be1f905dd9', s03: 'https://data.moenv.gov.tw/api/v2/ems_s_03?api_key=af57253c-e838-46da-a1f5-12b43afd75f3' };
for (const [k, base] of Object.entries(API)) {
  try {
    const r = await get(`${base}&limit=1&format=JSON`);
    const j = JSON.parse(r.buf.toString());
    show(`${k} JSON limit=1`, `HTTP ${r.status}；鍵 ${Object.keys(j).join(', ')}；total ${j.total}；include_total ${j.include_total}`);
    for (const f of k === 's01' ? ['county,EQ,新北市', 'county,EQ,臺北市'] : ['address,LIKE,新北市']) {
      const t0 = Date.now();
      const fr = await get(`${base}&limit=1000&format=CSV&filters=${encodeURIComponent(f)}`);
      const t = parseCsv(fr.buf.toString());
      console.log(`  filters=${f}：HTTP ${fr.status}，${t.length - 1} 列，${Date.now() - t0} ms`);
    }
  } catch (e) { show(k, `✗ ${e.message}`); }
}

// 3. ems_s_01 全部翻完（每頁 1000），只統計雙北
try {
  const all = []; let head = null;
  for (let off = 0; off < 300000; off += 1000) {
    const r = await get(`${API.s01}&limit=1000&offset=${off}&format=CSV`);
    const t = parseCsv(r.buf.toString()); if (!head) head = t[0];
    all.push(...t.slice(1)); if (t.length - 1 < 1000) break; await nap(300);
  }
  const H = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const local = all.filter((c) => CITY.test(c[H.county] || ''));
  const withBan = local.filter((c) => /^\d{8}$/.test(String(c[H.uniformno]).trim()));
  const active = withBan.filter((c) => !['airreleasedate', 'waterreleasedate', 'wastereleasedate', 'toxicreleasedate', 'soilreleasedate'].some((d) => String(c[H[d]] || '').trim()));
  show('ems_s_01 全部', [`全國 ${all.length}；雙北 ${local.length}；雙北有統編 ${withBan.length}（不重複 ${new Set(withBan.map((c) => c[H.uniformno])).size}）；沒解除列管 ${active.length}（不重複 ${new Set(active.map((c) => c[H.uniformno])).size}）`,
    `  空污 ${active.filter((c) => c[H.isair] === '1').length}、水污 ${active.filter((c) => c[H.iswater] === '1').length}、廢棄物 ${active.filter((c) => c[H.iswaste] === '1').length}、毒化 ${active.filter((c) => c[H.istoxic] === '1').length}`,
    `  行業（沒解除列管、有統編）：${top(active.map((c) => c[H.industryname]), 25)}`,
    `  只有廢棄物、行業是營造的：${active.filter((c) => c[H.iswaste] === '1' && c[H.isair] !== '1' && c[H.iswater] !== '1' && /營造|工程/.test(c[H.industryname])).length}`,
    `  空污或水污（排除只有廢棄物）不重複統編：${new Set(active.filter((c) => c[H.isair] === '1' || c[H.iswater] === '1').map((c) => c[H.uniformno])).size}`].join('\n'));
} catch (e) { show('ems_s_01 全部', `✗ ${e.message}`); }

// 4. ems_s_03 先翻 30 頁看速度與雙北比例
try {
  const all = []; let head = null; const t0 = Date.now(); let pages = 0;
  for (let off = 0; off < 30000; off += 1000) {
    const r = await get(`${API.s03}&limit=1000&offset=${off}&format=CSV`);
    const t = parseCsv(r.buf.toString()); if (!head) head = t[0]; pages++;
    all.push(...t.slice(1)); if (t.length - 1 < 1000) break; await nap(300);
  }
  const H = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const local = all.filter((c) => CITY.test(c[H.address] || ''));
  const wb = local.filter((c) => /^\d{8}$/.test(String(c[H.ban]).trim()));
  show('ems_s_03 前 30 頁', [`${pages} 頁 ${((Date.now() - t0) / 1000).toFixed(0)} 秒；${all.length} 列，不重複許可 ${new Set(all.map((c) => c[H.per_no])).size}；雙北 ${local.length}，有統編 ${wb.length}（不重複 ${new Set(wb.map((c) => c[H.ban])).size}）`,
    `  per_type（雙北）：${top(local.map((c) => c[H.per_type]))}`, `  per_sdate（雙北有統編）：${ymHist(wb.map((c) => c[H.per_sdate]))}`].join('\n'));
} catch (e) { show('ems_s_03', `✗ ${e.message}`); }
console.log('\n完成。');
