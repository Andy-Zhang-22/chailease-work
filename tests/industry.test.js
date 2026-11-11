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

test('fetch-industry 第二批：食品只收工廠／製造場所；環保列管分工地、工廠，解除列管與只有廢棄物的不收', async () => {
  const t = await tool();
  assert.deepEqual(t.foodRow({ 公司統一編號: '12345678', 食品業者登錄字號: 'A-1', 登錄項目: '工廠/製造場所' }), { taxId: '12345678', site: 'A-1' });
  assert.equal(t.foodRow({ 公司統一編號: '12345678', 食品業者登錄字號: 'A-2', 登錄項目: '餐飲場所' }), null, '餐廳不收');
  assert.equal(t.foodRow({ 公司統一編號: '', 食品業者登錄字號: 'A-3', 登錄項目: '工廠/製造場所' }), null, '沒統編');
  const env = { uniformno: '23456789', emsno: 'F001', industryname: '其他專門營造業', isair: '0', iswater: '0', iswaste: '1', wastereleasedate: '' };
  assert.deepEqual(t.envRow(env), { taxId: '23456789', site: 'F001', type: 'site', flags: [] });
  assert.equal(t.envRow({ ...env, wastereleasedate: '20260901' }), null, '工地解除列管了');
  assert.deepEqual(t.envRow({ ...env, industryname: '金屬表面處理業', isair: '1', iswater: '1', iswaste: '1' }).flags, ['空污', '水污']);
  assert.equal(t.envRow({ ...env, industryname: '金屬表面處理業', isair: '1', airreleasedate: '20260101' }), null, '空污解除、只剩廢棄物');
  assert.equal(t.envRow({ ...env, industryname: '餐館' }), null, '只有廢棄物的餐廳不收');
  const x = { sites: [{ key: 'F:A-1', type: 'food' }, { key: 'E:F001', type: 'site' }, { key: 'E:F002', type: 'site' }, { key: 'E:F003', type: 'factory', flags: ['空污'] }] };
  assert.equal(t.sitesText(x), '食品工廠 1 處；工地 2 處；列管廠 1 處（空污）');
  const seen = new Map([['F:A-1', '202610'], ['E:F001', '202610'], ['E:F002', '202612'], ['E:F003', '202611']]);
  assert.deepEqual(t.newSiteOf(x, seen, '202610'), { ym: '202612', what: '新工地' });
  assert.equal(t.newSiteOf(x, new Map([['E:F001', '202610']]), '202610'), null, '起算月就有的不算新');
  assert.equal(t.HEAD.slice(12, 15).join(','), '場所,新場所年月,新場所');   // 版本 365 後面再接建照三欄
  // 食藥署的 zip 沒有中央目錄：照本地檔頭解
  const zlib = require('node:zlib');
  const data = Buffer.from('公司統一編號,登錄項目\n12345678,工廠/製造場所\n');
  const name = Buffer.from('97_2.csv'); const hdr = Buffer.alloc(30);
  hdr.writeUInt32LE(0x04034b50, 0); hdr.writeUInt16LE(0x808, 6); hdr.writeUInt16LE(8, 8); hdr.writeUInt16LE(name.length, 26);
  assert.equal(t.unzipFirst(Buffer.concat([hdr, name, zlib.deflateRawSync(data), Buffer.alloc(16)])), data.toString());
});

test('分頁：新工地／新廠是訊號、算利率不敏感、寫進加入名單的備註', () => {
  const r = I.toRecord({ 統編: '23456789', 名稱: '丙營造有限公司', 類別: '營造業', 地址: '新北市新莊區', 資本額: '20000000', 首見年月: '202610', 場所: '工地 2 處', 新場所年月: '202611', 新場所: '新工地' }, TODAY, '202610');
  assert.equal(r.sites, '工地 2 處'); assert.equal(I.isNewSite(r), true);
  assert.deepEqual(I.dailyFacts(r).signals, ['營造業（有工地）', '剛有新工地']);
  assert.match(I.noteFor(r), /^產業名單：營造業，2026-11 新工地$/);
  assert.equal(I.kindLabel('食品製造業'), '🍱 食品工廠');
  const f = I.toRecord({ 統編: '34567890', 名稱: '丁食品股份有限公司', 類別: '食品製造業、環保列管工廠', 地址: '臺北市內湖區', 首見年月: '202610', 場所: '食品工廠 1 處；列管廠 1 處（水污）' }, TODAY, '202610');
  assert.deepEqual(I.dailyFacts(f).signals, ['食品工廠', '環保列管工廠']);
  assert.equal(I.isNewSite(f), false);
  const oldSite = I.toRecord({ 統編: '45678901', 名稱: '戊營造', 類別: '營造業', 首見年月: '202610', 新場所年月: '202608', 新場所: '新工地' }, TODAY, '202610');
  assert.equal(I.isNewSite(oldSite), false, '4 個月前的新工地不算剛有');
});

