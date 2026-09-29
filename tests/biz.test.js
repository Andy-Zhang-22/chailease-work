'use strict';
/*
 * 商行／企業社分頁：抓資料腳本的篩選與欄位轉換、畫面的卡片資料、加入名單的 CSV。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'biz']);
const B = w.Biz;
const TODAY = new Date(2026, 8, 29);

test('抓資料腳本：財政部那一列 → 我們的一列；全形轉半形、民國日期、只留獨資合夥與資本額門檻、分公司不要', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-biz.mjs'));
  const row = m.parseLine('"新北市新莊區中正路３７１號一樓",38965019,,"原味商行",1000000,1040413,獨資,Y,472927,豆類製品零售,471913,雜貨店,,,,');
  assert.equal(row.length, 16);
  const r = m.normalize(row, { cities: ['新北市'], minCapital: 500000 });
  assert.deepEqual(r, { taxId: '38965019', name: '原味商行', org: '獨資', capital: 1000000, setup: '2015/04/13', address: '新北市新莊區中正路371號一樓', code: '472927', ind: '豆類製品零售', ind2: '雜貨店', ind3: '', invoice: 'Y' });
  assert.equal(m.normalize(m.parseLine('"臺北市中山區x路1號",12345678,,"甲商行",1000000,1040413,獨資,Y,1,a,,,,,,'), { cities: ['新北市'], minCapital: 500000 }), null, '不在縣市裡');
  assert.equal(m.normalize(m.parseLine('"新北市新莊區x路1號",12345678,,"甲商行",100000,1040413,獨資,Y,1,a,,,,,,'), { cities: ['新北市'], minCapital: 500000 }), null, '資本額不到');
  assert.equal(m.normalize(m.parseLine('"新北市新莊區x路1號",12345678,,"甲股份有限公司",1000000,1040413,股份有限公司,Y,1,a,,,,,,'), { cities: ['新北市'], minCapital: 500000 }), null, '公司不是商業');
  assert.equal(m.normalize(m.parseLine('"新北市新莊區x路1號",12345678,87654321,"甲商行新莊分行",1000000,1040413,獨資,Y,1,a,,,,,,'), { cities: ['新北市'], minCapital: 500000 }), null, '分公司不要');
  assert.equal(m.normalize(m.parseLine('29-SEP-26,,,,,,,,,,,,,,,'), {}), null, '出檔日期那列');
  assert.equal(m.halfWidth('３７１號－１'), '371號-1'); assert.equal(m.rocDate('0400711'), '1951/07/11'); assert.equal(m.rocDate('1040413'), '2015/04/13'); assert.equal(m.rocDate(''), '');
});

test('抓資料腳本：負責人從新北市商業登記清冊對（只留名單裡的統編；同統編留營業中、最新設立的）', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-biz.mjs'));
  const http = require('node:http');
  const body = ['\uFEFFaddress_code,ban_no,buss_name,buss_addr_comb,register_funds,org_code,res_name,set_app_date,close_app_date,yyymmroc',
    '新北市,19501383,盛品禮品文具店," ",0,06獨資,沈保元,0850216,0880703,11506',
    '新北市,19501383,盛品禮品文具店,新北市板橋區x路1號,100000,06獨資,沈小華,1000101,,11506',
    '新北市,38965019,原味商行,新北市新莊區中正路371號,1000000,06獨資,王小明,1110413,,11506',
    '新北市,38965019,原味商行,新北市新莊區中正路371號,1000000,06獨資,王大明,1050413,,11506',
    '新北市,11111111,別家商行,,0,06獨資,路人甲,1050413,,11506',
    '新北市,22222222,沒負責人商行,,0,06獨資,,1050413,,11506'].join('\n');
  const srv = http.createServer((req, res) => { if (req.url !== '/csv/file') { res.statusCode = 404; res.end('nope'); return; } res.setHeader('content-type', 'text/csv;charset=UTF-8'); res.end(body); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const { owners, month } = await m.loadOwners(new Set(['19501383', '38965019', '22222222']), `http://127.0.0.1:${srv.address().port}/csv/file`);
    assert.equal(month, '2026/06');
    assert.deepEqual(Object.keys(owners).sort(), ['19501383', '38965019']);
    assert.equal(owners['19501383'].name, '沈小華', '歇業那筆不要，留營業中的');
    assert.equal(owners['38965019'].name, '王小明', '兩筆都營業中，留設立日期新的');
    assert.equal(owners['38965019'].funds, 1000000); assert.equal(owners['19501383'].funds, 100000);
    // 資本額以登記為準：稅籍 2 億、登記 20 萬 → 20 萬（門檻之後再套）；清冊沒有或登記 0 的用稅籍的
    const kept = [{ taxId: '38965019', capital: 200000000 }, { taxId: '19501383', capital: 800000 }, { taxId: '33333333', capital: 600000 }];
    assert.equal(m.applyFunds(kept, { 38965019: { name: '王小明', funds: 200000 }, 19501383: { name: '沈小華', funds: 0 } }), 1);
    assert.deepEqual(kept.map((r) => [r.capital, r.taxCapital]), [[200000, 200000000], [800000, 800000], [600000, 600000]]);
    await assert.rejects(() => m.loadOwners(new Set(['1']), `http://127.0.0.1:${srv.address().port}/nope`), /HTTP 404/, '抓不到要丟錯，讓呼叫端沿用上次的');
  } finally { srv.close(); }
});

test('畫面：一列 → 卡片資料（分公司、設立年數、行業）、加入名單的 CSV', () => {
  const r = B.toRecord({ '統編': '38965019', '名稱': '原味商行', '組織別': '獨資', '資本額': '1000000', '設立日期': '2022/04/13', '地址': '新北市新莊區中正路371號一樓', '行業代號': '472927', '行業': '豆類製品零售', '行業2': '雜貨店', '行業3': '', '開發票': 'Y', '負責人': '王小明' }, TODAY);
  assert.equal(r.branch.key, '新莊分公司'); assert.equal(r.district, '新莊區'); assert.equal(r.years, 4); assert.equal(B.ageOf(r), 'lt5');
  assert.deepEqual(r.inds, ['豆類製品零售', '雜貨店']); assert.equal(r.invoice, true);
  assert.equal(B.money(1000000), '100 萬'); assert.equal(B.money(150000000), '1.5 億');
  const csv = B.toStandardCsv([r], ['2026-10-06']);
  const rows = w.Normalize.parseCsv(csv);
  assert.equal(rows[0].join(','), '公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家');
  const out = w.Normalize.toRecords(rows, '商行企業社-2026-09-29-1家.csv', {});
  const rec = out.records[0];
  assert.equal(rec.company, '原味商行'); assert.equal(rec.taxId, '38965019'); assert.equal(rec.founded, '2022'); assert.equal(rec.capital, '1,000'); assert.equal(rec.owner, '王小明'); assert.equal(rec.industry, '豆類製品零售');
  assert.equal(r.reg, true, '舊檔沒有商業登記欄：有負責人就當有商業登記');
  const t = B.toRecord({ '統編': '98798418', '名稱': '永元水電行', '組織別': '獨資', '資本額': '60000000', '設立日期': '2003/08/01', '地址': '新北市永和區中正路368巷1弄67號1樓', '行業代號': '475', '行業': '居家修繕用品零售', '開發票': 'N', '負責人': '', '稅籍資本額': '60000000', '商業登記': 'N' }, TODAY);
  assert.equal(t.reg, false); assert.match(B.noteFor(t), /只有稅籍登記/); assert.match(B.noteFor(t), /稅籍自填/);
  assert.equal(B.toRecord({ '統編': '1', '名稱': 'x', '組織別': '獨資', '資本額': '1', '設立日期': '', '地址': '', '行業': '', '開發票': 'N', '負責人': '', '商業登記': 'Y' }, TODAY).reg, true, '清冊有這家但沒名字也算有商業登記');
  assert.equal(rec.nextDate, '2026-10-06'); assert.match(rec.notesRaw, /商行／企業社（稅籍登記）：獨資，資本額 100 萬，設立 2022-04-13/);
  assert.equal(w.Normalize.parseNotes(B.noteFor(r)).length, 1, '備註裡的日期用 - 不會被當成通話');
});

test('抓資料腳本：有限合夥、財團法人、寺廟、管委會不算商行', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-biz.mjs'));
  const mk = (name, org) => m.parseLine(`"新北市新莊區x路1號",12345678,,"${name}",1000000,1040413,${org},Y,1,a,,,,,,`);
  assert.equal(m.normalize(mk('奇跡資本有限合夥', '有限合夥'), { cities: ['新北市'], minCapital: 0 }), null);
  assert.equal(m.normalize(mk('財團法人下文山清水祖師', '獨資'), { cities: ['新北市'], minCapital: 0 }), null);
  assert.equal(m.normalize(mk('祭祀公業法人新北市廖仁記', '獨資'), { cities: ['新北市'], minCapital: 0 }), null);
  assert.equal(m.normalize(mk('某某大廈管理委員會', '獨資'), { cities: ['新北市'], minCapital: 0 }), null);
  assert.ok(m.normalize(mk('躍祥精密工業社', '獨資'), { cities: ['新北市'], minCapital: 0 }));
});

test('本月設立／變更：清冊一列 → 卡片資料（民國日期、營業項目拆開、案由分類）', () => {
  const o = { '統一編號': '01894203', '公司名稱': '德縉企業社', '公司所在地': '新北市土城區裕生路21巷6弄33號8樓', '代表人': '石明輝', '資本額': '45000', '核准設立日期': '', '核准變更日期': '115/08/17', '案由或變更事項': '所在地變更', '營業項目': 'CD01040 機車及其零件製造業；CA02010 金屬結構及建築組件製造業；ZZ99999 除許可業務外，得經營法令非禁止或限制之業務', '縣市': '新北市', '清冊': '變更', '期別': '11508' };
  const r = B.toMonthlyRecord(o, TODAY);
  assert.equal(r.taxId, '01894203'); assert.equal(r.name, '德縉企業社'); assert.equal(r.owner, '石明輝'); assert.equal(r.capital, 45000);
  assert.deepEqual(r.changed, { y: 2026, m: 8, d: 17 }); assert.equal(r.setup, null); assert.equal(B.ageOf(r), 'unknown');
  assert.equal(r.kind, '變更'); assert.equal(r.rk, 'move'); assert.equal(r.reg, true); assert.equal(r.monthly, true); assert.equal(r.period, '11508');
  assert.deepEqual(r.inds, ['機車及其零件製造業', '金屬結構及建築組件製造業'], 'ZZ99999 那條不算行業');
  assert.equal(r.branch.key, '新北分公司'); assert.equal(r.district, '土城區');
  assert.match(B.noteFor(r), /2026\/08 商業變更登記清冊：所在地變更/); assert.match(B.noteFor(r), /核准變更 2026\/08\/17/); assert.doesNotMatch(B.noteFor(r), /統一發票/);
  const s = B.toMonthlyRecord({ ...o, '清冊': '設立', '核准設立日期': '115/08/11', '核准變更日期': '', '案由或變更事項': '' }, TODAY);
  assert.equal(s.kind, '設立'); assert.deepEqual(s.setup, { y: 2026, m: 8, d: 11 }); assert.equal(s.years, 0); assert.equal(B.ageOf(s), 'lt5'); assert.equal(s.rk, '');
  assert.equal(B.periodLabel('11508'), '2026/08'); assert.deepEqual(B.parseAnyDate('2026/08/11'), { y: 2026, m: 8, d: 11 }); assert.equal(B.parseAnyDate('115/13/01'), null);
  assert.equal(B.reasonKind('合夥人變更'), 'owner'); assert.equal(B.reasonKind('轉讓登記'), 'owner'); assert.equal(B.reasonKind('外縣市遷入'), 'move'); assert.equal(B.reasonKind('增資'), 'up'); assert.equal(B.reasonKind('資本額變更'), 'capital'); assert.equal(B.reasonKind('名稱變更'), 'name'); assert.equal(B.reasonKind('營業項目變更'), 'items'); assert.equal(B.reasonKind('其他'), 'other');
  const rec = B.toStandardCsv([r]).split('\n')[1];
  assert.match(rec, /^德縉企業社,01894203,,,45,,石明輝,,機車及其零件製造業,/);
});
