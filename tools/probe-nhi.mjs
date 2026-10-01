/**
 * 探路：健保署「全民健康保險新成立投保單位資料」（data.gov.tw #26769）。一次性，看完刪。
 * 看：資料集的每個資源（哪幾個月）、ODS 檔多大、zip 裡有什麼、content.xml 長怎樣、幾列、新北市幾列。
 */
import zlib from 'node:zlib';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const show = (t, b) => console.log(`\n=========== ${t} ===========\n${b}`);
const get = (u) => fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180000), redirect: 'follow' });

/** 最小的 zip 讀取：走 central directory，找到檔名就 inflateRaw */
function zipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('不是 zip');
  const n = buf.readUInt16LE(eocd + 10); const cdOff = buf.readUInt32LE(eocd + 16);
  const out = []; let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('central directory 壞了');
    const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20); const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28); const elen = buf.readUInt16LE(p + 30); const clen = buf.readUInt16LE(p + 32); const loff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    out.push({ name, method, csize, usize, loff });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
function zipRead(buf, e) {
  const nlen = buf.readUInt16LE(e.loff + 26); const elen = buf.readUInt16LE(e.loff + 28);
  const start = e.loff + 30 + nlen + elen; const data = buf.subarray(start, start + e.csize);
  return e.method === 0 ? data : zlib.inflateRawSync(data);
}

let dist = [];
try {
  const r = await get('https://data.gov.tw/api/v2/rest/dataset/26769');
  const j = await r.json();
  dist = (j.result && j.result.distribution) || [];
  show('資料集 26769', `${j.result && j.result.title}｜更新：${j.result && j.result.modifiedDate}｜資源 ${dist.length} 個\n` + dist.map((d) => `- ${d.resourceDescription || ''}｜${d.resourceFormat || d.format || ''}｜${d.resourceDownloadUrl || d.downloadURL || ''}｜${d.resourceModified || ''}`).join('\n'));
} catch (e) { show('資料集 26769', `✗ ${e.message}`); }
const urls = dist.map((d) => d.resourceDownloadUrl || d.downloadURL).filter(Boolean);
if (!urls.length) urls.push('https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-B12003-001');
for (const u of urls.slice(0, 2)) {
  try {
    const r = await get(u);
    const buf = Buffer.from(await r.arrayBuffer());
    show(`下載 ${u}`, `HTTP ${r.status} ${r.headers.get('content-type')} ${buf.length} bytes disp=${r.headers.get('content-disposition')} 開頭=${buf.subarray(0, 4).toString('hex')}`);
    if (buf.subarray(0, 2).toString() !== 'PK') { show('  不是 zip，前 600 字', buf.toString('utf8', 0, 600)); continue; }
    const entries = zipEntries(buf);
    show('  zip 內容', entries.map((e) => `${e.name} method=${e.method} ${e.csize}→${e.usize}`).join('\n'));
    const ce = entries.find((e) => e.name === 'content.xml');
    if (!ce) continue;
    const xml = zipRead(buf, ce).toString('utf8');
    show('  content.xml 前 2500 字', xml.slice(0, 2500));
    const rows = xml.match(/<table:table-row[\s\S]*?<\/table:table-row>/g) || [];
    const cellsOf = (row) => [...row.matchAll(/<table:table-cell([^>]*)>([\s\S]*?)<\/table:table-cell>|<table:table-cell([^>]*)\/>/g)].flatMap((m) => {
      const attrs = m[1] || m[3] || ''; const rep = Number((attrs.match(/number-columns-repeated="(\d+)"/) || [])[1] || 1);
      const text = (m[2] || '').replace(/<text:p[^>]*>/g, '').replace(/<\/text:p>/g, '\n').replace(/<[^>]+>/g, '').trim();
      return Array(Math.min(rep, 20)).fill(text);
    });
    show('  列數', `${rows.length}；前 4 列：\n${rows.slice(0, 4).map((r) => cellsOf(r).join(' | ')).join('\n')}`);
    const parsed = rows.map(cellsOf);
    const head = parsed[0] || [];
    const iAddr = head.findIndex((h) => /地址/.test(h));
    const ntpc = parsed.filter((c) => /^(新北市|臺北縣|台北縣)/.test(String(c[iAddr] || '')));
    show('  新北市', `${ntpc.length} 列；前 5：\n${ntpc.slice(0, 5).map((c) => c.join(' | ')).join('\n')}`);
    const months = {}; parsed.slice(1).forEach((c) => { months[c[0]] = (months[c[0]] || 0) + 1; });
    show('  年月分布', JSON.stringify(months));
  } catch (e) { show(`下載 ${u}`, `✗ ${e.message}`); }
}
console.log('\n完成。');
