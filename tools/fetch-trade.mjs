/**
 * 出進口廠商登記：經濟部國際貿易署的「出進口廠商登記資料」→ 新北市的廠商電話表 ＋ 最近登記的名單 → leads/trade/。
 *
 * 使用者：「政府採購決標公告、出進口廠商登記這兩個做看看」。決標那條走不通（官方採購網擋 Actions 的 IP、民間 API
 * 有 Cloudflare 驗證頁、台灣標案網的 API 沒有得標廠商），這條通。
 *
 * 來源（探路確認）：data.gov.tw 資料集 79641「出進口廠商登記資料」，下載網址
 *   https://www.trade.gov.tw/OpenData/getOpenData.aspx?oid=678DFEBC68102C72 → 轉到 https://fbfh.trade.gov.tw/opendata/companyData.csv
 *   103 MB、374,967 筆、每日更新（核發日期＝最後一次異動）。欄位：
 *   統一編號,原始登記日期,核發日期,廠商中文名稱,廠商英文名稱,中文營業地址,英文營業地址,代表人,電話號碼,傳真號碼,進口資格,出口資格
 *   代表人中間字遮掉（賴O佳）；有電話 347,135 筆；新北市 75,454 筆（有電話 70,514）。
 *
 * 整份放不進網頁，這裡串流讀、只留 --cities（預設新北市），寫兩個檔：
 *   phones.csv（統編,電話,傳真,核發日期）：整個縣市的都留——這是給「補電話」用的：登記清冊、動保、商行的名單都沒電話，
 *     加進客戶名單時用統編對這張表，對得到就直接填（使用者說投資控股類「找不到電話等於沒用」，電話是最大的痛點）。
 *   trade.csv（全部欄位）：原始登記日期在最近 --months 個月內的——剛開始做進出口的公司，開信用狀、押貨款正是週轉金需求。
 * index.json 記抓取時間、檔案日期、各區筆數。
 *
 * 用法：node tools/fetch-trade.mjs [--out leads/trade] [--cities 新北市,臺北市] [--months 24]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/trade');
const CITIES = opt('cities', '新北市,臺北市').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const MONTHS = Number(opt('months', '24')) || 24;
const SOURCE = 'https://fbfh.trade.gov.tw/opendata/companyData.csv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const HEAD = ['統編', '名稱', '英文名稱', '地址', '代表人', '電話', '傳真', '原始登記日期', '核發日期', '進口', '出口'];
const PHONE_HEAD = ['統編', '電話', '傳真', '核發日期'];

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
const halfWidth = (s) => String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ－]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ').trim();
/** 20241112 → 2024/11/12；壞的回空 */
const ymd = (s) => { const t = String(s || '').replace(/\D/g, ''); if (t.length !== 8) return ''; const y = +t.slice(0, 4); const m = t.slice(4, 6); const d = t.slice(6, 8); return (y > 1911 && +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) ? `${y}/${m}/${d}` : ''; };
const districtOf = (address) => (String(address || '').match(/^[^\s]{2}[市縣]([^\s]{1,3}[區鄉鎮市])/) || [])[1] || '?';
const inCity = (addr, cities) => !cities.length || cities.some((c) => addr.startsWith(c) || addr.startsWith(c.replace(/^臺/, '台')) || addr.startsWith(c.replace(/^台/, '臺')));

/** 貿易署那一列 → 我們的一列；不在縣市裡或壞的回 null */
function normalize(cells, { cities = CITIES } = {}) {
  if (!cells || cells.length < 12) return null;
  const [taxId, first, issued, name, ename, addrRaw, , rep, tel, fax, imp, exp] = cells;
  const tax = String(taxId || '').replace(/\D/g, '');
  if (tax.length !== 8 || !String(name || '').trim()) return null;
  const addr = halfWidth(addrRaw).replace(/^臺/, '台');
  if (!inCity(addr, cities)) return null;
  return {
    taxId: tax, name: halfWidth(name), ename: String(ename || '').trim(), address: addr, rep: String(rep || '').trim(),
    tel: halfWidth(tel), fax: halfWidth(fax), first: ymd(first), issued: ymd(issued),
    imp: String(imp || '').trim() === '有' ? 'Y' : 'N', exp: String(exp || '').trim() === '有' ? 'Y' : 'N',
  };
}
/** 原始登記日期在最近 months 個月內 */
function isRecent(r, months = MONTHS, today = new Date()) {
  if (!r.first) return false;
  const cut = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  const [y, m, d] = r.first.split('/').map(Number);
  return new Date(y, m - 1, d) >= cut;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`下載 ${SOURCE}（串流，只留 ${CITIES.join('、')}；名單留原始登記在 ${MONTHS} 個月內的）`);
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const lastModified = res.headers.get('last-modified') || '';
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
  let n = 0; const kept = [];
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    n++;
    if (n === 1) { if (!/統一編號/.test(line) || !/電話號碼/.test(line)) throw new Error(`表頭對不上：${line.slice(0, 200)}`); continue; }
    const r = normalize(parseLine(line));
    if (r) kept.push(r);
    if (n % 100000 === 0) console.log(`  …讀到第 ${n.toLocaleString()} 列，留 ${kept.length.toLocaleString()} 筆`);
  }
  console.log(`讀完 ${n.toLocaleString()} 列，${CITIES.join('、')} ${kept.length.toLocaleString()} 筆`);
  if (kept.length < 1000) throw new Error('留下來的太少，篩選條件或欄位對不上');
  const withPhone = kept.filter((r) => r.tel || r.fax);
  const recent = kept.filter((r) => isRecent(r)).sort((a, b) => b.first.localeCompare(a.first) || b.issued.localeCompare(a.issued));
  const byDist = {};
  recent.forEach((r) => { const d = districtOf(r.address); byDist[d] = (byDist[d] || 0) + 1; });
  const phones = [PHONE_HEAD, ...withPhone.map((r) => [r.taxId, r.tel, r.fax, r.issued])];
  const list = [HEAD, ...recent.map((r) => [r.taxId, r.name, r.ename, r.address, r.rep, r.tel, r.fax, r.first, r.issued, r.imp, r.exp])];
  await fs.writeFile(path.join(OUT, 'phones.csv'), `﻿${phones.map((c) => c.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(OUT, 'trade.csv'), `﻿${list.map((c) => c.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  const index = {
    generatedAt: new Date().toISOString(), lastModified, source: SOURCE, cities: CITIES, months: MONTHS,
    total: kept.length, withPhone: withPhone.length, recent: recent.length, recentWithPhone: recent.filter((r) => r.tel).length,
    byDist: Object.fromEntries(Object.entries(byDist).sort((a, b) => b[1] - a[1])),
    files: [{ path: 'trade.csv', rows: recent.length }, { path: 'phones.csv', rows: withPhone.length }],
  };
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  console.log(`寫入 phones.csv ${withPhone.length.toLocaleString()} 筆、trade.csv ${recent.length.toLocaleString()} 筆（有電話 ${index.recentWithPhone}）；各區 ${Object.entries(index.byDist).slice(0, 8).map(([k, v]) => `${k} ${v}`).join('、')}`);
  console.log('\n完成');
}

export { normalize, parseLine, halfWidth, ymd, districtOf, isRecent, HEAD, PHONE_HEAD };

if (process.argv[1] && /fetch-trade\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
