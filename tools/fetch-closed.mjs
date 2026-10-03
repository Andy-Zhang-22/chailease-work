/**
 * 已停業：哪些公司已經停業、註銷了 → leads/closed/closed.csv，各分頁自動藏、名單上標出來。
 *
 * 使用者：「已停業自動藏」（探路見 README：停歇業是負面訊號，拿來免得打到空號）。三個來源，都是財政部／健保署的公開資料：
 *   - 稅籍停業：https://eip.fia.gov.tw/data/BGMOPEN1X.csv（data.gov.tw 75140，每日）：營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,停業日期,使用統一發票,行業…
 *   - 稅籍非營業中（停業以外：註銷、撤銷、廢止…）：https://eip.fia.gov.tw/data/BGMOPEN1Y.csv（75141，每月）：欄位同上但沒有停業日期
 *   - 健保停歇業投保單位：data.gov.tw 26767，一年一個 ODS（跟新成立那份同格式）：年月,投保單位代號,單位名稱,統一編號,證照地址,行業別代碼,行業別中文,註銷生效日
 * 只留 --cities 的；非營業中那份是歷年累積的，只留設立日期在最近 --years（預設 30）年內的，太老的不會在任何名單上。
 * 同一個統編幾個來源都有的留一筆：稅籍停業 > 稅籍非營業中 > 健保投保單位註銷。
 * 第一次跑新北＋臺北有 56 萬家（30 MB），網頁載不動；所以只留「有出現在 leads/ 底下任何一份名單裡的統編」（登記清冊、動保、商行、
 * 上市櫃、出進口與電話表、剛開始請人、剛開電子發票）——分頁要藏的只會是這些；客戶名單上不在這些名單裡的那幾家就標不到。
 *
 * 寫 closed.csv（統編,名稱,狀態,日期）、index.json。用法：node tools/fetch-closed.mjs [--out leads/closed] [--cities 新北市,臺北市] [--years 30] [--all]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { odsTable } from './fetch-nhi.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/closed');
const CITIES = opt('cities', '新北市,臺北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const YEARS = Number(opt('years', '30')) || 30;
const ALL = args.includes('--all');   // 不限名單裡的統編（檔會很大，平常不要）
const SUSPENDED = 'https://eip.fia.gov.tw/data/BGMOPEN1X.csv';
const INACTIVE = 'https://eip.fia.gov.tw/data/BGMOPEN1Y.csv';
const NHI_META = 'https://data.gov.tw/api/v2/rest/dataset/26767';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
export const HEAD = ['統編', '名稱', '狀態', '日期'];
export const KINDS = { suspended: '稅籍停業', inactive: '稅籍非營業中', nhi: '健保投保單位註銷' };
const RANK = { suspended: 0, inactive: 1, nhi: 2 };

const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const halfWidth = (s) => String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ－（）]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ').trim();
export const inCity = (addr, cities) => !cities.length || cities.some((c) => addr.startsWith(c) || addr.startsWith(c.replace(/^臺/, '台')) || addr.startsWith(c.replace(/^台/, '臺')));
/** 民國七碼 1150523 → 2026/05/23；西元八碼 20260523 也收；壞的回空 */
export const dateOf = (s) => {
  const t = String(s || '').replace(/\D/g, '');
  let y; let m; let d;
  if (t.length === 7) { y = +t.slice(0, 3) + 1911; m = t.slice(3, 5); d = t.slice(5, 7); }
  else if (t.length === 8) { y = +t.slice(0, 4); m = t.slice(4, 6); d = t.slice(6, 8); }
  else return '';
  return (y > 1911 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) ? `${y}/${m}/${d}` : '';
};
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

/** 稅籍那一列（照表頭對好的物件）→ { taxId, name, kind, date }；不在縣市、沒統編、太老的回 null */
export function fromTax(o, kind, { cities = CITIES, years = YEARS, now = new Date() } = {}) {
  const taxId = String(o['統一編號'] || '').replace(/\D/g, '');
  if (taxId.length !== 8) return null;
  const address = halfWidth(o['營業地址']);
  if (!inCity(address, cities)) return null;
  const setup = dateOf(o['設立日期']);
  if (kind === 'inactive' && setup && now.getFullYear() - +setup.slice(0, 4) > years) return null;
  return { taxId, name: halfWidth(o['營業人名稱']), kind, date: kind === 'suspended' ? dateOf(o['停業日期']) : '' };
}
/** 健保停歇業那一列 → 同上 */
export function fromNhi(o, { cities = CITIES } = {}) {
  let taxId = String(o['統一編號'] || '').replace(/\D/g, '');
  if (taxId.length === 7) taxId = `0${taxId}`;
  if (taxId.length !== 8) return null;
  const address = halfWidth(o['證照地址']);
  if (!inCity(address, cities)) return null;
  return { taxId, name: halfWidth(o['單位名稱']), kind: 'nhi', date: dateOf(o['註銷生效日']) };
}
/** 幾個來源合起來，同一統編留最強的那個（稅籍停業 > 非營業中 > 健保） */
export function merge(lists) {
  const m = new Map();
  lists.flat().forEach((r) => { if (!r) return; const old = m.get(r.taxId); if (!old || RANK[r.kind] < RANK[old.kind]) m.set(r.taxId, r); });
  return [...m.values()].sort((a, b) => a.taxId.localeCompare(b.taxId));
}
export const toRow = (r) => [r.taxId, r.name, KINDS[r.kind] || r.kind, r.date];
/** leads/ 底下每份 CSV 裡的統編（表頭叫 統編／統一編號／客戶統編 的那欄），不看 closed 自己 */
export async function repoTaxIds(root, { skip = /[\\/]closed[\\/]/ } = {}) {
  const ids = new Set();
  async function walk(dir) {
    let ents = [];
    try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!/\.csv$/i.test(e.name) || skip.test(`${path.sep}${path.relative(root, p)}`) || skip.test(p)) continue;
      let text = '';
      try { text = await fs.readFile(p, 'utf8'); } catch (err) { continue; }
      const lines = text.replace(/^﻿/, '').split(/\r?\n/);
      const head = parseLine(lines[0] || '').map((h) => h.trim());
      const ci = head.findIndex((h) => /^(統編|統一編號|客戶統編)$/.test(h));
      if (ci < 0) continue;
      for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const v = String(parseLine(lines[i])[ci] || '').replace(/\D/g, ''); if (v.length === 8) ids.add(v); }
    }
  }
  await walk(root);
  return ids;
}

