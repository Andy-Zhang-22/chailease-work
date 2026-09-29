/** 探路第三輪：哪裡有商業（商行、企業社）的負責人姓名整批資料。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type'), url: r.url, text: init.method === 'HEAD' ? '' : await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (t, s) => console.log(`\n=========== ${t} ===========\n${s}`);
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// 1. data.gov.tw 的 API 搜尋（幾種可能的寫法都試）
for (const url of [
  'https://data.gov.tw/api/v2/rest/datasets?q=%E5%95%86%E6%A5%AD%E7%99%BB%E8%A8%98&size=20',
  'https://data.gov.tw/api/front/dataset/list?q=%E5%95%86%E6%A5%AD%E7%99%BB%E8%A8%98',
  'https://data.gov.tw/api/v1/rest/datasets?q=%E5%95%86%E6%A5%AD%E7%99%BB%E8%A8%98',
]) {
  try { const r = await get(url); show(url, `HTTP ${r.status} ${r.type} ${r.text.length} bytes\n${r.text.slice(0, 800)}`); } catch (e) { show(url, `✗ ${e.message}`); }
  await nap(400);
}
// 2. 用搜尋引擎找 data.gov.tw 上的商業登記資料集
for (const q of ['site:data.gov.tw 商業登記 負責人', 'site:data.gov.tw 商業登記資料 新北市', 'site:data.gov.tw 商業登記 縣市 負責人姓名']) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  try { const r = await get(url); const links = [...new Set([...r.text.matchAll(/https?:\/\/data\.gov\.tw\/dataset\/\d+/g)].map((m) => m[0]))]; const titles = [...r.text.matchAll(/class="result__a"[^>]*>([^<]{3,120})</g)].map((m) => m[1].trim()); show(`duckduckgo ${q}`, `HTTP ${r.status}\n${links.slice(0, 10).join('\n')}\n${titles.slice(0, 10).join('\n')}`); } catch (e) { show(`duckduckgo ${q}`, `✗ ${e.message}`); }
  await nap(800);
}
// 3. GCIS 入口網的商業清冊：從公司清冊那頁找有沒有商業的
for (const url of ['https://serv.gcis.nat.gov.tw/pub/cmpy/reportCity.jsp', 'https://serv.gcis.nat.gov.tw/pub/busm/reportCity.jsp', 'https://serv.gcis.nat.gov.tw/pub/cmpy/busmReportCity.jsp', 'https://gcis.nat.gov.tw/mainNew/subclassNAction.do?method=getFile&pk=1', 'https://data.gcis.nat.gov.tw/od/datacategory']) {
  try { const r = await get(url); const links = [...new Set([...r.text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /busm|bus|商業|report/i.test(h)))]; show(url, `HTTP ${r.status} → ${r.url} ${r.text.length} bytes\n${strip(r.text).slice(0, 500)}\n連結：${links.slice(0, 20).join('\n')}`); } catch (e) { show(url, `✗ ${e.message}`); }
  await nap(500);
}
// 4. 新北市政府開放資料：API 搜尋
for (const url of ['https://data.ntpc.gov.tw/api/datasets?q=%E5%95%86%E6%A5%AD%E7%99%BB%E8%A8%98', 'https://data.ntpc.gov.tw/api/datasets?keyword=%E5%95%86%E6%A5%AD', 'https://data.ntpc.gov.tw/api/v1/rest/datalist?keyword=%E5%95%86%E6%A5%AD']) {
  try { const r = await get(url); show(url, `HTTP ${r.status} ${r.type} ${r.text.length} bytes\n${r.text.slice(0, 800)}`); } catch (e) { show(url, `✗ ${e.message}`); }
  await nap(400);
}
console.log('\n完成。');
