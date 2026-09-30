'use strict';
/*
 * sync.js 的合併邏輯（純函式，跟 Google 無關）。
 * 同步合併錯了是最痛的一種 bug：畫面上看起來存好了，同步一次就變回去，而且無聲。
 * 所以重點測「兩邊順序對調結果要一樣」跟「墓碑不會把使用者剛匯入的資料吃掉」。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('./load');

const { DriveSync } = loadModules(['sync']);

// exportedAt 是當下時間，比對前拿掉；陣列順序不影響語意，排好再比
const norm = (d) => ({
  records: [...d.records].sort((a, b) => a.id.localeCompare(b.id)),
  logs: [...d.logs].sort((a, b) => a.uid.localeCompare(b.uid)),
  states: [...d.states].sort((a, b) => a.recordId.localeCompare(b.recordId)),
  tombstones: d.tombstones,
  settings: d.settings,
});

test('mergeTombstones：同一個鍵取比較新的墓碑，兩種格式都吃', () => {
  const a = { records: { r1: 100, r2: 500 }, companies: { c1: { at: 10, name: '甲' } } };
  const b = { records: { r1: 300, r3: 50 }, companies: { c1: { at: 5, name: '甲舊' } } };
  const ab = DriveSync.mergeTombstones(a, b);
  assert.deepEqual(ab.records, { r1: 300, r2: 500, r3: 50 });
  assert.deepEqual(ab.companies, { c1: { at: 10, name: '甲' } });
  assert.deepEqual(DriveSync.mergeTombstones(b, a), ab, '順序對調結果一樣');
  assert.deepEqual(DriveSync.mergeTombstones(null, undefined), { logs: {}, sources: {}, records: {}, companies: {} });
});

test('mergeRegChanges：聯集、同一天同種類算一次、新到舊、壞資料丟掉', () => {
  const left = [{ date: '2025-09-16', kinds: ['capitalUp'] }, { date: '2025-10-08', kinds: ['address'] }];
  const right = [{ date: '2025-09-16', kinds: ['capitalUp'] }, { date: '2025-11-01', kinds: ['owner'] }, { date: '', kinds: ['x'] }, { date: '2025-12-01', kinds: [] }, null];
  const out = DriveSync.mergeRegChanges(left, right);
  assert.deepEqual(out.map((e) => e.date), ['2025-11-01', '2025-10-08', '2025-09-16']);
  assert.deepEqual(DriveSync.regHistoryOf({ regChange: { date: '2025-01-01', kinds: ['other'] } }).length, 1, '舊版單筆 regChange 也收進來');
  assert.deepEqual(DriveSync.regHistoryOf(null), []);
});

test('mergeState：整體取較新，但編輯內容、連結、提醒各看自己的時間戳', () => {
  const a = { recordId: 'r', updatedAt: 10, edits: { phone: '02' }, editsAt: 9, remindAt: '2025-10-01', remindSetAt: 8 };
  const b = { recordId: 'r', updatedAt: 20, outcome: 'contacted' };
  const out = DriveSync.mergeState(a, b);
  assert.equal(out.updatedAt, 20);
  assert.equal(out.outcome, 'contacted');
  assert.deepEqual(out.edits, { phone: '02' }, '另一台只是記了一通電話，不能洗掉這台的編輯');
  assert.equal(out.remindAt, '2025-10-01');
  assert.deepEqual(DriveSync.mergeState(b, a), out, '順序對調結果一樣');

  // 還原（把 edits 清掉）也算一次編輯：editsAt 比較新的那邊沒有 edits，就該沒有
  const restored = DriveSync.mergeState(a, { recordId: 'r', updatedAt: 5, editsAt: 30 });
  assert.equal(restored.edits, undefined);
  assert.equal(restored.editsAt, 30);
});

test('mergeState：每個欄位各自看 fieldAt——手機按的「完成」不會被電腦背景寫的 regAt 整筆蓋掉', () => {
  // 手機 10 點按完成；電腦 10 點 5 分背景查商工登記寫了 regAt（updatedAt 比較新，但沒有 dueDoneOn）
  const phone = { recordId: 'r', updatedAt: 1000, dueDoneOn: '2026-09-30', nextDate: '2026-10-03', fieldAt: { dueDoneOn: 1000, nextDate: 900 } };
  const pc = { recordId: 'r', updatedAt: 1300, regAt: 1300, nextDate: '2026-10-01', fieldAt: { nextDate: 1200 } };
  const out = DriveSync.mergeState(phone, pc);
  assert.equal(out.dueDoneOn, '2026-09-30', '完成要留著');
  assert.equal(out.nextDate, '2026-10-01', '下次聯絡日電腦改得比較晚，用電腦的');
  assert.equal(out.regAt, 1300);
  assert.equal(out.updatedAt, 1300);
  assert.deepEqual(out.fieldAt, { dueDoneOn: 1000, nextDate: 1200 });
  assert.deepEqual(DriveSync.mergeState(pc, phone), out, '順序對調結果一樣');
  // 一邊有 fieldAt、另一邊是舊版沒記：拿記的時間跟另一邊的 updatedAt 比
  const old = { recordId: 'r', updatedAt: 1500, dueDoneOn: '' };
  assert.equal(DriveSync.mergeState(phone, old).dueDoneOn, '', '舊版整筆 1500 比手機 1000 新，照舊版');
  assert.equal(DriveSync.mergeState(phone, { recordId: 'r', updatedAt: 500, dueDoneOn: '' }).dueDoneOn, '2026-09-30');
  // 清掉欄位也算一次改動：fieldAt 比較新、值是 undefined → 合併後沒有
  const cleared = DriveSync.mergeState(phone, { recordId: 'r', updatedAt: 800, fieldAt: { dueDoneOn: 2000 } });
  assert.equal(cleared.dueDoneOn, undefined);
  // 沒有 fieldAt 的舊資料：照整筆取較新
  const legacy = DriveSync.mergeState({ recordId: 'r', updatedAt: 10, outcome: 'x' }, { recordId: 'r', updatedAt: 20, outcome: 'y' });
  assert.equal(legacy.outcome, 'y'); assert.equal(legacy.fieldAt, undefined);
});

test('mergeDumps：找回某天的資料——備份之後、還原之前的刪除不算，之後的刪除照常', () => {
  // 備份時間 100；200 刪了 r1 與整份名單 s2；還原在 300；350 又刪了 r3
  const backup = { records: [{ id: 'r1', source: 's', importedAt: 50 }, { id: 'r2', source: 's2', importedAt: 50 }, { id: 'r3', source: 's', importedAt: 50 }], logs: [], states: [], tombstones: {}, settings: {} };
  const local = {
    records: [{ id: 'r3', source: 's', importedAt: 50 }], logs: [], states: [],
    tombstones: { records: { r1: 200, r3: 350 }, sources: { s2: 200 }, logs: {}, companies: { 'tax:1': { at: 200 }, 'tax:9': { at: 40 } } },
    settings: { 'restore-window': { v: [{ from: 100, to: 300 }], at: 300 } },
  };
  const out = DriveSync.mergeDumps(local, backup);
  const ids = out.records.map((r) => r.id).sort();
  assert.deepEqual(ids, ['r1', 'r2'], 'r1、s2 回來；r3 是還原之後刪的，照刪');
  assert.equal(out.tombstones.records.r1, undefined);
  assert.equal(out.tombstones.sources.s2, undefined);
  assert.equal(out.tombstones.records.r3, 350);
  assert.equal(out.tombstones.companies['tax:1'], undefined, '窗口內刪的公司可以再匯入');
  assert.deepEqual(out.tombstones.companies['tax:9'], { at: 40 }, '備份之前就刪的公司照擋');
  assert.deepEqual(DriveSync.mergeDumps(backup, local).records.map((r) => r.id).sort(), ids, '順序對調結果一樣');
});

test('mergeDumps：兩邊順序對調結果一樣；紀錄靠 uid 去重、改得比較新的贏', () => {
  const a = {
    records: [{ id: 'r1', source: 's', importedAt: 100 }],
    logs: [{ uid: 'l1', recordId: 'r1', createdAt: 100, updatedAt: 300, text: '改過的' }],
    states: [{ recordId: 'r1', updatedAt: 100 }],
    settings: { theme: { at: 1, value: 'dark' } },
  };
  const b = {
    records: [{ id: 'r1', source: 's', importedAt: 100 }, { id: 'r2', source: 's', importedAt: 100 }],
    logs: [{ uid: 'l1', recordId: 'r1', createdAt: 100, updatedAt: 200, text: '舊的' }, { uid: 'l2', recordId: 'r2', createdAt: 150 }],
    states: [{ recordId: 'r2', updatedAt: 100 }],
    settings: { theme: { at: 2, value: 'light' } },
  };
  const ab = DriveSync.mergeDumps(a, b);
  const ba = DriveSync.mergeDumps(b, a);
  assert.deepEqual(norm(ab), norm(ba));
  assert.equal(ab.records.length, 2);
  assert.equal(ab.logs.length, 2);
  assert.equal(ab.logs.find((l) => l.uid === 'l1').text, '改過的', '同一則紀錄取改得比較新的，不是先到先贏');
  assert.equal(ab.states.length, 2);
  assert.equal(ab.settings.theme.value, 'light');
  assert.equal(ab.version, 2);
});

test('mergeDumps：墓碑只擋得住比它舊的匯入，之後再匯入一次就該回來', () => {
  const cloud = { records: [], tombstones: { records: { r1: 200 }, sources: {}, logs: {}, companies: {} } };
  const oldImport = { records: [{ id: 'r1', source: 's', importedAt: 100 }], states: [{ recordId: 'r1', updatedAt: 100 }] };
  const newImport = { records: [{ id: 'r1', source: 's', importedAt: 300 }], states: [{ recordId: 'r1', updatedAt: 300 }] };
  assert.equal(DriveSync.mergeDumps(cloud, oldImport).records.length, 0, '刪掉之後的舊資料不能救回來');
  assert.equal(DriveSync.mergeDumps(cloud, oldImport).states.length, 0, '客戶不在了，狀態也一起丟');
  assert.equal(DriveSync.mergeDumps(cloud, newImport).records.length, 1, '使用者自己又匯入了一次，要留著');
  assert.equal(DriveSync.mergeDumps(cloud, newImport).states.length, 1);
});

test('mergeDumps：整份名單被刪掉、被刪掉的通話紀錄不回來', () => {
  const cloud = { tombstones: { sources: { 'a.pdf': 500 }, logs: { l1: 500 }, records: {}, companies: {} } };
  const local = {
    records: [{ id: 'r1', source: 'a.pdf', importedAt: 100 }, { id: 'r2', source: 'b.pdf', importedAt: 100 }],
    logs: [{ uid: 'l1', recordId: 'r2', createdAt: 100 }, { uid: 'l2', recordId: 'r2', createdAt: 100 }],
  };
  const out = DriveSync.mergeDumps(cloud, local);
  assert.deepEqual(out.records.map((r) => r.id), ['r2']);
  assert.deepEqual(out.logs.map((l) => l.uid), ['l2']);
});

test('mergeDumps：清除名單前建的狀態，之後還在記電話就算活的', () => {
  // 狀態的 updatedAt 卡在清除之前，但清除之後又記了一通電話 → 狀態要留
  const cloud = { tombstones: { records: { r1: 200 }, sources: {}, logs: {}, companies: {} } };
  const local = {
    records: [{ id: 'r1', source: 's', importedAt: 300 }],
    states: [{ recordId: 'r1', updatedAt: 100, outcome: 'contacted' }],
    logs: [{ uid: 'l1', recordId: 'r1', createdAt: 250 }],
  };
  const out = DriveSync.mergeDumps(cloud, local);
  assert.equal(out.states.length, 1);
  assert.equal(out.states[0].outcome, 'contacted');
});

test('diffSummary：這次同步多了幾筆', () => {
  assert.deepEqual(DriveSync.diffSummary({ records: [1], logs: [], states: [] }, { records: [1, 2], logs: [1], states: [] }), { records: 1, logs: 1, states: 0 });
  assert.deepEqual(DriveSync.diffSummary(null, null), { records: 0, logs: 0, states: 0 });
});

test('mergeDumps：同統編的兩筆收成一筆，留最早匯入的，另一筆的通話紀錄與狀態搬過來', () => {
  const { DriveSync } = loadModules(['sync']);
  const old = { id: 'old', source: '每日新名單-2026-09-27.csv', company: '鑫廷織品開發股份有限公司', taxId: '12660104', importedAt: 100 };
  const dup = { id: 'dup', source: '每日新名單-2026-09-29.csv', company: '鑫廷織品開發股份有限公司', taxId: '12660104', importedAt: 200 };
  const other = { id: 'x', source: 'A', company: '同名不同統編', taxId: '11111111', importedAt: 50 };
  const other2 = { id: 'y', source: 'B', company: '同名不同統編', taxId: '22222222', importedAt: 60 };
  const a = { records: [old, other], logs: [{ uid: 'l1', recordId: 'old', createdAt: 150, note: '打過' }], states: [{ recordId: 'old', updatedAt: 150, edits: { phoneRaw: '02 2995 5188' }, editsAt: 150 }], tombstones: {}, settings: {} };
  const b = { records: [dup, other2], logs: [{ uid: 'l2', recordId: 'dup', createdAt: 250, note: '另一台打的' }], states: [{ recordId: 'dup', updatedAt: 260, nextDate: '2026-10-01' }], tombstones: {}, settings: {} };
  const ab = DriveSync.mergeDumps(a, b);
  const ba = DriveSync.mergeDumps(b, a);
  assert.deepEqual(ab.records.map((r) => r.id).sort(), ['old', 'x', 'y'], '同統編留最早的；同名不同統編是兩家，都留');
  assert.deepEqual(ba.records.map((r) => r.id).sort(), ['old', 'x', 'y'], '順序對調結果一樣');
  assert.deepEqual(ab.logs.map((l) => `${l.uid}:${l.recordId}`).sort(), ['l1:old', 'l2:old'], '另一筆的通話紀錄搬到留下的那筆');
  const st = ab.states.find((s) => s.recordId === 'old');
  assert.equal(ab.states.length, 1);
  assert.equal(st.nextDate, '2026-10-01', '狀態合併：比較新的下次聯絡日');
  assert.deepEqual(st.edits, { phoneRaw: '02 2995 5188' }, '編輯過的電話留著');
});

test('mergeRegChanges：兩天各查到一模一樣的變更（另一台沒同步到）只留最新那次；不同內容都留', () => {
  const { DriveSync } = loadModules(['sync']);
  const same = { address: { from: '新北市三重區仁賢街20號5樓', to: '新北市新店區寶興路45巷2弄20號8樓' } };
  const a = [{ date: '2026-09-28', kinds: ['address'], changes: same }];
  const b = [{ date: '2026-09-29', kinds: ['address'], changes: same }, { date: '2026-03-01', kinds: ['capitalUp'], changes: { capital: { from: '1,000', to: '2,000' } } }];
  const out = DriveSync.mergeRegChanges(a, b);
  assert.deepEqual(out.map((e) => e.date), ['2026-09-29', '2026-03-01']);
  const back = [{ date: '2026-09-30', kinds: ['address'], changes: { address: { from: '新北市新店區寶興路45巷2弄20號8樓', to: '新北市三重區仁賢街20號5樓' } } }];
  assert.equal(DriveSync.mergeRegChanges(out, back).length, 3, '搬回去是另一件事，要留');
});
