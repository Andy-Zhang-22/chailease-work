/**
 * 產業名單（車輛相關業者）：經濟部「公司登記（依營業項目別）」→ 新北市、臺北市 → leads/industry/。
 *
 * 使用者：「還有什麼資料是能幫我能找到更多客戶的？」→「這些資料都做，同個統編的公司依資料都合在一起」。
 * 探路（2026/10，見 README）：車輛相關的營業項目每月一份，有統編、資本額、地址、公司狀態，跟中租的車輛租賃最對口：
 *   data.gov.tw 36719 汽車貨運業、36720 遊覽車客運業、36711 計程車客運業、36715 小客車租賃業。
 *   CSV 表頭："統一編號","公司名稱","公司地址","資本總額","實收資本額","在境內營運資金","公司狀態","產製日期"。**沒有設立日期。**
 * 同一個統編可能在好幾份（又做貨運又做租車）→ 合成一家，類別記在一起。
 * 誰是「剛出現」：跟電子發票一樣自己記首見年月（leads/industry/seen.csv）；第一次跑全部記成起算月。
 * 成立日期、組織別、行業：拿統編對財政部稅籍檔（fetch-einv.mjs 同一套串流）。電話：貿易署電話表。
 *
 * industry.csv：統編,名稱,類別,地址,資本額,實收資本額,首見年月,設立日期,組織別,行業代號,行業,電話
 * 用法：node tools/fetch-industry.mjs [--out leads/industry] [--cities 新北市,臺北市] [--phones leads/trade/phones.csv] [--reset-baseline]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { parseLine, taxFields, halfWidth, inCity, districtOf, ymOf, updateSeen } from './fetch-einv.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/industry');
const CITIES = opt('cities', '新北市,臺北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const PHONES = opt('phones', 'leads/trade/phones.csv');
const RESET = args.includes('--reset-baseline');
const TAX_SOURCE = 'https://eip.fia.gov.tw/data/BGMOPEN1.csv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
/** 要抓的營業項目：data.gov.tw 資料集編號 → 類別名稱 */
export const KINDS = [
  { id: 36719, kind: '汽車貨運業' },
  { id: 36720, kind: '遊覽車客運業' },
  { id: 36711, kind: '計程車客運業' },
  { id: 36715, kind: '小客車租賃業' },
];
export const HEAD = ['統編', '名稱', '類別', '地址', '資本額', '實收資本額', '首見年月', '設立日期', '組織別', '行業代號', '行業', '電話'];
const BRANCH_NAME = /分公司$/;
const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const num = (s) => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;

/** 依營業項目別那一列 → { taxId, name, address, capital, paid }；不是核准設立、不在縣市、分公司、沒統編回 null */
export function normalize(o, { cities = CITIES } = {}) {
  const tax = String(o['統一編號'] || '').replace(/\D/g, '');
  if (tax.length !== 8) return null;
  const status = String(o['公司狀態'] || '').trim();
  if (status && !/核准設立/.test(status)) return null;
  const name = halfWidth(o['公司名稱']);
  if (!name || BRANCH_NAME.test(name)) return null;
  const address = halfWidth(o['公司地址']);
  if (!inCity(address, cities)) return null;
  return { taxId: tax, name, address, capital: num(o['資本總額']), paid: num(o['實收資本額']) };
}
/** 同一個統編在好幾份：類別合在一起，其餘取第一次看到的 */
export function addKind(byTax, r, kind) {
  const have = byTax.get(r.taxId);
  if (have) { if (!have.kinds.includes(kind)) have.kinds.push(kind); return have; }
  const x = { ...r, kinds: [kind] };
  byTax.set(r.taxId, x);
  return x;
}
export const toRow = (r) => [r.taxId, r.name, r.kinds.join('、'), r.address, r.capital || '', r.paid || '', r.firstYm, r.founded || '', r.org || '', r.indCode || '', r.industry || '', r.tel || ''];

