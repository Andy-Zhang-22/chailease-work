/**
 * 探路：一次探幾個新名單來源（使用者：「全部都做」）。看完連同 workflow 一起刪。
 * 開發環境連不出去，只有 Actions 的 runner 出得去。不猜網址：用 DuckDuckGo 找 data.gov.tw 的資料集編號，
 * 讀資料集頁面的欄位說明與下載連結，再抓前 200KB 看表頭。回什麼記什麼。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type') || '', len: r.headers.get('content-length'), url: r.url, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const show = (title, body) => console.log(`\n=========== ${title} ===========\n${body}`);

async function ddg(q) {
  for (const host of ['https://html.duckduckgo.com/html/?q=', 'https://lite.duckduckgo.com/lite/?q=']) {
    try {
      const r = await get(host + encodeURIComponent(q));
      if (r.status !== 200) { await nap(5000); continue; }
      const hrefs = [...r.text.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{3,120})</g)].map((m) => `${decodeURIComponent((m[1].match(/uddg=([^&]+)/) || [, m[1]])[1])} ｜ ${m[2].trim()}`).filter((x) => /^https?:\/\/(?!.*duckduckgo)/.test(x));
      show(`duckduckgo ${q}`, hrefs.slice(0, 12).join('\n'));
      return hrefs;
    } catch (e) { show(`duckduckgo ${q}`, `✗ ${e.message}`); }
  }
  return [];
}
async function dataset(id) {
  try {
    const r = await get(`https://data.gov.tw/dataset/${id}`);
    const title = (r.text.match(/<title>([^<]+)</) || [])[1] || '';
    const text = strip(r.text);
    const fields = (text.match(/主要欄位說明\s*\*?[^。]{0,20}?欄位\s*(.{0,500}?)\s*資料資源下載網址/) || text.match(/主要欄位說明\s*(.{0,400})/) || [])[1] || '';
    const desc = (text.match(new RegExp(`${title.split(' ｜')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.{0,300})`)) || [])[1] || '';
    const freq = (text.match(/更新頻率\s*([^授]{1,20})/) || [])[1] || '';
    const dl = [...new Set([...r.text.matchAll(/https?:\/\/[^"'<>\s]+/g)].map((m) => m[0].replace(/&amp;/g, '&')).filter((u) => !/data\.gov\.tw|google|facebook|w3\.org|schema\.org|gstatic|cloudflare|jquery|bootstrap|fonts\.|twitter|moda\.gov/.test(u)))];
    show(`資料集 ${id} ${title}`, `HTTP ${r.status}\n說明：${desc}\n更新：${freq}\n欄位：${fields}\n下載：\n${dl.slice(0, 8).join('\n')}`);
    for (const u of dl.filter((x) => /\.(csv|json|xml|zip)(\?|$)|download|api|opendata|OpenData|getOpenData/i.test(x)).slice(0, 2)) {
      try {
        const s = await get(u, { headers: { Range: 'bytes=0-200000' } });
        const t = s.text.replace(/^﻿/, '');
        let body = `HTTP ${s.status} ${s.type} content-length=${s.len} → ${s.url}\n`;
        if (/json/.test(s.type) || /^\s*[[{]/.test(t)) {
          let j = null; try { j = JSON.parse(t); } catch (e) { /* 被截斷 */ }
          const rows = j ? (Array.isArray(j) ? j : (j.records || j.data || j.result || j.results || j.items || [])) : null;
          const row = rows && Array.isArray(rows) ? rows[0] : null;
          body += row ? `JSON 第一筆的鍵：${Object.keys(row).join(' | ')}\n第一筆：${JSON.stringify(row).slice(0, 600)}` : `（JSON，前 200KB 截斷）${t.slice(0, 600)}`;
        } else if (/html/.test(s.type)) body += strip(t).slice(0, 600);
        else { const lines = t.split(/\r?\n/); body += `${lines.length} 列\n表頭：${lines[0].slice(0, 500)}\n第 2 列：${(lines[1] || '').slice(0, 400)}`; }
        show(`  試抓 ${u}`, body);
      } catch (e) { show(`  試抓 ${u}`, `✗ ${e.message}`); }
      await nap(800);
    }
  } catch (e) { show(`資料集 ${id}`, `✗ ${e.message}`); }
}

const TOPICS = [
  ['台灣就業通 求才', ['site:data.gov.tw 台灣就業通 求才', 'site:data.gov.tw 勞動部 職缺 求才 資料集 公司名稱 電話']],
  ['產業園區廠商名錄', ['site:data.gov.tw 產業園區 廠商 名錄', 'site:data.gov.tw 工業區 廠商 基本資料 電話']],
  ['工廠登記', ['site:data.gov.tw 工廠登記 資料 工廠名稱 負責人', 'site:data.gov.tw 新北市 工廠 清冊']],
  ['SBIR 補助通過', ['site:data.gov.tw SBIR 通過 名單', 'site:data.gov.tw 小型企業創新研發計畫 核定']],
  ['投資台灣事務所', ['site:data.gov.tw 投資臺灣事務所 核准 投資', '投資臺灣事務所 核准 名單 開放資料']],
  ['固定污染源公私場所', ['site:data.gov.tw 固定污染源 公私場所 基本資料 新北市']],
  ['票交所拒絕往來', ['site:data.gov.tw 拒絕往來 戶 名單 票據交換所', '票據交換所 拒絕往來戶 名單 開放資料 下載']],
  ['減班休息通報', ['site:data.gov.tw 減班休息 事業單位 名單', '勞動部 減班休息 實施 事業單位 名單 開放資料']],
];
const seen = new Set();
for (const [topic, qs] of TOPICS) {
  show(`主題：${topic}`, '');
  const ids = [];
  for (const q of qs) {
    const hrefs = await ddg(q);
    hrefs.forEach((h) => { const m = h.match(/data\.gov\.tw\/dataset\/(\d+)/); if (m && !ids.includes(m[1])) ids.push(m[1]); });
    await nap(4000);
  }
  for (const id of ids.slice(0, 3)) { if (seen.has(id)) continue; seen.add(id); await dataset(id); await nap(1000); }
  if (!ids.length) show(`主題：${topic}`, '搜尋沒有找到 data.gov.tw 的資料集');
}
console.log('\n完成。');
