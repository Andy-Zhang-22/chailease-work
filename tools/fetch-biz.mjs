/**
 * 商行／企業社名單：財政部「全國營業（稅籍）登記資料」→ 篩出要打的獨資、合夥 → leads/biz/。
 *
 * 使用者：「我想找商行或企業社的老闆做企金推廣，可以怎麼找名單」，選了這條。
 *
 * 來源（探路確認）：https://eip.fia.gov.tw/data/BGMOPEN1.csv（322 MB，UTF-8，每月更新；也有 .zip 66 MB）
 *   欄位：營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,使用統一發票,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3
 *   第一列資料是出檔日期（29-SEP-26,,,,…），設立日期是民國七碼（1040413），地址用全形數字（３７１號）。
 *   全台 171 萬筆；新北市獨資／合夥 114,661 筆，資本額 50 萬以上 5,172 筆（探路統計）。
 *   **沒有負責人**——負責人從新北市政府經濟發展局「新北市商業登記清冊」補（data.gov.tw 資料集 125322，探路確認）：
 *   https://data.ntpc.gov.tw/api/datasets/1ae53d31-a418-4209-83cb-474d91b7f3fc/csv/file（約 35 萬列，全新北市歷年商業登記）
 *   欄位：address_code,ban_no,buss_name,buss_addr_comb,register_funds,org_code,res_name,set_app_date,close_app_date,yyymmroc
 *   整份串流讀、只留名單裡的統編，用 ban_no 對 res_name。這份不定期更新（yyymmroc 是蒐集年月），
 *   剛設立幾個月的可能還沒有；抓不到清冊就沿用上次的 owners.json。
 *   （經濟部 GCIS 開放 API 的商業登記幾條都不給負責人，探路試過三輪。）
 *
 * 整份放不進網頁；這裡串流讀、只留：
 *   - 縣市在 --cities（預設新北市，新莊分公司的轄區都在新北）
 *   - 組織別是獨資或合夥（公司、有限合夥另有公司登記那條）
 *   - 資本額 ≥ --min-capital（預設 50 萬；商行大多 10 萬以下，那種給不了額度）
 *   - 分公司（總機構統編非空）不要，總機構才是打的對象
 *
 * 產出 leads/biz/biz.csv（統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人,稅籍資本額,商業登記）
 *   商業登記 Y＝清冊裡有這家；N＝只有稅籍登記、沒辦商業登記（小規模營業人可免辦），findbiz 查不到、負責人沒有、資本額是稅籍自填的。
 * owners.json（統編 → 負責人，清冊抓不到時沿用）、index.json（抓取時間、出檔日期、各區筆數、查到負責人幾家）。
 *
 * 用法：node tools/fetch-biz.mjs [--out leads/biz] [--cities 新北市,臺北市] [--min-capital 500000]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/biz');
const CITIES = opt('cities', '新北市,臺北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const MIN_CAPITAL = Number(opt('min-capital', '500000')) || 0;
const SOURCE = 'https://eip.fia.gov.tw/data/BGMOPEN1.csv';
const OWNER_SOURCE = 'https://data.ntpc.gov.tw/api/datasets/1ae53d31-a418-4209-83cb-474d91b7f3fc/csv/file';   // 新北市商業登記清冊
/*
 * 臺北市沒有像新北那樣帶負責人的清冊（探路：data.gov.tw 整份目錄裡「臺北市＋商業登記」21 個，欄位有負責人的 0 個；
 * data.taipei 搜不到）。有的是經濟部商業發展署「台北市商業登記資料」按行業分的檔（統一編號、商業名稱、商業地址、
 * 實收資本額、核准設立日期），只有 A、C、F、I、J 五個行業檔。拿來標「有商業登記」、用登記資本額取代稅籍自填的；負責人還是空的。
 */
