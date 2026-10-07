'use strict';
/*
 * 產業名單（經濟部公司登記依營業項目別：車輛相關業者）：抓資料腳本的欄位轉換與合併、分頁的卡片資料、加入名單的 CSV、每日新名單的訊號。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz', 'industry']);
const I = w.Industry;
const TODAY = new Date(2026, 11, 5);
const tool = () => import(pathToFileURL(path.join(ROOT, 'tools', 'fetch-industry.mjs')).href);

test('fetch-industry：只留縣市內核准設立的總公司；同統編好幾類合成一家', async () => {
  const t = await tool();
  const base = { 統一編號: '12345678', 公司名稱: '甲運通有限公司', 公司地址: '新北市新莊區中正路1號', 資本總額: '5,000,000', 實收資本額: '4000000', 公司狀態: '核准設立' };
  const r = t.normalize(base, { cities: ['新北市', '臺北市'] });
  assert.deepEqual(r, { taxId: '12345678', name: '甲運通有限公司', address: '新北市新莊區中正路1號', capital: 5000000, paid: 4000000 });
  assert.equal(t.normalize({ ...base, 公司狀態: '解散' }, { cities: ['新北市'] }), null, '不是核准設立');
  assert.equal(t.normalize({ ...base, 公司地址: '桃園市中壢區' }, { cities: ['新北市'] }), null, '縣市外');
  assert.equal(t.normalize({ ...base, 公司名稱: '甲運通有限公司新莊分公司' }, { cities: ['新北市'] }), null, '分公司');
  assert.equal(t.normalize({ ...base, 統一編號: '' }, { cities: ['新北市'] }), null, '沒統編');
  const by = new Map();
  t.addKind(by, r, '汽車貨運業'); t.addKind(by, r, '小客車租賃業'); t.addKind(by, r, '汽車貨運業');
  assert.deepEqual(by.get('12345678').kinds, ['汽車貨運業', '小客車租賃業']);
  assert.deepEqual(t.KINDS.map((k) => k.id), [36719, 36720, 36711, 36715]);
});

test('分頁：卡片資料、剛出現（起算之後才出現）是訊號、加入名單的 CSV 只留重點', () => {
  const r = I.toRecord({ 統編: '12345678', 名稱: '甲運通有限公司', 類別: '汽車貨運業、小客車租賃業', 地址: '新北市新莊區中正路1號', 資本額: '30000000', 首見年月: '202611', 設立日期: '107/05/01', 行業: '汽車貨運', 電話: '02-2222-3333' }, TODAY, '202610');
  assert.deepEqual(r.kinds, ['汽車貨運業', '小客車租賃業']);
  assert.equal(r.capital, 30000000); assert.equal(r.isNew, true); assert.equal(I.whenOf(r), 'm3');
  assert.deepEqual(I.dailyFacts(r).signals, ['車輛業者', '剛做車輛業']);
  const old = I.toRecord({ 統編: '87654321', 名稱: '乙交通有限公司', 類別: '計程車客運業', 地址: '臺北市中山區', 首見年月: '202610' }, TODAY, '202610');
  assert.equal(old.isNew, false); assert.equal(I.whenOf(old), 'base');
  assert.deepEqual(I.dailyFacts(old).signals, ['車輛業者'], '起算時就在名單上的：只是車輛業者');
  assert.equal(I.kindLabel('遊覽車客運業'), '🚌 遊覽車');
  const csv = I.toStandardCsv([r], ['2026-12-06']);
  assert.match(csv, /甲運通有限公司,12345678,,2018,"30,000",02-2222-3333/);
  assert.match(csv, /產業名單：汽車貨運業、小客車租賃業，2026-11 新出現，汽車貨運/);
  assert.match(I.noteFor(old), /^產業名單：計程車客運業$/);
});

test('fetch-industry 第二批：食品只收工廠／製造場所；環保列管分工地、工廠，解除列管與只有廢棄物的不收', async () => {
  const t = await tool();
  assert.deepEqual(t.foodRow({ 公司統一編號: '12345678', 食品業者登錄字號: 'A-1', 登錄項目: '工廠/製造場所' }), { taxId: '12345678', site: 'A-1' });
  assert.equal(t.foodRow({ 公司統一編號: '12345678', 食品業者登錄字號: 'A-2', 登錄項目: '餐飲場所' }), null, '餐廳不收');
  assert.equal(t.foodRow({ 公司統一編號: '', 食品業者登錄字號: 'A-3', 登錄項目: '工廠/製造場所' }), null, '沒統編');
  const env = { uniformno: '23456789', emsno: 'F001', industryname: '其他專門營造業', isair: '0', iswater: '0', iswaste: '1', wastereleasedate: '' };
  assert.deepEqual(t.envRow(env), { taxId: '23456789', site: 'F001', type: 'site', flags: [] });
  assert.equal(t.envRow({ ...env, wastereleasedate: '20260901' }), null, '工地解除列管了');
  assert.deepEqual(t.envRow({ ...env, industryname: '金屬表面處理業', isair: '1', iswater: '1', iswaste: '1' }).flags, ['空污', '水污']);
  assert.equal(t.envRow({ ...env, industryname: '金屬表面處理業', isair: '1', airreleasedate: '20260101' }), null, '空污解除、只剩廢棄物');
  assert.equal(t.envRow({ ...env, industryname: '餐館' }), null, '只有廢棄物的餐廳不收');
  const x = { sites: [{ key: 'F:A-1', type: 'food' }, { key: 'E:F001', type: 'site' }, { key: 'E:F002', type: 'site' }, { key: 'E:F003', type: 'factory', flags: ['空污'] }] };
  assert.equal(t.sitesText(x), '食品工廠 1 處；工地 2 處；列管廠 1 處（空污）');
  const seen = new Map([['F:A-1', '202610'], ['E:F001', '202610'], ['E:F002', '202612'], ['E:F003', '202611']]);
  assert.deepEqual(t.newSiteOf(x, seen, '202610'), { ym: '202612', what: '新工地' });
  assert.equal(t.newSiteOf(x, new Map([['E:F001', '202610']]), '202610'), null, '起算月就有的不算新');
  assert.equal(t.HEAD.slice(-3).join(','), '場所,新場所年月,新場所');
  // 食藥署的 zip 沒有中央目錄：照本地檔頭解
  const zlib = require('node:zlib');
  const data = Buffer.from('公司統一編號,登錄項目\n12345678,工廠/製造場所\n');
  const name = Buffer.from('97_2.csv'); const hdr = Buffer.alloc(30);
  hdr.writeUInt32LE(0x04034b50, 0); hdr.writeUInt16LE(0x808, 6); hdr.writeUInt16LE(8, 8); hdr.writeUInt16LE(name.length, 26);
  assert.equal(t.unzipFirst(Buffer.concat([hdr, name, zlib.deflateRawSync(data), Buffer.alloc(16)])), data.toString());
});

test('分頁：新工地／新廠是訊號、算利率不敏感、寫進加入名單的備註', () => {
  const r = I.toRecord({ 統編: '23456789', 名稱: '丙營造有限公司', 類別: '營造業', 地址: '新北市新莊區', 資本額: '20000000', 首見年月: '202610', 場所: '工地 2 處', 新場所年月: '202611', 新場所: '新工地' }, TODAY, '202610');
  assert.equal(r.sites, '工地 2 處'); assert.equal(I.isNewSite(r), true);
  assert.deepEqual(I.dailyFacts(r).signals, ['營造業（有工地）', '剛有新工地']);
  assert.match(I.noteFor(r), /^產業名單：營造業，2026-11 新工地$/);
  assert.equal(I.kindLabel('食品製造業'), '🍱 食品工廠');
  const f = I.toRecord({ 統編: '34567890', 名稱: '丁食品股份有限公司', 類別: '食品製造業、環保列管工廠', 地址: '臺北市內湖區', 首見年月: '202610', 場所: '食品工廠 1 處；列管廠 1 處（水污）' }, TODAY, '202610');
  assert.deepEqual(I.dailyFacts(f).signals, ['食品工廠', '環保列管工廠']);
  assert.equal(I.isNewSite(f), false);
  const oldSite = I.toRecord({ 統編: '45678901', 名稱: '戊營造', 類別: '營造業', 首見年月: '202610', 新場所年月: '202608', 新場所: '新工地' }, TODAY, '202610');
  assert.equal(I.isNewSite(oldSite), false, '4 個月前的新工地不算剛有');
});
