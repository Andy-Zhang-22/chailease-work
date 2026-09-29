/** 探路第二輪：新北市商業變更／設立清冊 PDF（bms 與 bmsItem）長什麼樣。看完連同 workflow 一起刪。 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
const UA = 'asaaaa-list-updater/1.0 (+https://github.com/Andy-Zhang-22/asaaaa)';
const BASE = 'https://serv.gcis.nat.gov.tw/pub/cmpy/reportAction.do?method=report';
for (const [cls, kind] of [['bmsItem', 'change'], ['bms', 'change'], ['bmsItem', 'setup']]) {
  const name = `376410000A${kind}11508.pdf`;
  const url = `${BASE}&reportClass=${cls}&subPath=11508&fileName=${name}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `/tmp/${cls}-${kind}.pdf`;
    await fs.writeFile(file, buf);
    console.log(`\n== ${cls} ${kind}\n   ${url}\n   HTTP ${r.status} ${r.headers.get('content-type')} ${buf.length} bytes  PDF? ${buf.subarray(0, 5).toString() === '%PDF-'}`);
    if (buf.subarray(0, 5).toString() !== '%PDF-') { console.log(`   內容：${buf.toString('utf8').slice(0, 300)}`); continue; }
    const info = execFileSync('pdfinfo', [file]).toString();
    console.log(`   ${(info.match(/Pages:\s+\d+/) || [])[0]}  ${(info.match(/Page size:[^\n]+/) || [])[0]}`);
    const layout = execFileSync('pdftotext', ['-layout', '-f', '1', '-l', '1', file, '-']).toString();
    console.log(`   第一頁（-layout）：\n${layout.split('\n').slice(0, 45).map((l) => `   | ${l}`).join('\n')}`);
    const tsv = execFileSync('pdftotext', ['-tsv', '-f', '1', '-l', '1', file, '-']).toString().split('\n');
    const words = tsv.slice(1).map((l) => l.split('\t')).filter((c) => c.length >= 12 && c[11] !== '###LINE###' && c[11] !== '###PAGE###' && c[11] !== '###FLOW###' && c[11].trim());
    const heads = words.filter((c) => Number(c[7]) < 200).map((c) => `${c[11]}@${Math.round(Number(c[6]))},${Math.round(Number(c[7]))}`);
    console.log(`   表頭附近的字（字@x,y）：${heads.slice(0, 40).join(' ')}`);
  } catch (e) { console.log(`\n== ${cls} ${kind}\n   ✗ ${e.message}`); }
}
console.log('\n完成。');
