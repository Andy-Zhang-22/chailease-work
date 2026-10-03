/** 探路第二輪：426D5542 用 President_No 拿全部申登機關，再用 7E6AFA72（商業登記基本資料-應用一）President_No＋Agency 拿 Business_Last_Change_Date。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); return { status: r.status, text: await r.text() }; };
const API = 'https://data.gcis.nat.gov.tw/od/data/api/';
for (const id of ['50586604', '91712817', '87493071']) {
  const u1 = `${API}426D5542-5F05-43EB-83F9-F1300F14E1F1?$format=json&$filter=${encodeURIComponent(`President_No eq ${id}`)}&$skip=0&$top=20`;
  const r1 = await get(u1);
  console.log(`\n=== ${id} 426D5542 全部列 HTTP ${r1.status}\n${r1.text.slice(0, 1500)}`);
  let rows = []; try { rows = JSON.parse(r1.text || '[]'); } catch (e) { rows = []; }
  for (const ag of [...new Set(rows.map((x) => x.Agency).filter(Boolean)), '376410000A', '379100000G']) {
    const u2 = `${API}7E6AFA72-AD6A-46D3-8681-ED77951D912D?$format=json&$filter=${encodeURIComponent(`President_No eq ${id} and Agency eq ${ag}`)}&$skip=0&$top=5`;
    const r2 = await get(u2);
    console.log(`--- 7E6AFA72 Agency ${ag} HTTP ${r2.status}\n${r2.text.slice(0, 800)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
console.log('\n完成。');
