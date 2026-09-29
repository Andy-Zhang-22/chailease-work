/** 探路第二輪：找有負責人姓名的「商業登記」整批開放資料（data.gov.tw、新北市政府開放資料）。看完連同 workflow 一起刪。 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url, init = {}) => { const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000), redirect: 'follow' }); return { status: r.status, type: r.headers.get('content-type'), len: r.headers.get('content-length'), text: init.method === 'HEAD' ? '' : await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (t, s) => console.log(`\n=========== ${t} ===========\n${s}`);

// 1. data.gov.tw 搜尋：列出資料集編號與標題
const seen = new Map();
for (const q of ['商業登記', '商業登記 新北市', '商業登記 負責人', '商業登記資料']) {
  const url = `https://data.gov.tw/datasets/search?p=1&size=20&s=_score_desc&q=${encodeURIComponent(q)}`;
  try { const r = await get(url); const hits = [...r.text.matchAll(/dataset\/(\d+)[^>]*>\s*([^<]{3,90}?)\s*</g)]; hits.forEach((m) => seen.set(m[1], m[2].trim())); show(`data.gov.tw 搜尋「${q}」`, `HTTP ${r.status}，${hits.length} 個`); } catch (e) { show(`搜尋 ${q}`, `✗ ${e.message}`); }
  await nap(500);
}
console.log([...seen].map(([id, t]) => `${id} ${t}`).join('\n'));
// 2. 標題像「商業登記」的，看它的下載連結與欄位說明
const cands = [...seen].filter(([, t]) => /商業登記|商業名稱|營業人/.test(t)).slice(0, 12);
for (const [id, title] of cands) {
  try {
    const r = await get(`https://data.gov.tw/api/v2/rest/dataset/${id}`);
    let j = {}; try { j = JSON.parse(r.text); } catch (e) { /* 不是 JSON */ }
    const dist = (j.distribution || []).map((d) => `${d.resourceFormat || ''} ${d.downloadURL || ''} ｜ ${String(d.resourceDescription || '').slice(0, 60)}`);
    show(`${id} ${title}`, `欄位說明：${String(j.fieldDescription || j.notes || '').slice(0, 400)}\n${dist.join('\n')}`);
  } catch (e) { show(`${id} ${title}`, `✗ ${e.message}`); }
  await nap(500);
}
// 3. 新北市政府開放資料：搜尋商業登記
for (const q of ['商業登記', '商業', '公司登記']) {
  const url = `https://data.ntpc.gov.tw/datasets?q=${encodeURIComponent(q)}`;
  try {
    const r = await get(url);
    const hits = [...new Set([...r.text.matchAll(/datasets\/([0-9a-f-]{36})[^>]*>\s*([^<]{2,80}?)\s*</g)].map((m) => `${m[1]} ${m[2].trim()}`))];
    show(`data.ntpc.gov.tw 搜尋「${q}」`, `HTTP ${r.status} ${r.text.length} bytes，${hits.length} 個\n${hits.slice(0, 30).join('\n')}`);
    for (const h of hits.filter((x) => /商業|營業|公司/.test(x)).slice(0, 6)) {
      const id = h.slice(0, 36);
      try { const s = await get(`https://data.ntpc.gov.tw/api/datasets/${id}/json?page=0&size=2`); console.log(`\n  --- ${h}\n  HTTP ${s.status} ${s.text.slice(0, 500).replace(/\s+/g, ' ')}`); } catch (e) { console.log(`\n  --- ${h}\n  ✗ ${e.message}`); }
      await nap(500);
    }
  } catch (e) { show(`ntpc 搜尋 ${q}`, `✗ ${e.message}`); }
}
console.log('\n完成。');
