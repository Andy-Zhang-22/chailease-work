'use strict';
/*
 * 剛開電子發票（財政部導入電子發票營業人清單）：抓資料腳本的欄位轉換、首見年月（誰是剛導入）、稅籍對欄、留誰；
 * 分頁的卡片資料、加入名單的 CSV、備註。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz', 'einv']);
const E = w.Einv;
const TODAY = new Date(2026, 10, 3);   // 2026/11/03

test('抓資料腳本：清單一列轉一列（全形轉半形、不在縣市的、協會、分公司不留）、稅籍對欄、民國日期', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-einv.mjs'));
  const cities = ['新北市', '臺北市'];
  assert.deepEqual(m.normalize({ 營業人統編: '22667534', 營業人名稱: '中南生物科技股份有限公司', 屬性: 'B2B', 地址: '新北市新莊區中正路１００號' }, { cities }),
    { taxId: '22667534', name: '中南生物科技股份有限公司', kind: 'B2B', address: '新北市新莊區中正路100號' });
  assert.equal(m.normalize({ 營業人統編: '22667534', 營業人名稱: '中南生物科技股份有限公司', 屬性: 'B2B', 地址: '南投縣草屯鎮中正路1205號' }, { cities }), null, '不在縣市');
  assert.equal(m.normalize({ 營業人統編: '00000764', 營業人名稱: '全家便利商店股份有限公司第一二二分公司', 屬性: 'B2C', 地址: '台北市中山區南京東路3段68號' }, { cities }), null, '分公司不留');
  assert.equal(m.normalize({ 營業人統編: '26655587', 營業人名稱: '社團法人新北市失能者服務協會', 屬性: 'B2C', 地址: '新北市新店區德正街27巷29弄8號' }, { cities }), null, '協會不留');
  assert.equal(m.normalize({ 營業人統編: '1234567', 營業人名稱: '七碼統編有限公司', 屬性: 'B2B', 地址: '新北市新莊區中正路1號' }, { cities }), null, '統編不是 8 碼');
  assert.equal(m.normalize({ 營業人統編: '22609578', 營業人名稱: '雙鶴企業股份有限公司', 屬性: 'B2C', 地址: '臺北市中山區南京東路３段６８號１６樓' }, { cities }).address, '臺北市中山區南京東路3段68號16樓');
  // 稅籍那一列：營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,使用統一發票,行業代號,名稱,…
  assert.deepEqual(m.taxFields(['新北市新莊區中正路100號', '22667534', '', '中南生物科技股份有限公司', '12000000', '1120305', '股份有限公司', 'Y', '464915', '醫療機械設備批發', '', '', '', '', '', '']),
    { branch: false, founded: '112/03/05', org: '股份有限公司', capital: 12000000, indCode: '464915', industry: '醫療機械設備批發', invoice: 'Y' });
  assert.equal(m.taxFields(['x', '00000764', '00000434', '全家', '0', '1000101', '股份有限公司', 'Y', '', '', '', '', '', '', '', '']).branch, true, '有總機構統編＝分公司');
  assert.equal(m.rocOf('1120305'), '112/03/05'); assert.equal(m.rocOf('112035'), ''); assert.equal(m.rocOf(''), '');
  assert.equal(Math.round(m.yearsSinceRoc('112/03/05', TODAY) * 10) / 10, 3.7); assert.equal(m.yearsSinceRoc('', TODAY), null);
  assert.equal(m.ymOf(TODAY), '202611');
  assert.equal(m.districtOf('新北市樹林區保安二街53號'), '樹林區');
});

test('抓資料腳本：首見表——第一次全記起算月、之後新出現的才是剛導入；留剛導入的或成立幾年內的', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-einv.mjs'));
  const first = m.updateSeen(new Map(), ['A', 'B', 'C'], '202610', '');
  assert.equal(first.baseline, '202610'); assert.equal(first.newIds.size, 0, '第一次沒有剛導入');
  assert.deepEqual([...first.seen.entries()], [['A', '202610'], ['B', '202610'], ['C', '202610']]);
  const next = m.updateSeen(first.seen, ['A', 'C', 'D'], '202611', first.baseline);
  assert.equal(next.baseline, '202610'); assert.deepEqual([...next.newIds], ['D']);
  assert.equal(next.seen.get('B'), '202610', '這個月沒出現的還留著（之後回來不算新）'); assert.equal(next.seen.get('D'), '202611');
  const now = TODAY;
  assert.equal(m.keep({ isNew: true, founded: '' }, { years: 3, now }), true, '剛導入的一律留');
  assert.equal(m.keep({ isNew: false, founded: '112/03/05' }, { years: 3, now }), false, '3.7 年前成立、起算時已導入：不留');
  assert.equal(m.keep({ isNew: false, founded: '112/03/05' }, { years: 5, now }), true);
  assert.equal(m.keep({ isNew: false, founded: '114/09/01' }, { years: 3, now }), true);
  assert.equal(m.keep({ isNew: false, founded: '' }, { years: 3, now }), false, '稅籍沒對到、也不是剛導入：不留');
  assert.deepEqual(m.toRow({ taxId: '22667534', name: '中南生物科技股份有限公司', kind: 'B2B', address: '新北市新莊區中正路100號', firstYm: '202611', founded: '112/03/05', org: '股份有限公司', capital: 12000000, indCode: '464915', industry: '醫療機械設備批發', invoice: 'Y', tel: '02-2960-0000' }),
    ['22667534', '中南生物科技股份有限公司', 'B2B', '新北市新莊區中正路100號', '202611', '112/03/05', '股份有限公司', 12000000, '464915', '醫療機械設備批發', 'Y', '02-2960-0000']);
  assert.deepEqual(m.HEAD, ['統編', '名稱', '屬性', '地址', '首見年月', '設立日期', '組織別', '資本額', '行業代號', '行業', '開發票', '電話']);
});

const ROW = { 統編: '22667534', 名稱: '中南生物科技股份有限公司', 屬性: 'B2B', 地址: '新北市新莊區中正路100號', 首見年月: '202611', 設立日期: '112/03/05', 組織別: '股份有限公司', 資本額: '12000000', 行業代號: '464915', 行業: '醫療機械設備批發', 開發票: 'Y', 電話: '02-2960-0000' };

test('分頁：一列 → 卡片資料（首見年月、剛導入、距今幾個月、成立幾年、組織、分公司）', () => {
  const r = E.toRecord(ROW, TODAY, '202610');
  assert.equal(r.taxId, '22667534'); assert.equal(r.kind, 'B2B'); assert.deepEqual(r.ym, { y: 2026, m: 11 }); assert.equal(r.isNew, true, '首見 202611 晚於起算 202610');
  assert.equal(r.firstMonths, 0); assert.equal(E.whenOf(r), 'new');
  assert.equal(r.years, 3); assert.equal(E.ageOf(r), 'lt5'); assert.equal(E.orgOf(r), 'company'); assert.equal(r.capital, 12000000); assert.equal(r.org, '股份有限公司');
  assert.equal(r.branch.key, '新莊分公司'); assert.equal(r.district, '新莊區');
  const base = E.toRecord({ ...ROW, 首見年月: '202610' }, TODAY, '202610');
  assert.equal(base.isNew, false, '首見＝起算月：只知道起算時已導入'); assert.equal(E.whenOf(base), 'base');
  const old = E.toRecord({ ...ROW, 首見年月: '202604' }, TODAY, '202603');
  assert.equal(old.isNew, true); assert.equal(old.firstMonths, 7); assert.equal(E.whenOf(old), 'old');
  assert.equal(E.whenOf(E.toRecord({ ...ROW, 首見年月: '202609' }, TODAY, '202603')), 'm3');
  const b = E.toRecord({ 統編: '', 名稱: '蓮莊香舖', 屬性: 'B2C', 地址: '新北市新莊區新樹路497巷11號', 首見年月: '202611', 設立日期: '', 組織別: '獨資', 資本額: '', 電話: '' }, TODAY, '202610');
  assert.equal(E.orgOf(b), 'other'); assert.equal(E.ageOf(b), 'unknown'); assert.equal(b.key, '蓮莊香舖', '沒統編用名稱當鍵');
  assert.equal(E.toRecord(ROW, TODAY, '').isNew, false, '沒有起算月就當都不是剛導入');
});

test('分頁：加入名單的 CSV（15 欄標準表頭）、備註、每日挑選的優先順序', () => {
  const r = E.toRecord(ROW, TODAY, '202610');
  const csv = E.toStandardCsv([r], ['2026-11-04']);
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], '公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家');
  assert.match(lines[1], /^中南生物科技股份有限公司,22667534,,2023,"12,000",02-2960-0000,,,醫療機械設備批發,2026-11-04,,/);
  assert.equal(E.noteFor(r), '電子發票 2026-11（財政部導入電子發票營業人清單：剛導入，B2B），行業 醫療機械設備批發，資本額 1,200 萬，成立 2023-03-05');
  assert.match(E.noteFor(E.toRecord({ ...ROW, 首見年月: '202610' }, TODAY, '202610')), /^電子發票 2026-10（財政部導入電子發票營業人清單：起算時已導入，B2B）/);
  assert.deepEqual(E.DAILY_PRIORITY, ['利率不敏感', '有電話', '資本額 500～6,000 萬', '我的分公司', '成立 6～10 年', '剛導入 3 個月內']);
});
