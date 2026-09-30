'use strict';
/*
 * 出進口廠商：抓資料腳本的欄位轉換與篩選、分頁的卡片資料、加入名單的 CSV（電話要帶進去）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz', 'trade']);
const T = w.Trade;
const TODAY = new Date(2026, 9, 1);

test('抓資料腳本：貿易署那一列 → 我們的一列；只留縣市裡的、全形轉半形、日期轉斜線、進出口「有」→ Y', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-trade.mjs'));
  const row = m.parseLine('"00000650","20241114","20250101","毅恆國際有限公司","YI HENG INTERNATIONAL CO., LTD.","新北市八里區文昌三街２３號6樓","No. 23, Wenchang 3rd St.","沈O年","０２-26101234#12","02-26101235","有","無"');
  assert.equal(row.length, 12);
  const r = m.normalize(row, { cities: ['新北市'] });
  assert.deepEqual(r, { taxId: '00000650', name: '毅恆國際有限公司', ename: 'YI HENG INTERNATIONAL CO., LTD.', address: '新北市八里區文昌三街23號6樓', rep: '沈O年', tel: '02-26101234#12', fax: '02-26101235', first: '2024/11/14', issued: '2025/01/01', imp: 'Y', exp: 'N' });
  assert.equal(m.normalize(m.parseLine('"12345678","20241114","20241114","甲公司","","臺北市中山區x路1號","","","02-1","","有","有"'), { cities: ['新北市'] }), null, '不在縣市裡');
  assert.notEqual(m.normalize(m.parseLine('"12345678","20241114","20241114","甲公司","","臺北市中山區x路1號","","","02-1","","有","有"'), { cities: ['臺北市'] }), null, '臺／台都認');
  assert.equal(m.normalize(m.parseLine('"1234567","20241114","20241114","甲公司","","新北市中山區x路1號","","","","","有","有"'), { cities: ['新北市'] }), null, '統編不是 8 碼');
  assert.equal(m.ymd('20241112'), '2024/11/12'); assert.equal(m.ymd('2024111'), ''); assert.equal(m.ymd(''), '');
  assert.equal(m.districtOf('新北市新莊區中正路1號'), '新莊區');
  // 最近 N 個月：原始登記 2025/01 距 2026/10/01 是 21 個月 → 24 個月內留、12 個月內不留
  assert.equal(m.isRecent({ first: '2025/01/01' }, 24, TODAY), true);
  assert.equal(m.isRecent({ first: '2025/01/01' }, 12, TODAY), false);
  assert.equal(m.isRecent({ first: '' }, 24, TODAY), false);
});

test('分頁：trade.csv 一列 → 卡片資料（幾個月前登記、進出口、分公司）', () => {
  const r = T.toRecord({ 統編: '00000650', 名稱: '毅恆國際有限公司', 英文名稱: 'YI HENG', 地址: '新北市新莊區中正路1號', 代表人: '沈O年', 電話: '02-2990-1234', 傳真: '', 原始登記日期: '2026/08/20', 核發日期: '2026/09/10', 進口: 'Y', 出口: 'Y' }, TODAY);
  assert.equal(r.taxId, '00000650');
  assert.equal(r.firstMonths, 1);
  assert.equal(T.whenOf(r), 'm3');
  assert.equal(T.qualOf(r), 'both');
  assert.equal(r.branch.key, '新莊分公司');
  assert.equal(r.district, '新莊區');
  const old = T.toRecord({ 統編: '11111111', 名稱: '乙', 地址: '新北市板橋區x路1號', 電話: '', 原始登記日期: '2025/01/15', 核發日期: '2025/01/15', 進口: 'N', 出口: 'Y' }, TODAY);
  assert.equal(old.firstMonths, 20);
  assert.equal(T.whenOf(old), 'y2');
  assert.equal(T.qualOf(old), 'exp');
  assert.equal(T.monthsSince({ y: 2026, m: 9, d: 15 }, TODAY), 0, '不足一個月算 0');
});

test('加入名單的 CSV：電話、代表人、地址、備註都帶；跟主站的標準欄位對齊', () => {
  const r = T.toRecord({ 統編: '00000650', 名稱: '毅恆國際有限公司', 英文名稱: 'YI HENG', 地址: '新北市新莊區中正路1號', 代表人: '沈O年', 電話: '02-2990-1234', 傳真: '02-2990-1235', 原始登記日期: '2026/08/20', 核發日期: '2026/09/10', 進口: 'Y', 出口: 'Y' }, TODAY);
  const csv = T.toStandardCsv([r], ['2026-10-02']);
  const lines = csv.replace(/^﻿/, '').trim().split('\n');
  assert.equal(lines[0], '公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家');
  assert.match(lines[1], /^毅恆國際有限公司,00000650,,,,02-2990-1234,沈O年,,,2026-10-02,,出進口廠商登記（貿易署）：進口＋出口，原始登記 2026-08-20，最近異動 2026-09-10，傳真 02-2990-1235，YI HENG，代表人是貿易署公開檔/);
  assert.match(lines[1], /,新北市新莊區中正路1號,\d{4}-\d{2}-\d{2},$/);
});
