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
  const zh = m.normalize({ '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '公司簡稱': '台泥', '營利事業統一編號': '11913502', '產業別': '01', '住址': '台北市中山北路2段113號', '董事長': '張安平', '總經理': '程耀輝', '總機電話': '(02)2222-1234', '成立日期': '19501229', '上市日期': '19620209', '實收資本額': '77231817420', '網址': 'https://x' }, { market: '上市', zh: true });
  assert.equal(zh.taxId, '11913502'); assert.equal(zh.founded, '1950/12/29'); assert.equal(zh.capital, '77231817420'); assert.equal(zh.address, '台北市中山北路2段113號');
  const en = m.normalize({ SecuritiesCompanyCode: '1240', CompanyName: '茂生農經股份有限公司', 'UnifiedBusinessNo.': '18795706', SecuritiesIndustryCode: '33', Address: '2F.,No.30,Sec. 1,Heping W.Rd.', Chairman: '吳清德', GeneralManager: '吳清德', Telephone: '02-23456789', DateOfIncorporation: '19670218', DateOfListing: '20180808', 'Paidin.Capital.NTDollars': '464439920' }, { market: '上櫃', zh: false });
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
  const r = L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '產業別': '水泥工業', '住址': '台北市中山北路2段113號', '董事長': '張安平', '總經理': '程耀輝', '總機電話': '(02)2222-1234', '成立日期': '1950/12/29', '上市櫃日期': '1962/02/09', '實收資本額': '77231817420' }, owners, TODAY);
  assert.equal(r.years, 75); assert.equal(r.invest.length, 1); assert.equal(r.sameSpot.length, 1); assert.equal(r.others.length, 2);
  assert.equal(r.branch.key, '不在劃分表上', '證交所的地址常沒寫「區」，對不到分公司；抓資料時會拿商工登記的地址換掉');
  const r2 = L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '住址': '台北市中山區中山北路2段113號', '董事長': '張安平', '實收資本額': '1' }, owners, TODAY);
  assert.equal(r2.branch.key, '城中分公司');
  assert.match(r.blob, /安平投資/);
});

test('加入客戶名單：加的是投資公司，備註寫清楚是哪個上市櫃老闆的，日期不會被當成通話', () => {
  const owners = { '張安平': [{ taxId: '12345678', name: '安平投資股份有限公司', invest: true, address: '台北市中山北路2段113號', capital: '50,000', founded: '2010/01/05', owner: '張安平', sameSpot: true }] };
  const r = L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '住址': '台北市中山北路2段113號', '董事長': '張安平', '總機電話': '(02)2222-1234', '實收資本額': '77231817420' }, owners, TODAY);
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

test('每日動態：重大訊息主旨分類、掛到公司上、篩選鍵與最新動態日', () => {
  assert.equal(L.newsKind('公告本公司董事會決議取得不動產暨興建廠房'), 'asset');
  assert.equal(L.newsKind('代子公司公告取得機器設備'), 'asset');
  assert.equal(L.newsKind('公告本公司董事會決議辦理現金增資發行新股'), 'fund');
  assert.equal(L.newsKind('公告本公司資金貸與他人'), 'fund');
  assert.equal(L.newsKind('公告本公司取得子公司股權'), 'deal');
  assert.equal(L.newsKind('公告本公司處分股票'), 'deal');
  assert.equal(L.newsKind('公告本公司董事長異動'), 'people');
  assert.equal(L.newsKind('公告本公司代理發言人異動'), 'people');
  assert.equal(L.newsKind('公告本公司名稱由「甲」更名為「乙」'), 'rename');
  assert.equal(L.newsKind('公告本公司名稱由「世紀離岸風電設備股份有限公司」更名為「世紀能源設備股份有限公司」'), 'rename', '公司名裡的「設備」不是買設備');
  assert.equal(L.newsKind('公告本公司股票面額由「新台幣10元」變更為「新台幣5元」'), 'other');
  assert.equal(L.newsKind('公告本公司除息基準日'), 'meeting');
  assert.equal(L.newsKind('公告本公司115年8月自結營收'), 'ops');
  assert.equal(L.newsKind('公告本公司「全坤御峰」工地火災事件說明'), 'other');
  const dyn = L.groupDyn(
    { items: [
      { m: '上市', code: '1101', d: '2026-09-27', t: '16:52', s: '公告本公司董事會決議取得不動產', c: '第20款' },
      { m: '上市', code: '1101', d: '2026-08-01', t: '09:00', s: '公告本公司除息基準日', c: '' },
      { m: '上市', code: '1101', d: '2026-07-01', t: '09:00', s: '很久以前的', c: '' },
    ] },
    { ym: '2026-08', by: { 1101: { code: '1101', ym: '2026-08', cur: 13515534, yoy: 25.3, mom: -1.7, cumPct: 2.7 } } },
    { items: [{ d: '2026-09-20', code: '1101', name: '台泥', field: '董事長', from: '甲', to: '乙' }] });
  const r = L.attachDyn(L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '臺灣水泥股份有限公司', '統一編號': '11913502', '實收資本額': '1' }, {}, TODAY), dyn, TODAY);
  assert.equal(r.news.length, 3); assert.equal(r.news[0].kind, 'asset');
  assert.equal(r.recentNews, 1, '近 30 天只有 9/27 那則');
  assert.deepEqual([...r.dynKeys].sort(), ['asset', 'basic', 'news', 'rev-up']);
  assert.equal(r.active, '2026-09-27');
  assert.equal(r.rev.yoy, 25.3);
  const none = L.attachDyn(L.toRecord({ '市場別': '上櫃', '公司代號': '9999', '公司名稱': '無', '實收資本額': '1' }, {}, TODAY), dyn, TODAY);
  assert.equal(none.dynKeys.size, 0); assert.equal(none.active, ''); assert.equal(none.rev, null);
});

