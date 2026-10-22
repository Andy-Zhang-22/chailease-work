/**
 * 產業名單：車輛相關業者、食品工廠、環保列管工廠、營造業（有工地）→ 新北市、臺北市 → leads/industry/。
 *
 * 使用者：「還有什麼資料是能幫我能找到更多客戶的？」→「這些資料都做，同個統編的公司依資料都合在一起」。
 * 探路（2026/10，見 README）：車輛相關的營業項目每月一份，有統編、資本額、地址、公司狀態，跟中租的車輛租賃最對口：
 *   data.gov.tw 36719 汽車貨運業、36720 遊覽車客運業、36711 計程車客運業、36715 小客車租賃業。
 *   CSV 表頭："統一編號","公司名稱","公司地址","資本總額","實收資本額","在境內營運資金","公司狀態","產製日期"。**沒有設立日期。**
 * 同一個統編可能在好幾份（又做貨運又做租車）→ 合成一家，類別記在一起。
 * 誰是「剛出現」：跟電子發票一樣自己記首見年月（leads/industry/seen.csv）；第一次跑全部記成起算月。
 * 成立日期、組織別、行業：拿統編對財政部稅籍檔（fetch-einv.mjs 同一套串流）。電話：貿易署電話表。
 *
 * 第二批（版本 308）：
 *   食品工廠：食藥署「食品業者登錄」（data.gov.tw 8938，每月 zip，沒有登錄日期）登錄項目是「工廠/製造場所」的。
 *   環保列管：環境部「環境保護許可管理系統（暨解除列管）對象」（118447，API 每頁 1000 筆翻完）：
 *     行業是營造／工程的＝營造業（有工地）；其他有空污或水污列管、沒解除的＝環保列管工廠。只有廢棄物的（餐廳、清潔）不收。
 *   這兩份的地址是工廠／工地的，名稱也可能是工地名 → 名稱、地址都改用稅籍檔（總公司），稅籍檔沒有的、分公司、縣市外的不收。
 *   新廠／新工地：每個場所（食品登錄字號、環境部管制編號）記首見年月（seen-sites.csv），這家多了新場所就標出來。
 *   探路時試過水污染源許可（106598）的許可起始日：多半是展延，分不出新廠，沒用。
 * industry.csv：統編,名稱,類別,地址,資本額,實收資本額,首見年月,設立日期,組織別,行業代號,行業,電話,場所,新場所年月,新場所,建照年月,建照用途,建照造價,建照種類
 * 用法：node tools/fetch-industry.mjs [--out leads/industry] [--cities 新北市,臺北市] [--phones leads/trade/phones.csv] [--reset-baseline]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
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
/** 第二批：食品工廠、環保列管（類別名稱） */
export const FOOD = { id: 8938, kind: '食品製造業' };
export const ENV = { id: 118447, factory: '環保列管工廠', site: '營造業' };
/*
 * 第三批（版本 365）：新北市建築執照存查（data.gov.tw 123639，新北市工務局，每 3 月）。探路 2026/10/21：14,343 列，起造人沒遮罩、
 * 一半以上是公司名，有用途、工程造價、發照日。沒有統編 → 起造人名字對稅籍檔的營業人名稱（總公司、縣市內的才留）。
 * 使用者：「來源越多參考的資訊越好」→ 做成訊號「正在蓋廠房／辦公室（造價 N 萬）」收進產業名單。住宅、農舍（建商）不收。
 * 存查裡建造執照（建字）、使用執照（使字）都有：建照＝正在蓋，使照＝剛蓋好（版本 366）。
 */
export const PERMIT = { id: 123639, kind: '正在蓋廠房', months: 24 };
export const HEAD = ['統編', '名稱', '類別', '地址', '資本額', '實收資本額', '首見年月', '設立日期', '組織別', '行業代號', '行業', '電話', '場所', '新場所年月', '新場所', '建照年月', '建照用途', '建照造價', '建照種類'];
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

