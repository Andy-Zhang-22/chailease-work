'use strict';
/*
 * 已停業（稅籍停業／非營業中、健保停歇業投保單位）：抓資料腳本的欄位轉換與合併、瀏覽器端的比對。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModules, ROOT } = require('./load');

test('抓資料腳本：稅籍停業／非營業中、健保停歇業各一列轉一列；同統編留最強的；太老的非營業中不留', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-closed.mjs'));
  const now = new Date(2026, 9, 3);
  const cities = ['新北市', '臺北市'];
  assert.deepEqual(m.fromTax({ 營業地址: '新北市新莊區中正路１００號', 統一編號: '22667534', 營業人名稱: '中南生物科技股份有限公司', 設立日期: '1120305', 停業日期: '1150523' }, 'suspended', { cities, now }),
    { taxId: '22667534', name: '中南生物科技股份有限公司', kind: 'suspended', date: '2026/05/23' });
  assert.deepEqual(m.fromTax({ 營業地址: '臺北市中山區南京東路３段６８號', 統一編號: '22609578', 營業人名稱: '雙鶴企業股份有限公司', 設立日期: '0990101' }, 'inactive', { cities, now }),
    { taxId: '22609578', name: '雙鶴企業股份有限公司', kind: 'inactive', date: '' });
  assert.equal(m.fromTax({ 營業地址: '臺北市中山區南京東路3段68號', 統一編號: '22609578', 營業人名稱: 'x', 設立日期: '0800101' }, 'inactive', { cities, now, years: 30 }), null, '設立 35 年前的非營業中不留');
  assert.notEqual(m.fromTax({ 營業地址: '臺北市中山區南京東路3段68號', 統一編號: '22609578', 營業人名稱: 'x', 設立日期: '0800101' }, 'suspended', { cities, now, years: 30 }), null, '停業的不看年紀');
  assert.equal(m.fromTax({ 營業地址: '南投縣草屯鎮中正路1號', 統一編號: '22667534', 營業人名稱: 'x' }, 'suspended', { cities, now }), null, '不在縣市');
  assert.equal(m.fromTax({ 營業地址: '新北市新莊區中正路1號', 統一編號: '1234567', 營業人名稱: 'x' }, 'suspended', { cities, now }), null, '統編不是 8 碼');
  assert.deepEqual(m.fromNhi({ 年月: '202605', 單位名稱: '蓮莊香舖', 統一編號: '2198779', 證照地址: '新北市新莊區新樹路４９７巷１１號', 註銷生效日: '20260531' }, { cities }),
    { taxId: '02198779', name: '蓮莊香舖', kind: 'nhi', date: '2026/05/31' });
  assert.equal(m.fromNhi({ 單位名稱: 'x', 統一編號: '12345678', 證照地址: '臺南市新營區民治路1號' }, { cities }), null);
  const merged = m.merge([[{ taxId: '22667534', name: 'A', kind: 'inactive', date: '' }], [{ taxId: '22667534', name: 'A', kind: 'suspended', date: '2026/05/23' }, null], [{ taxId: '02198779', name: 'B', kind: 'nhi', date: '2026/05/31' }, { taxId: '22667534', name: 'A', kind: 'nhi', date: '2026/06/01' }]]);
  assert.deepEqual(merged, [{ taxId: '02198779', name: 'B', kind: 'nhi', date: '2026/05/31' }, { taxId: '22667534', name: 'A', kind: 'suspended', date: '2026/05/23' }], '同統編留稅籍停業、照統編排');
  assert.deepEqual(m.toRow(merged[1]), ['22667534', 'A', '稅籍停業', '2026/05/23']);
  assert.deepEqual(m.toRow(merged[0]), ['02198779', 'B', '健保投保單位註銷', '2026/05/31']);
  assert.equal(m.dateOf('1150523'), '2026/05/23'); assert.equal(m.dateOf('20260531'), '2026/05/31'); assert.equal(m.dateOf('115052'), ''); assert.equal(m.dateOf(''), '');
  assert.deepEqual(m.HEAD, ['統編', '名稱', '狀態', '日期']);
});

test('瀏覽器端：載停業表、用統編比、沒統編才比名稱、還沒載就當沒停業', async () => {
  const CSV = '﻿統編,名稱,狀態,日期\n22667534,中南生物科技股份有限公司,稅籍停業,2026/05/23\n02198779,蓮莊香舖,健保投保單位註銷,2026/05/31\n';
  const fetchStub = async (url) => (/index\.json/.test(url) ? { ok: true, json: async () => ({ generatedAt: 'x', total: 2 }) } : { ok: true, text: async () => CSV });
  const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'closed'], { fetch: fetchStub });
  const C = w.Closed;
  assert.equal(C.ready(), false); assert.equal(C.of('中南生物科技股份有限公司', '22667534'), null, '還沒載就當沒有');
  await C.ensure();
  assert.equal(C.ready(), true); assert.equal(C.count(), 2);
  assert.deepEqual(C.of('別的名字', '22667534'), { taxId: '22667534', name: '中南生物科技股份有限公司', kind: '稅籍停業', date: '2026/05/23' }, '有統編就比統編');
  assert.equal(C.of('中南生物科技股份有限公司', '11111111'), null, '統編對不到就不比名稱（統編是準的）');
  assert.equal(C.of('蓮莊香舖', '').kind, '健保投保單位註銷', '沒統編才比名稱');
  assert.equal(C.of('不存在的', ''), null);
  assert.equal(C.label(C.of('', '22667534')), '稅籍停業 2026/05/23'); assert.equal(C.label(null), '');
});
