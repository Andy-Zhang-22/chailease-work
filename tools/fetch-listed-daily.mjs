/**
 * 上市櫃公司的「動態」：每天抓一次，網站的「上市櫃公司」分頁把它畫在每張卡片上。
 *
 * 使用者：「我想要的效果是這些上市櫃名單每天都能及時更新他的動態面資訊」。
 *
 * 來源（證交所、櫃買中心的開放 API，探路確認過；興櫃沒有重大訊息的 API）：
 *   上市 每日重大訊息  https://openapi.twse.com.tw/v1/opendata/t187ap04_L
 *                     出表日期｜發言日期｜發言時間｜公司代號｜公司名稱｜主旨 ｜符合條款｜事實發生日｜說明
 *   上櫃 每日重大訊息  https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O
 *                     Date｜發言日期｜發言時間｜SecuritiesCompanyCode｜CompanyName｜主旨｜符合條款｜事實發生日｜說明
 *   上市 每月營收      https://openapi.twse.com.tw/v1/opendata/t187ap05_L
 *   上櫃 每月營收      https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O
 *                     資料年月｜公司代號｜營業收入-當月營收｜上月營收｜去年當月營收｜上月比較增減(%)｜去年同月增減(%)｜
 *                     累計營業收入-當月累計營收｜去年累計營收｜前期比較增減(%)（單位仟元）
 *
 * 重大訊息的 API 每次只給「昨天」發的，所以要天天抓、自己累積：留最近 NEWS_DAYS 天，
 * 只存主旨不存說明（說明動輒上千字，兩千家公司一個月會撐爆頁面）。營收只留最新一期。
 *
 * 產出 leads/listed/news.json、revenue.json，並把 index.json 的 dailyAt／newsAt／revenueYm 更新
 * （分頁用 dailyAt 當這兩個檔的快取鍵）。基本資料（董事長、資本額、地址）的異動不在這裡：
 * fetch-listed.mjs 每天重抓基本資料時跟前一天比，寫 changes.json。
 *
 * 用法：node tools/fetch-listed-daily.mjs [--out leads/listed] [--days 45]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const OUT = opt('out', 'leads/listed');
const NEWS_DAYS = Number(opt('days', '45')) || 45;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const NEWS_SOURCES = [
  { market: '上市', url: 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L' },
  { market: '上櫃', url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O' },
];
const REVENUE_SOURCES = [
  { market: '上市', url: 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L' },
  { market: '上櫃', url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O' },
];

/** 民國 1150927 → 2026-09-27；也接受 115/09/27、20260927 */
function rocDate(s) {
  const t = String(s || '').replace(/\D/g, '');
  if (t.length === 7) return `${Number(t.slice(0, 3)) + 1911}-${t.slice(3, 5)}-${t.slice(5, 7)}`;
  if (t.length === 8) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return '';
}
/** 民國 11508 → 2026-08 */
function rocYm(s) {
  const t = String(s || '').replace(/\D/g, '');
  if (t.length === 5) return `${Number(t.slice(0, 3)) + 1911}-${t.slice(3, 5)}`;
  if (t.length === 6) return `${t.slice(0, 4)}-${t.slice(4, 6)}`;
  return '';
}
/** 發言時間 70004 → 07:00，165242 → 16:52 */
function hhmm(s) {
  const t = String(s || '').replace(/\D/g, '').padStart(6, '0');
  return t.length === 6 ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : '';
}
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const num = (s) => { const t = String(s ?? '').replace(/,/g, '').trim(); if (!t || t === '-') return null; const v = Number(t); return Number.isFinite(v) ? v : null; };
const pct = (s) => { const v = num(s); return v == null ? null : Math.round(v * 10) / 10; };
/** 欄位名稱偶爾帶空白（「主旨 」），照去掉空白後的名字找 */
function field(row, ...names) {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => x.trim() === n);
    if (k != null && row[k] != null && row[k] !== '') return row[k];
  }
  return '';
}

/** API 的一列重大訊息 → 我們存的樣子；沒代號、沒日期、沒主旨的丟掉 */
function normNews(row, market) {
  const code = clean(field(row, '公司代號', 'SecuritiesCompanyCode'));
  const d = rocDate(field(row, '發言日期'));
  const s = clean(field(row, '主旨'));
  if (!code || !d || !s) return null;
  return {
    m: market, code, name: clean(field(row, '公司名稱', 'CompanyName')),
    d, t: hhmm(field(row, '發言時間')), s: s.slice(0, 200),
    c: clean(field(row, '符合條款')), f: rocDate(field(row, '事實發生日')),
  };
}
const newsKey = (n) => `${n.code}|${n.d}|${n.t}|${n.s.slice(0, 60)}`;

