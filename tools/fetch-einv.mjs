/**
 * 剛開電子發票：財政部「導入電子發票營業人清單」→ 新北市、臺北市，跟上個月比出剛導入的 → leads/einv/。
 *
 * 使用者：「幫我找一下像健保這樣的資料，還有沒有成立公司必要的指標？」→ 探路（見 README）找到這份：
 * 開始開電子發票＝真的在營運、有進銷項；是「成立之後開始做生意」的腳印。
 *
 * 來源（探路確認）：data.gov.tw 資料集 31869，每月一份 CSV（43 MB、40 萬列）：營業人統編,營業人名稱,屬性(B2B/B2C),地址。
 *   https://dataset.einvoice.nat.gov.tw/ods/portal/ODS303W/download/3886F055-EB77-4DF9-98E2-F3F49A7D3434/1/8B227A99-042A-4901-8B34-5715442A227C/0/?fileType=csv
 *   **沒有日期**：誰是「剛導入」只能自己記——leads/einv/seen.csv 記每個統編第一次出現在哪個月（首見年月）；
 *   第一次跑全部記成起算月（index.json 的 baseline），之後每個月新出現的統編就是剛導入的。
 * 成立日期、組織別、資本額、行業、開不開發票：拿統編對財政部的稅籍檔（BGMOPEN1.csv，322 MB，fetch-biz.mjs 也在用，串流讀只留我們要的統編）。
 * 電話：對貿易署的出進口廠商電話表（leads/trade/phones.csv），對不到就空著。
 *
 * 寫 einv.csv（統編,名稱,屬性,地址,首見年月,設立日期,組織別,資本額,行業代號,行業,開發票,電話）：只留
 *   - 剛導入的（首見年月晚於起算月），或
 *   - 稅籍設立日期在最近 --years 年內的（第一次跑沒有「剛導入」，先用「成立不久就開電子發票的」當名單）
 *   分公司（稅籍有總機構統編、或名稱是○○分公司）、協會工會那類不留。
 * seen.csv（統編,首見年月；只記 --cities 裡的）、index.json。
 * 用法：node tools/fetch-einv.mjs [--out leads/einv] [--cities 新北市,臺北市] [--years 3] [--phones leads/trade/phones.csv] [--reset-baseline]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/einv');
const CITIES = opt('cities', '新北市,臺北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const YEARS = Number(opt('years', '3')) || 3;
const PHONES = opt('phones', 'leads/trade/phones.csv');
const RESET = args.includes('--reset-baseline');
const SOURCE = 'https://dataset.einvoice.nat.gov.tw/ods/portal/ODS303W/download/3886F055-EB77-4DF9-98E2-F3F49A7D3434/1/8B227A99-042A-4901-8B34-5715442A227C/0/?fileType=csv';
const META = 'https://data.gov.tw/api/v2/rest/dataset/31869';
const TAX_SOURCE = 'https://eip.fia.gov.tw/data/BGMOPEN1.csv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
export const HEAD = ['統編', '名稱', '屬性', '地址', '首見年月', '設立日期', '組織別', '資本額', '行業代號', '行業', '開發票', '電話'];
// 不是做生意的：協會、工會、廟、學校、管委會…（名稱判斷，寧可少擋）
const NOT_BIZ = /協會|工會|公會|基金會|教會|寺$|宮$|廟$|社團法人|財團法人|管理委員會|管委會|自救會|學會|促進會|聯誼會|公所|政府|學校|國小|國中|高中|高職|大學|幼兒園|幼稚園|托嬰|黨部|佛堂|禪寺|精舍|堂$|祭祀公業/;
const BRANCH_NAME = /分公司$|分店$|分行$|門市$|營業所$|分處$|分部$/;

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const halfWidth = (s) => String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ－（）]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ').trim();
export const inCity = (addr, cities) => !cities.length || cities.some((c) => addr.startsWith(c) || addr.startsWith(c.replace(/^臺/, '台')) || addr.startsWith(c.replace(/^台/, '臺')));
export const districtOf = (address) => (String(address || '').match(/^[^\s]{2}[市縣]([^\s]{1,3}?[區鄉鎮市])/) || [])[1] || '?';
/** 民國七碼 1040413 → 104/04/13（民國，跟其他清冊一致）；壞的回空 */
export const rocOf = (s) => { const t = String(s || '').replace(/\D/g, ''); if (t.length !== 7) return ''; const y = +t.slice(0, 3); const m = t.slice(3, 5); const d = t.slice(5, 7); return (y > 0 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) ? `${y}/${m}/${d}` : ''; };
/** 民國 104/04/13 距今幾年（小數）；壞的回 null */
export const yearsSinceRoc = (roc, now = new Date()) => { const m = String(roc || '').match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/); if (!m) return null; const d = new Date(+m[1] + 1911, +m[2] - 1, +m[3]); return (now - d) / (365.25 * 86400000); };
export const ymOf = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 一列 CSV（引號與逗號） */
export function parseLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 電子發票那一列（照表頭對好的物件）→ { taxId, name, kind, address }；不在縣市裡、沒統編、不是做生意的、分公司回 null */
export function normalize(o, { cities = CITIES } = {}) {
  const tax = String(o['營業人統編'] || '').replace(/\D/g, '');
  if (tax.length !== 8) return null;
  const name = halfWidth(o['營業人名稱']);
  if (!name || NOT_BIZ.test(name) || BRANCH_NAME.test(name)) return null;
  const address = halfWidth(o['地址']);
  if (!inCity(address, cities)) return null;
  const kind = /B2C/i.test(String(o['屬性'] || '')) ? 'B2C' : /B2B/i.test(String(o['屬性'] || '')) ? 'B2B' : String(o['屬性'] || '').trim();
  return { taxId: tax, name, kind, address };
}

