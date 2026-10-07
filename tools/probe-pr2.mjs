/** 探路：食品業者登錄（8938）、環保許可對象（118447）、水污染源許可（106598）。一次性，看完刪。
 * 只印表頭、筆數、分類欄的統計，不印任何一列資料（記錄是公開的）。 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const show = (t, b) => console.log(`\n=========== ${t} ===========\n${b}`);
function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.length > 1);
}
async function urlsOf(id) {
  const r = await fetch(`https://data.gov.tw/api/v2/rest/dataset/${id}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  const ds = (j.result && j.result.distribution) || [];
  console.log(`#${id} ${j.result && j.result.title}｜更新：${j.result && (j.result.updateFrequency || '')}｜${ds.length} 個下載`);
  ds.forEach((d) => console.log(`  ${d.resourceFormat || d.format}｜${d.resourceDescription || ''}｜${d.resourceDownloadUrl || d.downloadURL}`));
  return ds;
}
const CAT = /類別|業別|狀態|縣市|行政區|鄉鎮|type|status|county|township|^is|產業|industry|per_type|per_item|組織|登錄/i;
const CITY = /新北|臺北|台北/;
function stats(name, table) {
  const h = table[0].map((x) => x.trim()); const body = table.slice(1);
  const ai = h.findIndex((k) => /地址|address|addr/i.test(k));
  const ci = h.findIndex((k) => /縣市|county/i.test(k));
  const ti = h.findIndex((k) => /統編|統一編號|^ban$|uniform/i.test(k));
  const local = body.filter((c) => CITY.test(String(c[ci >= 0 ? ci : ai] || '')));
  const lines = [`表頭（${h.length}）：${h.join(' | ')}`, `筆數 ${body.length}；新北／臺北 ${local.length}；統編 8 碼（全部）${ti >= 0 ? body.filter((c) => /^\d{8}$/.test(String(c[ti]).trim())).length : '無統編欄'}；（雙北）${ti >= 0 ? local.filter((c) => /^\d{8}$/.test(String(c[ti]).trim())).length : '-'}`];
  if (ti >= 0) lines.push(`雙北不重複統編 ${new Set(local.map((c) => String(c[ti]).trim()).filter((x) => /^\d{8}$/.test(x))).size}`);
  h.forEach((k, i) => {
    const vals = local.map((c) => String(c[i] || '').trim());
    const distinct = new Set(vals).size;
    if (CAT.test(k)) {
      const m = new Map(); vals.forEach((v) => m.set(v, (m.get(v) || 0) + 1));
      lines.push(`  [${k}] ${distinct} 種：${[...m].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([v, n]) => `${v.slice(0, 20) || '（空）'} ${n}`).join('、')}`);
    }
    if (/date|日期|年月|sdate|edate/i.test(k)) {
      const ds = vals.map((v) => v.replace(/\D/g, '')).filter(Boolean);
      const ym = new Map(); ds.forEach((d) => { const y = d.length === 7 ? String(Number(d.slice(0, 3)) + 1911) + d.slice(3, 5) : d.slice(0, 6); ym.set(y, (ym.get(y) || 0) + 1); });
      const keys = [...ym.keys()].sort();
      lines.push(`  [${k}] 有值 ${ds.length}；長度 ${[...new Set(ds.map((d) => d.length))].join('/')}；最早 ${keys[0]} 最晚 ${keys[keys.length - 1]}；最近 14 個月：${keys.slice(-14).map((y) => `${y}:${ym.get(y)}`).join(' ')}`);
    }
  });
  show(name, lines.join('\n'));
}
async function download(url, file) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(600000), redirect: 'follow' });
  const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(file, buf);
  console.log(`  下載 HTTP ${r.status} ${r.headers.get('content-type')} ${buf.length} bytes`);
  return buf;
}
const decode = (buf) => { const u = new TextDecoder('utf-8').decode(buf); return /�/.test(u.slice(0, 5000)) ? new TextDecoder('big5').decode(buf) : u; };

// 1. 食品業者登錄
try {
  const ds = await urlsOf(8938);
  const u = (ds.find((d) => /zip/i.test(String(d.resourceFormat || d.format))) || ds[0]);
  const buf = await download(u.resourceDownloadUrl || u.downloadURL, '/tmp/food.zip');
  if (buf.slice(0, 2).toString() === 'PK') {
    fs.mkdirSync('/tmp/food', { recursive: true });
    console.log(execFileSync('unzip', ['-o', '-q', '/tmp/food.zip', '-d', '/tmp/food']).toString());
    const files = execFileSync('find', ['/tmp/food', '-type', 'f']).toString().trim().split('\n');
    console.log(`  zip 內 ${files.length} 個檔：${files.map((f) => `${f.replace('/tmp/food/', '')}（${fs.statSync(f).size}）`).join('、')}`);
    for (const f of files.filter((x) => /csv$/i.test(x))) stats(`食品 ${f.replace('/tmp/food/', '')}`, parseCsv(decode(fs.readFileSync(f))));
  } else stats('食品', parseCsv(decode(buf)));
} catch (e) { show('食品', `✗ ${e.message}`); }

// 2. 環保許可對象
for (const id of [118447, 106598]) {
  try {
    const ds = await urlsOf(id);
    const u = ds.find((d) => /csv/i.test(String(d.resourceFormat || d.format))) || ds[0];
    const buf = await download(u.resourceDownloadUrl || u.downloadURL, `/tmp/${id}.csv`);
    stats(`#${id}`, parseCsv(decode(buf)));
  } catch (e) { show(`#${id}`, `✗ ${e.message}`); }
}
console.log('\n完成。');
