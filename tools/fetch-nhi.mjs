/**
 * 剛開始請人：健保署「全民健康保險新成立投保單位資料（不含移工雇主單位）」→ 新北市、最近幾個月的名單 → leads/nhi/。
 *
 * 使用者：「我要你再幫我想找名單的來源」「全部都做」。第二次探路（見 README）能用的只剩這份：每月一份，剛成立健保投保單位
 * ＝剛開始幫員工投保＝剛開始請人（新公司、或老公司第一次請員工），是「正在長大」的訊號。
 *
 * 來源（探路確認）：data.gov.tw 資料集 26769，一年一個 ODS 檔（民國 105 年起），每個約 4 MB、五萬多列，新北市一年約 8,700 列。
 *   下載網址在資料集的 API 裡：https://data.gov.tw/api/v2/rest/dataset/26769 → distribution[].resourceDownloadUrl
 *   （例如 115 年 https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-B12003-00G）。
 *   欄位：年月(201601)、投保單位代號、單位名稱、統一編號、證照地址（全形數字）、行業別代碼、行業別中文、證照核准成立日(20151130)
 *   沒有電話。這裡拿統編對貿易署的出進口廠商電話表（leads/trade/phones.csv）填，對不到就空著；資本額留給 fill-founded.mjs 查商工登記。
 *
 * ODS 是 zip 裡一個 content.xml：Node 沒有內建 unzip，這裡自己走 central directory、inflateRaw（檔案結構很單純，不值得裝套件）。
 *
 * 寫 nhi.csv（統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額；成立日期用民國，跟其他清冊一致）與 index.json。
 * 用法：node tools/fetch-nhi.mjs [--out leads/nhi] [--cities 新北市] [--months 6] [--phones leads/trade/phones.csv]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/nhi');
const CITIES = opt('cities', '新北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const MONTHS = Number(opt('months', '6')) || 6;
const PHONES = opt('phones', 'leads/trade/phones.csv');
const META = 'https://data.gov.tw/api/v2/rest/dataset/26769';
// API 拿不到時的備援（探路時看到的）：民國年 → 下載網址
const KNOWN = { 113: 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-B12003-00E', 114: 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-B12003-00F', 115: 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-B12003-00G' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const HEAD = ['統編', '名稱', '地址', '行業代號', '行業', '成立日期', '投保年月', '電話', '資本額'];
// 不是做生意的：協會、工會、廟、學校…（名稱判斷，寧可少擋）
const NOT_BIZ = /協會|工會|公會|基金會|教會|寺$|宮$|廟$|社團法人|財團法人|管理委員會|自救會|學會|促進會|聯誼會|公所|政府|學校|國小|國中|高中|高職|大學|幼兒園|幼稚園|托嬰|黨部|佛堂|禪寺|精舍|堂$/;

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const halfWidth = (s) => String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ－（）]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ').trim();
/** 20151130 → 104/11/30（民國，跟其他清冊一致）；壞的回空 */
export const toRoc = (s) => { const t = String(s || '').replace(/\D/g, ''); if (t.length !== 8) return ''; const y = +t.slice(0, 4) - 1911; const m = t.slice(4, 6); const d = t.slice(6, 8); return (y > 0 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) ? `${y}/${m}/${d}` : ''; };
export const districtOf = (address) => (String(address || '').match(/^[^\s]{2}[市縣]([^\s]{1,3}?[區鄉鎮市])/) || [])[1] || '?';
export const inCity = (addr, cities) => !cities.length || cities.some((c) => addr.startsWith(c) || addr.startsWith(c.replace(/^臺/, '台')) || addr.startsWith(c.replace(/^台/, '臺')));
/** 年月 YYYYMM 距今幾個月（同一個月＝0） */
export const monthsAgo = (ym, now = new Date()) => { const y = +String(ym).slice(0, 4); const m = +String(ym).slice(4, 6); return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m); };

/* ---------------- zip / ODS ---------------- */

/** 最小的 zip 讀取：走 central directory，回每個檔的位置；讀的時候才 inflateRaw */
export function zipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('不是 zip 檔');
  const n = buf.readUInt16LE(eocd + 10); const cdOff = buf.readUInt32LE(eocd + 16);
  const out = []; let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 的 central directory 壞了');
    const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20); const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28); const elen = buf.readUInt16LE(p + 30); const clen = buf.readUInt16LE(p + 32); const loff = buf.readUInt32LE(p + 42);
    out.push({ name: buf.toString('utf8', p + 46, p + 46 + nlen), method, csize, usize, loff });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
export function zipRead(buf, e) {
  const nlen = buf.readUInt16LE(e.loff + 26); const elen = buf.readUInt16LE(e.loff + 28);
  const start = e.loff + 30 + nlen + elen; const data = buf.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`zip 壓縮方式 ${e.method} 不支援`);
}
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/** content.xml 的表格列 → 字串陣列（重複的空格只展開到 40 欄） */
export function odsRows(xml) {
  const rows = xml.match(/<table:table-row[\s\S]*?<\/table:table-row>/g) || [];
  return rows.map((row) => [...row.matchAll(/<table:table-cell([^>]*)>([\s\S]*?)<\/table:table-cell>|<table:table-cell([^>]*)\/>/g)].flatMap((m) => {
    const attrs = m[1] || m[3] || ''; const rep = Number((attrs.match(/number-columns-repeated="(\d+)"/) || [])[1] || 1);
    const text = unxml((m[2] || '').replace(/<text:p[^>]*>/g, '').replace(/<\/text:p>/g, '\n').replace(/<[^>]+>/g, '')).trim();
    return Array(Math.min(rep, 40)).fill(text);
  }));
}
/** ODS 檔（Buffer）→ 列 */
export function odsTable(buf) {
  const ce = zipEntries(buf).find((e) => e.name === 'content.xml');
  if (!ce) throw new Error('ODS 裡沒有 content.xml');
  return odsRows(zipRead(buf, ce).toString('utf8'));
}

