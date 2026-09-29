/** 探路：商業（獨資／合夥）在 findbiz 能不能用統編直接開到頁面。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const TAX = '31684990'; const NAME = '躍祥';
const show = async (label, url, init = {}) => {
  try {
    const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(60000), redirect: 'follow' });
    const t = await r.text();
    const title = (t.match(/<title>([^<]*)</) || [])[1] || '';
    const links = [...new Set([...t.matchAll(/\/fts\/business\/[0-9]+\/[0-9]+/g)].map((m) => m[0]))].slice(0, 5);
    console.log(`\n== ${label}\n   ${url}\n   HTTP ${r.status} → ${r.url}\n   title: ${title.trim().slice(0, 80)}\n   有名稱: ${t.includes(NAME)}  有負責人: ${t.includes('負責人')}  驗證碼: ${/validat|captcha|驗證碼/i.test(t)}  長度 ${t.length}\n   business 連結: ${links.join(' ')}`);
    return t;
  } catch (e) { console.log(`\n== ${label}\n   ✗ ${e.message}`); return ''; }
};
await show('business/統編', `https://findbiz.nat.gov.tw/fts/business/${TAX}`);
await show('business/統編/', `https://findbiz.nat.gov.tw/fts/business/${TAX}/`);
await show('company/統編（現在用的）', `https://findbiz.nat.gov.tw/fts/company/${TAX}`);
const qs = `qryCond=${TAX}&isAlive=all&qryType=cmpyType&cmpyType=true&brCmpyType=true&busmType=true&factType=true&lmtdType=true&fhl=zh_TW&curPage=0&validatorOpen=N&rlPermit=0&errorMsg=&userResp=&busiItemMain=&busiItemSub=`;
await show('queryList GET', `https://findbiz.nat.gov.tw/fts/query/QueryList/queryList.do?${qs}`);
await show('queryList POST', 'https://findbiz.nat.gov.tw/fts/query/QueryList/queryList.do', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do' }, body: qs });
await show('queryInit GET 帶 qryCond', `https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?qryCond=${TAX}`);
for (const api of ['426D5542-5F05-43EB-83F9-F1300F14E1F1', '7E6AFA72-AD6A-46D3-8681-ED77951D912D']) {
  const t = await show(`GCIS ${api.slice(0, 8)}`, `https://data.gcis.nat.gov.tw/od/data/api/${api}?$format=json&$filter=President_No%20eq%20${TAX}&$skip=0&$top=1`, { headers: { Accept: 'application/json' } });
  console.log(`   body: ${t.slice(0, 700)}`);
}
console.log('\n完成。');