/** 食品業者登錄一列 → { taxId, site }；不是工廠／製造場所、沒統編回 null（名稱、地址之後用稅籍檔的） */
export function foodRow(o) {
  if (!/工廠|製造/.test(String(o['登錄項目'] || ''))) return null;
  const tax = String(o['公司統一編號'] || '').replace(/\D/g, '');
  const site = String(o['食品業者登錄字號'] || '').trim();
  return tax.length === 8 && site ? { taxId: tax, site } : null;
}
const CONSTRUCTION = /營造|工程業|整地|基礎及結構/;
/** 環境部列管對象一列 → { taxId, site, type: 'site'（工地）|'factory'（工廠）, flags }；解除列管、只有廢棄物的非營造、沒統編回 null */
export function envRow(o) {
  const tax = String(o.uniformno || '').replace(/\D/g, '');
  const site = String(o.emsno || '').trim();
  if (tax.length !== 8 || !site) return null;
  const on = (k) => String(o[`is${k}`] || '').trim() === '1' && !String(o[`${k}releasedate`] || '').trim();
  const flags = [['air', '空污'], ['water', '水污']].filter(([k]) => on(k)).map(([, t]) => t);
  if (CONSTRUCTION.test(String(o.industryname || ''))) return ['air', 'water', 'waste', 'toxic', 'soil'].some(on) ? { taxId: tax, site, type: 'site', flags } : null;
  return flags.length ? { taxId: tax, site, type: 'factory', flags } : null;
}
/** 這家的場所 → 「食品工廠 1 處；工地 3 處；列管廠 1 處（空污、水污）」 */
export function sitesText(x) {
  const food = x.sites.filter((s) => s.type === 'food').length;
  const site = x.sites.filter((s) => s.type === 'site').length;
  const fac = x.sites.filter((s) => s.type === 'factory');
  const flags = [...new Set(fac.flatMap((s) => s.flags || []))];
  return [food ? `食品工廠 ${food} 處` : '', site ? `工地 ${site} 處` : '', fac.length ? `列管廠 ${fac.length} 處${flags.length ? `（${flags.join('、')}）` : ''}` : ''].filter(Boolean).join('；');
}
/** 場所首見年月 → 這家最近一次多了新場所（起算月之後才算）：{ ym, what: '新工地'|'新廠' } 或 null */
export function newSiteOf(x, seenSites, siteBaseline) {
  let best = null;
  x.sites.forEach((s) => {
    const ym = seenSites.get(s.key);
    if (!ym || !(ym > siteBaseline)) return;
    if (!best || ym > best.ym) best = { ym, what: s.type === 'site' ? '新工地' : '新廠' };
  });
  return best;
}
const PERMIT_COMPANY = /公司|企業|商行|工業|實業|科技|股份|工廠|開發|事業|農場|合作社/;
const PERMIT_RESIDENTIAL = /住宅|農舍|宿舍|公寓|透天/;
const PERMIT_BUSINESS = /工廠|廠房|廠|辦公|事務所|商業|店舖|店鋪|商場|倉儲|倉庫|物流|停車|旅館|醫院|診所|學校|幼兒園|運動|展示|研發|實驗/;
/** 用途文字 → 短名（訊號用）：廠房／辦公室／倉儲／新建物 */
export const permitUse = (use) => (/工廠|廠房|廠/.test(use) ? '廠房' : /倉儲|倉庫|物流/.test(use) ? '倉儲' : /辦公|事務所|商業|店舖|店鋪|商場/.test(use) ? '辦公室' : '新建物');
/**
 * 建築執照存查一列 → { names, ym, use, cost, district, lic }；起造人不像公司、純住宅／農舍、發照日缺或太舊回 null。
 * 起造人好幾個用「、」並列；發照日民國 yyyMMdd。
 */