/** 稅籍那一列（cells）→ 補的欄位；分公司（有總機構統編）回 { branch: true } */
export function taxFields(cells) {
  if (!cells || cells.length < 10) return null;
  const [, , headOffice, , capRaw, setup, org, invoice, code1, ind1] = cells;
  return { branch: !!String(headOffice || '').replace(/\D/g, ''), founded: rocOf(setup), org: String(org || '').trim(), capital: Number(String(capRaw || '').replace(/\D/g, '')) || 0, indCode: String(code1 || '').trim(), industry: String(ind1 || '').trim(), invoice: String(invoice || '').trim() === 'Y' ? 'Y' : 'N' };
}

/**
 * 首見表 + 這個月的統編 → 每個統編的首見年月。第一次（表是空的）全部記成這個月並當起算月；之後新出現的記這個月。
 * 回 { seen: Map, baseline, newIds: Set }
 */
export function updateSeen(prev, ids, ym, baseline) {
  const seen = new Map(prev);
  const first = !seen.size;
  const base = first ? ym : (baseline || ym);
  const newIds = new Set();
  ids.forEach((id) => { if (!seen.has(id)) { seen.set(id, ym); if (!first) newIds.add(id); } });
  return { seen, baseline: base, newIds };
}

/** 要不要留在 einv.csv：剛導入的，或成立在 years 年內的 */
export const keep = (r, { years = YEARS, now = new Date() } = {}) => {
  if (r.isNew) return true;
  const y = yearsSinceRoc(r.founded, now);
  return y != null && y < years;
};
export const toRow = (r) => [r.taxId, r.name, r.kind, r.address, r.firstYm, r.founded || '', r.org || '', r.capital || '', r.indCode || '', r.industry || '', r.invoice || '', r.tel || ''];

async function readSeen(file) {
  const m = new Map();
  try {
    const text = await fs.readFile(file, 'utf8');
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = line.split(','); if (/^\d{8}$/.test(c[0] || '') && /^\d{6}$/.test(c[1] || '')) m.set(c[0], c[1]); });
  } catch (e) { /* 第一次 */ }
  return m;
}

