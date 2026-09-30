/**
 * 探路：政府採購決標公告、出進口廠商登記，能不能抓、欄位長怎樣。看完連同 workflow 一起刪。
 * 開發環境連不出去，只有 Actions 的 runner 出得去；結果印在摘要上。不猜網址：先讀說明頁，回什麼記什麼。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
const sample = async (title, url, init) => {
  try {
    const r = await get(url, init);
    const t = r.text.replace(/^﻿/, '');
    let body = `HTTP ${r.status} ${r.type} ${t.length} 字　→ ${r.url}\n`;
    if (/json/.test(r.type) || /^\s*[[{]/.test(t)) {
      let j = null; try { j = JSON.parse(t); } catch (e) { /* 不是 JSON */ }
      if (j) {
        const top = Array.isArray(j) ? `陣列 ${j.length} 筆` : `物件鍵：${Object.keys(j).join(' | ')}`;
        const rows = Array.isArray(j) ? j : (j.records || j.data || j.result || j.results || j.items || []);
        const row = Array.isArray(rows) ? rows[0] : null;
        body += `${top}\n第一筆的鍵：${row && typeof row === 'object' ? Object.keys(row).join(' | ') : '（無）'}\n第一筆：${JSON.stringify(row ?? j).slice(0, 1500)}`;
      } else body += t.slice(0, 1500);
    } else if (/html/.test(r.type)) body += strip(t).slice(0, 2500);
    else { const lines = t.split(/\r?\n/); body += `${lines.length} 列\n表頭：${lines[0].slice(0, 500)}\n第 2 列：${(lines[1] || '').slice(0, 500)}\n第 3 列：${(lines[2] || '').slice(0, 300)}`; }
    show(title, body);
    return { r, t };
  } catch (e) { show(title, `✗ ${e.message}`); return null; }
};
const ddg = async (q) => {
  try {
    const r = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const hrefs = [...r.text.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]{3,120})</g)].map((m) => `${decodeURIComponent((m[1].match(/uddg=([^&]+)/) || [, m[1]])[1])} ｜ ${m[2].trim()}`);
    show(`duckduckgo ${q}`, `HTTP ${r.status}\n${hrefs.slice(0, 12).join('\n')}`);
  } catch (e) { show(`duckduckgo ${q}`, `✗ ${e.message}`); }
};
const links = (html, re) => [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((u) => re.test(u)))];

// ---------- 一、政府採購決標 ----------
// 上次探路（9/24）：pcc.g0v.ronny.tw 轉到 pcc-api.openfun.app，首頁就是 API 說明，先把整頁讀完
const home = await sample('g0v 標案 API 說明頁', 'https://pcc-api.openfun.app/');
if (home) {
  const text = strip(home.t);
  show('說明頁全文', text.slice(0, 6000));
  show('說明頁裡的 /api 連結', links(home.t, /api/).slice(0, 30).join('\n'));
}
await nap(800);
// 說明頁常見的幾條（回什麼記什麼，不通就不通）
for (const [title, url] of [
  ['依日期列標案', 'https://pcc-api.openfun.app/api/listbydate?date=20260926'],
  ['依公司名找', 'https://pcc-api.openfun.app/api/searchbycompanyname?query=%E7%B2%BE%E5%AF%86'],
  ['依統編找', 'https://pcc-api.openfun.app/api/searchbycompanyid?query=22099131'],
]) { await sample(`g0v ${title}`, url); await nap(800); }
// 官方：政府電子採購網的決標公告查詢、開放資料
await sample('政府電子採購網首頁', 'https://web.pcc.gov.tw/');
await nap(600);
await sample('政府電子採購網 決標公告查詢頁', 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion?isAward=Y');
await nap(600);
await ddg('政府電子採購網 決標公告 開放資料 csv');
await nap(800);
await ddg('site:data.gov.tw 決標公告');

// ---------- 二、出進口廠商登記 ----------
await ddg('site:data.gov.tw 出進口廠商');
await nap(800);
await ddg('國際貿易署 出進口廠商 登記 資料 下載 csv');
await nap(800);
await ddg('出進口廠商登記系統 fbfh.trade.gov.tw 資料下載');
await nap(800);
await sample('出進口廠商登記系統首頁', 'https://fbfh.trade.gov.tw/fb/web/indexfbOI.do');
await nap(600);
await sample('fbfh 根', 'https://fbfh.trade.gov.tw/');
await nap(600);
// 貿易署自己的開放資料頁（有沒有這個網址不確定，回什麼記什麼）
await sample('貿易署開放資料', 'https://www.trade.gov.tw/Pages/List.aspx?nodeID=1372');
console.log('\n完成。');