export function permitRow(o, { now = new Date(), months = PERMIT.months } = {}) {
  const useRaw = halfWidth(o.use_of_buildings || '').trim();
  if (PERMIT_RESIDENTIAL.test(useRaw) && !PERMIT_BUSINESS.test(useRaw)) return null;
  // 起造人欄位八成長這樣「○○股份有限公司 負責人:王○○」（探路：295 個名字裡 229 個），負責人以後的拿掉才對得到稅籍檔
  const names = halfWidth(o.proprietor || '').replace(/[(（]?\s*(負責人|代表人).*$/, '').split(/[、,，;；]/).map((x) => x.replace(/[(（][^)）]*[)）]/g, '').trim()).filter((x) => x && PERMIT_COMPANY.test(x) && !BRANCH_NAME.test(x));
  if (!names.length) return null;
  const d = String(o.date_the_permit || o.date_licensing || '').replace(/\D/g, '');
  if (d.length !== 7) return null;
  const y = Number(d.slice(0, 3)) + 1911; const m = Number(d.slice(3, 5));
  if (!(m >= 1 && m <= 12)) return null;
  const age = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (age < 0 || age > months) return null;
  const site = halfWidth(o.building_site || o.house_address || '');
  const district = (site.match(/新北市(..區)/) || site.match(/^(..區)/) || [])[1] || '';
  // 執照字號：「115土建字第…號」建造執照＝正在蓋；「115土使字第…號」使用執照＝剛蓋好（使用者 10/22 指出存查裡兩種都有）；
  // 拆除、雜項（圍牆、廣告塔）不收
  const lic = String(o.license_number || '').trim();
  const stage = /使字/.test(lic) ? '使照' : /建字/.test(lic) ? '建照' : '';
  if (!stage) return null;
  return { names, ym: `${y}${String(m).padStart(2, '0')}`, use: permitUse(useRaw), cost: num(o.project_cost), district, lic, stage };
}
/** 建照存查 → 起造人名字 → 最近一張（ym 最新；同月取造價高的） */
async function fetchPermits() {
  const url = await csvUrlOf(PERMIT.id);
  console.log(`新北市建築執照存查（${PERMIT.id}）下載 ${url}`);
  const text = await fetchRetry(url, (r) => r.text());
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const head = parseLine(lines[0]).map((h) => h.trim());
  if (!head.includes('proprietor') || !head.includes('date_the_permit')) throw new Error(`建築執照表頭對不上：${head.join(',')}`);
  const by = new Map(); let n = 0; let kept = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    n++;
    const cells = parseLine(lines[i]); const o = {}; head.forEach((h, k) => { o[h] = cells[k] || ''; });
    const r = permitRow(o);
    if (!r) continue;
    kept++;
    r.names.forEach((name) => { const have = by.get(name); if (!have || r.ym > have.ym || (r.ym === have.ym && r.cost > have.cost)) by.set(name, { ym: r.ym, use: r.use, cost: r.cost, district: r.district, stage: r.stage, n: (have ? have.n : 0) + 1 }); else have.n += 1; });
  }
  console.log(`  ${n.toLocaleString()} 列，最近 ${PERMIT.months} 個月、起造人像公司、不是純住宅的 ${kept.toLocaleString()} 張，起造人 ${by.size.toLocaleString()} 個名字（之後對稅籍檔留縣市內的）`);
  return by;
}
export const toRow = (r) => [r.taxId, r.name, r.kinds.join('、'), r.address, r.capital || '', r.paid || '', r.firstYm, r.founded || '', r.org || '', r.indCode || '', r.industry || '', r.tel || '', r.sites && r.sites.length ? sitesText(r) : '', r.newSite ? r.newSite.ym : '', r.newSite ? r.newSite.what : '', r.permit ? r.permit.ym : '', r.permit ? r.permit.use : '', r.permit ? r.permit.cost || '' : '', r.permit ? r.permit.stage || '建照' : ''];

