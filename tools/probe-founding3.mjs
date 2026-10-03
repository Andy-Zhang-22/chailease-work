/** 探路第三輪：食品業者登錄（zip 裡的 CSV）、臺北市建照的起造人長什麼樣、電子發票導入名單有沒有分月的檔。一次性，看完刪。 */
import { inflateRawSync } from 'node:zlib';
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
/** 讀 zip 裡的檔（跟 fetch-nhi.mjs 同一招：掃 central directory） */
function zipEntries(buf) {
  const out = []; let eocd = buf.length - 22; while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return out; let p = buf.readUInt32LE(eocd + 16); const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) { if (buf.readUInt32LE(p) !== 0x02014b50) break; const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20); const nlen = buf.readUInt16LE(p + 28); const elen = buf.readUInt16LE(p + 30); const clen = buf.readUInt16LE(p + 32); const off = buf.readUInt32LE(p + 42); const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8'); out.push({ name, method, csize, off }); p += 46 + nlen + elen + clen; }
  return out;
}
function zipRead(buf, e) { const nlen = buf.readUInt16LE(e.off + 26); const elen = buf.readUInt16LE(e.off + 28); const start = e.off + 30 + nlen + elen; const data = buf.subarray(start, start + e.csize); return e.method === 8 ? inflateRawSync(data) : Buffer.from(data); }

// 1. 食品業者登錄
try {
  const r = await get('https://data.fda.gov.tw/data/opendata/export/97/csv');
  const entries = zipEntries(r.buf); show('食品業者登錄 zip 內容', entries.map((e) => `${e.name} ${e.csize}B`).join('\n'));
  const e = entries.find((x) => /csv$/i.test(x.name)); const t = parseCsv(zipRead(r.buf, e).toString('utf8')); const h = t[0]; const body = t.slice(1);
  const ai = h.findIndex((k) => /地址/.test(k)); const ni = h.findIndex((k) => /名稱/.test(k)); const ii = h.findIndex((k) => /登錄項目/.test(k)); const ti = h.findIndex((k) => /統一編號/.test(k));
  const local = body.filter((c) => LOCAL.test(String(c[ai])));
  const items = (c) => String(c[ii]).split(/[;,、|]/).map((s) => s.trim()).filter(Boolean);
  show('食品業者登錄', `表頭 ${h.join('|')}；共 ${body.length} 列；有統編 ${body.filter((c) => String(c[ti]).replace(/\D/g, '').length === 8).length}；新北／臺北 ${local.length}（公司字尾 ${local.filter((c) => /公司$/.test(String(c[ni]))).length}）\n登錄項目（全國）：${top(body.flatMap(items), 20)}\n新北／臺北 公司的登錄項目：${top(local.filter((c) => /公司$/.test(String(c[ni]))).flatMap(items), 20)}\n例（新北／臺北 公司前 3）：${local.filter((c) => /公司$/.test(String(c[ni]))).slice(0, 3).map((c) => c.join('｜')).join('　／　').slice(0, 500)}`);
} catch (e) { show('食品業者登錄', `✗ ${e.message}`); }

// 2. 臺北市 115 年建造執照：起造人欄到底長什麼樣
try {
  const r = await get('https://data.taipei/api/dataset/d8834353-ff8e-4a6c-9730-a4d3541f2669/resource/43624c8e-c768-4b3c-93c4-595f5af7a9cb/download');
  const rows = [...r.text.matchAll(/<Data>([\s\S]*?)<\/Data>/g)].map((m) => m[1]);
  const field = (s, n) => { const m = s.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
  show('臺北市 115 年建照 起造人／建物資訊 例', rows.slice(0, 6).map((s) => `起造人=${field(s, '起造人').slice(0, 80)}｜建造類別=${field(s, '建造類別')}｜使用分區=${field(s, '使用分區')}｜工程金額=${field(s, '工程金額')}｜建築概要=${field(s, '建築概要').replace(/\s+/g, ' ').slice(0, 80)}`).join('\n'));
  show('起造人欄值分佈', top(rows.map((s) => field(s, '起造人').replace(/\d/g, '#').slice(0, 20)), 15));
} catch (e) { show('臺北市 115 年建照', `✗ ${e.message}`); }

// 3. 電子發票導入名單：資料集頁有沒有分月／歷史檔
for (const u of ['https://dataset.einvoice.nat.gov.tw/ods/portal/ODS303W', 'https://dataset.einvoice.nat.gov.tw/ods/portal/ODS303W/3886F055-EB77-4DF9-98E2-F3F49A7D3434', 'https://data.gov.tw/api/v2/rest/dataset/31869']) {
  try { const r = await get(u); const b = r.text.replace(/\s+/g, ' ');
    const hits = [...b.matchAll(/[^<>]{0,60}(導入電子發票|\d{3}年\d{1,2}月|yyyymm|月份|歷史)[^<>]{0,80}/g)].map((m) => m[0]).slice(0, 25);
    show(`電子發票頁 ${u}`, `HTTP ${r.status} ${r.type} ${b.length} 字\n${hits.join('\n') || b.slice(0, 800)}`); } catch (e) { show(`電子發票頁 ${u}`, `✗ ${e.message}`); }
}
console.log('\n完成。');
