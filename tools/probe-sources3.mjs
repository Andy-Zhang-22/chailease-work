// 探路第二輪（看完就刪）：新北市建築執照存查 123639、臺北市 115 年度建造執照摘要 128200。只印統計，不印起造人名。
const UA = 'Mozilla/5.0 (probe; chailease-work)';
const get = (u, ms = 300000) => fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) });
const parseCsv = (text) => { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows; };
const urlOf = async (id) => { const j = await (await get(`https://data.gov.tw/api/v2/rest/dataset/${id}`)).json(); const ds = (j.result && j.result.distribution) || []; const d = ds.find((x) => /csv|xml/i.test(String(x.resourceFormat || x.format || ''))) || ds[0]; return d.resourceDownloadUrl || d.downloadURL; };
const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join('、');
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const COMPANY_RE = /公司|企業|商行|工業|實業|科技|股份|工廠|建設|開發|事業/;
// 1. 新北
{
  const url = await urlOf(123639); console.log(`新北 123639 下載主機 ${new URL(url).host}`);
  const text = (await (await get(url)).text()).replace(/^﻿/, '');
  const rows = parseCsv(text); const head = rows[0]; const data = rows.slice(1).filter((r) => r.length >= head.length - 2);
  console.log(`欄位（${head.length}）：${head.join(',')}`); console.log(`列數 ${data.length}`);
  const ix = (n) => head.indexOf(n);
  const iP = ix('proprietor'), iD = ix('date_licensing'), iD2 = ix('date_the_permit'), iU = ix('use_of_buildings'), iC = ix('project_cost'), iS = ix('building_site'), iA = ix('house_address'), iF = ix('total_floor_area');
  const dates = data.map((r) => String(r[iD] || '')).filter(Boolean).sort();
  console.log(`date_licensing 樣式（前 3 種長度）：${[...new Set(dates.map((d) => d.length))].slice(0, 3).join('/')}，最小 ${dates[0]}，最大 ${dates[dates.length - 1]}`);
  const d2 = data.map((r) => String(r[iD2] || '')).filter(Boolean).sort(); console.log(`date_the_permit 最小 ${d2[0]}，最大 ${d2[d2.length - 1]}`);
  let masked = 0, company = 0, multi = 0, empty = 0; const lens = new Map();
  data.forEach((r) => { const p = String(r[iP] || '').trim(); if (!p) { empty += 1; return; } if (/[○Ｏ〇*＊]/.test(p)) masked += 1; if (COMPANY_RE.test(p)) company += 1; if (/[、,，;；]|等\d*人/.test(p)) multi += 1; bump(lens, Math.min(p.length, 30)); });
  console.log(`起造人：空白 ${empty}、有遮罩符號 ${masked}、像公司名 ${company}、多人並列 ${multi}；長度分布 ${top(lens, 10)}`);
  const uses = new Map(); data.forEach((r) => bump(uses, String(r[iU] || '').slice(0, 12) || '（空）')); console.log(`用途前 12：${top(uses, 12)}`);
  const costs = data.map((r) => Number(String(r[iC] || '').replace(/\D/g, ''))).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p) => costs[Math.floor(costs.length * p)] || 0; console.log(`工程造價有值 ${costs.length}：P25 ${q(0.25)}、P50 ${q(0.5)}、P75 ${q(0.75)}、P90 ${q(0.9)}（元？看量級）`);
  const dist = new Map(); data.forEach((r) => { const s = String(r[iS] || r[iA] || ''); const m = s.match(/新北市(..區)/) || s.match(/^(..區)/); bump(dist, m ? m[1] : '（看不出區）'); }); console.log(`區前 12：${top(dist, 12)}`);
  const recent = data.filter((r) => { const d = String(r[iD] || r[iD2] || '').replace(/\D/g, ''); const y = d.length >= 7 ? (d.length === 7 ? Number(d.slice(0, 3)) + 1911 : Number(d.slice(0, 4))) : 0; return y >= 2025; });
  const rc = recent.filter((r) => COMPANY_RE.test(String(r[iP] || ''))).length;
  console.log(`2025 年起的列 ${recent.length}，其中起造人像公司的 ${rc}`);
  const fa = data.map((r) => Number(String(r[iF] || '').replace(/[^\d.]/g, ''))).filter((x) => x > 0).sort((a, b) => a - b); console.log(`總樓地板面積 P50 ${fa[Math.floor(fa.length / 2)] || 0}`);
}
// 2. 臺北
{
  const url = await urlOf(128200); console.log(`\n臺北 128200 下載主機 ${new URL(url).host}`);
  const text = await (await get(url)).text();
  const tags = new Map(); (text.match(/<([A-Za-z_一-鿿][^\s>\/]*)>/g) || []).forEach((t) => bump(tags, t.slice(1, -1)));
  console.log(`XML 大小 ${text.length}，標籤：${top(tags, 30)}`);
  const own = text.match(/<(起造人[^>]*)>([^<]*)<\//g) || []; const masked = own.filter((x) => /[○Ｏ〇*＊]/.test(x)).length; const comp = own.filter((x) => COMPANY_RE.test(x)).length;
  console.log(`起造人欄 ${own.length} 個，遮罩 ${masked}，像公司名 ${comp}`);
}