async function readSeen(file, keyOk = (k) => /^\d{8}$/.test(k)) {
  const m = new Map();
  try {
    const text = await fs.readFile(file, 'utf8');
    text.replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach((line) => { const c = parseLine(line); if (keyOk(c[0] || '') && /^\d{6}$/.test(c[1] || '')) m.set(c[0], c[1]); });
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

/** 整份下載（連內容一起讀完）失敗就重來：食藥署的伺服器常在傳到一半斷線 */
async function fetchRetry(url, read, ms = 10 * 60000, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await read(r);
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`  下載失敗（${e.message}），${2 * 2 ** i} 秒後第 ${i + 1} 次`);
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** i));
    }
  }
}
/** zip 第一個檔解成文字（食藥署的 zip 是串流產生的，沒有中央目錄，unzip 打不開，照本地檔頭自己解） */
export function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf.toString('utf8');
  const method = buf.readUInt16LE(8); const nlen = buf.readUInt16LE(26); const xlen = buf.readUInt16LE(28);
  const body = buf.subarray(30 + nlen + xlen);
  if (method === 0) return body.toString('utf8');
  return zlib.inflateRawSync(body, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8');
}
/** 食品業者登錄 → 統編 → 場所（只要工廠／製造場所） */
async function fetchFood() {
  const url = await csvUrlOf(FOOD.id);
  console.log(`食品業者登錄（${FOOD.id}）下載 ${url}`);
  const text = unzipFirst(await fetchRetry(url, async (r) => Buffer.from(await r.arrayBuffer())));
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const head = parseLine(lines[0]).map((h) => h.trim());
  if (!head.includes('公司統一編號') || !head.includes('登錄項目')) throw new Error(`食品業者登錄表頭對不上：${head.join(',')}`);
  const by = new Map(); let n = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    n++;
    const cells = parseLine(lines[i]); const o = {}; head.forEach((h, k) => { o[h] = cells[k] || ''; });
    const r = foodRow(o);
    if (!r) continue;
    if (!by.has(r.taxId)) by.set(r.taxId, new Map());
    by.get(r.taxId).set(`F:${r.site}`, { key: `F:${r.site}`, type: 'food' });
  }
  console.log(`  ${n.toLocaleString()} 列，工廠／製造場所有統編的 ${by.size.toLocaleString()} 家（全國，之後對稅籍檔留縣市內的）`);
  return by;
}
/** 環境部列管對象（API 每頁 1000 筆翻到底）→ 統編 → 場所 */
async function fetchEnv() {
  const u = new URL(await csvUrlOf(ENV.id));
  ['limit', 'offset', 'sort'].forEach((k) => u.searchParams.delete(k));
  u.searchParams.set('format', 'CSV');
  console.log(`環保列管（${ENV.id}）${u.origin}${u.pathname}`);
  const by = new Map(); let n = 0; let pages = 0; let head = null;
  for (let off = 0; off < 3000000; off += 1000) {
    u.searchParams.set('limit', '1000'); u.searchParams.set('offset', String(off));
    const lines = (await fetchRetry(u.toString(), (r) => r.text(), 120000)).replace(/^\uFEFF/, '').split(/\r?\n/).filter((x) => x.trim());
    pages++;
    if (!lines.length) break;
    const h = parseLine(lines[0]).map((x) => x.trim());
    if (!head) { head = h; if (!head.includes('uniformno') || !head.includes('emsno')) throw new Error(`環保列管表頭對不上：${head.join(',')}`); }
    for (let i = 1; i < lines.length; i++) {
      n++;
      const cells = parseLine(lines[i]); const o = {}; h.forEach((k, j) => { o[k] = cells[j] || ''; });
      const r = envRow(o);
      if (!r) continue;
      if (!by.has(r.taxId)) by.set(r.taxId, new Map());
      by.get(r.taxId).set(`E:${r.site}`, { key: `E:${r.site}`, type: r.type, flags: r.flags });
    }
    if (lines.length - 1 < 1000) break;
    await new Promise((ok) => setTimeout(ok, 200));
  }
  console.log(`  ${pages} 頁 ${n.toLocaleString()} 列，有統編、還在列管的工地或工廠 ${by.size.toLocaleString()} 家（全國）`);
  if (n < 10000) throw new Error('環保列管筆數太少，API 可能變了');
  return by;
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
  console.log(`車輛相關合計（同統編合併）${byTax.size.toLocaleString()} 家`);
  if (byTax.size < 100) throw new Error('留下來的太少，欄位或縣市對不上');

  // 2. 食品工廠、環保列管（全國，名稱地址等對稅籍檔再決定留不留）
  const extra = new Map();   // 統編 → { kinds:Set, sites:Map }
  const addExtra = (by, kindOf) => by.forEach((sites, tax) => {
    if (!extra.has(tax)) extra.set(tax, { kinds: new Set(), sites: new Map() });
    const x = extra.get(tax);
    sites.forEach((st, k) => { x.sites.set(k, st); x.kinds.add(kindOf(st)); });
  });
  addExtra(await fetchFood(), () => FOOD.kind);
  addExtra(await fetchEnv(), (st) => (st.type === 'site' ? ENV.site : ENV.factory));
  // 2b. 新北建照：起造人名字（沒統編），對稅籍檔的營業人名稱
  const permitByName = await fetchPermits();
  let permitHit = 0;

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
    const tax = String(cells[1] || '').replace(/\D/g, '');
    let r = byTax.get(tax);
    const x = extra.get(tax);
    const pm = permitByName.size ? permitByName.get(halfWidth(cells[3])) : null;
    if (!r && !x && !pm) continue;
    const t = taxFields(cells);
    if (!t) continue;
    if (!r) {
      // 食品、環保那兩份的地址是工廠／工地的 → 用稅籍檔的總公司名稱、地址；分公司、縣市外不收。建照只有起造人名字，也走這條
      const name = halfWidth(cells[3]); const address = halfWidth(cells[0]);
      if (t.branch || !name || BRANCH_NAME.test(name) || !inCity(address, CITIES)) continue;
      r = { taxId: tax, name, address, capital: t.capital, paid: 0, kinds: [] };
      byTax.set(tax, r);
    }
    if (x) { x.kinds.forEach((k) => { if (!r.kinds.includes(k)) r.kinds.push(k); }); r.sites = [...x.sites.values()]; }
    if (pm && !t.branch && !r.permit) { if (!r.kinds.includes(PERMIT.kind)) r.kinds.push(PERMIT.kind); r.permit = pm; permitHit++; }
    hit++;
    r.founded = t.founded; r.org = t.org; r.indCode = t.indCode; r.industry = t.industry;
  }
  // 4. 首見年月（公司）、場所首見（新廠／新工地）
  const { seen, baseline, newIds } = updateSeen(prevSeen, [...byTax.keys()], ym, prevIndex.baseline);
  byTax.forEach((r, id) => { r.firstYm = seen.get(id); r.isNew = r.firstYm > baseline; });
  console.log(`起算月 ${baseline}；這個月（${ym}）新出現 ${newIds.size.toLocaleString()} 家`);
  const prevSites = RESET ? new Map() : await readSeen(path.join(OUT, 'seen-sites.csv'), (k) => /^[FE]:/.test(k));
  const siteKeys = [...byTax.values()].flatMap((r) => (r.sites || []).map((st) => st.key));
  const sitesSeen = updateSeen(prevSites, siteKeys, ym, prevIndex.siteBaseline);
  byTax.forEach((r) => { r.newSite = r.sites ? newSiteOf(r, sitesSeen.seen, sitesSeen.baseline) : null; });
  console.log(`場所 ${siteKeys.length.toLocaleString()} 處（起算月 ${sitesSeen.baseline}）；這個月新場所 ${sitesSeen.newIds.size.toLocaleString()} 處`);
  console.log(`稅籍檔 ${tn.toLocaleString()} 列（出檔 ${fileDate || '?'}），對到 ${hit.toLocaleString()} 家；建照起造人對到 ${permitHit.toLocaleString()} 家`);

  // 5. 電話
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
  await fs.writeFile(path.join(OUT, 'seen-sites.csv'), `場所,首見年月\n${[...sitesSeen.seen.entries()].sort().map(([k, v]) => `${csvCell(k)},${v}`).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), source: [...KINDS.map((k) => k.id), FOOD.id, ENV.id, PERMIT.id].map((id) => `https://data.gov.tw/dataset/${id}`),
    kinds: [...KINDS.map((k) => k.kind), FOOD.kind, ENV.factory, ENV.site, PERMIT.kind], cities: CITIES, permitTotal: list.filter((r) => r.permit).length,
    baseline, siteBaseline: sitesSeen.baseline, newSiteTotal: list.filter((r) => r.newSite).length, dataYm: ym, taxFileDate: fileDate, total: list.length, newTotal: list.filter((r) => r.isNew).length, newThisMonth: list.filter((r) => r.isNew && r.firstYm === ym).length,
    withPhone: list.filter((r) => r.tel).length, byKind, byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])),
    files: [{ path: 'industry.csv', rows: list.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`\n留 ${list.length.toLocaleString()} 家（${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join('、')}；剛出現 ${index.newTotal}；有電話 ${index.withPhone}）→ ${OUT}`);
}

if (process.argv[1] && /fetch-industry\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
