'use strict';
/*
 * 政府標案得標（g0v 標案 API 的決標公告）：分頁的卡片資料、組織型態、剛得標的訊號、加入名單的 15 欄（版本 378）。
 * 抓資料腳本（tools/fetch-pcc.mjs）的解析另外在下面測，資料是假的、照探路看到的鍵名寫。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz', 'pcc']);
const P = w.Pcc;
const TODAY = new Date(2026, 9, 24);
const row = { 統編: '12345678', 名稱: '甲營造有限公司', 組織型態: '公司登記', 地址: '新北市新莊區中正路1號', 電話: '02-2222-3333', 最近決標日: '2026-10-23', 標案名稱: '某國小校舍整修工程', 招標機關: '新北市政府教育局', 決標金額: '12500000', 得標件數: '2', 首次決標日: '2026-08-05', 案號: '1150923-1', 成立日期: '107/05/01', 資本額: '30000000' };

test('分頁：卡片資料、組織型態、剛得標是利率不敏感的訊號', () => {
  const r = P.toRecord(row, TODAY);
  assert.equal(r.capital, 30000000); assert.equal(r.awards, 2); assert.equal(r.amount, 12500000);
  assert.deepEqual(r.ym, { y: 2026, m: 10, d: 23 }); assert.equal(r.regMonths, 0);
  assert.equal(P.orgOf(r), 'company'); assert.equal(P.orgOf({ orgType: '商業登記', name: '乙工程行' }), 'biz'); assert.equal(P.orgOf({ orgType: '財團法人', name: '丙基金會' }), 'other');
  assert.equal(P.whenOf(r), 'm3');
  assert.deepEqual(P.dailyFacts(r).signals, ['剛得標（1,250 萬）']);
  assert.equal(P.dailyFacts(r).mobile, false);
  const old = P.toRecord({ ...row, 統編: '87654321', 最近決標日: '2026-03-01' }, TODAY);
  assert.deepEqual(P.dailyFacts(old).signals, []);
  assert.equal(P.whenOf(old), 'y1');
  assert.deepEqual(P.parseYm('115/10/23'), { y: 2026, m: 10, d: 23 });
  assert.deepEqual(P.parseYm('202610'), { y: 2026, m: 10 });
});

test('加入名單：15 欄只填對得上的，備註放標案名稱、招標機關、決標金額、決標日期', () => {
  const r = P.toRecord(row, TODAY);
  const csv = P.toStandardCsv([r], ['2026-10-27']);
  const lines = csv.replace(/^﻿/, '').split('\n');
  assert.equal(lines[0], '公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家');
  assert.match(csv, /^甲營造有限公司,12345678,,2018,"30,000",02-2222-3333,,,,2026-10-27,,/m);   // 分級、負責人、KEYMAN、產業別留空
  assert.equal(P.noteFor(r), '政府標案得標 2026-10-23，某國小校舍整修工程，招標機關 新北市政府教育局，決標 1,250 萬，共 2 件');
  assert.match(csv, /新北市新莊區中正路1號,\d{4}-\d{2}-\d{2},$/m);
});

test('合併頁的那一句', () => {
  const r = P.toRecord(row, TODAY);
  const f = P.cardFacts(r);
  assert.equal(f.info, '2026/10/23 得標 新北市政府教育局「某國小校舍整修工程」，決標 1,250 萬');
  assert.equal(f.ym, '2026-10'); assert.equal(f.tel, '02-2222-3333'); assert.equal(f.capital, 30000000);
});

test('近三件（版本 425）：JSON 那格 → 最近的在前、最多三件；舊檔沒有這欄就是空的；抓取程式一天一天累積', async () => {
  const r = P.toRecord({ ...row, 近三件: JSON.stringify([['2026-08-05', '舊工程', '某局', '3000000'], ['2026-10-23', '新工程', '某署', '12500000'], ['2025-01-01', '更舊', '某所', '100'], ['2024-01-01', '最舊', '某所', '1']]) }, TODAY);
  assert.deepEqual(r.recent.map((x) => [x.ym.y, x.ym.m, x.ym.d, x.tender, x.amount]), [[2026, 10, 23, '新工程', 12500000], [2026, 8, 5, '舊工程', 3000000], [2025, 1, 1, '更舊', 100]]);
  assert.deepEqual(P.toRecord(row, TODAY).recent, []);
  assert.deepEqual(P.toRecord({ ...row, 近三件: '壞掉的' }, TODAY).recent, []);
  // 抓取程式：舊列沒有近三件 → 用它那一標當第一件；再得一標接上、照日期排、只留三件；重複案件不算
  const { spawnSync } = require('node:child_process');
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('fp', ${JSON.stringify(path.join(ROOT, 'tools', 'fetch-pcc.py'))}); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
head = [h for h in m.HEAD if h != '近三件']
prev = [['12345678', '甲營造有限公司', '公司登記', '新北市新莊區中正路1號', '02-2222-3333', '2026-10-01', '甲工程', '某局', '5000000', '1', '2026-10-01', 'A-1', '', '']]
def win(date, tender, amount, case):
    return {'tax': '12345678', 'name': '甲營造有限公司', 'org': '公司登記', 'address': '新北市新莊區中正路1號', 'tel': '02-2222-3333', 'amount': amount, 'award': {'date': date, 'tender': tender, 'agency': '某署', 'case_no': case, 'total': amount, 'key': 'U|' + case}}
by, cases, st = m.merge_rows(head, prev, set(), [win('2026-10-20', '乙工程', 8000000, 'B-2'), win('2026-09-15', '丙工程', 100, 'C-3'), win('2026-10-25', '丁工程', 900, 'D-4'), win('2026-10-20', '乙工程', 8000000, 'B-2')], '2026-10-26')
o = by['12345678']
print(json.dumps({'recent': json.loads(o['近三件']), 'awards': o['得標件數'], 'latest': o['標案名稱'], 'dup': st['dup']}, ensure_ascii=False))
`;
  const out = spawnSync('python3', ['-c', py], { encoding: 'utf-8' });
  assert.equal(out.status, 0, out.stderr);
  const got = JSON.parse(out.stdout.trim());
  assert.deepEqual(got.recent.map((x) => [x[0], x[1], x[3]]), [['2026-10-25', '丁工程', '900'], ['2026-10-20', '乙工程', '8000000'], ['2026-10-01', '甲工程', '5000000']]);
  assert.equal(got.awards, '4'); assert.equal(got.latest, '丁工程'); assert.equal(got.dup, 1);
});
