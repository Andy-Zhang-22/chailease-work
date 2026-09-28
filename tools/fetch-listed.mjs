/**
 * 上市／上櫃／興櫃公司基本資料 ＋ 董事長名下的其他公司（找投資公司）。
 *
 * 使用者：「我可以透過這些上市櫃公司老闆另外持有的投資公司去給他額度」。上市櫃公司本身
 * 多半是大企部的範圍，真正要打的是老闆名下的投資／控股公司——那些是一般公司，統編、地址、
 * 資本額都查得到。
 *
 * 來源（都是開放 API，探路確認過）：
 *   上市  https://openapi.twse.com.tw/v1/opendata/t187ap03_L        中文欄位、中文地址
 *   上櫃  https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O     英文欄位、英文地址
 *   興櫃  https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R     英文欄位、英文地址
 *   負責人 https://data.gcis.nat.gov.tw/od/data/api/4B61A0F1-…?$filter=Responsible_Name eq 姓名
 *          → [{ Business_Accounting_NO, Company_Name }]，同名同姓的都會回來
 *   上櫃、興櫃的中文地址與投資公司的資料，拿統編查商工登記（Registry，跟主站同一套）。
 *
 * 產出 leads/listed/：
 *   companies.csv  每家上市櫃公司一列（市場別、代號、名稱、統編、產業、地址、董事長、總經理、電話、成立、上市櫃日、實收資本額、網址、名下投資公司數）
 *   owners.json    董事長姓名 → 名下其他公司 [{ 統編、名稱、是否投資公司、地址、資本額（仟元）、設立日期、是否與上市公司同址 }]
 *   cache.json     查過的東西（負責人查詢、商工登記），下個月只查新的
 *   index.json     抓取時間、各市場家數、查了幾位董事長、找到幾家投資公司
 *
 * 只能在 GitHub Actions 跑（開發環境連不上這些網站）。負責人查詢與商工登記一家一家查，
 * 有 --minutes 的時間預算，到了就存檔收工，workflow 看到還有剩會自己再排一輪。
 *
 * 用法：node tools/fetch-listed.mjs [--out leads/listed] [--minutes 280] [--probe]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadModules } = require('../tests/load.js');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/listed');
const MINUTES = Number(opt('minutes', '280')) || 280;
const PROBE = args.includes('--probe');
const DEADLINE = Date.now() + MINUTES * 60000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchLikeBrowser = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), 'User-Agent': UA }, signal: init.signal || AbortSignal.timeout(45000) });
const { Registry } = loadModules(['registry'], { fetch: fetchLikeBrowser });

const SOURCES = [
  { market: '上市', url: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L', zh: true },
  { market: '上櫃', url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', zh: false },
  { market: '興櫃', url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R', zh: false },
];
const OWNER_API = 'https://data.gcis.nat.gov.tw/od/data/api/4B61A0F1-458C-43F9-93F3-9FD6DA5E1B08';
// 證交所／櫃買共用的產業別代碼
const INDUSTRY = {
  '01': '水泥工業', '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維', '05': '電機機械', '06': '電器電纜', '08': '玻璃陶瓷',
  '09': '造紙工業', '10': '鋼鐵工業', '11': '橡膠工業', '12': '汽車工業', '14': '建材營造', '15': '航運業', '16': '觀光餐旅',
  '17': '金融保險', '18': '貿易百貨', '19': '綜合', '20': '其他', '21': '化學工業', '22': '生技醫療', '23': '油電燃氣',
  '24': '半導體', '25': '電腦及週邊設備', '26': '光電', '27': '通信網路', '28': '電子零組件', '29': '電子通路', '30': '資訊服務',
  '31': '其他電子', '32': '文化創意', '33': '農業科技', '34': '電子商務', '35': '綠能環保', '36': '數位雲端', '37': '運動休閒', '38': '居家生活',
  '80': '管理股票', '91': '存託憑證',
};
const INVEST_RE = /投資|控股|資產|創投|資本|開發股份|實業股份|興業股份|管理顧問/;
const HEAD = ['市場別', '公司代號', '公司名稱', '公司簡稱', '統一編號', '產業別', '住址', '董事長', '總經理', '總機電話', '成立日期', '上市櫃日期', '實收資本額', '網址', '名下投資公司數', '名下其他公司數'];

const ymd = (s) => { const t = String(s || '').trim(); return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}/${t.slice(4, 6)}/${t.slice(6, 8)}` : ''; };
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/^－\s*$/, '');
const csvCell = (v) => { const t = String(v == null ? '' : v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const toCsv = (rows) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`;

async function getJson(url) {
  const res = await fetchLikeBrowser(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 80)}`);
  const j = JSON.parse(text);
  return Array.isArray(j) ? j : [];
}

function normalize(row, src) {
  const g = (zh, en) => clean(src.zh ? row[zh] : row[en]);
  return {
    market: src.market,
    code: g('公司代號', 'SecuritiesCompanyCode'),
    name: g('公司名稱', 'CompanyName'),
    abbr: g('公司簡稱', 'CompanyAbbreviation'),
    taxId: g('營利事業統一編號', 'UnifiedBusinessNo.').replace(/\D/g, ''),
    industryCode: g('產業別', 'SecuritiesIndustryCode'),
    address: src.zh ? g('住址', '') : '',          // 上櫃、興櫃給的是英文地址，等一下拿統編查中文的
    addressEn: src.zh ? '' : g('', 'Address'),
    chairman: g('董事長', 'Chairman'),
    gm: g('總經理', 'GeneralManager'),
    phone: g('總機電話', 'Telephone'),
    founded: ymd(g('成立日期', 'DateOfIncorporation')),
    listed: ymd(g('上市日期', 'DateOfListing')),
    capital: String(g('實收資本額', 'Paidin.Capital.NTDollars')).replace(/\D/g, ''),
    web: g('網址', 'WebAddress'),
  };
}

/** 兩個地址是不是同一個地方：去空白、臺→台，比到「號」為止。 */
function sameSpot(a, b) {
  const key = (s) => { const t = String(s || '').replace(/\s+/g, '').replace(/臺/g, '台'); const m = t.match(/^(.*?\d+(?:-\d+)?號)/); return m ? m[1] : ''; };
  const ka = key(a); const kb = key(b);
  return !!ka && ka === kb;
}

