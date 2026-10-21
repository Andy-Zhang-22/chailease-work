// 探路（看完就刪）：data.gov.tw 整份目錄裡找四類來源，只印資料集編號、名稱、機關、格式、欄位名、大小。不印任何資料列。
const UA = 'Mozilla/5.0 (probe; chailease-work)';
const get = (u, ms = 120000) => fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) });
const parseCsv = (text) => { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows; };
const cat = await (await get('https://data.gov.tw/api/front/dataset/export?format=csv', 300000)).text();
const rows = parseCsv(cat.replace(/^﻿/, ''));
const head = rows[0]; console.log(`目錄 ${rows.length - 1} 個資料集；欄位：${head.join('、')}`);
const col = (re) => head.findIndex((h) => re.test(h));
const iId = col(/識別碼|編號|^id$/i), iUrl = col(/下載網址/), iFields = col(/主要欄位/), iName = col(/名稱|title/i), iOrg = col(/機關|提供|organization/i), iFmt = col(/格式|format/i), iFreq = col(/頻率|frequency/i), iUpd = col(/更新時間|更新日期|modified|updated/i), iDesc = col(/描述|說明|description/i);
const GROUPS = [
  ['建築執照（新北、臺北）', (n, o) => /建築執照|建造執照|建照/.test(n) && /新北|臺北|台北/.test(n + o)],
  ['出進口實績', (n) => /實績/.test(n) && /出進口|進出口|廠商|貿易/.test(n)],
  ['商標／專利申請公告', (n) => /(商標|專利).*(申請|公告|核准|註冊)/.test(n)],
  ['徵才、職缺', (n) => /職缺|徵才|求才|求職/.test(n)],
];
const picks = [];
for (const [label, test] of GROUPS) {
  const hits = rows.slice(1).filter((r) => test(String(r[iName] || ''), String(r[iOrg] || '')));
  console.log(`\n== ${label}：${hits.length} 個`);
  hits.slice(0, 25).forEach((r) => console.log(`  ${r[iId]}｜${r[iName]}｜${r[iOrg]}｜${r[iFmt]}｜${iFreq >= 0 ? r[iFreq] : ''}｜${iUpd >= 0 ? String(r[iUpd]).slice(0, 10) : ''}｜欄位：${String(r[iFields] || '').slice(0, 160)}`));
  hits.filter((r) => /新北市建築執照存查|115年度建造執照摘要|新建建築物建造執照列表|企業職缺資訊|求職徵才職缺資訊/.test(String(r[iName] || ''))).forEach((r) => picks.push([label, r[iId], r[iName], String(r[iUrl] || '').split(';')[0]]));
}
console.log('\n== 看詮釋資料與欄位（每組最多 6 個，只讀前 300 KB，印欄位名與大小）');
for (const [label, id, name, catUrl] of picks) {
  try {
    let url = catUrl;
    try {
      const j = await (await get(`https://data.gov.tw/api/v2/rest/dataset/${id}`)).json();
      const ds = (j.result && j.result.distribution) || [];
      const d = ds.find((x) => /csv|json|xml/i.test(String(x.resourceFormat || x.format || ''))) || ds[0];
      if (d && (d.resourceDownloadUrl || d.downloadURL)) url = d.resourceDownloadUrl || d.downloadURL;
      console.log(`\n[${label}] ${id} ${name}：詮釋資料資源 ${ds.length} 個，格式 ${ds.map((x) => x.resourceFormat || x.format).join('/')}`);
    } catch (e) { console.log(`\n[${label}] ${id} ${name}：詮釋資料讀不到（${String(e.message || e).slice(0, 60)}），用目錄的下載網址`); }
    const host = url ? new URL(url).host : '';
    console.log(`  主機 ${host}`);
    if (!url) continue;
    const r = await get(url, 90000);
    const type = r.headers.get('content-type') || ''; const len = r.headers.get('content-length') || '?';
    const reader = r.body.getReader(); let got = ''; let bytes = 0;
    while (bytes < 300000) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; got += Buffer.from(value).toString('utf8'); }
    try { reader.cancel(); } catch (e) { /* 夠了 */ }
    const bin = /zip|octet/.test(type) || got.charCodeAt(0) === 0x50 && got.charCodeAt(1) === 0x4b;
    if (bin) { console.log(`  回 ${r.status} ${type}，大小 ${len}（zip／二進位，沒拆）`); continue; }
    const text = got.replace(/^﻿/, '');
    if (/^\s*[\[{]/.test(text)) {
      const keys = (text.match(/"([^"]{1,40})"\s*:/g) || []).map((k) => k.replace(/[":\s]/g, '')); const uniq = [...new Set(keys)].slice(0, 40);
      console.log(`  回 ${r.status} JSON，大小 ${len}；鍵：${uniq.join('、')}`);
    } else {
      const lines = text.split(/\r?\n/).filter(Boolean);
      console.log(`  回 ${r.status} ${type.split(';')[0]}，大小 ${len}；前 300 KB 約 ${lines.length} 列；表頭：${(lines[0] || '').slice(0, 300)}`);
    }
  } catch (e) { console.log(`  ✗ ${id} ${String(e.message || e).slice(0, 120)}`); }
}
