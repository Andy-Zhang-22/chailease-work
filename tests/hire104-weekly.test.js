// tools/hire104-weekly.py（版本 405）：104 徵才中每週候選池。全部假資料：假公司名、假統編、假電話（四碼相同），檔案放暫存資料夾。
// 測：write 對稅籍檔（同名挑縣市、兩家以上不猜、外商分公司去後綴）、排除已在名單與刪過的、資本額門檻、沒電話不收、排序、寫回同步檔不動其他鍵；
//     prepare 這週抓過就不抓；接收器只收 104 來源＋對的暗號、收到就關。
// 版本 406：接收器多一頁 /recv.html（104 網頁開它、postMessage 給它，它再同源 POST），網頁程式先放按鈕、點了才開始。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'hire104-weekly.py');
const PORT = 18765 + Math.floor(Math.random() * 500);

function run(args, env = {}) {
  return new Promise((resolve) => {
    const p = spawn('python3', [TOOL, ...args], { env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hire104-'));
  const work = path.join(dir, 'work');
  fs.mkdirSync(path.join(dir, 'root', 'leads', 'trade'), { recursive: true });
  // 公開名單的電話（統編 → 電話）；丁四沒電話
  fs.writeFileSync(path.join(dir, 'root', 'leads', 'trade', 'phones.csv'),
    '﻿統編,電話,傳真,核發日期\n11111111,02-2222-3333,,\n22222222,02-2999-8888,,\n33333333,02-2777-6666,,\n55555555,02-2555-4444,,\n66666666,02-2333-1111,,\n77777777,02-2444-0000,,\n88888888,02-2111-0000,,\n');
  // 稅籍檔（欄位跟財政部那份一樣；地址用全形數字）
  const fia = ['營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,使用統一發票,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3',
    '29-OCT-26,,,,,,,,,,,,,,,',
    '新北市新莊區假路１號,11111111,,甲一精密有限公司,12000000,1080903,有限公司,Y,2599,金屬製品,,,,,,',          // 1,200 萬 → 300～6,000 萬
    '臺北市中山區假路２號,22222222,,乙二科技股份有限公司,900000000,0880101,股份有限公司,Y,4651,電腦設備批發,,,,,,',  // 9 億 → 不是目標，排後面
    '新北市板橋區假路３號,33333333,,丙三工程有限公司,30000000,1100505,有限公司,Y,4290,土木工程,,,,,,',
    '桃園市中壢區假路４號,34343434,,丙三工程有限公司,5000000,1050101,有限公司,Y,4290,土木工程,,,,,,',          // 同名在桃園 → 用縣市挑掉
    '新北市三重區假路５號,44444444,,丁四貿易有限公司,8000000,1090101,有限公司,Y,4619,批發,,,,,,',               // 沒電話
    '新北市中和區假路６號,55555555,,戊五實業有限公司,1000000,1110101,有限公司,Y,2599,金屬,,,,,,',              // 100 萬 → 未滿 200 萬
    '新北市新店區假路７號,66666666,,己六股份有限公司,20000000,1000101,股份有限公司,Y,6201,軟體,,,,,,',          // 已在名單
    '新北市新店區假路８號,67676767,,己六股份有限公司,20000000,1000101,股份有限公司,Y,6201,軟體,,,,,,',          // 同名同縣市兩家 → 不猜
    '新北市汐止區假路９號,77777777,,庚七有限公司,10000000,1060101,有限公司,Y,4719,零售,,,,,,',                  // 刪過（墓碑）
    '臺北市信義區假路１０號,88888888,,英屬開曼群島商辛八有限公司臺灣分公司,50000000,1020202,外國公司在台之分公司,Y,7020,顧問,,,,,,',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'fia.csv'), '﻿' + fia + '\n');
  const result = { at: Date.now(), areas: 41, areaDone: 41, pages: 3, overflow: 0, stopped: '', list: [
    { name: '甲一精密有限公司', area: '新北市新莊區', count: 2 },
    { name: '乙二科技股份有限公司(乙二)', area: '台北市中山區', count: 30 },   // 結尾括號品牌、台北
    { name: '丙三工程有限公司', area: '新北市板橋區', count: 5 },
    { name: '丁四貿易有限公司', area: '新北市三重區', count: 1 },
    { name: '戊五實業有限公司', area: '新北市中和區', count: 1 },
    { name: '己六股份有限公司', area: '新北市新店區', count: 3 },
    { name: '庚七有限公司', area: '新北市汐止區', count: 4 },
    { name: '英屬開曼群島商辛八有限公司', area: '台北市信義區', count: 6 },     // 外商分公司
    { name: '壬九查無有限公司', area: '新北市林口區', count: 9 },             // 稅籍檔沒有
    { name: '癸十沒缺有限公司', area: '新北市林口區', count: 0 },             // 沒在徵才
  ] };
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(result));
  const sync = { exportedAt: 'x', version: 1,
    settings: { 'hiring-candidates': { v: '{"day":"2026-11-09"}', at: 5 }, 'feed-shares': { v: '1,1,2,1,1,1,1,1', at: 7 } },
    records: [{ id: 'r1', company: '己六股份有限公司', taxId: '' }], logs: [{ uid: 'L1' }], states: {},
    tombstones: { logs: {}, sources: {}, records: {}, companies: { 'tax:77777777': { at: 1, company: '庚七有限公司', taxId: '77777777' } } } };
  fs.writeFileSync(path.join(dir, 'sync.json'), JSON.stringify(sync));
  return { dir, work, env: { HIRE104_WORK: work, HIRE104_ROOT: path.join(dir, 'root'), HIRE104_PORT: String(PORT) } };
}

test('write：對稅籍檔補統編、排除與門檻、有電話才收、排序，寫回同步檔不動其他鍵', async () => {
  const fx = fixture();
  const r = await run(['--sync', path.join(fx.dir, 'sync.json'), 'write', '--fia', path.join(fx.dir, 'fia.csv')], fx.env);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /抓了 10 家/);
  assert.match(r.out, /進候選池 4 家（300～6,000 萬 3）/);
  assert.doesNotMatch(r.out, /甲一|乙二|丙三/, '終端機不印公司名');
  const data = JSON.parse(fs.readFileSync(path.join(fx.dir, 'sync.json'), 'utf8'));
  assert.strictEqual(data.settings['feed-shares'].v, '1,1,2,1,1,1,1,1', '其他設定不動');
  assert.deepStrictEqual(data.logs, [{ uid: 'L1' }]);
  const pool = JSON.parse(data.settings['hiring-pool-104'].v);
  assert.ok(data.settings['hiring-pool-104'].at > 0 && pool.at === data.settings['hiring-pool-104'].at);
  assert.match(pool.week, /^\d{4}-W\d{2}$/);
  assert.deepStrictEqual(pool.list.map((x) => x.key), ['88888888', '33333333', '11111111', '22222222'],
    '目標資本額先、職缺多的先；乙二（9 億）排最後；丙三用縣市挑到新北那家；辛八是外商分公司');
  const s = pool.stats;
  assert.deepStrictEqual([s.hiring, s.noTax, s.ambiguous, s.already, s.lowCap, s.noPhone], [9, 1, 1, 1, 1, 1]);
  const head = pool.head.split(',');
  assert.strictEqual(head.length, 15);
  assert.strictEqual(head[0], '公司名稱');
  const cells = (row) => { const out = []; let cur = '', q = false; for (const ch of row) { if (q) { if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const jia = cells(pool.list.find((x) => x.key === '11111111').row);
  assert.deepStrictEqual([jia[0], jia[1], jia[3], jia[4], jia[5], jia[9], jia[12]],
    ['甲一精密有限公司', '11111111', '2019', '12,000', '02-2222-3333', '__DAY__', '新北市新莊區假路1號']);
  assert.match(jia[11], /^104 徵才中：2 件/);
  const xin = cells(pool.list.find((x) => x.key === '88888888').row);
  assert.strictEqual(xin[0], '英屬開曼群島商辛八有限公司臺灣分公司', '公司名稱用稅籍的登記名');
});

test('prepare：這週抓過就不抓；--force 照樣開接收器', async () => {
  const fx = fixture();
  const syncP = path.join(fx.dir, 'sync.json');
  await run(['--sync', syncP, 'write', '--fia', path.join(fx.dir, 'fia.csv')], fx.env);
  const r1 = await run(['--sync', syncP, 'prepare'], fx.env);
  assert.match(r1.out, /這週（.*）抓過了，候選池 4 家/);
  assert.ok(!fs.existsSync(path.join(fx.work, 'snippet.js')));
  const r2 = await run(['--sync', syncP, 'prepare', '--force'], fx.env);
  assert.match(r2.out, /接收器開好了/);
  const js = fs.readFileSync(path.join(fx.work, 'snippet.js'), 'utf8');
  assert.match(js, /sw=2/);
  assert.match(js, /recv\.html/);
  assert.match(js, /開始抓 104 徵才中/);
  assert.match(js, new RegExp(`127\\.0\\.0\\.1:${PORT}`));
  const pid = Number(fs.readFileSync(path.join(fx.work, 'receiver.pid'), 'utf8'));
  try { process.kill(pid); } catch (e) { /* 已經結束 */ }
});

function post(headers, body) {
  return new Promise((resolve) => {
    const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (rs) => { rs.resume(); rs.on('end', () => resolve(rs.statusCode)); });
    rq.on('error', () => resolve(0));
    rq.end(body);
  });
}
function getPage(p) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (rs) => { let b = ''; rs.on('data', (c) => { b += c; }); rs.on('end', () => resolve({ code: rs.statusCode, body: b })); }).on('error', () => resolve({ code: 0, body: '' }));
  });
}
function receiver(fx, token) {
  const p = spawn('python3', [TOOL, 'receive', '--token', token, '--hours', '0.05'], { env: { ...process.env, ...fx.env } });
  return { p, done: new Promise((r) => p.on('close', r)) };
}