/* ---------------- 快取 ---------------- */
const CACHE = path.join(OUT, 'cache.json');
let cache = { reg: {}, owners: {} };
// 在 main() 裡才讀：測試會 import 這支檔案拿純函式，import 時不要碰檔案、不要印東西
async function loadCache() {
  try { cache = { reg: {}, owners: {}, ...JSON.parse(await fs.readFile(CACHE, 'utf8')) }; } catch (e) { console.log('還沒有 cache.json，這次從頭建'); }
}
let dirty = 0;
const saveCache = async () => { await fs.mkdir(OUT, { recursive: true }); await fs.writeFile(CACHE, `${JSON.stringify(cache)}\n`, 'utf8'); dirty = 0; };
const today = new Date().toISOString().slice(0, 10);
const daysOld = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 1e9);

let fails = 0;
let stopped = '';
const timeUp = () => Date.now() > DEADLINE;

/** 商工登記：地址、資本額、設立日期、負責人。查過的留 180 天。 */
async function regOf(taxId, name) {
  const hit = cache.reg[taxId];
  if (hit && daysOld(hit.at) < 180) return hit;
  let res;
  try { res = await Registry.lookupCompany({ taxId, name }, { useMirror: true }); }
  catch (err) { res = { ok: false, reason: String((err && err.message) || err) }; }
  if (res.ok && res.data) {
    const d = res.data;
    cache.reg[taxId] = { at: today, name: d.name || name || '', address: d.address || '', capital: d.capital || '', founded: d.founded || '', owner: d.owner || '' };
    fails = 0;
  } else if (/查無資料|沒有一筆的統編是|部分欄位/.test(res.reason || '')) {
    cache.reg[taxId] = { at: today, missing: true };
    fails = 0;
  } else {
    fails += 1;
    if (fails >= 20) stopped = `連續 ${fails} 次連不上（${String(res.reason || '').slice(0, 60)}）`;
    await nap(2000);
    return null;
  }
  dirty += 1;
  if (dirty >= 200) await saveCache();
  return cache.reg[taxId];
}

/** 負責人查詢：這個名字名下有哪些公司。查過的留 60 天。 */
async function companiesOf(personName) {
  const hit = cache.owners[personName];
  if (hit && daysOld(hit.at) < 60) return hit.list;
  const url = `${OWNER_API}?$format=json&$filter=Responsible_Name%20eq%20${encodeURIComponent(personName)}&$skip=0&$top=300`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchLikeBrowser(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      if (res.status === 200 && (text.trim().startsWith('[') || text.trim() === '')) {
        const list = text.trim() ? JSON.parse(text).map((x) => ({ taxId: String(x.Business_Accounting_NO || '').replace(/\D/g, ''), name: clean(x.Company_Name) })).filter((x) => x.taxId) : [];
        cache.owners[personName] = { at: today, list };
        dirty += 1;
        if (dirty >= 200) await saveCache();
        fails = 0;
        return list;
      }
      // 「查無資料」的 API 會回一段文字而不是陣列
      if (res.status === 200 || res.status === 404) { cache.owners[personName] = { at: today, list: [] }; dirty += 1; fails = 0; return []; }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === 3) { fails += 1; if (fails >= 20) stopped = `連續 ${fails} 次連不上（${String(err.message).slice(0, 60)}）`; return null; }
      await nap(1500 * attempt);
    }
  }
  return null;
}

