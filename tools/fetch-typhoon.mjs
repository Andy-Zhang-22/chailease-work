/**
 * 颱風假：人事行政總處「天然災害停止上班及上課情形」→ 新北市整天停止上班的日子 → leads/holidays-extra.json。
 *
 * 使用者 10/22：「當新北政府發布颱風假時，你可以自動獲得資訊，幫我在系統做修正」。
 * 颱風假臨時宣布，假日表（holidays.js）不會有；每天清晨後台挑名單前先看這頁，新北市整天停班就把那天當假日：
 * 後台那天不挑新名單、下次聯絡日在那天的照上限重排挪到下個上班日，網站排日期也會跳過。
 *
 * 來源（2026/10/22 用 Actions 探路確認）：https://www.dgpa.gov.tw/typh/daily/nds.html，純網頁沒有 JSON。
 *   頁上有「更新時間：2026/10/22 17:11:04」；每個縣市一列，格子 headers="city_Name New Taipei City" 的下一格是內容：
 *   沒事是「尚未宣布消息」，有事是一句一句「新北市:今天停止上班、停止上課。」「新北市烏來區:明天停止上班、停止上課。」
 *   「某某國小:今天下午01:00起停止上班、停止上課。」用 <br> 隔開。
 * 規則：對象剛好是「新北市」（整個市，不是某區、某學校）而且「今天／明天」整天停止上班才算；下午起、上午停的半天不算假。
 * 只印日期與筆數。抓不到就印出來、照常結束（不能讓挑名單整輪失敗）。
 * 用法：node tools/fetch-typhoon.mjs [--out leads/holidays-extra.json] [--city 新北市]
 */
import fs from 'node:fs/promises';

const URL = 'https://www.dgpa.gov.tw/typh/daily/nds.html';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const KEEP_DAYS = 60;   // 過了兩個月的颱風假留著沒用，順手清掉

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => ymd(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000));
const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** 頁上的「更新時間：2026/10/22 17:11:04」→ 2026-10-22（台灣時間；沒有就回空字串） */
export function updatedDate(html) {
  const m = /更新時間[：:]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(String(html || ''));
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

/** 某個縣市那一格的句子（去掉標籤、按句號拆開） */
export function cityLines(html, city = '新北市') {
  const s = String(html || '');
  const i = s.indexOf(`<FONT>${city}</FONT>`);
  if (i < 0) return null;
  const cell = /<TD[^>]*>([\s\S]*?)<\/TD>/i.exec(s.slice(s.indexOf('</TD>', i) + 5));
  if (!cell) return null;
  return cell[1].split(/<br\s*\/?>/i).map(strip).filter(Boolean);
}

/**
 * 整個市整天停止上班的日子。today 是頁面的更新日（台灣時間）。
 * @returns {{ off: string[], note: string[] }} off＝放假的日期；note＝有宣布但不算假的（半天、某區）
 */
export function offDays(lines, { city = '新北市', today }) {
  const off = []; const note = [];
  for (const line of lines || []) {
    if (/尚未宣布/.test(line)) continue;
    const m = /^([^:：]+)[:：](.+)$/.exec(line);
    if (!m) continue;
    const who = m[1].trim(); const what = m[2].trim();
    const when = /^(今天|明天)/.exec(what);
    if (!when) continue;
    const day = when[1] === '今天' ? today : addDays(today, 1);
    const whole = who === city && /^(今天|明天)(全天)?停止上班/.test(what);
    if (whole) off.push(day); else if (/停止上班/.test(what)) note.push(`${day} ${who}${what.replace(/^(今天|明天)/, '')}`);
  }
  return { off: [...new Set(off)].sort(), note };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
  const OUT = opt('out', 'leads/holidays-extra.json');
  const CITY = opt('city', '新北市');
  let have = {};
  try { have = JSON.parse(await fs.readFile(OUT, 'utf8')) || {}; } catch (e) { have = {}; }

  let html = '';
  try {
    const r = await fetch(URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  } catch (err) {
    console.log(`停班公告抓不到（${err && err.message ? err.message : err}），這次不看；假日表維持 ${Object.keys(have).length} 天`);
    return;
  }
  const today = updatedDate(html) || ymd(new Date(Date.now() + 8 * 3600000));
  const lines = cityLines(html, CITY);
  if (!lines) { console.log(`停班公告頁找不到${CITY}那一列（頁面改版？），這次不看`); return; }
  const { off, note } = offDays(lines, { city: CITY, today });

  const next = {};
  const floor = addDays(today, -KEEP_DAYS);
  for (const [k, v] of Object.entries(have)) if (k >= floor) next[k] = v;
  for (const d of off) next[d] = next[d] || `颱風假（${CITY}停止上班）`;
  const added = off.filter((d) => !have[d]);
  const changed = JSON.stringify(next) !== JSON.stringify(have);
  if (changed) await fs.writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`停班公告（更新 ${today}）：${CITY}整天停班 ${off.length ? off.join('、') : '沒有'}${added.length ? `，新增 ${added.join('、')}` : ''}${note.length ? `；其他宣布：${note.join('；')}` : ''}；假日表共 ${Object.keys(next).length} 天${changed ? '（有寫檔）' : ''}`);
}

if (process.argv[1] && /fetch-typhoon\.mjs$/.test(process.argv[1])) main().catch((err) => { console.log(`停班公告處理失敗：${err && err.message ? err.message : err}`); });
