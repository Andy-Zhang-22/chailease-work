/**
 * 探路第二輪：
 *  1. 把 BGMOPEN1.csv 整份串流讀完，算新北市獨資／合夥有幾筆、資本額與設立年的分佈、開發票的比例——決定分頁怎麼篩
 *  2. 經濟部 GCIS 的 swagger 裡有沒有「商業登記」查負責人的 API（用統編查）
 */
import readline from 'node:readline';
import { Readable } from 'node:stream';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get = (url, init = {}) => fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(600000) });

console.log('=========== GCIS swagger 裡跟商業登記有關的路徑 ===========');
try {
  const r = await get('https://data.gcis.nat.gov.tw/resources/swagger/swagger.json');
  const j = JSON.parse(await r.text());
  Object.entries(j.paths || {}).forEach(([p, v]) => {
    const g = v.get || {}; const txt = `${g.summary || ''} ${g.description || ''} ${(g.tags || []).join(' ')}`;
    if (/商業|負責人|Business/i.test(txt) || /商業/.test(p)) {
      console.log(p, '—', (g.summary || '').slice(0, 80), '| params:', (g.parameters || []).map((x) => x.name).join(','));
    }
  });
} catch (e) { console.log('✗', e.message); }

console.log('\n=========== BGMOPEN1.csv 整份統計 ===========');
const r = await get('https://eip.fia.gov.tw/data/BGMOPEN1.csv');
const rl = readline.createInterface({ input: Readable.fromWeb(r.body) });
const parse = (line) => { const out = []; let cur = ''; let q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
let n = 0; let head = null;
const stat = { total: 0, ntpc: 0, ntpcSole: 0, byOrg: {}, byDist: {}, capBucket: {}, yearBucket: {}, invoice: { Y: 0, N: 0 }, sample: [] };
const capB = (v) => (v < 100000 ? '<10萬' : v < 500000 ? '10-50萬' : v < 1000000 ? '50-100萬' : v < 5000000 ? '100-500萬' : '≥500萬');
const nowY = 2026;
for await (const line of rl) {
  n++;
  if (n === 1) { head = parse(line); continue; }
  const c = parse(line);
  if (c.length < 10 || !c[1]) continue;
  stat.total++;
  const addr = c[0]; const org = c[6];
  if (!/^新北市/.test(addr)) continue;
  stat.ntpc++;
  stat.byOrg[org] = (stat.byOrg[org] || 0) + 1;
  if (!/獨資|合夥/.test(org)) continue;
  stat.ntpcSole++;
  const dist = (addr.match(/^新北市([^\s]{1,3}[區])/) || [])[1] || '?';
  stat.byDist[dist] = (stat.byDist[dist] || 0) + 1;
  const cap = Number(c[4]) || 0; stat.capBucket[capB(cap)] = (stat.capBucket[capB(cap)] || 0) + 1;
  const y = c[5] && c[5].length === 7 ? Number(c[5].slice(0, 3)) + 1911 : 0;
  const yb = !y ? '?' : nowY - y <= 5 ? '5年內' : nowY - y <= 10 ? '5-10年' : '>10年';
  stat.yearBucket[yb] = (stat.yearBucket[yb] || 0) + 1;
  stat.invoice[c[7] === 'Y' ? 'Y' : 'N']++;
  if (stat.sample.length < 5 && /新莊區/.test(addr) && cap >= 1000000 && nowY - y <= 5) stat.sample.push(line.slice(0, 200));
}
console.log('表頭：', head && head.join(' | '));
console.log(JSON.stringify(stat, null, 1));
// 新莊分公司轄區（新莊、泰山、五股、林口、三重、蘆洲、八里 大概）、獨資合夥、開發票、資本額≥50萬、設立10年內 大概幾筆
console.log('\n完成。');
