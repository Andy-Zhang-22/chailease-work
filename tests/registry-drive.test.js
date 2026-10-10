'use strict';
/*
 * 後台商工登記更新（tools/registry-drive.mjs）：比對、分類、套進同步檔的純邏輯。
 * 跟瀏覽器裡的 registryBatch／classifyRegistryChanges／recordRegistryChecks／applyRegistryDiffs 同一套規則。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModules, ROOT } = require('./load');

test('比對與分類：查到不一樣就算差異；原本空白的不算變更登記；實收對齊不算增資', async () => {
  const m = await import(path.join(ROOT, 'tools', 'registry-drive.mjs'));
  const rec = { id: 'a', company: '甲公司', taxId: '12345678', capital: '10,000', capitalPaid: '', owner: '王小明', address: '新北市新莊區中正路1號', founded: '2010' };
  const data = { taxId: '12345678', capital: '20,000', capitalPaid: '10,000', owner: '王大明', address: '新北市新莊區中正路1號', founded: '2010/05/01', regChanged: '2026/09/01' };
  const ch = m.diffFields(m.viewOf(rec, null), data);
  assert.deepEqual(Object.keys(ch).sort(), ['capital', 'capitalPaid', 'owner', 'regChanged']);
  assert.equal(ch.founded, undefined, '成立年只比西元年');
  // 資本總額 10,000→20,000 但實收剛好 10,000：舊值等於實收，是欄位對齊，不算增資
  assert.deepEqual(m.classify(ch, m.viewOf(rec, null)), ['owner']);
  const ch2 = m.diffFields(m.viewOf(rec, { edits: { capitalPaid: '5,000' } }), data);
  assert.deepEqual(m.classify(ch2, m.viewOf(rec, { edits: { capitalPaid: '5,000' } })), ['capitalUp', 'owner'], '編輯過的值當成名單現值');
  // 舊資料的地址寫「104登記：… / 公司登記：…」：登記地址取公司登記那段，跟查到的一樣就不算差異（第一次後台跑出來的假差異）
  const legacy = { ...rec, address: '104登記：新北市新莊區中正路9號 / 公司登記：新北市新莊區中正路1號' };
  assert.equal(m.diffFields(m.viewOf(legacy, null), data).address, undefined, '登記地址只比「公司登記」那段');
  const legacy2 = { ...rec, address: '公司登記：新北市新莊區中正路1號' };
  assert.equal(m.diffFields(m.viewOf(legacy2, null), data).address, undefined, '只有「公司登記：」前綴的也拆掉');
  assert.equal(m.diffFields(m.viewOf({ ...rec, address: '新北市新莊區中正路2號' }, null), data).address.to, '新北市新莊區中正路1號', '真的不一樣還是算');
});

test('套進同步檔：edits／editsAt、regAt、regChanges 往上加、查不到記 regError、registry-auto-last 設成今天', async () => {
  const m = await import(path.join(ROOT, 'tools', 'registry-drive.mjs'));
  const { DriveSync } = loadModules(['sync']);
  const dump = { version: 2, records: [{ id: 'a', company: '甲', taxId: '1' }, { id: 'b', company: '乙', taxId: '2' }],
    logs: [], tombstones: {}, settings: { 'registry-mirror': { v: '1', at: 1 } },
    states: [{ recordId: 'a', updatedAt: 100, edits: { keyman: '小陳' }, editsAt: 100, regChanges: [{ date: '2026-01-01', kinds: ['address'], changes: {} }] }] };
  const results = [
    { recordId: 'a', company: '甲', ok: true, view: { company: '甲', capital: '10,000', owner: '王' }, changes: { capital: { from: '10,000', to: '30,000' }, owner: { from: '王', to: '李' } }, regChanged: '115/09/20', status: '核准設立' },
    { recordId: 'b', company: '乙', ok: false, reason: '查無資料\n第二行' },
    { recordId: 'c', company: '丙', ok: true, view: { company: '丙', capital: '', owner: '' }, changes: {}, status: '解散' },
  ];
  dump.records.push({ id: 'c', company: '丙', taxId: '3' });
  const out = m.applyResults(dump, results, { now: 5000, today: '2026-09-29', mergeRegChanges: DriveSync.mergeRegChanges, regHistoryOf: DriveSync.regHistoryOf });
  const a = out.states.find((s) => s.recordId === 'a'); const b = out.states.find((s) => s.recordId === 'b');
  assert.deepEqual(a.edits, { keyman: '小陳', capital: '30,000', owner: '李' }, '原本的編輯留著，登記的差異蓋上去');
  assert.equal(a.editsAt, 5000); assert.equal(a.regAt, 5000); assert.equal(a.updatedAt, 5000);
  assert.equal(a.regChanges.length, 2); assert.deepEqual(a.regChanges[0], { date: '2026-09-20', kinds: ['capitalUp', 'owner'], changes: { capital: { from: '10,000', to: '30,000' }, owner: { from: '王', to: '李' } } }, '日期是登記的最近異動日期（115/09/20），不是跑的那天 9/29');
  assert.deepEqual(a.regChange, a.regChanges[0]);
  assert.equal(b.regAt, 5000); assert.equal(b.regError, '查無資料');
  assert.equal(a.regStatus, '核准設立', '登記現況記進追蹤狀態');
  const c = out.states.find((s) => s.recordId === 'c'); assert.equal(c.regStatus, '解散');
  assert.match(m.CLOSED_RE.source, /解散/); assert.ok(m.CLOSED_RE.test('解散') && m.CLOSED_RE.test('歇業/撤銷') && !m.CLOSED_RE.test('核准設立'), 'CLOSED_RE 認得解散、歇業，不認核准設立');
  const rep = m.buildReport({ mode: 'write', today: '2026-09-29', results, diffs: [results[0]], failed: [results[1]], missing: [], seconds: 3 });
  assert.match(rep, /1 筆登記現況不是營業中/); assert.match(rep, /丙：解散/); assert.doesNotMatch(rep, /甲：核准設立/);
  assert.equal(out.settings['registry-auto-last'].v, '2026-09-29'); assert.match(out.settings['registry-auto-summary'].v, /更新 1 筆，1 筆查不到/);
  assert.equal(out.edited, 1);
  assert.equal(dump.states[0].edits.capital, undefined, '不改原本的 dump');
  // 跟雲端最新版合併：後台的狀態時間比較新，會贏；名單本身從雲端來
  const merged = DriveSync.mergeDumps(dump, { ...out, records: [], logs: [] });
  assert.equal(merged.records.length, 3);
  assert.equal(merged.states.find((s) => s.recordId === 'a').edits.capital, '30,000');
});

test('報告：筆數在第一行，明細列公司與欄位前後值，太長會截', async () => {
  const m = await import(path.join(ROOT, 'tools', 'registry-drive.mjs'));
  const diffs = [{ company: '甲', view: { capital: '1,000' }, changes: { capital: { from: '1,000', to: '2,000' } } }];
  const text = m.buildReport({ mode: 'report', today: '2026-09-29', results: [1, 2], diffs, failed: [{ company: '乙', reason: '查無資料\n第二行' }], missing: [1], seconds: 12 });
  assert.match(text.split('\n')[0], /^2026-09-29 後台商工登記更新（只列差異、沒套用）：查 2 筆，12 秒；1 筆跟登記不一致，1 筆查不到（1 筆登記上真的沒有）/);
  assert.match(text, /• 甲（增資）：資本總額（仟元） 1,000 → 2,000/);
  assert.match(text, /• 乙：查無資料$/m);
  const big = m.buildReport({ mode: 'write', today: '2026-09-29', results: [], diffs: Array.from({ length: 400 }, (_, i) => ({ company: `公司${i}`, view: {}, changes: { address: { from: '舊地址'.repeat(5), to: '新地址'.repeat(5) } } })), failed: [], missing: [], seconds: 1 });
  assert.ok(big.length <= 12100 && /太長，後面略/.test(big));
});

test('防呆：查到的核准變更日期比名單上的舊（鏡像的舊快照），整筆不套用', async () => {
  const m = await import(path.join(ROOT, 'tools', 'registry-drive.mjs'));
  assert.equal(m.regDateMs('2026/09/17'), Date.UTC(2026, 8, 17)); assert.equal(m.regDateMs('115/09/17'), Date.UTC(2026, 8, 17)); assert.equal(m.regDateMs(''), 0);
  const r = { company: '甲', address: '新北市新莊區富貴路568號6樓', regChanged: '2026/09/17' };
  const old = { address: '新北市新莊區富貴路562號6樓', regChanged: '2026/01/21' };
  assert.equal(m.staleRegistry(r, old), true);
  assert.deepEqual(m.diffFields(r, old), {}, '舊快照一個欄位都不動');
  const newer = { address: '新北市新莊區富貴路570號', regChanged: '2026/10/01' };
  assert.equal(m.staleRegistry(r, newer), false);
  assert.deepEqual(Object.keys(m.diffFields(r, newer)).sort(), ['address', 'regChanged']);
  assert.equal(m.staleRegistry({ company: '沒查過' }, old), false, '名單上沒有日期就沒得比，照常套用');
});
