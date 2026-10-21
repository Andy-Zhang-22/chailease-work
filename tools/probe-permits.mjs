// 探路（看完就刪）：新北建照 → 起造人名字對稅籍檔，只印家數與分布，不印公司名
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { fetchPermits, PERMIT } from './fetch-industry.mjs';
import { parseLine, taxFields, halfWidth, inCity, districtOf } from './fetch-einv.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const by = await fetchPermits();
const uses = {}; const yms = {}; let multi = 0;
by.forEach((p) => { uses[p.use] = (uses[p.use] || 0) + 1; yms[p.ym] = (yms[p.ym] || 0) + 1; if (p.n > 1) multi += 1; });
console.log(`用途：${JSON.stringify(uses)}；一家多張 ${multi}；發照年月分布：${Object.entries(yms).sort().map(([k, v]) => `${k} ${v}`).join('、')}`);
const res = await fetch('https://eip.fia.gov.tw/data/BGMOPEN1.csv', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
let n = 0; let hit = 0; let inCityHit = 0; let branch = 0; const dist = {}; const caps = []; const seen = new Set();
for await (const line of rl) {
  n++; if (n <= 2) continue;
  const cells = parseLine(line);
  const name = halfWidth(cells[3]);
  const pm = by.get(name); if (!pm) continue;
  const t = taxFields(cells); if (!t) continue;
  hit++;
  if (t.branch) { branch++; continue; }
  const address = halfWidth(cells[0]);
  if (!inCity(address, ['新北市', '臺北市'])) continue;
  if (seen.has(name)) continue; seen.add(name);
  inCityHit++; const d = districtOf(address); dist[d] = (dist[d] || 0) + 1; caps.push(t.capital || 0);
}
caps.sort((a, b) => a - b);
console.log(`稅籍檔 ${n.toLocaleString()} 列；名字對到 ${hit}（分公司 ${branch}）；新北臺北總公司不重複 ${inCityHit} 家（起造人名字 ${by.size} 個）`);
console.log(`區：${Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join('、')}`);
console.log(`資本額：P25 ${caps[Math.floor(caps.length * 0.25)] || 0}、P50 ${caps[Math.floor(caps.length * 0.5)] || 0}、P75 ${caps[Math.floor(caps.length * 0.75)] || 0}；300～6,000 萬的 ${caps.filter((c) => c >= 3e6 && c <= 6e7).length} 家；資本額 0 的 ${caps.filter((c) => !c).length} 家`);