test('fetch-industry 第三批：新北建照只收起造人像公司、不是純住宅、兩年內的；分頁的訊號與備註（版本 365）', async () => {
  const t = await tool();
  const now = new Date(2026, 9, 21);
  const base = { proprietor: '己五金股份有限公司', use_of_buildings: '工廠', date_the_permit: '1150915', project_cost: '12800000', building_site: '新北市三重區中正北路', license_number: '115重建字第00001號' };
  assert.deepEqual(t.permitRow(base, { now }), { names: ['己五金股份有限公司'], ym: '202609', use: '廠房', cost: 12800000, district: '三重區', lic: '115重建字第00001號', stage: '建照', address: '新北市三重區中正北路' });
  assert.equal(t.permitRow({ ...base, license_number: '115土使字第00170號' }, { now }).stage, '使照', '使用執照＝剛蓋好');
  assert.equal(t.permitRow({ ...base, license_number: '115土拆字第00001號' }, { now }), null, '拆除執照不收');
  assert.equal(t.permitRow({ ...base, license_number: '115土雜字第00001號' }, { now }), null, '雜項執照不收');
  assert.equal(t.permitRow({ ...base, proprietor: '王○○' }, { now }), null, '自然人不收');
  assert.equal(t.permitRow({ ...base, use_of_buildings: '集合住宅' }, { now }), null, '純住宅不收');
  assert.equal(t.permitRow({ ...base, use_of_buildings: '店舖、集合住宅' }, { now }).use, '辦公室', '住商混合收，算辦公室');
  assert.equal(t.permitRow({ ...base, date_the_permit: '1120915' }, { now }), null, '三年前的不收');
  assert.equal(t.permitRow({ ...base, date_the_permit: '//' }, { now }), null, '沒發照日不收');
  assert.deepEqual(t.permitRow({ ...base, proprietor: '甲建設股份有限公司、乙開發有限公司新莊分公司' }, { now }).names, ['甲建設股份有限公司'], '並列的拆開、分公司不收');
  assert.deepEqual(t.permitRow({ ...base, proprietor: '己五金股份有限公司 負責人:王大明' }, { now }).names, ['己五金股份有限公司'], '「負責人:某某」拿掉');
  assert.deepEqual(t.permitRow({ ...base, proprietor: '己五金股份有限公司（代表人：王大明）' }, { now }).names, ['己五金股份有限公司'], '括號裡的代表人拿掉');
  assert.equal(t.permitUse(''), '新建物'); assert.equal(t.permitUse('倉庫'), '倉儲');
  assert.equal(t.PERMIT.id, 123639);
  assert.equal(t.HEAD.slice(-5).join(','), '建照年月,建照用途,建照造價,建照種類,建照地址');
  assert.equal(t.permitRow({ ...base, house_address: '新北市三重區中正北路100號' }, { now }).address, '新北市三重區中正北路100號', '有門牌用門牌');
  const r = I.toRecord({ 統編: '56789012', 名稱: '己五金股份有限公司', 類別: '新建廠房', 地址: '新北市三重區', 資本額: '20000000', 首見年月: '202610', 建照年月: '202609', 建照用途: '廠房', 建照造價: '12800000', 建照地址: '新北市三重區中正北路100號' }, TODAY, '202610');
  assert.deepEqual(r.permit, { ym: { y: 2026, m: 9 }, use: '廠房', cost: 12800000, months: 3, stage: '建照', address: '新北市三重區中正北路100號' });
  assert.deepEqual(I.dailyFacts(r).signals, ['正在蓋廠房（造價 1,280 萬）']);
  assert.match(I.noteFor(r), /^產業名單：新建廠房，2026-09 建照 正在蓋廠房（造價 1,280 萬），蓋在 新北市三重區中正北路100號$/);
  assert.equal(I.kindLabel('新建廠房'), '🏗 新建廠房');
  const done = I.toRecord({ 統編: '56789014', 名稱: '辛工業有限公司', 類別: '新建廠房', 首見年月: '202610', 建照年月: '202606', 建照用途: '廠房', 建照造價: '38020000', 建照種類: '使照' }, TODAY, '202610');
  assert.deepEqual(I.dailyFacts(done).signals, ['廠房剛蓋好（造價 3,802 萬）'], '使照＝剛蓋好');
  assert.match(I.noteFor(done), /^產業名單：新建廠房，2026-06 使照 廠房剛蓋好（造價 3,802 萬）$/);
  const noPermit = I.toRecord({ 統編: '56789013', 名稱: '庚公司', 類別: '食品製造業', 首見年月: '202610' }, TODAY, '202610');
  assert.equal(noPermit.permit, null);
});