const TPE_REG = {
  A: 'D336A7C8-4772-4B93-88DC-A6CE51BAABBF',   // 農林漁牧（data.gov.tw 139890）
  C: '44FEB6B1-BEF5-413C-8773-399EE9586C28',   // 製造業（53663）
  F: '76A5AA0B-385A-459A-899B-38C96ADF9319',   // 零售、批發及餐飲業（53661）
  I: 'AE1DA8CA-5F26-450C-960C-D358A2CB05B4',   // 專業、科學及技術服務業（52934）
  J: 'E6F56E3C-BD98-4545-9C38-4FF44F27C6B4',   // 文化、運動、休閒及其他服務業（160031）
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const HEAD = ['統編', '名稱', '組織別', '資本額', '設立日期', '地址', '行業代號', '行業', '行業2', '行業3', '開發票', '負責人', '稅籍資本額', '商業登記'];

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
  if (!/^(獨資|合夥)$/.test(String(org || '').trim())) return null;   // 有限合夥是公司那一類，不算
  // 稅籍上組織別填獨資的財團法人、寺廟、教會、公寓大廈管委會不是要打的對象
  if (/財團法人|社團法人|祭祀公業|寺$|宮$|廟|教會|堂$|管理委員會|管委會|基金會|協會|公會|工會|學會|事務所$/.test(String(name || ''))) return null;
  if (String(headOffice || '').replace(/\D/g, '')) return null;   // 分公司
  const addr = halfWidth(addrRaw);
  if (cities.length && !cities.some((c) => addr.startsWith(c) || addr.startsWith(c.replace(/^臺/, '台')) || addr.startsWith(c.replace(/^台/, '臺')))) return null;
  const capital = Number(String(capRaw || '').replace(/\D/g, '')) || 0;
  if (capital < minCapital) return null;
  return { taxId: tax, name: halfWidth(name), org: org.trim(), capital, setup: rocDate(setup), address: addr.replace(/^臺/, '台'), code: String(code1 || '').trim(), ind: String(ind1 || '').trim(), ind2: String(ind2 || '').trim(), ind3: String(ind3 || '').trim(), invoice: String(invoice || '').trim() === 'Y' ? 'Y' : 'N' };
}

/** 新北市商業登記清冊：整份串流讀，只留名單裡的統編 → { name, closed }；同一統編有幾筆時留還在營業的、最新設立的。
 *  回 { owners, month }（month 是清冊的蒐集年月，如 2026/06）；抓不到就丟錯，由呼叫端沿用上次的。 */
async function loadOwners(taxIds, source = OWNER_SOURCE) {
  const res = await fetch(source, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10 * 60000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
  let head = null; let n = 0; let month = ''; const owners = {};
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!head) { head = parseLine(line).map((h) => h.trim().toLowerCase()); if (!head.includes('ban_no') || !head.includes('res_name')) throw new Error(`清冊表頭對不上：${line.slice(0, 200)}`); continue; }
    n++;
    const cells = parseLine(line);
    const row = {}; head.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    if (!month && /^\d{5}$/.test(row.yyymmroc || '')) month = `${Number(row.yyymmroc.slice(0, 3)) + 1911}/${row.yyymmroc.slice(3)}`;
    const tax = (row.ban_no || '').replace(/\D/g, '');
    if (tax.length !== 8 || !taxIds.has(tax) || !row.res_name) continue;
    const cur = { name: row.res_name, closed: !!(row.close_app_date || '').replace(/\D/g, ''), setup: (row.set_app_date || '').replace(/\D/g, ''), funds: Number(String(row.register_funds || '').replace(/\D/g, '')) || 0 };
    const old = owners[tax];
    if (!old || (old.closed && !cur.closed) || (old.closed === cur.closed && cur.setup > old.setup)) owners[tax] = cur;
  }
  if (!n) throw new Error('清冊是空的');
  console.log(`新北市商業登記清冊 ${n.toLocaleString()} 列（蒐集年月 ${month || '?'}），對到名單裡 ${Object.keys(owners).length.toLocaleString()} 家的負責人`);
  return { owners, month };
}