test('抓動態的腳本：民國日期、重大訊息與營收欄位對應、累積去重只留最近幾天', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-listed-daily.mjs'));
  assert.equal(m.rocDate('1150927'), '2026-09-27'); assert.equal(m.rocYm('11508'), '2026-08'); assert.equal(m.hhmm('70004'), '07:00');
  const zh = m.normNews({ '出表日期': '1150928', '發言日期': '1150927', '發言時間': '165242', '公司代號': '2509', '公司名稱': '全坤建', '主旨 ': '公告本公司「全坤御峰」工地\r\n火災事件說明', '符合條款': '第26款', '事實發生日': '1150926', '說明': '長長的說明' }, '上市');
  assert.deepEqual(zh, { m: '上市', code: '2509', name: '全坤建', d: '2026-09-27', t: '16:52', s: '公告本公司「全坤御峰」工地 火災事件說明', c: '第26款', f: '2026-09-26' });
  const en = m.normNews({ Date: '1150928', '發言日期': '1150927', '發言時間': '70004', SecuritiesCompanyCode: '4530', CompanyName: '天意能創', '主旨': '公告更名', '符合條款': '第53款', '事實發生日': '1150708' }, '上櫃');
  assert.equal(en.code, '4530'); assert.equal(en.name, '天意能創'); assert.equal(en.t, '07:00');
  assert.equal(m.normNews({ '公司代號': '', '發言日期': '1150927', '主旨': 'x' }, '上市'), null);
  const merged = m.mergeNews([{ ...zh, d: '2026-07-01' }, zh], [zh, { ...zh, t: '17:00' }], '2026-09-28', 45);
  assert.equal(merged.length, 2, '7/1 的過期丟掉、重複的只留一則'); assert.equal(merged[0].t, '17:00', '新的在前');
  const rev = m.normRevenue({ '出表日期': '1150917', '資料年月': '11508', '公司代號': '1101', '營業收入-當月營收': '13515534', '營業收入-上月營收': '13744103', '營業收入-去年當月營收': '12214776', '營業收入-上月比較增減(%)': '-1.6630332295967223', '營業收入-去年同月增減(%)': '10.649053245020621', '累計營業收入-當月累計營收': '98726969', '累計營業收入-去年累計營收': '96131621', '累計營業收入-前期比較增減(%)': '2.699785952844798', '備註': '-' }, '上市');
  assert.deepEqual(rev, { code: '1101', m: '上市', ym: '2026-08', cur: 13515534, prev: 13744103, ly: 12214776, mom: -1.7, yoy: 10.6, cum: 98726969, cumLy: 96131621, cumPct: 2.7 });
  assert.equal(m.normRevenue({ '資料年月': '11508', '公司代號': '1', '營業收入-當月營收': '' }, '上市').cur, null);
});

