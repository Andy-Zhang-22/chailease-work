/**
 * 探路第二輪：政府採購決標公告、出進口廠商登記，能不能抓、欄位長怎樣。看完連同 workflow 一起刪。
 * 第一輪：g0v 標案 API（pcc-api.openfun.app）有 Cloudflare 驗證頁、web.pcc.gov.tw 把 Actions 的 IP 擋掉（WAF）；
 * DuckDuckGo 找到官方「資料集下載」頁、twbuying.org 的 API、opendatatw 的鏡像、data.gov.tw 幾個決標資料集；
 * fbfh.trade.gov.tw 連得到，首頁有「查詢廠商基本資料(含實績級距)」。這輪把這些頁面讀完、找下載連結。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
const abs = (u, base) => { try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch (e) { return ''; } };
const anchors = (html, base, re) => [...new Set([...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => `${abs(m[1], base)} ｜ ${strip(m[2]).trim().slice(0, 60)}`).filter((x) => re.test(x)))];
const sample = async (title, url, init, opts = {}) => {
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
    } else if (/html/.test(r.type)) {
      body += strip(t).slice(0, opts.textLen || 1800);
      const links = anchors(t, r.url, opts.linkRe || /csv|json|xml|zip|download|api|open|opendata|下載|資料集|查詢|basic|search/i);
      if (links.length) body += `\n--- 連結 ---\n${links.slice(0, opts.linkMax || 40).join('\n')}`;
    } else { const lines = t.split(/\r?\n/); body += `${lines.length} 列\n表頭：${lines[0].slice(0, 500)}\n第 2 列：${(lines[1] || '').slice(0, 500)}\n第 3 列：${(lines[2] || '').slice(0, 300)}`; }
    show(title, body);
    return { r, t };
  } catch (e) { show(title, `✗ ${e.message}`); return null; }
};
const ddg = async (q) => {
  for (const host of ['https://html.duckduckgo.com/html/?q=', 'https://lite.duckduckgo.com/lite/?q=']) {
    try {
      const r = await get(host + encodeURIComponent(q));
      const hrefs = [...r.text.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{3,120})</g)].map((m) => `${decodeURIComponent((m[1].match(/uddg=([^&]+)/) || [, m[1]])[1])} ｜ ${m[2].trim()}`).filter((x) => /^https?:\/\/(?!.*duckduckgo)/.test(x));
      show(`duckduckgo ${q}`, `HTTP ${r.status}\n${hrefs.slice(0, 12).join('\n')}`);
      if (r.status === 200) return;
    } catch (e) { show(`duckduckgo ${q}`, `✗ ${e.message}`); }
    await nap(3000);
  }
};

// ---------- 一、政府採購決標 ----------
await sample('政府電子採購網 資料集下載頁（官方開放資料）', 'https://web.pcc.gov.tw/tps/tp/OpenData/showList', {}, { textLen: 3000 });
await nap(800);
await sample('台灣標案網 API 說明', 'https://twbuying.org/api', {}, { textLen: 5000, linkRe: /./, linkMax: 40 });
await nap(800);
await sample('opendatatw 決標資料 900002', 'https://opendatatw.org/dataset/900002', {}, { textLen: 2500 });
await nap(800);
for (const [id, name] of [['7264', '與政府機關有巨額採購且在履約期間之廠商名單'], ['172023', '近半年 GPA 決標資料集'], ['16370', '招標公告']]) {
  const p = await sample(`data.gov.tw ${id} ${name}`, `https://data.gov.tw/dataset/${id}`, {}, { textLen: 1200, linkRe: /csv|json|xml|zip|download|api|pcc|datasets\/[0-9a-f-]{36}/i });
  if (p) {
    const dl = [...new Set([...p.t.matchAll(/https?:\/\/[^"'<>\s]+/g)].map((m) => m[0].replace(/&amp;/g, '&')).filter((u) => !/data\.gov\.tw|google|facebook|w3\.org|schema\.org|gstatic|cloudflare|jquery|bootstrap|fonts\./.test(u) && /\.(csv|json|xml|zip)(\?|$)|download|api|pcc/i.test(u)))];
    show(`${id} 的下載連結`, dl.slice(0, 12).join('\n'));
    for (const u of dl.slice(0, 2)) { await sample(`${id} 試抓 ${u}`, u, { headers: { Range: 'bytes=0-200000' } }); await nap(600); }
  }
  await nap(800);
}

// ---------- 二、出進口廠商登記 ----------
const home = await sample('fbfh 首頁的連結', 'https://fbfh.trade.gov.tw/fb/web/homef.do', {}, { textLen: 200, linkRe: /fbfh|trade\.gov/, linkMax: 60 });
if (home) {
  // 首頁上「查詢廠商基本資料」那條連結，點進去看查詢頁長什麼樣（有沒有整批下載、Excel、開放資料）
  const q = anchors(home.t, home.r.url, /基本資料|Basic|query|Query/).map((x) => x.split(' ｜ ')[0]);
  for (const u of q.slice(0, 3)) { await sample(`fbfh 查詢頁 ${u}`, u, {}, { textLen: 2500, linkRe: /./, linkMax: 40 }); await nap(800); }
}
await sample('貿易署 API 頁（首頁上有「API」）', 'https://www.trade.gov.tw/', {}, { textLen: 300, linkRe: /API|api|開放|廠商基本資料|OpenData|opendata/, linkMax: 30 });
await nap(3000);
await ddg('出進口廠商 基本資料 data.gov.tw');
await nap(4000);
await ddg('貿易署 出進口廠商登記資料 開放資料 下載');
console.log('\n完成。');
