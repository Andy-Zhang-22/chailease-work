/** 探路：商業登記查負責人的 API 到底回什麼。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() }; };
console.log('=========== swagger 裡三支商業登記的完整定義 ===========');
try {
  const j = JSON.parse((await get('https://data.gcis.nat.gov.tw/resources/swagger/swagger.json')).text);
  for (const id of ['7E6AFA72-AD6A-46D3-8681-ED77951D912D', 'F570BC9A-DA4C-4813-8087-FB9CE95F9D38', '426D5542-5F05-43EB-83F9-F1300F14E1F1', '673F0FC0-B3A7-429F-9041-E9866836B66D']) {
    const p = j.paths[`/${id}`]; console.log(`\n--- ${id}\n`, JSON.stringify(p, null, 1).slice(0, 2500));
  }
} catch (e) { console.log('✗', e.message); }
const ids = ['31684990', '91712817', '87493071'];
for (const ds of ['7E6AFA72-AD6A-46D3-8681-ED77951D912D', 'F570BC9A-DA4C-4813-8087-FB9CE95F9D38', '426D5542-5F05-43EB-83F9-F1300F14E1F1', '673F0FC0-B3A7-429F-9041-E9866836B66D']) {
  for (const id of ids.slice(0, 2)) {
    for (const q of [`$format=json&$filter=Business_Accounting_NO%20eq%20${id}&$skip=0&$top=1`, `$format=json&$filter=Business_Accounting_NO eq ${id}&$skip=0&$top=1`, `$format=json&$filter=President_No%20eq%20${id}`, `$format=json&$filter=Business_Accounting_NO%20eq%20${id}`]) {
      const url = `https://data.gcis.nat.gov.tw/od/data/api/${ds}?${q}`;
      try { const r = await get(url); console.log(`\n${url}\nHTTP ${r.status} ${r.type} ${r.text.length} bytes\n${r.text.slice(0, 600).replace(/\s+/g, ' ')}`); } catch (e) { console.log(`\n${url}\n✗ ${e.message}`); }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
console.log('\n完成。');