test('基本資料跟前一天比：董事長換人、新掛牌、下市櫃；英文地址換中文不算異動', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-listed.mjs'));
  const o = [{ '公司代號': '1101', '公司名稱': '台泥', '市場別': '上市', '董事長': '張安平', '總經理': '程耀輝', '實收資本額': '100', '住址': '台北市中山區中山北路2段113號' },
    { '公司代號': '9999', '公司名稱': '走了', '市場別': '上櫃', '住址': '2F., No.30' }];
  const n = [{ '公司代號': '1101', '公司名稱': '台泥', '市場別': '上市', '董事長': '王大明', '總經理': '程耀輝', '實收資本額': '100', '住址': '台北市中山區中山北路2段113號' },
    { '公司代號': '1234', '公司名稱': '新的', '市場別': '興櫃' }];
  const d = m.diffCompanies(o, n, '2026-09-28');
  assert.deepEqual(d.map((c) => `${c.code} ${c.field} ${c.from}→${c.to}`), ['1101 董事長 張安平→王大明', '1234 新掛牌 →興櫃', '9999 下市櫃 上櫃→']);
  assert.deepEqual(m.diffCompanies([], n, '2026-09-28'), [], '第一次沒有舊檔，不把全部當新掛牌');
  assert.deepEqual(m.diffCompanies([{ '公司代號': '1', '公司名稱': 'a', '住址': 'No.1 Rd.' }], [{ '公司代號': '1', '公司名稱': 'a', '住址': '台北市中山區一路1號' }], '2026-09-28'), []);
  const merged = m.mergeChanges([{ d: '2026-01-01', code: '1', field: '董事長', from: 'x', to: 'y' }, d[0]], [d[0]], '2026-09-28', 180);
  assert.equal(merged.length, 1, '過期丟掉、同一天同公司同欄位只留一筆');
  assert.deepEqual(m.parseCsv('﻿a,b\n1,"x,""y"\n'), [['a', 'b'], ['1', 'x,"y']]);
});

test('董監事設質：董事長本人與有設質的人、合計設質比、篩選鍵', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-listed-daily.mjs'));
  const rows = [
    { '資料年月': '11508', '公司代號': '1101', '職稱': '董事長本人', '姓名': '甲', '目前持股': '1000000', '設質股數': '400000', '設質股數佔持股比例': '40.00%' },
    { '資料年月': '11508', '公司代號': '1101', '職稱': '董事本人', '姓名': '乙', '目前持股': '500000', '設質股數': '300000', '設質股數佔持股比例': '60.00%' },
    { '資料年月': '11508', '公司代號': '1101', '職稱': '監察人本人', '姓名': '丙', '目前持股': '500000', '設質股數': '0', '設質股數佔持股比例': '0.00%' },
  ].map((r) => m.normPledge(r));
  const p = m.pledgeOf(rows);
  assert.equal(p.ym, '2026-08'); assert.equal(p.n, 3); assert.equal(p.pledgers, 2); assert.equal(p.pct, 35);
  assert.deepEqual(p.people.map((x) => x.n), ['甲', '乙'], '董事長排第一，沒設質的監察人不存');
  const dyn = L.groupDyn(null, null, null, { by: { 1101: p } });
  const r = L.attachDyn(L.toRecord({ '市場別': '上市', '公司代號': '1101', '公司名稱': '台泥', '實收資本額': '1' }, {}, TODAY), dyn, TODAY);
  assert.equal(r.chairPledge.r, 40);
  assert.deepEqual([...r.dynKeys].sort(), ['pledge', 'pledge-50', 'pledge-chair', 'pledge-total']);
});

test('董監事設質：同一個法人股東佔好幾席併成一列，職稱串起來、董事長排前', async () => {
  const m = await import(path.join(ROOT, 'tools', 'fetch-listed-daily.mjs'));
  const rows = [
    { '資料年月': '11508', '公司代號': '8927', '職稱': '董事本人', '姓名': '高雄汽車客運股份有限公司', '目前持股': '91712913', '設質股數': '59260000', '設質股數佔持股比例': '64.61%' },
    { '資料年月': '11508', '公司代號': '8927', '職稱': '董事長本人', '姓名': '高雄汽車客運股份有限公司', '目前持股': '91712913', '設質股數': '59260000', '設質股數佔持股比例': '64.61%' },
    { '資料年月': '11508', '公司代號': '8927', '職稱': '董事本人', '姓名': '高雄汽車客運股份有限公司', '目前持股': '91712913', '設質股數': '59260000', '設質股數佔持股比例': '64.61%' },
    { '資料年月': '11508', '公司代號': '8927', '職稱': '董事本人', '姓名': '某某', '目前持股': '1000', '設質股數': '500', '設質股數佔持股比例': '50.00%' },
  ].map((r) => m.normPledge(r));
  const p = m.pledgeOf(rows);
  assert.equal(p.people.length, 2);
  assert.equal(p.people[0].t, '董事長本人、董事本人'); assert.equal(p.people[0].r, 64.6);
  assert.equal(p.pledgers, 2, '人數算併過席次之後的');
});