test('接收器：本機接收分頁帶暗號；不是 104／本機來源、暗號不對 → 403；本機分頁同源送的 → 存檔、關掉', async () => {
  const fx = fixture();
  fs.rmSync(path.join(fx.work, 'result.json'));
  const token = 'a'.repeat(32);
  const rv = receiver(fx, token);
  await new Promise((r) => setTimeout(r, 800));
  const pg = await getPage('/recv.html');
  assert.strictEqual(pg.code, 200);
  assert.ok(pg.body.includes(token) && pg.body.includes('"https://www.104.com.tw"'), '分頁帶暗號、只收 104 來的訊息');
  assert.strictEqual((await getPage('/other')).code, 404);
  assert.strictEqual(await post({ Origin: 'https://evil.example', 'X-Token': token }, '{"list":[]}'), 403);
  assert.strictEqual(await post({ Origin: `http://127.0.0.1:${PORT}`, 'X-Token': 'wrong' }, '{"list":[]}'), 403);
  assert.ok(!fs.existsSync(path.join(fx.work, 'result.json')));
  assert.strictEqual(await post({ Origin: `http://127.0.0.1:${PORT}`, 'X-Token': token }, '{"list":[{"name":"x","count":1}]}'), 200);
  assert.strictEqual(await rv.done, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(fx.work, 'result.json'), 'utf8')).list.length, 1);
});

test('接收器：104 網頁直接送（Chrome 允許存取區域網路時）也收', async () => {
  const fx = fixture();
  fs.rmSync(path.join(fx.work, 'result.json'));
  const token = 'c'.repeat(32);
  const rv = receiver(fx, token);
  await new Promise((r) => setTimeout(r, 800));
  assert.strictEqual(await post({ Origin: 'https://www.104.com.tw', 'X-Token': 'wrong' }, '{"list":[]}'), 403);
  assert.strictEqual(await post({ Origin: 'https://www.104.com.tw', 'X-Token': token }, '{"list":[{"name":"y","count":2}]}'), 200);
  assert.strictEqual(await rv.done, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(fx.work, 'result.json'), 'utf8')).list[0].count, 2);
});
