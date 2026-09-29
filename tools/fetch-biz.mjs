/**
 * 商行／企業社名單：財政部「全國營業（稅籍）登記資料」→ 篩出要打的獨資、合夥 → leads/biz/。
 *
 * 使用者：「我想找商行或企業社的老闆做企金推廣，可以怎麼找名單」，選了這條。
 *
 * 來源（探路確認）：https://eip.fia.gov.tw/data/BGMOPEN1.csv（322 MB，UTF-8，每月更新；也有 .zip 66 MB）
 *   欄位：營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,使用統一發票,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3
 *   第一列資料是出檔日期（29-SEP-26,,,,…），設立日期是民國七碼（1040413），地址用全形數字（３７１號）。
 *   全台 171 萬筆；新北市獨資／合夥 114,661 筆，資本額 50 萬以上 5,172 筆（探路統計）。
 *   **沒有負責人**——拿統編查經濟部「商業登記基本資料-應用一」（GCIS swagger 探路：
 *   /7E6AFA72-AD6A-46D3-8681-ED77951D912D，OData，$filter=Business_Accounting_NO eq 統編；回來的欄位第一次跑會印出來，
 *   負責人欄位用名字比對 Responsible／負責人）。一家一家查，有 --owners 分鐘的預算，查過的留在 owners.json，
 *   下個月只查新的；查不完 workflow 會自己再排一輪（--skip-fetch 只補負責人）。
 *
 * 整份放不進網頁；這裡串流讀、只留：
 *   - 縣市在 --cities（預設新北市，新莊分公司的轄區都在新北）
 *   - 組織別是獨資或合夥（公司、有限合夥另有公司登記那條）
 *   - 資本額 ≥ --min-capital（預設 50 萬；商行大多 10 萬以下，那種給不了額度）
 *   - 分公司（總機構統編非空）不要，總機構才是打的對象
 *
 * 產出 leads/biz/biz.csv（統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人）、
 * owners.json（統編 → 負責人）、index.json（抓取時間、出檔日期、各區筆數、查到負責人幾家）。
 *
 * 用法：node tools/fetch-biz.mjs [--out leads/biz] [--cities 新北市] [--min-capital 500000] [--owners 分鐘] [--skip-fetch]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/biz');
const CITIES = opt('cities', '新北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const MIN_CAPITAL = Number(opt('min-capital', '500000')) || 0;
const OWNER_MINUTES = Number(opt('owners', '0')) || 0;
const SKIP_FETCH = args.includes('--skip-fetch');
const SOURCE = 'https://eip.fia.gov.tw/data/BGMOPEN1.csv';
const OWNER_API = 'https://data.gcis.nat.gov.tw/od/data/api/7E6AFA72-AD6A-46D3-8681-ED77951D912D';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const HEAD = ['統編', '名稱', '組織別', '資本額', '設立日期', '地址', '行業代號', '行業', '行業2', '行業3', '開發票', '負責人'];

/** 一列 CSV（自己寫的與財政部的都只有引號與逗號要處理） */
function parseLine(line) {
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
const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** 全形數字、英文、符號 → 半形；地址「３７１號」才對得上商工登記與分公司劃分 */
const halfWidth = (s) => String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ－]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ').trim();
/** 民國七碼 1040413 → 2015/04/13；壞的回空 */
const rocDate = (s) => { const t = String(s || '').replace(/\D/g, ''); if (t.length !== 7) return ''; const y = Number(t.slice(0, 3)) + 1911; const m = t.slice(3, 5); const d = t.slice(5, 7); return (y > 1911 && +m >= 1 && +m <= 12 && +d >= 1) ? `${y}/${m}/${d}` : ''; };
const districtOf = (address) => (String(address || '').match(/^[^\s]{2}[市縣]([^\s]{1,3}[區鄉鎮市])/) || [])[1] || '?';

