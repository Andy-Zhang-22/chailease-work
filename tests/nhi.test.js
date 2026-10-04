'use strict';
/*
 * 剛開始請人（健保新成立投保單位）：抓資料腳本的 ODS 解析與欄位轉換、分頁的卡片資料、加入名單的 CSV。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz', 'nhi']);
const N = w.Nhi;
const TODAY = new Date(2026, 9, 1);

/** 用 Node 內建的 zlib 做一個最小的 zip（stored 的 mimetype ＋ deflate 的 content.xml），測 zip 讀取 */
function tinyZip(entries) {
  const locals = []; const centrals = []; let off = 0;
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  for (const [name, text, method] of entries) {
    const raw = Buffer.from(text, 'utf8'); const data = method === 8 ? zlib.deflateRawSync(raw) : raw; const nm = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm); off += lh.length + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const cell = (t) => (t === '' ? '<table:table-cell/>' : `<table:table-cell office:value-type="string"><text:p>${t}</text:p></table:table-cell>`);
const row = (cells) => `<table:table-row>${cells.map(cell).join('')}<table:table-cell table:number-columns-repeated="3"/></table:table-row>`;
const XML = `<?xml version="1.0"?><office:document-content><office:body><office:spreadsheet><table:table table:name="工作表1">${[
  row(['年月', '投保單位代號', '單位名稱', '統一編號', '證照地址', '行業別代碼', '行業別中文', '證照核准成立日']),
  row(['202609', '143089043', '名祿實業有限公司', '54867253', '新北市板橋區國慶路１５８巷２０號１０樓', '4582', '運動用品、器材批發業', '20150903']),
  row(['202609', '143087576', '蓮莊香舖', '2198779', '新北市新莊區新樹路４９７巷１１號（１樓）', '4852', '其他全新商品零售業', '20160112']),
  row(['202608', '143045452', '社團法人新北市失能者服務協會', '26655587', '新北市新店區德正街２７巷２９弄８號１樓', '9499', '未分類其他組織', '20110114']),
  row(['202608', '143053749', '安全藥局', '47725933', '臺南市新營區民治路６之５１號', '4751', '藥品及醫療用品零售業', '20151130']),
  row(['202603', '143053758', '宇駿貿易有限公司', '24908600', '新北市新莊區中正路１００號', '4552', '服裝及其配件批發業', '20150814']),
].join('')}</table:table></office:spreadsheet></office:body></office:document-content>`;

test('抓資料腳本：自己讀 zip、解 content.xml、一列轉一列（全形轉半形、7 碼統編補 0、不在縣市的與協會不留、民國日期）', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-nhi.mjs'));
  const buf = tinyZip([['mimetype', 'application/vnd.oasis.opendocument.spreadsheet', 0], ['content.xml', XML, 8]]);
  const rows = m.odsTable(buf);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0].slice(0, 8), ['年月', '投保單位代號', '單位名稱', '統一編號', '證照地址', '行業別代碼', '行業別中文', '證照核准成立日']);
  assert.equal(rows[1].length, 11, '重複的空格展開');
  const head = rows[0];
  const objs = rows.slice(1).map((c) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = c[i] || ''; }); return o; });
  const phones = new Map([['54867253', { tel: '02-2960-0000' }]]);
  const out = objs.map((o) => m.normalize(o, { cities: ['新北市'], phones }));
  assert.deepEqual(out[0], { taxId: '54867253', name: '名祿實業有限公司', address: '新北市板橋區國慶路158巷20號10樓', indCode: '4582', industry: '運動用品、器材批發業', founded: '104/09/03', ym: '202609', tel: '02-2960-0000', capital: '' });
  assert.equal(out[1].taxId, '02198779', '7 碼統編前面補 0'); assert.equal(out[1].address, '新北市新莊區新樹路497巷11號(1樓)'); assert.equal(out[1].tel, '');
  assert.equal(out[2], null, '協會不是做生意的');
  assert.equal(out[3], null, '不在新北市');
  assert.equal(m.toRoc('20151130'), '104/11/30'); assert.equal(m.toRoc('2015113'), ''); assert.equal(m.toRoc(''), '');
  assert.equal(m.monthsAgo('202609', new Date(2026, 9, 1)), 1); assert.equal(m.monthsAgo('202610', new Date(2026, 9, 1)), 0); assert.equal(m.monthsAgo('202603', new Date(2026, 9, 1)), 7);
  assert.equal(m.districtOf('新北市樹林區保安二街53號'), '樹林區');
  assert.deepEqual(m.toRow(out[0]), ['54867253', '名祿實業有限公司', '新北市板橋區國慶路158巷20號10樓', '4582', '運動用品、器材批發業', '104/09/03', '202609', '02-2960-0000', '']);
});

