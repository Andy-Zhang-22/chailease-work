// 一次性探路：商工登記開放資料（商業登記應用三 426D5542、商業登記基本資料 7E6AFA72）有沒有 findbiz 商業頁網址裡的那串序號
// 使用者同意用 85151464 當測試對象；只印欄位名稱與代碼類的值，不印名稱、人名、地址。查完刪掉腳本與紀錄。
const TAX = '85151464';
const KEY = '2310000000017086980';
const BASES = {
  '426D5542（應用三）': 'https://data.gcis.nat.gov.tw/od/data/api/426D5542-5F05-43EB-83F9-F1300F14E1F1',
  '7E6AFA72（基本資料）': 'https://data.gcis.nat.gov.tw/od/data/api/7E6AFA72-AD6A-46D3-8681-ED77951D912D',
};
const url = (base, filter) => `${base}?$format=json&$filter=${encodeURIComponent(filter)}&$skip=0&$top=20`;
const safe = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) return String(s);
  if (/^[0-9A-Za-z_\-./]{1,40}$/.test(s)) return s;   // 代碼、日期、數字照印
  return `<文字 ${s.length} 字>`;
};
async function get(label, u) {
  try {
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    console.log(`\n== ${label}：HTTP ${res.status}，${text.length} 字`);
    console.log(`整段回應含序號全文：${text.includes(KEY)}；含後段 17086980：${text.includes('17086980')}；含前段 2310000000：${text.includes('2310000000')}`);
    let rows = [];
    try { rows = JSON.parse(text); } catch (e) { console.log('不是 JSON：', text.slice(0, 120).replace(/[^\x20-\x7e]/g, '?')); return []; }
    if (!Array.isArray(rows)) rows = [rows];
    rows.forEach((r, i) => {
      console.log(`-- 第 ${i + 1} 筆`);
      for (const [k, v] of Object.entries(r || {})) {
        const vs = typeof v === 'string' ? v : JSON.stringify(v);
        console.log(`  ${k} = ${safe(v)}${vs && vs.includes('17086980') ? '  ←含序號後段' : ''}`);
      }
    });
    return rows;
  } catch (err) {
    console.log(`\n== ${label}：連不到（${err.message}）`);
    return [];
  }
}
const ag = await get('426D5542 用統編查', url(BASES['426D5542（應用三）'], `President_No eq ${TAX}`));
const agencies = [...new Set(ag.map((r) => r && r.Agency).filter(Boolean))];
for (const a of agencies) await get(`7E6AFA72 統編＋登記機關 ${a}`, url(BASES['7E6AFA72（基本資料）'], `President_No eq ${TAX} and Agency eq ${a}`));
if (!agencies.length) await get('7E6AFA72 只用統編', url(BASES['7E6AFA72（基本資料）'], `President_No eq ${TAX}`));