/** 把新抓的併進累積的清單：去重、只留最近 days 天、新的在前 */
function mergeNews(existing, fresh, today, days) {
  const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const floor = cutoff.toISOString().slice(0, 10);
  const map = new Map();
  [...existing, ...fresh].forEach((n) => { if (n && n.d >= floor && n.d <= today) map.set(newsKey(n), n); });
  return [...map.values()].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t) || a.code.localeCompare(b.code));
}

/** API 的一列營收 → { ym, cur, prev, ly, mom, yoy, cum, cumLy, cumPct }（仟元、%） */
function normRevenue(row, market) {
  const code = clean(field(row, '公司代號', 'SecuritiesCompanyCode'));
  const ym = rocYm(field(row, '資料年月'));
  if (!code || !ym) return null;
  return {
    code, m: market, ym,
    cur: num(field(row, '營業收入-當月營收')), prev: num(field(row, '營業收入-上月營收')), ly: num(field(row, '營業收入-去年當月營收')),
    mom: pct(field(row, '營業收入-上月比較增減(%)')), yoy: pct(field(row, '營業收入-去年同月增減(%)')),
    cum: num(field(row, '累計營業收入-當月累計營收')), cumLy: num(field(row, '累計營業收入-去年累計營收')), cumPct: pct(field(row, '累計營業收入-前期比較增減(%)')),
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const j = JSON.parse(text);
  return Array.isArray(j) ? j : (j.data || j.result || []);
}
const readJson = async (file, fallback) => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { return fallback; } };

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  await fs.mkdir(OUT, { recursive: true });
  const newsFile = path.join(OUT, 'news.json');
  const revFile = path.join(OUT, 'revenue.json');
  const indexFile = path.join(OUT, 'index.json');
  const old = await readJson(newsFile, { items: [] });

  // 重大訊息：兩個市場，一個失敗不影響另一個
  const fresh = [];
  const failed = [];
  for (const src of NEWS_SOURCES) {
    try {
      const rows = await getJson(src.url);
      const list = rows.map((r) => normNews(r, src.market)).filter(Boolean);
      console.log(`${src.market} 重大訊息：${list.length} 則${list.length ? `（發言日期 ${list[list.length - 1].d}～${list[0].d}）` : ''}`);
      fresh.push(...list);
    } catch (err) { failed.push(`${src.market}重大訊息`); console.log(`${src.market} 重大訊息抓不到：${err.message}`); }
    await nap(800);
  }
  const items = mergeNews(old.items || [], fresh, today, NEWS_DAYS);
  const newsAt = items.length ? items[0].d : (old.newsAt || '');
  const added = items.length - (old.items || []).filter((n) => items.some((x) => newsKey(x) === newsKey(n))).length;
  await fs.writeFile(newsFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), days: NEWS_DAYS, newsAt, items })}\n`, 'utf8');
  console.log(`news.json：共 ${items.length} 則（最近 ${NEWS_DAYS} 天），這次新增 ${added} 則，最新發言日 ${newsAt || '—'}`);

  // 每月營收：整份換新（API 就是最新一期全部公司）
  const oldRev = await readJson(revFile, { by: {} });
  const by = { ...(oldRev.by || {}) };
  let ym = oldRev.ym || '';
  for (const src of REVENUE_SOURCES) {
    try {
      const rows = await getJson(src.url);
      let n = 0;
      rows.forEach((r) => { const v = normRevenue(r, src.market); if (v) { by[v.code] = v; n += 1; if (v.ym > ym) ym = v.ym; } });
      console.log(`${src.market} 營收：${n} 家`);
    } catch (err) { failed.push(`${src.market}營收`); console.log(`${src.market} 營收抓不到：${err.message}`); }
    await nap(800);
  }
  await fs.writeFile(revFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), ym, by })}\n`, 'utf8');
  console.log(`revenue.json：${Object.keys(by).length} 家，資料年月 ${ym || '—'}`);

  // index.json 記動態更新到哪（分頁用 dailyAt 當快取鍵）
  const index = await readJson(indexFile, null);
  if (index) {
    index.dailyAt = new Date().toISOString();
    index.newsAt = newsAt; index.newsCount = items.length; index.revenueYm = ym;
    index.files = [...(index.files || []).filter((f) => !/^(news|revenue)\.json$/.test(f.path)), { path: 'news.json', rows: items.length }, { path: 'revenue.json', rows: Object.keys(by).length }];
    await fs.writeFile(indexFile, `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  } else console.log('還沒有 index.json（先跑 fetch-listed.mjs），這次不更新 dailyAt');

  if (failed.length === NEWS_SOURCES.length + REVENUE_SOURCES.length) throw new Error('四個來源都抓不到');
  console.log(failed.length ? `\n完成，但 ${failed.join('、')} 這次沒抓到，明天再補。` : '\n完成');
}

export { rocDate, rocYm, hhmm, normNews, normRevenue, mergeNews, newsKey };

if (process.argv[1] && /fetch-listed-daily\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
