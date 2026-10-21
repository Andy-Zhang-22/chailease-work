// 探路第二輪（看完就刪）：起造人名字為什麼只對到兩成？只印樣式統計與各種正規化後的對到家數，不印名字
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { fetchPermits } from './fetch-industry.mjs';
import { parseLine, taxFields, halfWidth, inCity } from './fetch-einv.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const by = await fetchPermits();
const names = [...by.keys()];
const cnt = (re) => names.filter((n) => re.test(n)).length;
console.log(`起造人名字 ${names.length}：有括號 ${cnt(/[()（）]/)}、有「負責人／代表人」${cnt(/負責人|代表人/)}、有空白 ${cnt(/\s/)}、有「等」${cnt(/等/)}、有數字 ${cnt(/\d/)}、有「股份有限公司」${cnt(/股份有限公司/)}、有「有限公司」${cnt(/有限公司/)}、有「建設」${cnt(/建設/)}、有「開發」${cnt(/開發/)}`);
const suf = {}; names.forEach((n) => { const k = n.slice(-4); suf[k] = (suf[k] || 0) + 1; });
console.log(`結尾四字前 12：${Object.entries(suf).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join('、')}`);
const lens = {}; names.forEach((n) => { lens[n.length] = (lens[n.length] || 0) + 1; }); console.log(`長度：${Object.entries(lens).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
// 各種正規化
const norms = {
  原樣: (n) => n,
  去括號: (n) => n.replace(/[(（][^)）]*[)）]/g, '').trim(),
  去括號與空白: (n) => n.replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, ''),
  去負責人後面: (n) => n.replace(/[(（]?(負責人|代表人).*$/, '').replace(/\s+/g, '').trim(),
  去括號空白且台臺同: (n) => n.replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, '').replace(/臺/g, '台'),
};
const want = {}; Object.keys(norms).forEach((k) => { want[k] = new Map(); names.forEach((n) => { const v = norms[k](n); if (v) want[k].set(v, n); }); });
const res = await fetch('https://eip.fia.gov.tw/data/BGMOPEN1.csv', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20 * 60000) });
const rl = readline.createInterface({ input: Readable.fromWeb(res.body) });
let n = 0; const hit = {}; const hitCity = {}; Object.keys(norms).forEach((k) => { hit[k] = new Set(); hitCity[k] = new Set(); });
let taxSuffixSample = {}; let tn = 0;
for await (const line of rl) {
  n++; if (n <= 2) continue;
  const cells = parseLine(line);
  const raw = halfWidth(cells[3]); if (!raw) continue;
  if (tn < 200000) { tn++; const k = raw.slice(-4); taxSuffixSample[k] = (taxSuffixSample[k] || 0) + 1; }
  const variants = { 原樣: raw, 去括號: raw.replace(/[(（][^)）]*[)）]/g, '').trim(), 去括號與空白: raw.replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, ''), 去負責人後面: raw.replace(/[(（]?(負責人|代表人).*$/, '').replace(/\s+/g, '').trim(), 去括號空白且台臺同: raw.replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, '').replace(/臺/g, '台') };
  for (const k of Object.keys(norms)) {
    const orig = want[k].get(variants[k]); if (!orig) continue;
    const t = taxFields(cells); if (!t || t.branch) continue;
    hit[k].add(orig); if (inCity(halfWidth(cells[0]), ['新北市', '臺北市'])) hitCity[k].add(orig);
  }
}
console.log(`稅籍檔 ${n.toLocaleString()} 列；營業人名稱結尾四字前 8（抽 20 萬列）：${Object.entries(taxSuffixSample).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join('、')}`);
Object.keys(norms).forEach((k) => console.log(`${k}：對到 ${hit[k].size} 個名字，其中新北臺北總公司 ${hitCity[k].size}`));