async function readSeen(file) {
  const m = new Map();
  try {
    const text = await fs.readFile(file, 'utf8');
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = line.split(','); if (/^\d{8}$/.test(c[0] || '') && /^\d{6}$/.test(c[1] || '')) m.set(c[0], c[1]); });
  } catch (e) { /* 第一次 */ }
  return m;
}
/** data.gov.tw 資料集的 CSV 下載網址（看詮釋資料，不自己猜） */
async function csvUrlOf(id) {
  const r = await fetch(`https://data.gov.tw/api/v2/rest/dataset/${id}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  const ds = (j.result && j.result.distribution) || [];
  const d = ds.find((x) => /csv/i.test(String(x.resourceFormat || x.format || ''))) || ds.find((x) => x.resourceDownloadUrl || x.downloadURL);
  if (!d) throw new Error(`資料集 ${id} 找不到下載網址`);
  return d.resourceDownloadUrl || d.downloadURL;
}

async function main() {
  const now = new Date();
  const ym = ymOf(now);
  await fs.mkdir(OUT, { recursive: true });
  let prevIndex = {};
  try { prevIndex = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8')); } catch (e) { prevIndex = {}; }
  const prevSeen = RESET ? new Map() : await readSeen(path.join(OUT, 'seen.csv'));
  console.log(`首見表：${prevSeen.size.toLocaleString()} 個統編；起算月 ${prevIndex.baseline || '（這次）'}`);

  // 1. 各營業項目
  const byTax = new Map(); const perKind = {};
  for (const { id, kind } of KINDS) {
    const url = await csvUrlOf(id);
    console.log(`${kind}（${id}）下載 ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10 * 60000), redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`${kind} HTTP ${res.status}`);
    const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
    let head = null; let n = 0; let kept = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      const cells = parseLine(line.replace(/^﻿/, ''));
      if (!head) { head = cells.map((h) => h.trim()); continue; }
      n++;
      const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; });
      const r = normalize(o, { cities: CITIES });
      if (!r) continue;
      addKind(byTax, r, kind); kept++;
    }
    if (!head || !head.includes('統一編號')) throw new Error(`${kind} 表頭對不上：${(head || []).join(',')}`);
    perKind[kind] = kept;
    console.log(`  ${n.toLocaleString()} 列，${CITIES.join('、')} 核准設立 ${kept.toLocaleString()} 家`);
  }
  console.log(`合計（同統編合併）${byTax.size.toLocaleString()} 家`);
  if (byTax.size < 100) throw new Error('留下來的太少，欄位或縣市對不上');

  // 2. 首見年月
  const { seen, baseline, newIds } = updateSeen(prevSeen, [...byTax.keys()], ym, prevIndex.baseline);
  byTax.forEach((r, id) => { r.firstYm = seen.get(id); r.isNew = r.firstYm > baseline; });
  console.log(`起算月 ${baseline}；這個月（${ym}）新出現 ${newIds.size.toLocaleString()} 家`);

  // 3. 稅籍：成立日期、組織別、行業
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
    const r = byTax.get(String(cells[1] || '').replace(/\D/g, ''));
    if (!r) continue;
    const t = taxFields(cells);
    if (!t) continue;
    hit++;
    r.founded = t.founded; r.org = t.org; r.indCode = t.indCode; r.industry = t.industry;
  }
  console.log(`稅籍檔 ${tn.toLocaleString()} 列（出檔 ${fileDate || '?'}），對到 ${hit.toLocaleString()} 家`);

  // 4. 電話
  let phones = null;
  try {
    const text = await fs.readFile(PHONES, 'utf8');
    phones = new Map();
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = line.split(','); if (c[0] && c[1]) phones.set(c[0].trim(), c[1].trim()); });
  } catch (e) { console.log(`沒有電話表 ${PHONES}（${e.message}），電話先空著`); }

  const list = [...byTax.values()];
  list.forEach((r) => { r.tel = phones ? (phones.get(r.taxId) || '') : ''; });
  list.sort((a, b) => b.firstYm.localeCompare(a.firstYm) || b.capital - a.capital || a.name.localeCompare(b.name, 'zh-Hant'));
  const byDist = {}; const byKind = {};
  list.forEach((r) => { const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; r.kinds.forEach((k) => { byKind[k] = (byKind[k] || 0) + 1; }); });
  await fs.writeFile(path.join(OUT, 'industry.csv'), `﻿${[HEAD, ...list.map(toRow)].map((r) => r.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(OUT, 'seen.csv'), `統編,首見年月\n${[...seen.entries()].sort().map(([k, v]) => `${k},${v}`).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), source: KINDS.map((k) => `https://data.gov.tw/dataset/${k.id}`), kinds: KINDS.map((k) => k.kind), cities: CITIES,
    baseline, dataYm: ym, taxFileDate: fileDate, total: list.length, newTotal: list.filter((r) => r.isNew).length, newThisMonth: newIds.size,
    withPhone: list.filter((r) => r.tel).length, byKind, byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])),
    files: [{ path: 'industry.csv', rows: list.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`\n留 ${list.length.toLocaleString()} 家（${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join('、')}；剛出現 ${index.newTotal}；有電話 ${index.withPhone}）→ ${OUT}`);
}

if (process.argv[1] && /fetch-industry\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
