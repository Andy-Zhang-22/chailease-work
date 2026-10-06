'use strict';
/*
 * 新設工廠（經濟部生產中工廠清冊）：抓資料腳本的欄位轉換、分頁的卡片資料、加入名單的 CSV、每日新名單的訊號。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz', 'factory']);
const F = w.Factory;
const TODAY = new Date(2026, 9, 5);
const tool = () => import(pathToFileURL(path.join(ROOT, 'tools', 'fetch-factory.mjs')).href);

test('fetch-factory：民國日期、產業類別、主要產品、只留縣市內最近登記的生產中工廠', async () => {
  const t = await tool();
  assert.deepEqual(t.rocDate('1150818'), { ym: '202608', roc: '115/08/18' });
  assert.equal(t.rocDate('abc'), null);
  assert.deepEqual(t.industryOf('25金屬製品製造業、29機械設備製造業'), { code: '25', name: '金屬製品製造業' });
  assert.equal(t.productsOf('251金屬模具、259其他金屬製品、"x"'), '金屬模具、其他金屬製品、"x"');
  const base = { 工廠名稱: '甲精密有限公司', 工廠地址: '新北市新莊區中正路1號', 統一編號: '12345678', 工廠組織型態: '有限公司', 工廠登記核准日期: '1150720', 工廠登記狀態: '生產中', 產業類別: '25金屬製品製造業', 主要產品: '251金屬模具' };
  const opts = { cities: ['新北市', '臺北市'], months: 12, now: new Date(2026, 9, 5) };
  const r = t.normalize(base, opts);
  assert.equal(r.taxId, '12345678'); assert.equal(r.ym, '202607'); assert.equal(r.products, '金屬模具'); assert.equal(r.org, '有限公司');
  assert.equal(t.normalize({ ...base, 工廠地址: '桃園市中壢區' }, opts), null, '縣市外');
  assert.equal(t.normalize({ ...base, 工廠登記核准日期: '1130101' }, opts), null, '超過 12 個月');
  assert.equal(t.normalize({ ...base, 統一編號: '' }, opts), null, '沒統編');
  assert.equal(t.normalize({ ...base, 統一編號: '1234567' }, opts).taxId, '01234567', '前面的 0 補回來');
  assert.deepEqual(t.parseCsv('a,b\n"x, y",2\n'), [['a', 'b'], ['x, y', '2']]);
});

test('分頁：卡片資料、組織型態、剛登記工廠是利率不敏感的訊號', () => {
  const r = F.toRecord({ 統編: '12345678', 名稱: '甲精密有限公司', 地址: '新北市新莊區中正路1號', 行業: '金屬製品製造業', 成立日期: '107/05/01', 登記年月: '202608', 電話: '02-2222-3333', 資本額: '30000000', 主要產品: '金屬模具', 組織型態: '有限公司', 工廠數: '2' }, TODAY);
  assert.equal(r.capital, 30000000); assert.equal(r.factories, 2); assert.equal(r.products, '金屬模具');
  assert.equal(F.orgOf(r), 'company'); assert.equal(F.orgOf({ orgType: '獨資', name: '乙工業社' }), 'biz');
  assert.equal(F.whenOf(r), 'm3');
  assert.deepEqual(F.dailyFacts(r).signals, ['剛登記工廠']);
  const old = F.toRecord({ 統編: '87654321', 名稱: '丙有限公司', 地址: '新北市新莊區', 登記年月: '202511', 組織型態: '有限公司' }, TODAY);
  assert.deepEqual(F.dailyFacts(old).signals, []);
  const csv = F.toStandardCsv([r], ['2026-10-06']);
  assert.match(csv, /甲精密有限公司,12345678,,2018,"30,000",02-2222-3333/);
  assert.match(csv, /工廠登記 2026-08 新登記，產品 金屬模具/);   // 只留重點
});
