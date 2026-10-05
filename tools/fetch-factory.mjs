/**
 * 新設工廠：經濟部「生產中工廠清冊」→ 新北市、臺北市，最近幾個月登記的工廠 → leads/factory/。
 *
 * 使用者：「還有什麼能讓我做的嗎」→ 選「新設立或變更的工廠」（剛登記工廠＝在擴廠、買設備，接動產擔保那條線）。
 *
 * 來源（2026/10 用 Actions 探路確認）：data.gov.tw 資料集 6569「登記工廠名錄」，每月更新。
 *   詮釋資料 https://data.gov.tw/api/v2/rest/dataset/6569 → 下載網址 https://www.ida.gov.tw/opendata/02/SDD6569.csv
 *   那個 CSV 只是索引（序號,年份,名稱,檔案格式,下載連結），真正的檔是索引裡的 zip：
 *   https://serv.gcis.nat.gov.tw/RDownLoad/Data/statistical/生產中工廠清冊.zip（裡面一個 11508.csv，UTF-8，約 10 萬列、28 MB）。
 *   欄位：工廠名稱,工廠登記編號,工廠設立許可案號,工廠地址,工廠市鎮鄉村里,工廠負責人姓名,統一編號,工廠組織型態,
 *         工廠設立核准日期,工廠登記核准日期,工廠登記狀態,產業類別,主要產品（日期是民國 1150818 這樣）。
 *   探路時：新北市 18,621 家、臺北市 863 家，統編都有；新北市每月 60～90 家新登記。
 *
 * 沒有電話：拿統編對貿易署的出進口廠商電話表（leads/trade/phones.csv）填；資本額、公司成立日留給 fill-founded.mjs 查商工登記。
 * 同一家公司好幾個廠：只留最近登記的那一個，另外記「工廠數」。
 * 寫 factory.csv（統編,名稱,地址,行業代號,行業,成立日期,登記年月,電話,資本額,主要產品,組織型態,工廠數）與 index.json。
 * 用法：node tools/fetch-factory.mjs [--out leads/factory] [--cities 新北市,臺北市] [--months 12] [--phones leads/trade/phones.csv]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { zipEntries, zipRead, inCity, districtOf, monthsAgo } from './fetch-nhi.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/factory');
const CITIES = opt('cities', '新北市,臺北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const MONTHS = Number(opt('months', '12')) || 12;
const PHONES = opt('phones', 'leads/trade/phones.csv');
const INDEX_CSV = 'https://www.ida.gov.tw/opendata/02/SDD6569.csv';
const KNOWN_ZIP = 'https://serv.gcis.nat.gov.tw/RDownLoad/Data/statistical/%E7%94%9F%E7%94%A2%E4%B8%AD%E5%B7%A5%E5%BB%A0%E6%B8%85%E5%86%8A.zip';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const HEAD = ['統編', '名稱', '地址', '行業代號', '行業', '成立日期', '登記年月', '電話', '資本額', '主要產品', '組織型態', '工廠數'];

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** 逐字元的 CSV（主要產品那欄常有逗號、被引號包起來） */
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
/** 民國 1150818／115/08/18 → { ym: '202608', roc: '115/08/18' }；壞的回 null */
export function rocDate(s) {
  const t = String(s || '').replace(/\D/g, '');
  if (t.length !== 7 && t.length !== 6) return null;
  const y = +t.slice(0, t.length - 4) + 1911; const m = t.slice(-4, -2); const d = t.slice(-2);
  if (y < 1912 || +m < 1 || +m > 12 || +d < 1 || +d > 31) return null;
  return { ym: `${y}${m}`, roc: `${y - 1911}/${m}/${d}` };
}
/** 產業類別「25金屬製品製造業、29機械設備製造業」→ { code: '25', name: '金屬製品製造業' }（取第一個） */
export function industryOf(s) {
  const first = String(s || '').split(/[、,，]/)[0].trim();
  const m = first.match(/^(\d{2})\s*(.*)$/);
  return m ? { code: m[1], name: m[2].trim() } : { code: '', name: first };
}
/** 主要產品「251金屬模具、259其他金屬製品」→「金屬模具、其他金屬製品」（去掉代碼，最多 4 項） */
export const productsOf = (s) => String(s || '').split(/[、,，]/).map((x) => x.trim().replace(/^\d+\s*/, '')).filter(Boolean).slice(0, 4).join('、');

/** 清冊一列（照表頭對好的物件）→ 我們的一列；不在縣市、沒統編、不是生產中、太久以前登記的回 null */
export function normalize(o, { cities = CITIES, phones = null, months = MONTHS, now = new Date() } = {}) {
  const address = String(o['工廠地址'] || '').trim();
  if (!inCity(address, cities)) return null;
  let tax = String(o['統一編號'] || '').replace(/\D/g, '');
  if (tax.length === 7) tax = `0${tax}`;
  if (tax.length !== 8) return null;
  if (o['工廠登記狀態'] && !/生產中/.test(o['工廠登記狀態'])) return null;
  const reg = rocDate(o['工廠登記核准日期']);
  if (!reg || monthsAgo(reg.ym, now) >= months || monthsAgo(reg.ym, now) < 0) return null;
  const ind = industryOf(o['產業類別']);
  const p = phones ? phones.get(tax) : null;
  return { taxId: tax, name: String(o['工廠名稱'] || '').trim(), address, indCode: ind.code, industry: ind.name, founded: '', ym: reg.ym,
    tel: p ? p.tel : '', capital: '', products: productsOf(o['主要產品']), org: String(o['工廠組織型態'] || '').trim(), factories: 1 };
}
export const toRow = (r) => [r.taxId, r.name, r.address, r.indCode, r.industry, r.founded, r.ym, r.tel, r.capital, r.products, r.org, r.factories];

