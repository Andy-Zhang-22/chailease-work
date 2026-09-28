/**
 * 探路：上市櫃公司的「動態」每天能從哪裡拿。一次性的，看完連同 workflow 一起刪。
 *  - 證交所／櫃買開放 API：每日重大訊息、每月營收、董監事持股（猜幾個常見代號，看哪個通）
 *  - 經濟部公司資料異動：按民國日期查一天的異動，看一頁多少、能不能翻頁
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
      console.log('第一筆：', JSON.stringify(arr[0]).slice(0, 700));
      console.log('最後一筆：', JSON.stringify(arr[arr.length - 1]).slice(0, 300));
    } else console.log(r.text.slice(0, 300));
  } catch (e) { console.log('不是 JSON：', r.text.slice(0, 300).replace(/\s+/g, ' ')); }
};
const d = new Date(); d.setDate(d.getDate() - 1);
const roc = `${d.getFullYear() - 1911}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const tries = [
  ['上市 每日重大訊息 t187ap04_L', 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L'],
  ['上櫃 每日重大訊息 mopsfin_t187ap04_O', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O'],
  ['興櫃 每日重大訊息 mopsfin_t187ap04_R', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_R'],
  ['上市 每月營收 t187ap05_L', 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L'],
  ['上櫃 每月營收 mopsfin_t187ap05_O', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O'],
  ['上市 董監事持股 t187ap11_L', 'https://openapi.twse.com.tw/v1/opendata/t187ap11_L'],
  ['上市 董事長／發言人異動? t187ap46_L_1', 'https://openapi.twse.com.tw/v1/opendata/t187ap46_L_1'],
  [`經濟部 公司資料異動 ${roc}（昨天）第一頁`, `https://data.gcis.nat.gov.tw/od/data/api/4347A009-6489-4F19-AC79-78F366BE7976?$format=json&$filter=Change_Of_Approval_Data%20eq%20${roc}&$skip=0&$top=1000`],
  [`經濟部 公司資料異動 ${roc} 第二頁`, `https://data.gcis.nat.gov.tw/od/data/api/4347A009-6489-4F19-AC79-78F366BE7976?$format=json&$filter=Change_Of_Approval_Data%20eq%20${roc}&$skip=1000&$top=1000`],
  ['證交所 OpenAPI 清單', 'https://openapi.twse.com.tw/v1/swagger.json'],
];
for (const [label, url] of tries) {
  try {
    const r = await get(url);
    if (/swagger/.test(url)) {
      console.log(`\n=========== ${label} ===========\nHTTP ${r.status} ${r.text.length} bytes`);
      try { const j = JSON.parse(r.text); const paths = Object.keys(j.paths || {}); console.log(`路徑 ${paths.length} 條`); paths.filter((p) => /t187ap/.test(p)).forEach((p) => console.log('  ', p, '—', (j.paths[p].get && j.paths[p].get.summary) || '')); } catch (e) { console.log('parse fail', e.message); }
    } else show(label, r);
  } catch (e) { console.log(`\n=========== ${label} ===========\n✗ ${e.message}`); }
  await new Promise((r) => setTimeout(r, 800));
}
console.log('\n完成。');