/** 臺北市的商業登記（經濟部按行業分的檔）：只留名單裡的統編，回 統編 → { funds, setup }。一個檔抓不到就略過那個檔。 */
async function loadTaipeiRegistry(taxIds) {
  const found = {}; let total = 0;
  for (const [cat, oid] of Object.entries(TPE_REG)) {
    try {
      const res = await fetch(`https://data.gcis.nat.gov.tw/od/file?oid=${oid}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10 * 60000) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
      let head = null;
      for await (const raw of rl) {
        const line = raw.replace(/^\uFEFF/, '');
        if (!head) { head = parseLine(line).map((h) => h.trim()); if (!head.includes('統一編號') || !head.includes('實收資本額')) throw new Error(`表頭對不上：${line.slice(0, 120)}`); continue; }
        total++;
        const cells = parseLine(line);
        const row = {}; head.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
        const tax = (row['統一編號'] || '').replace(/\D/g, '');
        if (tax.length !== 8 || !taxIds.has(tax)) continue;
        found[tax] = { funds: Number(String(row['實收資本額'] || '').replace(/\D/g, '')) || 0, setup: (row['核准設立日期'] || '').replace(/\D/g, '') };
      }
    } catch (e) { console.log(`✗ 台北市商業登記資料-${cat} 抓不到（${e.message}）`); }
    await nap(500);
  }
  console.log(`台北市商業登記資料（五個行業檔）${total.toLocaleString()} 列，對到名單裡 ${Object.keys(found).length.toLocaleString()} 家（這份沒有負責人）`);
  return found;
}

/** 對負責人與登記資本額：新北清冊抓得到就整批換新；抓不到就沿用上次的 owners.json（那裡面也有登記資本額）。
 *  臺北市另外對經濟部的商業登記檔：標「有商業登記」、用登記資本額，負責人空著（每次重抓，不進快取）。
 *  回 { owners: 統編 → { at, name, month, funds }, month, fresh }；owners.json 由呼叫端篩完再寫，免得存十幾萬筆。 */
async function fillOwners(kept) {
  let cached = {};
  try { cached = JSON.parse(await fs.readFile(path.join(OUT, 'owners.json'), 'utf8')); } catch (e) { cached = {}; }
  Object.keys(cached).forEach((k) => { if (!cached[k] || !cached[k].name) delete cached[k]; });
  const taxIds = new Set(kept.map((r) => r.taxId));
  const at = new Date().toISOString().slice(0, 10);
  let merged = {}; let month = ''; let fresh = false;
  try {
    const got = await loadOwners(taxIds);
    month = got.month; fresh = true;
    kept.forEach((r) => { const o = got.owners[r.taxId]; if (o) merged[r.taxId] = { at, name: o.name, month, funds: o.funds || 0 }; else if (cached[r.taxId]) merged[r.taxId] = cached[r.taxId]; });
  } catch (e) {
    console.log(`✗ 商業登記清冊抓不到（${e.message}），負責人沿用上次的 ${Object.keys(cached).length} 家`);
    merged = { ...cached };
  }
  if (CITIES.some((c) => /^[臺台]北市$/.test(c))) {
    const tpe = await loadTaipeiRegistry(taxIds);
    kept.forEach((r) => { const t = tpe[r.taxId]; if (t && !merged[r.taxId]) merged[r.taxId] = { at, name: '', month: 'gcis', funds: t.funds || 0 }; });
  }
  return { owners: merged, month, fresh };
}

/** 資本額以商業登記為準（稅籍檔那欄是營業人自己填的，有 20 萬填成 2 億的）；清冊沒有這家或登記資本額是 0 才用稅籍的 */
function applyFunds(kept, owners) {
  let n = 0;
  kept.forEach((r) => { r.taxCapital = r.capital; const o = owners[r.taxId]; if (o && o.funds > 0) { r.capital = o.funds; n += 1; } });
  return n;
}

async function writeOut(kept, fileDate, ow) {
  const owners = ow.owners;
  const byOrg = {}; const byDist = {};
  kept.forEach((r) => { byOrg[r.org] = (byOrg[r.org] || 0) + 1; const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; });
  const rows = [HEAD, ...kept.map((r) => [r.taxId, r.name, r.org, r.capital, r.setup, r.address, r.code, r.ind, r.ind2, r.ind3, r.invoice, (owners[r.taxId] && owners[r.taxId].name) || '', r.taxCapital == null ? r.capital : r.taxCapital, owners[r.taxId] ? 'Y' : 'N'])];
  const mine = {}; kept.forEach((r) => { if (owners[r.taxId]) mine[r.taxId] = owners[r.taxId]; });
  await fs.writeFile(path.join(OUT, 'owners.json'), `${JSON.stringify(mine)}\n`, 'utf8');
  await fs.writeFile(path.join(OUT, 'biz.csv'), `﻿${rows.map((c) => c.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), fileDate, source: SOURCE, cities: CITIES, minCapital: MIN_CAPITAL,
    total: kept.length, byOrg, byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])),
    withOwner: kept.filter((r) => owners[r.taxId] && owners[r.taxId].name).length, ownerSource: OWNER_SOURCE, ownerMonth: ow.month || '', ownerFresh: ow.fresh,
    registeredNoOwner: kept.filter((r) => owners[r.taxId] && !owners[r.taxId].name).length,   // 臺北市：有商業登記但那份檔沒負責人
    capitalFromRegistry: kept.filter((r) => owners[r.taxId] && owners[r.taxId].funds > 0).length,
    taxOnly: kept.filter((r) => !owners[r.taxId]).length,
    files: [{ path: 'biz.csv', rows: kept.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`寫入 biz.csv（${kept.length.toLocaleString()} 筆）：${Object.entries(byOrg).map(([k, v]) => `${k} ${v}`).join('、')}；各區 ${Object.entries(index.byDist).slice(0, 8).map(([k, v]) => `${k} ${v}`).join('、')}；查到負責人 ${index.withOwner} 家`);
  console.log('\n完成');
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`下載 ${SOURCE}（串流，只留 ${CITIES.join('、')} 的獨資／合夥；資本額對完商業登記清冊再篩 ≥ ${MIN_CAPITAL.toLocaleString()}）`);
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
  let n = 0; let fileDate = ''; const kept = [];
  for await (const line of rl) {
    n++;
    if (n === 1) continue;   // 表頭
    const cells = parseLine(line);
    if (n === 2 && cells[0] && !cells[1]) { fileDate = cells[0]; continue; }   // 出檔日期那列
    const r = normalize(cells, { minCapital: 0 });   // 門檻等對完登記資本額再套
    if (r) kept.push(r);
    if (n % 200000 === 0) console.log(`  …讀到第 ${n.toLocaleString()} 列，留 ${kept.length.toLocaleString()} 筆`);
  }
  console.log(`讀完 ${n.toLocaleString()} 列（出檔 ${fileDate || '?'}），留 ${kept.length.toLocaleString()} 筆`);
  if (!kept.length) throw new Error('一筆都沒留下，篩選條件或欄位對不上');
  const ow = await fillOwners(kept);
  const fromReg = applyFunds(kept, ow.owners);
  const list = kept.filter((r) => r.capital >= MIN_CAPITAL);
  console.log(`登記資本額對到 ${fromReg.toLocaleString()} 家；資本額 ≥ ${MIN_CAPITAL.toLocaleString()} 的 ${list.length.toLocaleString()} 筆（其中稅籍資本額與登記不同的 ${list.filter((r) => r.taxCapital !== r.capital).length.toLocaleString()} 筆）`);
  if (!list.length) throw new Error('篩完一筆都沒有');
  list.sort((a, b) => b.capital - a.capital || (b.setup || '').localeCompare(a.setup || ''));
  await writeOut(list, fileDate, ow);
}

export { normalize, parseLine, halfWidth, rocDate, districtOf, loadOwners, loadTaipeiRegistry, applyFunds, HEAD, TPE_REG };

if (process.argv[1] && /fetch-biz\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
