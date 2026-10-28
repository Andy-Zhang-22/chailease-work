// tools/hiring-104.py prepare：候選池不是今天的，先等雲端硬碟同步再判斷（版本 395）。
// 全部假資料：假公司名、假統編，同步檔放在暫存資料夾。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'hiring-104.py');
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HEAD = '公司名稱,地址';
const pool = (d) => ({
  day: d, at: Date.now(), head: HEAD,
  list: [{ key: '12345678', name: '測試甲有限公司', src: 'test', row: '測試甲有限公司,新北市新莊區假路1號' }],
});
const syncFile = (settings) => ({ settings, records: [], logs: [], states: {}, tombstones: [] });
const withPool = (d, extra = {}) => syncFile({ 'hiring-candidates': { v: JSON.stringify(pool(d)), at: Date.now() }, ...extra });

function tmpSync(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiring104-'));
  const f = path.join(dir, 'sync.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}

function prepare(file, args) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn('python3', [TOOL, '--sync', file, 'prepare', ...args]);
    let out = '';
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    p.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
  });
}

test('候選池一開始是昨天的，等的時候同步檔換成今天的 → 照查', async () => {
  const f = tmpSync(withPool(day(-1)));
  const run = prepare(f, ['--wait', '6', '--poll', '0.5']);
  setTimeout(() => fs.writeFileSync(f, JSON.stringify(withPool(day(0)))), 1200);
  const r = await run;
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /等雲端硬碟同步中/);
  assert.match(r.out, /候選 1 家/);
});

test('等到時間到還是昨天的 → 說今天沒有候選池', async () => {
  const f = tmpSync(withPool(day(-1)));
  const r = await prepare(f, ['--wait', '1.5', '--poll', '0.5']);
  assert.match(r.out, /今天（.*）沒有候選池/);
  assert.ok(r.ms >= 900, `應該有等（${r.ms} ms）`);
});

test('候選池本來就是今天的 → 不等', async () => {
  const f = tmpSync(withPool(day(0)));
  const r = await prepare(f, ['--wait', '30', '--poll', '10']);
  assert.match(r.out, /候選 1 家/);
  assert.doesNotMatch(r.out, /等雲端硬碟同步中/);
});

test('今天已經查過（候選池是舊的）→ 不等，直接說查過了', async () => {
  const done = { 'hiring-results': { v: JSON.stringify({ at: Date.now(), list: [{ key: '12345678', count: 0, at: Date.now() }] }), at: Date.now() } };
  const f = tmpSync(withPool(day(-1), done));
  const r = await prepare(f, ['--wait', '30', '--poll', '10']);
  assert.match(r.out, /今天查過了/);
  assert.ok(r.ms < 5000, `不該等（${r.ms} ms）`);
});
