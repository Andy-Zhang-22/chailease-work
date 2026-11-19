/*
 * 一次性探路第二輪（看完就刪）：臺北市產業發展獎勵補助網站，Actions 連得到（第一輪 HTTP 200）。
 * 這輪看：核定結果公告（news_detail/502、499，第一輪從首頁／最新消息拿到的連結）裡名單是文字、表格還是附件；
 * 補助企業資料庫（database/7）一頁幾家、有哪些欄位、怎麼翻頁；歷年核定補助清冊（download/20）的檔案連結。
 * 公司名一律遮掉（○），只印結構與筆數。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE = 'https://www.industry-incentive.taipei';
const strip = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t\r]+/g, ' ').trim();
const mask = (s) => String(s || '').replace(/[一-鿿A-Za-z0-9（）()．·\-]{1,30}?((股份)?有限公司|商行|企業社|工作室|事務所|基金會|協會)/g, '○○$1').replace(/(?<!\d)\d{8}(?!\d)/g, '########');
async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(40000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    console.log(`\nGET ${url} → HTTP ${res.status}，${ct}，${buf.length} bytes`);
    return { ok: res.ok, ct, text: /text|json|xml/.test(ct) ? buf.toString('utf8') : '', bytes: buf.length, cd: res.headers.get('content-disposition') || '' };
  } catch (err) { console.log(`\nGET ${url} → 失敗 ${err.message}`); return { ok: false, text: '', ct: '', bytes: 0, cd: '' }; }
}
/** 去掉頁首選單、頁尾：取 <main> 或第一個 <h1>/<h2> 之後到 <footer> 之前 */
const mainOf = (html) => {
  const m = html.match(/<main\b[\s\S]*?<\/main>/i); if (m) return m[0];
  const i = html.search(/<h1\b/i); const j = html.search(/<footer\b/i);
  return html.slice(i > 0 ? i : 0, j > i ? j : undefined);
};
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], text: strip(m[2]).slice(0, 50) }));

