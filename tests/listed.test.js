'use strict';
/*
 * 上市櫃公司分頁：抓資料腳本的欄位對應與「同址」判斷、畫面的金額與年數、
 * 加入名單的 CSV（加的是投資公司，備註寫清楚是哪個上市櫃老闆的）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModules, ROOT } = require('./load');

const w = loadModules(['normalize', 'holidays', 'rules', 'leads', 'listed']);
const L = w.Listed;
const TODAY = new Date(2026, 8, 28);

test('抓資料腳本：上市（中文欄位）、上櫃（英文欄位）都對得到同一組欄位；同址判斷', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-listed.mjs'));
  const zh = m.normalize({ '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '公司簡稱': '台泥', '營利事業統一編號': '11913502', '產業別': '01', '住址': '台北市中山北路2段113號', '董事長': '張安平', '總經理': '程耀輝', '總機電話': '(02)2531-7099', '成立日期': '19501229', '上市日期': '19620209', '實收資本額': '77231817420', '網址': 'https://x' }, { market: '上市', zh: true });
  assert.equal(zh.taxId, '11913502'); assert.equal(zh.founded, '1950/12/29'); assert.equal(zh.capital, '77231817420'); assert.equal(zh.address, '台北市中山北路2段113號');
  const en = m.normalize({ SecuritiesCompanyCode: '1240', CompanyName: '茂生農經股份有限公司', 'UnifiedBusinessNo.': '18795706', SecuritiesIndustryCode: '33', Address: '2F.,No.30,Sec. 1,Heping W.Rd.', Chairman: '吳清德', GeneralManager: '吳清德', Telephone: '02-23671162', DateOfIncorporation: '19670218', DateOfListing: '20180808', 'Paidin.Capital.NTDollars': '464439920' }, { market: '上櫃', zh: false });
  assert.equal(en.taxId, '18795706'); assert.equal(en.address, '', '英文地址不當中文地址用，等商工登記補'); assert.equal(en.addressEn, '2F.,No.30,Sec. 1,Heping W.Rd.'); assert.equal(en.chairman, '吳清德');
  assert.equal(m.INDUSTRY['24'], '半導體');
  assert.equal(m.sameSpot('台北市中山北路2段113號', '臺北市中山北路2段113號5樓'), true);
  assert.equal(m.sameSpot('台北市中山北路2段113號', '台北市中山北路2段115號'), false);
  assert.equal(m.sameSpot('', '台北市中山北路2段113號'), false);
  assert.equal(m.INVEST_RE.test('台泥投資股份有限公司'), true);
  assert.equal(m.INVEST_RE.test('台灣水泥股份有限公司'), false);
});

test('畫面：金額、年數、CSV 一列變卡片資料', () => {
  assert.equal(L.money(77231817420), '772.3 億');
  assert.equal(L.money(46443992), '4,644 萬');
  assert.equal(L.thousandsToYuan('50,000'), 50000000);
  assert.deepEqual(L.parseYmd('1950/12/29'), { y: 1950, m: 12, d: 29 });
  assert.deepEqual(L.parseYmd('19501229'), { y: 1950, m: 12, d: 29 });
  const owners = { '張安平': [
    { taxId: '12345678', name: '安平投資股份有限公司', invest: true, address: '台北市中山北路2段113號', capital: '50,000', founded: '2010/01/05', owner: '張安平', sameSpot: true },
    { taxId: '22345678', name: '某某貿易有限公司', invest: false },
  ] };
  const r = L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '產業別': '水泥工業', '住址': '台北市中山北路2段113號', '董事長': '張安平', '總經理': '程耀輝', '總機電話': '(02)2531-7099', '成立日期': '1950/12/29', '上市櫃日期': '1962/02/09', '實收資本額': '77231817420' }, owners, TODAY);
  assert.equal(r.years, 75); assert.equal(r.invest.length, 1); assert.equal(r.sameSpot.length, 1); assert.equal(r.others.length, 2);
  assert.equal(r.branch.key, '不在劃分表上', '證交所的地址常沒寫「區」，對不到分公司；抓資料時會拿商工登記的地址換掉');
  const r2 = L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '住址': '台北市中山區中山北路2段113號', '董事長': '張安平', '實收資本額': '1' }, owners, TODAY);
  assert.equal(r2.branch.key, '城中分公司');
  assert.match(r.blob, /安平投資/);
});

test('加入客戶名單：加的是投資公司，備註寫清楚是哪個上市櫃老闆的，日期不會被當成通話', () => {
  const owners = { '張安平': [{ taxId: '12345678', name: '安平投資股份有限公司', invest: true, address: '台北市中山北路2段113號', capital: '50,000', founded: '2010/01/05', owner: '張安平', sameSpot: true }] };
  const r = L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '住址': '台北市中山北路2段113號', '董事長': '張安平', '總機電話': '(02)2531-7099', '實收資本額': '77231817420' }, owners, TODAY);
  const x = r.invest[0];
  const note = L.noteFor(x, r);
  assert.match(note, /張安平 是上市 臺灣水泥股份有限公司（1101）董事長/);
  assert.match(note, /與上市公司同址/);
  assert.equal(w.Normalize.parseNotes(note).length, 1); assert.equal(w.Normalize.parseNotes(note)[0].date, null);
  const csv = L.toStandardCsv([{ x, r }], ['2026-10-06']);
  const rows = w.Normalize.parseCsv(csv);
  assert.equal(rows[0].join(','), '公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家');
  const out = w.Normalize.toRecords(rows, '上市櫃投資公司-2026-09-28-1家.csv', {});
  const rec = out.records[0];
  assert.equal(rec.company, '安平投資股份有限公司'); assert.equal(rec.taxId, '12345678'); assert.equal(rec.founded, '2010'); assert.equal(rec.capital, '50,000');
  assert.equal(rec.owner, '張安平'); assert.equal(rec.industry, '投資控股'); assert.equal(rec.nextDate, '2026-10-06'); assert.equal(rec.lastDate, null);
  assert.equal(w.Normalize.isGovRegistry(rows), false);
});