/* ---------------- 主流程 ---------------- */
async function main() {
  await loadCache();
  const companies = [];
  for (const src of SOURCES) {
    const rows = await getJson(src.url);
    const list = rows.map((r) => normalize(r, src)).filter((r) => r.name);
    console.log(`${src.market}：${list.length} 家`);
    companies.push(...list);
    await nap(500);
  }
  if (!companies.length) throw new Error('一家都沒抓到');
  const listedIds = new Set(companies.map((c) => c.taxId).filter(Boolean));

  // 上櫃、興櫃的中文地址：拿統編查商工登記。上市的地址有些沒寫「區」（台北市中山北路2段113號），
  // 分公司劃分要靠區，這種也拿商工登記的地址換掉
  const hasDistrict = (a) => /^[^\s]{2}[市縣][^\s]{1,3}[區鄉鎮市]/.test(String(a || '').replace(/^臺/, '台'));
  let addrDone = 0;
  for (const c of companies) {
    if (!c.taxId || (c.address && hasDistrict(c.address))) continue;
    if (timeUp()) { stopped = stopped || `時間到（${MINUTES} 分鐘）`; break; }
    if (stopped) break;
    const d = await regOf(c.taxId, c.name);
    if (d && !d.missing && d.address) { c.address = d.address; addrDone += 1; }
    await nap(300);
  }
  console.log(`補中文地址（上櫃、興櫃，以及上市地址沒寫區的）：這次查了 ${addrDone} 家`);

  // 董事長名下的其他公司
  const names = [...new Set(companies.map((c) => c.chairman).filter((n) => n && n.length >= 2 && n.length <= 6 && !/－|法人|代表/.test(n)))];
  console.log(`董事長 ${names.length} 位（不重複）`);
  let ownersDone = 0; let ownersLeft = 0;
  const owners = {};
  for (const personName of names) {
    if (stopped) { ownersLeft += 1; continue; }
    if (timeUp()) { stopped = `時間到（${MINUTES} 分鐘）`; ownersLeft += 1; continue; }
    const wasCached = cache.owners[personName] && daysOld(cache.owners[personName].at) < 60;
    const list = await companiesOf(personName);
    if (list == null) { ownersLeft += 1; continue; }
    if (!wasCached) { ownersDone += 1; await nap(400); }
    const mine = companies.filter((c) => c.chairman === personName);
    const others = list.filter((x) => !mine.some((c) => c.taxId === x.taxId));
    const out = [];
    for (const x of others) {
      const invest = INVEST_RE.test(x.name);
      const item = { taxId: x.taxId, name: x.name, invest, listed: listedIds.has(x.taxId) };
      // 投資公司才去查細節（地址、資本額、設立）；其他的只留名稱
      if (invest && !stopped && !timeUp()) {
        const d = await regOf(x.taxId, x.name);
        if (d && !d.missing) {
          item.address = d.address || ''; item.capital = d.capital || ''; item.founded = d.founded || ''; item.owner = d.owner || '';
          item.sameSpot = mine.some((c) => sameSpot(c.address, d.address));
          await nap(300);
        }
      }
      out.push(item);
    }
    if (out.length) owners[personName] = out;
  }
  await saveCache();

  const countInvest = (n) => (owners[n] || []).filter((x) => x.invest).length;
  const countOther = (n) => (owners[n] || []).length;
  const totalInvest = Object.values(owners).reduce((s, l) => s + l.filter((x) => x.invest).length, 0);
  const withInvest = companies.filter((c) => countInvest(c.chairman) > 0).length;
  const same = Object.values(owners).reduce((s, l) => s + l.filter((x) => x.sameSpot).length, 0);
  console.log(`負責人查詢：這次新查 ${ownersDone} 位，還有 ${ownersLeft} 位沒查${stopped ? `（${stopped}）` : ''}`);
  console.log(`名下有投資公司的上市櫃公司 ${withInvest} 家；投資公司共 ${totalInvest} 家，其中跟上市公司同址 ${same} 家`);
  if (PROBE) { console.log('（--probe，不寫檔）'); return; }

  await fs.mkdir(OUT, { recursive: true });
  const rows = [HEAD, ...companies.map((c) => [c.market, c.code, c.name, c.abbr, c.taxId, INDUSTRY[c.industryCode] || c.industryCode, c.address || c.addressEn, c.chairman, c.gm, c.phone, c.founded, c.listed, c.capital, c.web, countInvest(c.chairman), countOther(c.chairman)])];
  await fs.writeFile(path.join(OUT, 'companies.csv'), toCsv(rows), 'utf8');
  await fs.writeFile(path.join(OUT, 'owners.json'), `${JSON.stringify(owners)}\n`, 'utf8');
  const generatedAt = new Date().toISOString();
  const index = {
    generatedAt, total: companies.length,
    markets: Object.fromEntries(SOURCES.map((s) => [s.market, companies.filter((c) => c.market === s.market).length])),
    chairmen: names.length, chairmenLeft: ownersLeft, withInvest, investCompanies: totalInvest,
    files: [{ path: 'companies.csv', rows: companies.length }, { path: 'owners.json' }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`寫入 companies.csv（${companies.length} 家）、owners.json（${Object.keys(owners).length} 位董事長）`);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `remaining=${ownersLeft}\ntimeout=${/^時間到/.test(stopped) && ownersLeft > 0}\n`);
  }
  console.log(stopped ? `\n沒查完：${stopped}，下次接著查。` : '\n完成');
}

export { normalize, sameSpot, INDUSTRY, INVEST_RE, HEAD };
if (process.argv[1] && /fetch-listed\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
