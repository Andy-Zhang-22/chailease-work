/**
 * 探路第三輪：政府採購決標公告、出進口廠商登記，能不能抓、欄位長怎樣。看完連同 workflow 一起刪。
 * 第二輪找到：台灣標案網 twbuying.org 有免金鑰 API（/api/v1/tenders，type=award、county、dfrom/dto、limit≤200、format=csv）；
 * data.gov.tw 79641「出進口廠商登記資料」整批下載（統編、名稱、地址、代表人、電話、傳真、出口／進口資格，每日更新）。
 * 這輪：twbuying 實際回什麼欄位（有沒有統編、地址）；79641 的下載連結、檔案大小、表頭。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length'), disp: r.headers.get('content-disposition'), url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);
const sample = async (title, url, init, opts = {}) => {
  try {
    const r = await get(url, init);
    const t = r.text.replace(/^﻿/, '');
    let body = `HTTP ${r.status} ${r.type} ${t.length} 字　content-length=${r.len}　disposition=${r.disp}　→ ${r.url}\n`;
    if (/json/.test(r.type) || /^\s*[[{]/.test(t)) {
      let j = null; try { j = JSON.parse(t); } catch (e) { /* 不是 JSON */ }
      if (j) {
        const top = Array.isArray(j) ? `陣列 ${j.length} 筆` : `物件鍵：${Object.keys(j).join(' | ')}`;
        const rows = Array.isArray(j) ? j : (j.records || j.data || j.result || j.results || j.items || j.tenders || j.releases || []);
        body += `${top}\n`;
        (Array.isArray(rows) ? rows : []).slice(0, opts.rows || 2).forEach((row, i) => { body += `第 ${i + 1} 筆：${JSON.stringify(row).slice(0, 1200)}\n`; });
        if (!Array.isArray(rows) || !rows.length) body += JSON.stringify(j).slice(0, 1500);
      } else body += t.slice(0, 1500);
    } else if (/html/.test(r.type)) body += strip(t).slice(0, opts.textLen || 1500);
    else { const lines = t.split(/\r?\n/); body += `${lines.length} 列\n表頭：${lines[0].slice(0, 600)}\n第 2 列：${(lines[1] || '').slice(0, 500)}\n第 3 列：${(lines[2] || '').slice(0, 300)}`; }
    show(title, body);
    return { r, t };
  } catch (e) { show(title, `✗ ${e.message}`); return null; }
};

// ---------- 一、台灣標案網 API ----------
for (const [title, url] of [
  ['決標 新北市 JSON 5 筆', 'https://twbuying.org/api/v1/tenders?type=award&county=%E6%96%B0%E5%8C%97%E5%B8%82&limit=5'],
  ['決標 新北市 近一週 100 萬以上 JSON', 'https://twbuying.org/api/v1/tenders?type=award&county=%E6%96%B0%E5%8C%97%E5%B8%82&amin=1000000&dfrom=2026-09-22&dto=2026-09-30&limit=200'],
  ['決標 新北市 CSV', 'https://twbuying.org/api/v1/tenders?type=award&county=%E6%96%B0%E5%8C%97%E5%B8%82&limit=5&format=csv'],
  ['OCDS 新北市 2 筆', 'https://twbuying.org/api/v1/ocds?county=%E6%96%B0%E5%8C%97%E5%B8%82&limit=2'],
  ['資料涵蓋說明', 'https://twbuying.org/data'],
]) { await sample(`twbuying ${title}`, url, {}, { rows: 3, textLen: 2500 }); await nap(1500); }

// ---------- 二、出進口廠商登記資料 79641 ----------
const p = await sample('data.gov.tw 79641 出進口廠商登記資料', 'https://data.gov.tw/dataset/79641', {}, { textLen: 1500 });
if (p) {
  const dl = [...new Set([...p.t.matchAll(/https?:\/\/[^"'<>\s]+/g)].map((m) => m[0].replace(/&amp;/g, '&')).filter((u) => !/data\.gov\.tw|google|facebook|w3\.org|schema\.org|gstatic|cloudflare|jquery|bootstrap|fonts\./.test(u)))];
  show('79641 頁面上的外部連結', dl.slice(0, 20).join('\n'));
  for (const u of dl.filter((x) => /trade\.gov|\.csv|\.json|\.xml|\.zip|download/i.test(x)).slice(0, 3)) {
    // 只抓開頭，先看格式與表頭（說明說要 3～5 分鐘，整份可能很大）
    await sample(`79641 試抓（前 300KB） ${u}`, u, { headers: { Range: 'bytes=0-300000' } });
    await nap(1000);
  }
}
console.log('\n完成。');
