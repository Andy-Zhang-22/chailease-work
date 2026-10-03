/** 探路：商業（獨資／合夥）的「最近異動日期」GCIS 哪一支 API 有、欄位叫什麼。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() }; };
console.log('=========== swagger：名稱或欄位跟「商業」有關的資料集 ===========');
let paths = {};
try { paths = JSON.parse((await get('https://data.gcis.nat.gov.tw/resources/swagger/swagger.json')).text).paths || {}; } catch (e) { console.log('✗ swagger', e.message); }
const hits = [];
for (const [p, def] of Object.entries(paths)) {
  const s = JSON.stringify(def);
  if (/商業/.test(s) && /Change|異動|變更/.test(s)) hits.push(p);
}
for (const p of hits) console.log(`\n--- ${p}\n`, JSON.stringify(paths[p]).slice(0, 1800));
console.log(`\n共 ${hits.length} 支`);
const ids = ['50586604', '91712817'];   // 公開登記資料的商號（達冠專業玻璃貼膜企業社、協玖裝潢企業社）
const ds = new Set(['426D5542-5F05-43EB-83F9-F1300F14E1F1', 'F570BC9A-DA4C-4813-8087-FB9CE95F9D38', '7E6AFA72-AD6A-46D3-8681-ED77951D912D', ...hits.map((p) => p.replace(/^\//, '').split('?')[0])]);
for (const d of ds) {
  for (const id of ids) {
    for (const f of [`Business_Accounting_NO eq ${id}`, `President_No eq ${id}`]) {
      const url = `https://data.gcis.nat.gov.tw/od/data/api/${d}?$format=json&$filter=${encodeURIComponent(f)}&$skip=0&$top=1`;
      try { const r = await get(url); console.log(`\n${d} ${f}\nHTTP ${r.status} ${r.text.length} bytes\n${r.text.slice(0, 900).replace(/\s+/g, ' ')}`); } catch (e) { console.log(`\n${d} ${f}\n✗ ${e.message}`); }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}
console.log('\n完成。');
