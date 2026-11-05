// 探路第二輪（一次性，看完就刪）：yes123 用公司名搜職缺，命中率多少；新北的地區代碼長什麼樣。
// 公司名來自 leads/11509/新北市-change.csv（經濟部公開清冊）；只印筆數與統計，不印公司名。
import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW', Referer: 'https://www.yes123.com.tw/wk_index/joblist.asp' }, redirect: 'follow', signal: AbortSignal.timeout(30000) }); return { status: r.status, text: await r.text() }; };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const lines = fs.readFileSync('leads/11509/新北市-change.csv', 'utf8').replace(/^﻿/, '').split('\n').slice(1).filter(Boolean);
const parse = (l) => { const out = []; let cur = ''; let q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
const rows = lines.map(parse).filter((c) => { const cap = Number(c[4]) || 0; return cap >= 3000000 && cap <= 60000000 && /公司$/.test(c[1]); });
console.log(`新北市變更清冊 11509：${lines.length} 列，資本額 300～6,000 萬的公司 ${rows.length} 家，取前 40 家查`);
const pick = rows.slice(0, 40);
const stats = { checked: 0, nameHit: 0, withJobs: 0, jobs: [], comps: [], status: {} };
for (const c of pick) {
  const name = c[1].trim(); const short = name.replace(/(股份)?有限公司$/, '');
  try {
    const { status, text } = await get(`https://www.yes123.com.tw/wk_index/joblist.asp?find_key1=${encodeURIComponent(short)}`);
    stats.status[status] = (stats.status[status] || 0) + 1; stats.checked++;
    const comps = new Set([...text.matchAll(/comp_info\.asp\?p_id=([a-z]?\d+_\d+)/g)].map((m) => m[1]));
    const jobs = new Set([...text.matchAll(/job\.asp\?p_id=([a-z]?\d+_\d+)&(?:amp;)?job_id=(\d+_\d+)/g)].map((m) => m[2]));
    const hit = text.includes(short);
    if (hit) stats.nameHit++;
    if (hit && jobs.size) { stats.withJobs++; stats.jobs.push(jobs.size); stats.comps.push(comps.size); }
    if (stats.checked === 1) { const m = /(\d[\d,]*)\s*筆/.exec(text); console.log(`第一家的頁面：${text.length} 字，公司連結 ${comps.size}、職缺連結 ${jobs.size}、「N 筆」字樣 ${m ? m[1] : '無'}`); }
  } catch (e) { stats.status[`err:${e.message.slice(0, 40)}`] = (stats.status[`err:${e.message.slice(0, 40)}`] || 0) + 1; }
  await sleep(1500);
}
console.log(`查了 ${stats.checked} 家：頁面出現公司名 ${stats.nameHit} 家、同時有職缺連結 ${stats.withJobs} 家；職缺連結數 ${stats.jobs.join('/') || '—'}；公司連結數 ${stats.comps.join('/') || '—'}；狀態碼 ${JSON.stringify(stats.status)}`);
// 地區代碼：首頁與 joblist 的 option／data 裡像 1_1001_0003 的代碼，附文字（地名不是個資）
const { text: home } = await get('https://www.yes123.com.tw/wk_index/joblist.asp');
const zones = [...new Set([...home.matchAll(/value="(\d_\d{4}(?:_\d{4}){0,2})"[^>]*>([^<]{1,12})</g)].map((m) => `${m[1]}=${m[2].trim()}`))];
console.log(`地區代碼樣本（${zones.length}）：`, zones.filter((z) => /新北|板橋|新莊|三重|中和|土城|樹林|泰山|五股|林口|台北|臺北/.test(z)).slice(0, 30).join('、'));
const zoneLike = [...new Set([...home.matchAll(/find_zone_mode\d+[^>]*value="([^"]*)"/g)].map((m) => m[1]))];
console.log('find_zone_mode 預設值：', zoneLike.slice(0, 10));
// 試一次新北的地區搜尋（代碼從上面挑第一個含「新北」的）
const nb = zones.find((z) => /新北/.test(z));
if (nb) {
  const code = nb.split('=')[0];
  const { status, text } = await get(`https://www.yes123.com.tw/wk_index/joblist.asp?find_zone_mode1=${code}`);
  const comps = new Set([...text.matchAll(/comp_info\.asp\?p_id=([a-z]?\d+_\d+)/g)].map((m) => m[1]));
  const m = /(\d[\d,]*)\s*筆/.exec(text); const pages = [...text.matchAll(/joblist_search\('next'\)/g)].length;
  console.log(`新北地區搜尋（${code}）→ ${status}，公司連結 ${comps.size}、「N 筆」${m ? m[1] : '無'}、有下一頁連結 ${pages}`);
}