/* ---------------- 一列 ---------------- */

/** 健保署那一列（照表頭對好的物件）→ 我們的一列；不在縣市裡、不是做生意的、壞的回 null */
export function normalize(o, { cities = CITIES, phones = null } = {}) {
  const ym = String(o['年月'] || '').replace(/\D/g, '');
  if (ym.length !== 6) return null;
  const name = halfWidth(o['單位名稱']);
  if (!name || NOT_BIZ.test(name)) return null;
  const address = halfWidth(o['證照地址']);
  if (!inCity(address, cities)) return null;
  let tax = String(o['統一編號'] || '').replace(/\D/g, '');
  if (tax.length === 7) tax = `0${tax}`;   // 檔案裡前面的 0 掉了
  if (tax.length !== 8) tax = '';
  const p = tax && phones ? phones.get(tax) : null;
  return { taxId: tax, name, address, indCode: String(o['行業別代碼'] || '').trim(), industry: String(o['行業別中文'] || '').trim(), founded: toRoc(o['證照核准成立日']), ym, tel: p ? p.tel : '', capital: '' };
}
export const toRow = (r) => [r.taxId, r.name, r.address, r.indCode, r.industry, r.founded, r.ym, r.tel, r.capital];

/* ---------------- 主流程 ---------------- */

async function main() {
  const now = new Date();
  const wantYears = new Set();
  for (let k = 0; k < MONTHS; k++) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); wantYears.add(d.getFullYear() - 1911); }
  // 哪幾年的檔：先問 API，拿不到就用備援表
  const urls = new Map();
  try {
    const r = await fetch(META, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    const j = await r.json();
    ((j.result && j.result.distribution) || []).forEach((d) => {
      const m = String(d.resourceDescription || '').match(/(\d{3})\s*$/);
      const u = d.resourceDownloadUrl || d.downloadURL;
      if (m && u) urls.set(+m[1], u);
    });
    console.log(`資料集 26769：${urls.size} 個年度檔（${[...urls.keys()].sort().join('、')}）`);
  } catch (e) { console.log(`拿不到資料集 API（${e.message}），用備援的下載網址`); }
  Object.entries(KNOWN).forEach(([y, u]) => { if (!urls.has(+y)) urls.set(+y, u); });

  let phones = null;
  try {
    const text = await fs.readFile(PHONES, 'utf8');
    phones = new Map();
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = line.split(','); if (c[0] && c[1]) phones.set(c[0].trim(), { tel: c[1].trim() }); });
    console.log(`電話表 ${PHONES}：${phones.size.toLocaleString()} 個統編`);
  } catch (e) { console.log(`沒有電話表 ${PHONES}（${e.message}），電話先空著`); }

  const kept = [];
  const byYm = {};
  for (const y of [...wantYears].sort()) {
    const u = urls.get(y);
    if (!u) { console.log(`民國 ${y} 年：沒有這一年的檔（還沒上架）`); continue; }
    console.log(`民國 ${y} 年：下載 ${u}`);
    const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300000), redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const rows = odsTable(buf);
    const head = rows[0] || [];
    let inCityN = 0;
    rows.slice(1).forEach((cells) => {
      const o = {}; head.forEach((h, i) => { if (h) o[h.trim()] = cells[i] || ''; });
      const r = normalize(o, { cities: CITIES, phones });
      if (!r) return;
      inCityN += 1;
      if (monthsAgo(r.ym, now) >= MONTHS) return;
      kept.push(r);
      byYm[r.ym] = (byYm[r.ym] || 0) + 1;
    });
    console.log(`  ${buf.length.toLocaleString()} bytes、${(rows.length - 1).toLocaleString()} 列，${CITIES.join('、')} ${inCityN.toLocaleString()} 列`);
  }
  // 同一家同一個月只留一次（投保單位代號不同的分公司會各一列）
  const seen = new Set();
  const list = kept.filter((r) => { const k = `${r.taxId || r.name}|${r.ym}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.ym.localeCompare(a.ym) || a.name.localeCompare(b.name, 'zh-Hant'));
  const byDist = {};
  list.forEach((r) => { const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; });
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'nhi.csv'), `﻿${[HEAD, ...list.map(toRow)].map((r) => r.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), source: META, cities: CITIES, months: MONTHS,
    total: list.length, withPhone: list.filter((r) => r.tel).length, latestYm: list.length ? `${list[0].ym.slice(0, 4)}/${list[0].ym.slice(4)}` : '',
    byYm, byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])), files: [{ path: 'nhi.csv', rows: list.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`\n留 ${list.length.toLocaleString()} 家（最近 ${MONTHS} 個月，有電話 ${index.withPhone.toLocaleString()}）→ ${OUT}/nhi.csv\n各月：${Object.entries(byYm).sort().map(([k, v]) => `${k} ${v}`).join('、')}`);
}

if (process.argv[1] && /fetch-nhi\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