test('環保列管快取（版本 375）：抓成功存留下來的公司的列管場所，抓不到就讀回來同一個形狀', async () => {
  const t = await import(pathToFileURL(path.join(ROOT, 'tools/fetch-industry.mjs')).href);
  const byTax = new Map([
    ['12345678', { sites: [{ key: 'E:P001', type: 'factory', flags: ['水污'] }, { key: 'F:A-1', type: 'food' }] }],
    ['23456789', { sites: [{ key: 'E:S001', type: 'site', flags: [] }] }],
    ['34567890', { sites: [{ key: 'F:A-2', type: 'food' }] }],
    ['45678901', {}],
  ]);
  const j = t.envCacheOf(byTax, '2026-10-23T00:00:00.000Z');
  assert.equal(j.total, 2, '只存有列管場所的公司，食品的不算');
  assert.deepEqual(j.by['12345678'], [{ key: 'E:P001', type: 'factory', flags: ['水污'] }]);
  const back = t.envCacheToMap(JSON.parse(JSON.stringify(j)));
  assert.equal(back.size, 2);
  assert.deepEqual(back.get('23456789').get('E:S001'), { key: 'E:S001', type: 'site', flags: [] });
  assert.equal(t.envCacheToMap(null).size, 0);
});

test('fetch-industry 用 curl 下載（版本 404）：回傳的 Response 能讀；curl 失敗（找不到檔）在讀內容時丟錯，不是空檔案', async () => {
  const t = await tool();
  const fs = require('node:fs'); const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-test-'));
  const file = path.join(dir, 'a.csv');
  const content = '統一編號,公司名稱\n12345678,甲運通有限公司\n';
  fs.writeFileSync(file, content);
  const r = await t.curlFetch(pathToFileURL(file).href, { signal: AbortSignal.timeout(30000) });
  assert.equal(r.ok, true);
  assert.equal(await r.text(), content);
  const r2 = await t.curlFetch(pathToFileURL(path.join(dir, 'missing.csv')).href);
  await assert.rejects(r2.text(), /curl/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetch-industry 第四批（版本 426）：近 6 年純商辦的使照門牌（新北存查、臺北 XML）對稅籍檔的營業地址；分頁的卡片、訊號、備註', async () => {
  const t = await tool();
  const now = new Date(2026, 10, 11);
  // 門牌鍵：里、鄰、樓層、之 X、括號拿掉，「三段」→「3段」、台→臺；「68號、70號」兩個都算
  assert.deepEqual([...t.addressKeys('新北市三重區谷王里13鄰興德路47號')], ['三重區興德路47']);
  assert.deepEqual([...t.addressKeys('台北市中山區南京東路3段133之1號12樓')], ['中山區南京東路3段133']);
  assert.deepEqual([...t.addressKeys('臺北市信義區忠孝東路五段68號、70號')], ['信義區忠孝東路5段68', '信義區忠孝東路5段70']);
  assert.deepEqual([...t.addressKeys('新北市土城區員林里中央路2段33巷123號(3樓)')], ['土城區中央路2段33巷123']);
  assert.equal(t.addressKeys('新北市三峽區三峽市場內').size, 0, '沒有門牌就沒有鍵');
  // 新北存查：使字、用途有辦公沒有住宅、近 72 個月、有門牌
  const base = { license_number: '113土使字第00170號', use_of_buildings: 'G2辦公室', date_the_permit: '1130515', house_address: '新北市三重區谷王里13鄰興德路47號' };
  assert.deepEqual(t.officeNtpc(base, { now }), { keys: new Set(['三重區興德路47']), ym: '202405', address: '新北市三重區興德路47號' }, '顯示的地址把里鄰拿掉');
  assert.equal(t.officeNtpc({ ...base, use_of_buildings: 'G3店鋪、G2辦公室、H2集合住宅' }, { now }), null, '住商混合先不收');
  assert.equal(t.officeNtpc({ ...base, use_of_buildings: 'G2辦公室、公有市場' }, { now }), null, '市場不收');
  assert.equal(t.officeNtpc({ ...base, license_number: '113土建字第00001號' }, { now }), null, '建照（還在蓋）不收');
  assert.equal(t.officeNtpc({ ...base, date_the_permit: '1080515' }, { now }), null, '超過 6 年不收');
  assert.equal(t.officeNtpc({ ...base, house_address: '' }, { now }), null, '只有地段地號不收');
  // 臺北 XML：新建、每層用途有辦公沒有住宅、不是市場；每個 <地址> 都算
  const xml = ['<Datas>',
    '<Data><發照日期>1130520</發照日期><建造類別>新建</建造類別><建築地點><地址>臺北市信義區忠孝東路五段68號</地址><地址>臺北市信義區忠孝東路五段70號</地址></建築地點><建築概要><樓層>地上1樓,用途:(G2)一般事務所</樓層></建築概要></Data>',
    '<Data><發照日期>1130520</發照日期><建造類別>新建</建造類別><建築地點><地址>臺北市大安區和平東路一段1號</地址></建築地點><樓層>地上2樓,用途:(G2)辦公室 地上3樓,用途:(H2)集合住宅</樓層></Data>',
    '<Data><發照日期>1130520</發照日期><建造類別>新建</建造類別><建築地點><地址>臺北市大安區和平東路一段3號</地址></建築地點><樓層>地上2樓,用途:(G2)辦公室,公有市場攤位</樓層></Data>',
    '<Data><發照日期>1130520</發照日期><建造類別>增建</建造類別><建築地點><地址>臺北市大安區和平東路一段7號</地址></建築地點><樓層>(G2)辦公室</樓層></Data>',
    '<Data><發照日期>1050520</發照日期><建造類別>新建</建造類別><建築地點><地址>臺北市大安區和平東路一段5號</地址></建築地點><樓層>(G2)辦公室</樓層></Data>',
    '</Datas>'].join('\n');
  const o = t.officeTpe(xml, { now });
  assert.equal(o.n, 5); assert.equal(o.kept, 1, '住商混合、市場、增建、超過 6 年的不收');
  assert.deepEqual([...o.by.keys()], ['信義區忠孝東路5段68', '信義區忠孝東路5段70']);
  assert.deepEqual(t.officeOf(o.by, '台北市信義區忠孝東路5段70號8樓'), { ym: '202405', address: '臺北市信義區忠孝東路五段68號' }, '稅籍檔的寫法（台、5段、樓層）也對得到');
  assert.equal(t.officeOf(o.by, '臺北市信義區忠孝東路五段72號'), null);
  assert.equal(t.OFFICE.kind, '進駐新商辦'); assert.equal(t.OFFICE.months, 72);
  // 分頁
  const r = I.toRecord({ 統編: '56789015', 名稱: '壬顧問有限公司', 類別: '進駐新商辦', 地址: '新北市三重區興德路47號5樓', 資本額: '20000000', 首見年月: '202611', 建照年月: '202405', 建照用途: '辦公室', 建照造價: '', 建照種類: '進駐', 建照地址: '新北市三重區興德路47號' }, TODAY, '202610');
  assert.deepEqual(r.permit, { ym: { y: 2024, m: 5 }, use: '辦公室', cost: 0, months: 31, stage: '進駐', address: '新北市三重區興德路47號' });
  assert.equal(I.kindLabel('進駐新商辦'), '🏢 進駐新商辦');
  assert.deepEqual(I.dailyFacts(r).signals, ['進駐新商辦', '剛出現在產業名單'], '每日新名單的訊號不帶地址');
  assert.match(I.noteFor(r), /^產業名單：進駐新商辦，2024-05 使照 進駐新商辦（新北市三重區興德路47號），2026-11 新出現$/);
  assert.match(I.cardFacts(r).info, /^進駐新商辦（2024\/05 使照 進駐新商辦（新北市三重區興德路47號））$/);
  assert.match(I.toStandardCsv([r]), /進駐新商辦（新北市三重區興德路47號）/);
});
