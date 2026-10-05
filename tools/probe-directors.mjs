/**
 * 一次性探測（用完就刪）：商工登記的董監事資料拿不拿得到、境外法人股東怎麼寫、有多常見。
 * 使用者：「境外投資的公司會有公開資料拿找嗎」→ 選「商工登記董監事看有沒有境外法人」。
 * repo 公開、紀錄誰都看得到：只印欄位名稱、統計數字、境外法人本身的名稱（法人的登記資料），不印抽樣公司。
 * 抽樣用公開的經濟部設立／變更清冊（leads/115*），不碰客戶名單。
 */
import fs from 'node:fs/promises';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }); return { status: r.status, text: await r.text() }; };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 結構：台積電（公開資料）
const t = await get('https://company.g0v.ronny.tw/api/show/22099131');
console.log('g0v show 22099131 HTTP', t.status);
let j = null; try { j = JSON.parse(t.text); } catch (e) { console.log('不是 JSON：', t.text.slice(0, 200)); }
const data = j && (j.data || j);
if (data) {
  console.log('欄位：', Object.keys(data).join('、'));
  const dirs = data['董監事名單'];
  console.log('董監事名單型別：', Array.isArray(dirs) ? `陣列 ${dirs.length} 筆` : typeof dirs);
  if (Array.isArray(dirs) && dirs[0]) console.log('一筆的欄位：', Object.keys(dirs[0]).join('、'), '｜所代表法人範例：', JSON.stringify(dirs.find((d) => d['所代表法人'] && d['所代表法人'] !== '') ? dirs.find((d) => d['所代表法人'])['所代表法人'] : null));
}

// 2. 抽樣：公開清冊裡的新北市公司 200 家
const files = (await fs.readdir('leads')).filter((d) => /^115\d\d$/.test(d)).sort();
const ids = new Set();
for (const p of files) {
  for (const kind of ['setup', 'change']) {
    let txt = ''; try { txt = await fs.readFile(`leads/${p}/新北市-${kind}.csv`, 'utf8'); } catch (e) { continue; }
    txt.split('\n').slice(1).forEach((l) => { const id = l.split(',')[0].replace(/\D/g, ''); if (id.length === 8) ids.add(id); });
  }
}
const sample = [...ids].filter((_, i) => i % 37 === 0).slice(0, 200);
const OFF = /薩摩亞|英屬|維京|開曼|安圭拉|塞席爾|模里西斯|貝里斯|馬紹爾|巴拿馬|百慕達|SAMOA|VIRGIN|BVI|CAYMAN|ANGUILLA|SEYCHELLES|MAURITIUS|BELIZE|MARSHALL|PANAMA|BERMUDA/i;
let ok = 0, withCorp = 0, withForeign = 0, withOffshore = 0; const names = new Map(); const fails = new Map();
for (const id of sample) {
  try {
    const r = await get(`https://company.g0v.ronny.tw/api/show/${id}`);
    if (r.status !== 200) { fails.set(r.status, (fails.get(r.status) || 0) + 1); continue; }
    const d = (JSON.parse(r.text).data) || {};
    ok += 1;
    const corps = (Array.isArray(d['董監事名單']) ? d['董監事名單'] : []).map((x) => x['所代表法人']).filter(Boolean)
      .map((x) => (Array.isArray(x) ? x[1] || x[0] : typeof x === 'object' ? x.name || JSON.stringify(x) : String(x)));
    if (corps.length) withCorp += 1;
    const foreign = corps.filter((n) => /[A-Za-z]{3,}/.test(n) || /^(香港|新加坡|美|日|英|德|法|韓|澳|加拿大|馬來西亞|泰國|越南|薩摩亞|英屬|開曼|安圭拉|塞席爾|模里西斯|貝里斯)[^\s]{0,8}商/.test(n));
    if (foreign.length) withForeign += 1;
    if (corps.some((n) => OFF.test(n))) withOffshore += 1;
    foreign.forEach((n) => names.set(n, (names.get(n) || 0) + 1));
  } catch (e) { fails.set(e.name, (fails.get(e.name) || 0) + 1); }
  await nap(300);
}
console.log(`抽樣 ${sample.length} 家，查到 ${ok} 家；董監事有法人代表的 ${withCorp} 家；有外國／境外法人的 ${withForeign} 家；其中租稅天堂（薩摩亞、BVI、開曼…）的 ${withOffshore} 家`);
console.log('失敗：', JSON.stringify([...fails]));
console.log('外國／境外法人名稱（法人本身的登記資料）：');
[...names.keys()].slice(0, 40).forEach((n) => console.log('  ', n));