/** 財政部那一列 → 我們的一列；不要的回 null */
function normalize(cells, { cities = CITIES, minCapital = MIN_CAPITAL } = {}) {
  if (!cells || cells.length < 10) return null;
  const [addrRaw, taxId, headOffice, name, capRaw, setup, org, invoice, code1, ind1, , ind2, , ind3] = cells;
  const tax = String(taxId || '').replace(/\D/g, '');
  if (tax.length !== 8 || !name) return null;
  if (!/獨資|合夥/.test(org || '')) return null;
  if (String(headOffice || '').replace(/\D/g, '')) return null;   // 分公司
  const addr = halfWidth(addrRaw);
  if (cities.length && !cities.some((c) => addr.startsWith(c) || addr.startsWith(c.replace(/^臺/, '台')) || addr.startsWith(c.replace(/^台/, '臺')))) return null;
  const capital = Number(String(capRaw || '').replace(/\D/g, '')) || 0;
  if (capital < minCapital) return null;
  return { taxId: tax, name: halfWidth(name), org: org.trim(), capital, setup: rocDate(setup), address: addr.replace(/^臺/, '台'), code: String(code1 || '').trim(), ind: String(ind1 || '').trim(), ind2: String(ind2 || '').trim(), ind3: String(ind3 || '').trim(), invoice: String(invoice || '').trim() === 'Y' ? 'Y' : 'N' };
}

