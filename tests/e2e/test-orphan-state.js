// 清除名單後再匯入同一個檔案，雲端上留著的舊狀態不能回來蓋掉新檔案的下次聯絡日
global.window = global; global.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){} };
require(require('path').resolve(__dirname,'../..')+'/assets/js/sync.js');
const S = window.DriveSync;
let bad = 0; const chk = (ok, m) => { if (!ok) bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };

const T0 = 1000, WIPE = 2000, REIMPORT = 3000;
const rec = (importedAt) => ({ id: 'R1', source: 'A.csv', company: '甲', importedAt, nextDate: null });
const cloud = { records: [rec(T0)], logs: [], states: [{ recordId: 'R1', nextDate: '2026-03-17', updatedAt: T0 + 1 }], tombstones: { logs: {}, sources: {}, records: {} } };

// 本機清除：來源墓碑，本機沒有任何客戶與狀態
const wiped = { records: [], logs: [], states: [], tombstones: { logs: {}, sources: { 'A.csv': WIPE }, records: {} } };
let m = S.mergeDumps(wiped, cloud);
chk(m.records.length === 0, '清除後同步：客戶不回來');
chk(m.states.length === 0, `清除後同步：孤兒狀態一起丟（剩 ${m.states.length}）`);

// 再匯入同一個檔案（同 id），雲端還留著舊狀態
const again = { records: [rec(REIMPORT)], logs: [], states: [], tombstones: wiped.tombstones };
m = S.mergeDumps(again, cloud);
chk(m.records.length === 1, '重新匯入後客戶在');
chk(m.states.length === 0, `重新匯入後舊狀態不會附身回來（剩 ${m.states.length}）`);

// 正常情況：客戶還在，狀態要保留
m = S.mergeDumps({ records: [rec(T0)], logs: [], states: [], tombstones: { logs: {}, sources: {}, records: {} } }, cloud);
chk(m.states.length === 1 && m.states[0].nextDate === '2026-03-17', '客戶還在時狀態照常保留');

// 單筆刪除：records 墓碑，狀態也要跟著走
m = S.mergeDumps({ records: [], logs: [], states: [], tombstones: { logs: {}, sources: {}, records: { R1: WIPE } } }, cloud);
chk(m.records.length === 0 && m.states.length === 0, '單筆刪除後狀態跟著消失');

// 重新匯入後使用者又記了新的狀態（比墓碑新），要留著
m = S.mergeDumps({ records: [rec(REIMPORT)], logs: [], states: [{ recordId: 'R1', nextDate: '2026-12-01', updatedAt: REIMPORT + 5 }], tombstones: wiped.tombstones }, cloud);
chk(m.states.length === 1 && m.states[0].nextDate === '2026-12-01', '清除後新記的狀態（比墓碑新）保留，舊的不回來');

// 舊版時間戳卡住：狀態 updatedAt 在清除之前，但清除之後又記了電話 → 狀態要活著
const staleState = { recordId: 'R1', outcome: 'declined', lastDate: '2026-09-17', updatedAt: T0 + 2 };   // 仍在清除之前
const newLog = { uid: 'L1', recordId: 'R1', text: '真的都不需要', outcome: 'declined', date: '2026-09-17', createdAt: REIMPORT + 10 };
m = S.mergeDumps({ records: [rec(REIMPORT)], logs: [newLog], states: [staleState], tombstones: wiped.tombstones }, cloud);
chk(m.states.length === 1 && m.states[0].outcome === 'declined', `時間戳卡在清除前、但清除後有通話紀錄 → 狀態保留（剩 ${m.states.length}）`);
chk(m.logs.length === 1, '通話紀錄也在');
// 沒有清除後的紀錄，時間戳又在清除前 → 還是死的
m = S.mergeDumps({ records: [rec(REIMPORT)], logs: [], states: [staleState], tombstones: wiped.tombstones }, cloud);
chk(m.states.length === 0, '沒有清除後的紀錄、時間戳又在清除前 → 仍視為舊狀態丟掉');

console.log(bad ? `\n${bad} 項失敗` : '\n全部通過'); process.exit(bad ? 1 : 0);
