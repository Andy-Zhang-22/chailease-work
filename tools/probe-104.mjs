/*
 * 一次性探路：104 的職缺搜尋在 GitHub Actions 上抓不抓得到、長什麼樣。
 * 只印狀態碼、欄位名稱、筆數、地區代碼；不印公司名、職缺名、任何值（Actions 紀錄是公開的）。
 * 看完就刪，結論寫進 README。
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'zh-TW,zh;q=0.9', Referer: 'https://www.104.com.tw/jobs/search/' };
const MY_DISTRICTS = ['新莊區', '泰山區', '五股區', '林口區', '三重區', '蘆洲區', '樹林區', '八里區'];

async function get(url, extra = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { ...HEADERS, ...extra }, redirect: 'follow' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* 不是 JSON */ }
    return { status: res.status, type: res.headers.get('content-type') || '', bytes: text.length, json, text, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, type: '', bytes: 0, json: null, text: '', ms: Date.now() - started, error: String(e.message || e).slice(0, 120) };
  }
}
const keysOf = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : []);
const describe = (label, r) => console.log(`${label}: HTTP ${r.status} ${r.type.split(';')[0]} ${r.bytes} bytes ${r.ms} ms${r.error ? ` error=${r.error}` : ''}${r.json ? ` keys=${keysOf(r.json).join(',')}` : ''}`);

// 1. 地區代碼表（104 自己的分類工具 JSON）：找新莊分公司各區的代碼
let areaCodes = {};
{
  const r = await get('https://static.104.com.tw/category-tool/json/Area.json', { Referer: 'https://www.104.com.tw/' });
  describe('Area.json', r);
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, path)); return; }
    const name = node.des || node.name || '';
    const no = node.no || node.code || '';
    if (name && no && MY_DISTRICTS.some((d) => String(name).includes(d)) && /新北/.test(path)) areaCodes[name] = String(no);
    if (name && /新北市/.test(String(name)) && no) areaCodes['新北市'] = String(no);
    Object.values(node).forEach((v) => { if (v && typeof v === 'object') walk(v, `${path}/${name}`); });
  };
  if (r.json) walk(r.json, '');
  console.log(`  找到的地區代碼：${Object.entries(areaCodes).map(([k, v]) => `${k}=${v}`).join(' ') || '（沒有）'}`);
}
const area = areaCodes['新莊區'] || areaCodes['新北市'] || '6001002000';

// 2. 職缺搜尋：新舊兩個介面都試（只用地區，不下關鍵字）
const candidates = [
  ['search/api/jobs', `https://www.104.com.tw/jobs/search/api/jobs?jobsource=index_s&ro=0&area=${area}&order=16&asc=0&page=1&pagesize=20&mode=s`],
  ['search/list', `https://www.104.com.tw/jobs/search/list?ro=0&area=${area}&order=15&asc=0&page=1&mode=s&jobsource=2018indexpoc`],
];
let sample = null;
for (const [label, url] of candidates) {
  const r = await get(url, { Referer: `https://www.104.com.tw/jobs/search/?area=${area}` });
  describe(label, r);
  if (!r.json) { if (r.text) console.log(`  開頭 60 字元（非 JSON）：${r.text.slice(0, 60).replace(/\s+/g, ' ')}`); continue; }
  const data = r.json.data || r.json;
  console.log(`  data keys=${keysOf(data).join(',')}`);
  const list = data.list || data.jobs || (Array.isArray(data) ? data : []);
  console.log(`  筆數 ${list.length}，totalCount=${data.totalCount ?? data.total ?? '?'}，totalPage=${data.totalPage ?? '?'}`);
  if (list.length) {
    console.log(`  每筆欄位：${keysOf(list[0]).join(',')}`);
    const custs = new Set(list.map((x) => x.custNo || x.custName).filter(Boolean));
    console.log(`  前 ${list.length} 筆裡不同公司 ${custs.size} 家；有 custNo 的 ${list.filter((x) => x.custNo).length}，有 coIndustryDesc 的 ${list.filter((x) => x.coIndustryDesc).length}，有 jobAddrNoDesc 的 ${list.filter((x) => x.jobAddrNoDesc).length}`);
    const inds = {};
    list.forEach((x) => { const k = String(x.coIndustryDesc || '').slice(0, 6) || '（無）'; inds[k] = (inds[k] || 0) + 1; });
    console.log(`  行業（前 6 字）分布：${Object.entries(inds).map(([k, v]) => `${k} ${v}`).join('、')}`);
    if (!sample) sample = list[0];
  }
}

// 3. 公司頁的 JSON（員工數、資本額、電話在不在）
if (sample && (sample.custNo || sample.link)) {
  const custNo = sample.custNo || String((sample.link && sample.link.cust) || '').match(/company\/([a-z0-9]+)/i)?.[1];
  if (custNo) {
    const r = await get(`https://www.104.com.tw/company/ajax/content/${custNo}`, { Referer: `https://www.104.com.tw/company/${custNo}` });
    describe('company/ajax/content', r);
    const d = (r.json && r.json.data) || r.json;
    if (d) {
      console.log(`  公司頁欄位：${keysOf(d).join(',')}`);
      const has = (k) => (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '' ? '有' : '無');
      console.log(`  員工數 empNo=${has('empNo')}、資本額 capital=${has('capital')}、地址 address=${has('address')}、電話 phone=${has('phone')}、統編 taxNo=${has('taxNo')}、行業 industryDesc=${has('industryDesc')}、徵才中職缺數 jobCount=${has('jobCount')}`);
    }
  } else console.log('第一筆沒有 custNo，略過公司頁');
}

// 4. 行業篩選參數：製造業大類（indcat）能不能用
{
  const r = await get('https://static.104.com.tw/category-tool/json/Indust.json', { Referer: 'https://www.104.com.tw/' });
  describe('Indust.json', r);
  const found = [];
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth)); return; }
    const name = String(node.des || node.name || '');
    if (/製造|營造|運輸|批發|工程/.test(name) && depth <= 1 && (node.no || node.code)) found.push(`${name}=${node.no || node.code}`);
    Object.values(node).forEach((v) => { if (v && typeof v === 'object') walk(v, depth + 1); });
  };
  if (r.json) walk(r.json, 0);
  console.log(`  大類代碼：${found.slice(0, 12).join(' ') || '（沒找到）'}`);
}
console.log('探路結束');