async function main() {
  const now = new Date();
  // 下載網址：先看索引 CSV，拿不到用探路時的網址
  let zipUrl = KNOWN_ZIP;
  try {
    const r = await fetch(INDEX_CSV, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    const found = (await r.text()).split(/\r?\n/).map((l) => (l.match(/https?:\/\/\S+\.zip/) || [])[0]).find(Boolean);
    if (found) zipUrl = found;
    console.log(`索引 ${INDEX_CSV} → ${zipUrl}`);
  } catch (e) { console.log(`拿不到索引（${e.message}），用備援網址`); }
  const res = await fetch(zipUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300000), redirect: 'follow' });
  if (!res.ok) throw new Error(`下載工廠清冊：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const entry = zipEntries(buf).find((e) => /\.csv$/i.test(e.name));
  if (!entry) throw new Error('zip 裡沒有 CSV');
  const period = (entry.name.match(/(\d{5})/) || [])[1] || '';
  const table = parseCsv(zipRead(buf, entry).toString('utf8'));
  const head = (table[0] || []).map((h) => h.trim());
  console.log(`${entry.name}：${(table.length - 1).toLocaleString()} 列；表頭：${head.join(',')}`);
  for (const need of ['工廠名稱', '工廠地址', '統一編號', '工廠登記核准日期', '產業類別', '主要產品']) if (!head.includes(need)) throw new Error(`表頭少了「${need}」，清冊格式變了`);

  let phones = null;
  try {
    const text = await fs.readFile(PHONES, 'utf8');
    phones = new Map();
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = line.split(','); if (c[0] && c[1]) phones.set(c[0].trim(), { tel: c[1].trim() }); });
    console.log(`電話表 ${PHONES}：${phones.size.toLocaleString()} 個統編`);
  } catch (e) { console.log(`沒有電話表 ${PHONES}（${e.message}），電話先空著`); }

  // 上一版的資本額、成立日留著（fill-founded 查過的不用重查）
  const prev = new Map();
  try {
    const old = parseCsv(await fs.readFile(path.join(OUT, 'factory.csv'), 'utf8'));
    const h = old[0] || []; const it = h.indexOf('統編'); const ic = h.indexOf('資本額'); const iF = h.indexOf('成立日期');
    old.slice(1).forEach((r) => { if (r[it]) prev.set(r[it], { capital: ic >= 0 ? r[ic] : '', founded: iF >= 0 ? r[iF] : '' }); });
  } catch (e) { /* 第一次 */ }

  const byTax = new Map(); let inCityN = 0;
  table.slice(1).forEach((cells) => {
    const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; });
    if (inCity(String(o['工廠地址'] || '').trim(), CITIES)) inCityN += 1;
    const r = normalize(o, { cities: CITIES, phones, months: MONTHS, now });
    if (!r) return;
    const have = byTax.get(r.taxId);
    if (!have) { byTax.set(r.taxId, r); return; }
    have.factories += 1;
    if (r.ym > have.ym) { r.factories = have.factories; byTax.set(r.taxId, r); }
  });
  const list = [...byTax.values()].map((r) => { const p = prev.get(r.taxId); if (p) { r.capital = p.capital || ''; r.founded = p.founded || ''; } return r; })
    .sort((a, b) => b.ym.localeCompare(a.ym) || a.name.localeCompare(b.name, 'zh-Hant'));
  const byYm = {}; const byDist = {};
  list.forEach((r) => { byYm[r.ym] = (byYm[r.ym] || 0) + 1; const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; });
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'factory.csv'), `﻿${[HEAD, ...list.map(toRow)].map((r) => r.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), source: 'https://data.gov.tw/dataset/6569', file: zipUrl, period, cities: CITIES, months: MONTHS,
    inCity: inCityN, total: list.length, withPhone: list.filter((r) => r.tel).length,
    latestYm: list.length ? `${list[0].ym.slice(0, 4)}/${list[0].ym.slice(4)}` : '',
    byYm, byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])), files: [{ path: 'factory.csv', rows: list.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`${CITIES.join('、')} 生產中 ${inCityN.toLocaleString()} 家；最近 ${MONTHS} 個月登記的 ${list.length.toLocaleString()} 家（有電話 ${index.withPhone.toLocaleString()}）→ ${OUT}/factory.csv\n各月：${Object.entries(byYm).sort().map(([k, v]) => `${k} ${v}`).join('、')}`);
}

if (process.argv[1] && /fetch-factory\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
