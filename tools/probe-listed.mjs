/**
 * 探路：上市／上櫃／興櫃公司基本資料的開放 API 通不通、欄位長怎樣；
 * 以及拿董事長姓名去查「公司負責人資料」能不能找出他名下的投資公司。
 * 一次性的，看完連同 workflow 一起刪。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), text };
};
const show = (label, r) => {
  console.log(`\n=========== ${label} ===========`);
  console.log(`HTTP ${r.status}  ${r.type}  ${r.text.length} bytes`);
  try {
    const j = JSON.parse(r.text);
    const arr = Array.isArray(j) ? j : (j.data || j.result || []);
    console.log(`陣列 ${Array.isArray(arr) ? arr.length : '?'} 筆`);
    if (Array.isArray(arr) && arr.length) {
      console.log('欄位：', Object.keys(arr[0]).join(' | '));
      console.log('第一筆：', JSON.stringify(arr[0]).slice(0, 900));
      console.log('第二筆：', JSON.stringify(arr[1] || {}).slice(0, 400));
    } else console.log(r.text.slice(0, 500));
  } catch (e) { console.log('不是 JSON：', r.text.slice(0, 400).replace(/\s+/g, ' ')); }
};
const tries = [
  ['上市 基本資料 t187ap03_L', 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'],
  ['上櫃 基本資料 mopsfin_t187ap03_O', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O'],
  ['興櫃 基本資料 mopsfin_t187ap03_R', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R'],
  ['公司負責人資料：魏哲家', 'https://data.gcis.nat.gov.tw/od/data/api/4B61A0F1-458C-43F9-93F3-9FD6DA5E1B08?$format=json&$filter=Responsible_Name%20eq%20%E9%AD%8F%E5%93%B2%E5%AE%B6&$skip=0&$top=50'],
  ['公司負責人資料：郭台銘', 'https://data.gcis.nat.gov.tw/od/data/api/4B61A0F1-458C-43F9-93F3-9FD6DA5E1B08?$format=json&$filter=Responsible_Name%20eq%20%E9%83%AD%E5%8F%B0%E9%8A%98&$skip=0&$top=50'],
  ['公司負責人資料：陳志明（常見名，看會回幾家）', 'https://data.gcis.nat.gov.tw/od/data/api/4B61A0F1-458C-43F9-93F3-9FD6DA5E1B08?$format=json&$filter=Responsible_Name%20eq%20%E9%99%B3%E5%BF%97%E6%98%8E&$skip=0&$top=200'],
];
for (const [label, url] of tries) {
  try { show(label, await get(url)); } catch (e) { console.log(`\n=========== ${label} ===========\n✗ ${e.message}`); }
  await new Promise((r) => setTimeout(r, 800));
}
console.log('\n完成。');