async function main() {
  const now = new Date();
  const ym = ymOf(now);
  await fs.mkdir(OUT, { recursive: true });
  let prevIndex = {};
  try { prevIndex = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8')); } catch (e) { prevIndex = {}; }
  const prevSeen = RESET ? new Map() : await readSeen(path.join(OUT, 'seen.csv'));
  console.log(`首見表：${prevSeen.size.toLocaleString()} 個統編${RESET ? '（--reset-baseline：重新起算）' : ''}；起算月 ${prevIndex.baseline || '（這次）'}`);

  // 1. 電子發票導入名單
  let url = SOURCE;
  try {
    const r = await fetch(META, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    const j = await r.json();
    const d = ((j.result && j.result.distribution) || []).find((x) => x.resourceDownloadUrl || x.downloadURL);
    if (d) url = d.resourceDownloadUrl || d.downloadURL;
  } catch (e) { console.log(`拿不到資料集 API（${e.message}），用備援的下載網址`); }
  console.log(`下載 ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10 * 60000), redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
  let head = null; let n = 0; const byTax = new Map(); const kinds = {};
  for await (const line of rl) {
    n++;
    const cells = parseLine(line.replace(/^﻿/, ''));
    if (!head) { head = cells.map((h) => h.trim()); continue; }
    const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; });
    const r = normalize(o, { cities: CITIES });
    if (!r) continue;
    byTax.set(r.taxId, r);
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  }
  console.log(`讀完 ${n.toLocaleString()} 列，${CITIES.join('、')} ${byTax.size.toLocaleString()} 家（${Object.entries(kinds).map(([k, v]) => `${k} ${v.toLocaleString()}`).join('、')}）`);
  if (byTax.size < 1000) throw new Error('留下來的太少，欄位或縣市對不上');

  // 2. 首見年月
  const { seen, baseline, newIds } = updateSeen(prevSeen, [...byTax.keys()], ym, prevIndex.baseline);
  byTax.forEach((r, id) => { r.firstYm = seen.get(id); r.isNew = r.firstYm > baseline; });
  console.log(`起算月 ${baseline}；這個月（${ym}）新出現 ${newIds.size.toLocaleString()} 家；起算之後累計剛導入 ${[...byTax.values()].filter((r) => r.isNew).length.toLocaleString()} 家`);

  // 3. 稅籍：成立日期、組織別、資本額、行業、開發票
  console.log(`對稅籍檔 ${TAX_SOURCE}（串流）`);
  const tres = await fetch(TAX_SOURCE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
  if (!tres.ok || !tres.body) throw new Error(`稅籍檔 HTTP ${tres.status}`);
  const trl = readline.createInterface({ input: Readable.fromWeb(tres.body) });
  let tn = 0; let hit = 0; let fileDate = '';
  for await (const line of trl) {
    tn++;
    if (tn === 1) continue;
    const cells = parseLine(line);
    if (tn === 2 && cells[0] && !cells[1]) { fileDate = cells[0]; continue; }
    const tax = String(cells[1] || '').replace(/\D/g, '');
    const r = byTax.get(tax);
    if (!r) continue;
    const t = taxFields(cells);
    if (!t) continue;
    hit++;
    Object.assign(r, t);
    if (tn % 300000 === 0) console.log(`  …讀到第 ${tn.toLocaleString()} 列，對到 ${hit.toLocaleString()}`);
  }
  console.log(`稅籍檔 ${tn.toLocaleString()} 列（出檔 ${fileDate || '?'}），對到 ${hit.toLocaleString()} 家`);

  // 4. 電話
  let phones = null;
  try {
    const text = await fs.readFile(PHONES, 'utf8');
    phones = new Map();
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = line.split(','); if (c[0] && c[1]) phones.set(c[0].trim(), c[1].trim()); });
    console.log(`電話表 ${PHONES}：${phones.size.toLocaleString()} 個統編`);
  } catch (e) { console.log(`沒有電話表 ${PHONES}（${e.message}），電話先空著`); }

  // 5. 留下來的
  const list = [...byTax.values()].filter((r) => !r.branch && keep(r, { years: YEARS, now }));
  list.forEach((r) => { r.tel = phones ? (phones.get(r.taxId) || '') : ''; });
  list.sort((a, b) => b.firstYm.localeCompare(a.firstYm) || (b.founded || '').localeCompare(a.founded || '') || a.name.localeCompare(b.name, 'zh-Hant'));
  const byDist = {}; const byFirst = {};
  list.forEach((r) => { const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; byFirst[r.firstYm] = (byFirst[r.firstYm] || 0) + 1; });
  await fs.writeFile(path.join(OUT, 'einv.csv'), `﻿${[HEAD, ...list.map(toRow)].map((r) => r.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(OUT, 'seen.csv'), `統編,首見年月\n${[...seen.entries()].sort().map(([k, v]) => `${k},${v}`).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), source: META, cities: CITIES, years: YEARS, baseline, dataYm: ym, taxFileDate: fileDate,
    allInCities: byTax.size, total: list.length, newTotal: list.filter((r) => r.isNew).length, newThisMonth: newIds.size, withPhone: list.filter((r) => r.tel).length,
    byFirst: Object.fromEntries(Object.entries(byFirst).sort((a, b) => b[0].localeCompare(a[0]))), byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])),
    files: [{ path: 'einv.csv', rows: list.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`\n留 ${list.length.toLocaleString()} 家（剛導入 ${index.newTotal.toLocaleString()}、成立 ${YEARS} 年內 ${(list.length - index.newTotal).toLocaleString()}，有電話 ${index.withPhone.toLocaleString()}）→ ${OUT}/einv.csv`);
}

if (process.argv[1] && /fetch-einv\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
