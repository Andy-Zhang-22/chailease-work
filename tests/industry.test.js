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