test('分頁：一列 → 卡片資料（投保年月、距今幾個月、成立幾年、組織、分公司）', () => {
  const r = N.toRecord({ 統編: '54867253', 名稱: '名祿實業有限公司', 地址: '新北市新莊區中正路100號', 行業代號: '4582', 行業: '運動用品、器材批發業', 成立日期: '108/09/03', 投保年月: '202609', 電話: '02-2960-0000', 資本額: '12000000' }, TODAY);
  assert.equal(r.taxId, '54867253'); assert.deepEqual(r.ym, { y: 2026, m: 9 }); assert.equal(r.insMonths, 1); assert.equal(N.whenOf(r), 'm3');
  assert.equal(r.years, 7); assert.equal(N.ageOf(r), '5to10'); assert.equal(N.orgOf(r), 'company'); assert.equal(r.capital, 12000000);
  assert.equal(r.branch.key, '新莊分公司'); assert.equal(r.district, '新莊區');
  assert.equal(N.parseYm('11509').y, 2026, '民國年月也收'); assert.equal(N.parseYm('x'), null);
  const b = N.toRecord({ 統編: '', 名稱: '蓮莊香舖', 地址: '新北市新莊區新樹路497巷11號', 行業: '', 成立日期: '', 投保年月: '202603', 電話: '', 資本額: '' }, TODAY);
  assert.equal(N.orgOf(b), 'other'); assert.equal(N.ageOf(b), 'unknown'); assert.equal(N.whenOf(b), 'y1'); assert.equal(b.key, '蓮莊香舖', '沒統編用名稱當鍵');
  assert.equal(N.orgOf(N.toRecord({ 名稱: '慶峰建材行', 投保年月: '202609' }, TODAY)), 'biz');
});

test('分頁：加入名單的 CSV（15 欄標準表頭，電話、成立年、資本額仟元、行業、訪談內容）', () => {
  const r = N.toRecord({ 統編: '54867253', 名稱: '名祿實業有限公司', 地址: '新北市新莊區中正路100號', 行業代號: '4582', 行業: '運動用品、器材批發業', 成立日期: '108/09/03', 投保年月: '202609', 電話: '02-2960-0000', 資本額: '12000000' }, TODAY);
  const csv = N.toStandardCsv([r], ['2026-10-02']);
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], '公司名稱,統編,分級,成立,資本額(仟元),電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家'.replace('資本額(仟元)', '資本額'));
  assert.match(lines[1], /^名祿實業有限公司,54867253,,2019,"12,000",02-2960-0000,,,運動用品、器材批發業,2026-10-02,,/);
  assert.match(N.noteFor(r), /^健保新投保 2026-09（健保署新成立投保單位：剛開始幫員工投保），行業 運動用品、器材批發業，資本額 1,200 萬，成立 2019-09-03$/);
  assert.deepEqual(N.DAILY_PRIORITY, ['利率不敏感', '有電話', '資本額 500～6,000 萬', '我的分公司', '成立 6～10 年', '剛投保 3 個月內']);
});