async function streamTax(url, kind, now) {
  console.log(`下載 ${url}（串流）`);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
  let head = null; let n = 0; let fileDate = ''; const kept = [];
  for await (const line of rl) {
    n++;
    const cells = parseLine(line.replace(/^﻿/, ''));
    if (!head) { head = cells.map((h) => h.trim()); continue; }
    if (n === 2 && cells[0] && !cells[1]) { fileDate = cells[0]; continue; }   // 出檔日期那列
    const o = {}; head.forEach((h, i) => { o[h] = cells[i] || ''; });
    const r = fromTax(o, kind, { now });
    if (r) kept.push(r);
    if (n % 300000 === 0) console.log(`  …讀到第 ${n.toLocaleString()} 列，留 ${kept.length.toLocaleString()}`);
  }
  console.log(`  ${n.toLocaleString()} 列（出檔 ${fileDate || '?'}），${CITIES.join('、')} 留 ${kept.length.toLocaleString()}`);
  return { kept, fileDate };
}

async function nhiClosed(now) {
  const want = new Set([now.getFullYear() - 1911, now.getFullYear() - 1912]);
  const urls = new Map();
  try {
    const r = await fetch(NHI_META, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    const j = await r.json();
    ((j.result && j.result.distribution) || []).forEach((d) => { const m = String(d.resourceDescription || '').match(/(\d{3})\s*$/); const u = d.resourceDownloadUrl || d.downloadURL; if (m && u) urls.set(+m[1], u); });
  } catch (e) { console.log(`拿不到健保資料集 API（${e.message}），健保這份先跳過`); return []; }
  const kept = [];
  for (const y of [...want].sort()) {
    const u = urls.get(y);
    if (!u) { console.log(`健保停歇業 民國 ${y} 年：沒有這一年的檔`); continue; }
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300000), redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = odsTable(Buffer.from(await res.arrayBuffer()));
      const head = rows[0] || [];
      let n = 0;
      rows.slice(1).forEach((cells) => { const o = {}; head.forEach((h, i) => { if (h) o[h.trim()] = cells[i] || ''; }); const r = fromNhi(o); if (r) { kept.push(r); n++; } });
      console.log(`健保停歇業 民國 ${y} 年：${(rows.length - 1).toLocaleString()} 列，${CITIES.join('、')} 留 ${n.toLocaleString()}`);
    } catch (e) { console.log(`健保停歇業 民國 ${y} 年抓不到（${e.message}），跳過`); }
  }
  return kept;
}

async function main() {
  const now = new Date();
  await fs.mkdir(OUT, { recursive: true });
  const sus = await streamTax(SUSPENDED, 'suspended', now);
  const ina = await streamTax(INACTIVE, 'inactive', now);
  const nhi = await nhiClosed(now);
  const all = merge([sus.kept, ina.kept, nhi]);
  if (all.length < 1000) throw new Error('留下來的太少，欄位或縣市對不上');
  let list = all;
  if (!ALL) {
    const known = await repoTaxIds(path.dirname(OUT));
    list = all.filter((r) => known.has(r.taxId));
    console.log(`名單裡的統編 ${known.size.toLocaleString()} 個；${CITIES.join('、')} 已停業 ${all.length.toLocaleString()} 家裡有出現在名單的 ${list.length.toLocaleString()} 家（只留這些，網頁才載得動）`);
  }
  const byKind = {};
  list.forEach((r) => { const k = KINDS[r.kind]; byKind[k] = (byKind[k] || 0) + 1; });
  await fs.writeFile(path.join(OUT, 'closed.csv'), `﻿${[HEAD, ...list.map(toRow)].map((r) => r.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  const index = { generatedAt: new Date().toISOString(), cities: CITIES, years: YEARS, taxFileDate: sus.fileDate || ina.fileDate, total: list.length, allInCities: all.length, onlyKnown: !ALL, byKind, files: [{ path: 'closed.csv', rows: list.length }] };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`\n已停業 ${list.length.toLocaleString()} 家（${Object.entries(byKind).map(([k, v]) => `${k} ${v.toLocaleString()}`).join('、')}）→ ${OUT}/closed.csv`);
}

if (process.argv[1] && /fetch-closed\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