// 一、核定結果公告
for (const id of [502, 499]) {
  const p = await get(`${BASE}/news_detail/${id}`);
  if (!p.ok) continue;
  const main = mainOf(p.text); const body = strip(main);
  const lines = main.replace(/<(br|\/p|\/li|\/tr|\/div|\/h\d)\b[^>]*>/gi, '\n').split('\n').map(strip).filter((x) => x.length > 1);
  const co = lines.filter((x) => /(股份)?有限公司|商行|企業社/.test(x));
  console.log(`  主要內容 ${body.length} 字、${lines.length} 行；<table> ${(main.match(/<table\b/gi) || []).length}、<tr> ${(main.match(/<tr\b/gi) || []).length}、<td> ${(main.match(/<td\b/gi) || []).length}、<img> ${(main.match(/<img\b/gi) || []).length}、<iframe> ${(main.match(/<iframe\b/gi) || []).length}`);
  console.log(`  含公司字樣的行 ${co.length}；「公司」共 ${(body.match(/(股份)?有限公司/g) || []).length} 次；8 碼數字 ${(body.match(/(?<!\d)\d{8}(?!\d)/g) || []).length}；「元」${(body.match(/[\d,]+\s*(萬)?元/g) || []).length} 次；日期 ${(body.match(/\d{2,4}[-/年.]\d{1,2}[-/月.]\d{1,2}/g) || []).length} 個`);
  console.log(`  表頭 <th>：${[...main.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => strip(m[1])).slice(0, 15).join('｜') || '（沒有）'}`);
  const firstRow = (main.match(/<tr\b[\s\S]*?<\/tr>/i) || [''])[0];
  console.log(`  第一列 <tr> 的格子：${[...firstRow.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => mask(strip(m[1])).slice(0, 20)).join('｜') || '（沒有）'}`);
  console.log('  內容前 12 行（公司名遮掉）：'); lines.slice(0, 12).forEach((x) => console.log(`    ${mask(x).slice(0, 110)}`));
  console.log('  含公司的前 5 行（遮掉）：'); co.slice(0, 5).forEach((x) => console.log(`    ${mask(x).slice(0, 140)}`));
  const att = hrefs(main).filter((x) => /upload|file|download|attach|\.(pdf|ods|odt|xlsx?|docx?|csv|jpe?g|png)/i.test(x.href));
  console.log(`  內容裡像附件的連結 ${att.length}：${att.slice(0, 6).map((x) => `「${mask(x.text)}」${x.href.slice(0, 90)}`).join('、')}`);
  const imgs = [...main.matchAll(/<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  console.log(`  圖片 ${imgs.length}：${imgs.slice(0, 3).map((x) => x.slice(0, 80)).join('、')}`);
}

// 二、補助企業資料庫（2026 補助年度）
{
  const p = await get(`${BASE}/database/7`);
  if (p.ok) {
    const main = mainOf(p.text); const body = strip(main);
    const links = hrefs(main);
    const detail = links.filter((x) => /database_detail|database\/\d+\/\d+|company|detail/i.test(x.href));
    const pages = links.filter((x) => /[?&](page|p)=\d+|\/page\/\d+|database\/7\/\d+/i.test(x.href));
    console.log(`  主要內容 ${body.length} 字；連結 ${links.length}、像明細的 ${detail.length}、像翻頁的 ${pages.length}（${[...new Set(pages.map((x) => x.href))].slice(0, 6).join('、')}）`);
    console.log(`  明細連結樣式：${[...new Set(detail.map((x) => x.href.replace(/\d+/g, 'N')))].slice(0, 5).join('、')}；第一筆 ${detail[0] ? detail[0].href : ''}`);
    console.log(`  <select>/<option> ${(main.match(/<option\b/gi) || []).length} 個：${[...main.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((m) => strip(m[1])).slice(0, 25).join('｜')}`);
    console.log(`  <form> ${(main.match(/<form\b/gi) || []).length}：${[...main.matchAll(/<form\b[^>]*>/gi)].map((m) => m[0].slice(0, 120)).join(' ')}；input 名稱 ${[...main.matchAll(/<(?:input|select)\b[^>]*name\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).join('、')}`);
    const lines = main.replace(/<(br|\/p|\/li|\/tr|\/div|\/h\d)\b[^>]*>/gi, '\n').split('\n').map(strip).filter((x) => x.length > 1);
    console.log('  內容 8～30 行（遮掉）：'); lines.slice(8, 30).forEach((x) => console.log(`    ${mask(x).slice(0, 110)}`));
    if (detail[0]) {
      const d = await get(new URL(detail[0].href, `${BASE}/database/7`).href);
      if (d.ok) {
        const dm = mainOf(d.text); const dl = dm.replace(/<(br|\/p|\/li|\/tr|\/div|\/h\d|\/dt|\/dd|\/th|\/td)\b[^>]*>/gi, '\n').split('\n').map(strip).filter((x) => x.length > 1);
        console.log(`  明細頁 ${strip(dm).length} 字；有統編 ${/統一編號|統編/.test(strip(dm))}；8 碼數字 ${(strip(dm).match(/(?<!\d)\d{8}(?!\d)/g) || []).length}；前 25 行（遮掉）：`);
        dl.slice(0, 25).forEach((x) => console.log(`    ${mask(x).slice(0, 110)}`));
      }
    }
  }
}

// 三、歷年核定補助清冊
{
  const p = await get(`${BASE}/download/20`);
  if (p.ok) {
    const main = mainOf(p.text);
    const links = hrefs(main);
    console.log(`  內容連結 ${links.length}：`); links.slice(0, 25).forEach((x) => console.log(`    「${x.text}」 ${x.href.slice(0, 110)}`));
    const file = links.find((x) => /upload|file|download_file|\.(pdf|ods|xlsx?|csv)/i.test(x.href) && !/^\/?download\/\d+$/.test(x.href.replace(BASE, '')));
    if (file) {
      const f = await get(new URL(file.href, `${BASE}/download/20`).href);
      console.log(`  第一個檔：${f.ct}，${f.bytes} bytes，${f.cd.slice(0, 80)}`);
    }
  }
}
console.log('\n完成');