/** 商業登記查負責人：回 { name, status }；查無回 { name: '' }；連不上回 null */
let shownKeys = false;
async function ownerOf(taxId) {
  const url = `${OWNER_API}?$format=json&$filter=Business_Accounting_NO%20eq%20${taxId}&$skip=0&$top=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
    const text = await res.text();
    if (res.status !== 200) return null;
    if (!text.trim().startsWith('[')) return { name: '', status: '' };   // 「查無資料」是一段文字
    const row = JSON.parse(text)[0];
    if (!row) return { name: '', status: '' };
    if (!shownKeys) { shownKeys = true; console.log('商業登記回來的欄位：', Object.keys(row).join(' | ')); console.log('第一筆：', JSON.stringify(row).slice(0, 400)); }
    const key = Object.keys(row).find((k) => /Responsible|負責人/i.test(k));
    const statusKey = Object.keys(row).find((k) => /Status|狀態/i.test(k));
    return { name: key ? String(row[key] || '').trim() : '', status: statusKey ? String(row[statusKey] || '').trim() : '' };
  } catch (e) { return null; }
}

/** 沒查過的一家一家查，資本額大的先；時間到就停，下一輪接著 */
async function fillOwners(kept, owners, minutes) {
  const todo = kept.filter((r) => !owners[r.taxId]);
  if (!minutes) return { done: 0, left: todo.length, timeout: false };
  const deadline = Date.now() + minutes * 60000;
  let done = 0; let fails = 0; let stopped = '';
  const save = () => fs.writeFile(path.join(OUT, 'owners.json'), `${JSON.stringify(owners)}\n`, 'utf8');
  for (const r of todo) {
    if (Date.now() > deadline) { stopped = `時間到（${minutes} 分鐘）`; break; }
    const got = await ownerOf(r.taxId);
    if (got == null) { fails += 1; if (fails >= 15) { stopped = '連續 15 次連不上'; break; } await nap(2000); continue; }
    fails = 0;
    owners[r.taxId] = { at: new Date().toISOString().slice(0, 10), name: got.name, status: got.status };
    done += 1;
    if (done % 100 === 0) { console.log(`  …負責人查了 ${done} 家`); await save(); }
    await nap(300);
  }
  await save();
  const left = kept.filter((r) => !owners[r.taxId]).length;
  console.log(`負責人：這次查了 ${done} 家，還有 ${left} 家沒查${stopped ? `（${stopped}）` : ''}`);
  return { done, left, timeout: /^時間到/.test(stopped) && left > 0 };
}

async function writeOut(kept, owners, fileDate, st) {
  const byOrg = {}; const byDist = {};
  kept.forEach((r) => { byOrg[r.org] = (byOrg[r.org] || 0) + 1; const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; });
  const rows = [HEAD, ...kept.map((r) => [r.taxId, r.name, r.org, r.capital, r.setup, r.address, r.code, r.ind, r.ind2, r.ind3, r.invoice, (owners[r.taxId] && owners[r.taxId].name) || ''])];
  await fs.writeFile(path.join(OUT, 'biz.csv'), `﻿${rows.map((c) => c.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), fileDate, source: SOURCE, cities: CITIES, minCapital: MIN_CAPITAL,
    total: kept.length, byOrg, byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])),
    withOwner: kept.filter((r) => owners[r.taxId] && owners[r.taxId].name).length, ownersLeft: st.left,
    files: [{ path: 'biz.csv', rows: kept.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`寫入 biz.csv（${kept.length.toLocaleString()} 筆）：${Object.entries(byOrg).map(([k, v]) => `${k} ${v}`).join('、')}；各區 ${Object.entries(index.byDist).slice(0, 8).map(([k, v]) => `${k} ${v}`).join('、')}；查到負責人 ${index.withOwner} 家`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `remaining=${st.left}\ntimeout=${st.timeout}\n`);
  console.log(st.timeout ? '\n負責人沒查完，下一輪接著查。' : '\n完成');
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  let owners = {};
  try { owners = JSON.parse(await fs.readFile(path.join(OUT, 'owners.json'), 'utf8')); } catch (e) { owners = {}; }

  if (SKIP_FETCH) {
    // 再排一輪：稅籍檔上一輪已經抓好，只補負責人再重寫 CSV
    const table = (await fs.readFile(path.join(OUT, 'biz.csv'), 'utf8')).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(parseLine);
    const head = table[0];
    const kept = table.slice(1).map((c) => { const o = {}; head.forEach((h, i) => { o[h] = c[i] || ''; }); return { taxId: o['統編'], name: o['名稱'], org: o['組織別'], capital: Number(o['資本額']) || 0, setup: o['設立日期'], address: o['地址'], code: o['行業代號'], ind: o['行業'], ind2: o['行業2'], ind3: o['行業3'], invoice: o['開發票'] }; });
    let fileDate = '';
    try { fileDate = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8')).fileDate || ''; } catch (e) { /* 沒有就空 */ }
    console.log(`只補負責人：biz.csv 有 ${kept.length.toLocaleString()} 筆`);
    const st = await fillOwners(kept, owners, OWNER_MINUTES);
    await writeOut(kept, owners, fileDate, st);
    return;
  }

  console.log(`下載 ${SOURCE}（串流，只留 ${CITIES.join('、')} 的獨資／合夥、資本額 ≥ ${MIN_CAPITAL.toLocaleString()}）`);
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
  let n = 0; let fileDate = ''; const kept = [];
  for await (const line of rl) {
    n++;
    if (n === 1) continue;   // 表頭
    const cells = parseLine(line);
    if (n === 2 && cells[0] && !cells[1]) { fileDate = cells[0]; continue; }   // 出檔日期那列
    const r = normalize(cells);
    if (r) kept.push(r);
    if (n % 200000 === 0) console.log(`  …讀到第 ${n.toLocaleString()} 列，留 ${kept.length.toLocaleString()} 筆`);
  }
  console.log(`讀完 ${n.toLocaleString()} 列（出檔 ${fileDate || '?'}），留 ${kept.length.toLocaleString()} 筆`);
  if (!kept.length) throw new Error('一筆都沒留下，篩選條件或欄位對不上');
  kept.sort((a, b) => b.capital - a.capital || (b.setup || '').localeCompare(a.setup || ''));
  const st = await fillOwners(kept, owners, OWNER_MINUTES);
  await writeOut(kept, owners, fileDate, st);
}

export { normalize, parseLine, halfWidth, rocDate, districtOf, HEAD };

if (process.argv[1] && /fetch-biz\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
