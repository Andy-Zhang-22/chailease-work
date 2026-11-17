'use strict';
/* 登記清冊歷期比對（版本 432）：同一統編在幾期變更清冊裡增資過，兩期以上才列進 index.json 的 capitalUp。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ROOT } = require('./load');

const HEAD = '統一編號,公司名稱,公司所在地,代表人,資本額,核准設立日期,核准變更日期,案由或變更事項,營業項目,縣市,清冊,期別';
const row = (tax, name, reason, period) => [tax, name, '新北市新莊區中正路1號', '王一', '30000000', '108/10/01', '115/08/20', reason, '"CC01080 電子零組件製造業；CB01010 機械設備製造業"', '新北市', '變更', period].join(',');

test('兩期都增資的才列；一期增資、一期只變更負責人的不列；設立清冊不算', async () => {
  const m = await import(path.join(ROOT, 'tools', 'capital-up.mjs'));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capup-'));
  for (const p of ['11506', '11508']) await fs.mkdir(path.join(dir, p));
  await fs.writeFile(path.join(dir, '11506/新北市-change.csv'), `﻿${[HEAD,
    row('11111111', '甲一精密有限公司', '增資、所營事業變更', '11506'),
    row('22222222', '乙二機械股份有限公司', '增資', '11506'),
    row('33333333', '丙三工程有限公司', '負責人變更', '11506')].join('\n')}\n`);
  await fs.writeFile(path.join(dir, '11508/新北市-change.csv'), `﻿${[HEAD,
    row('11111111', '甲一精密有限公司', '發行新股', '11508'),
    row('11111111', '甲一精密有限公司', '增資', '11508'),   // 同一期兩筆只算一期
    row('33333333', '丙三工程有限公司', '增資', '11508'),
    row('44444444', '丁四貿易有限公司', '增資', '11508')].join('\n')}\n`);
  await fs.writeFile(path.join(dir, '11508/新北市-setup.csv'), `﻿${[HEAD, row('22222222', '乙二機械股份有限公司', '增資', '11508')].join('\n')}\n`);
  const periods = {
    '11506': { files: [{ city: '新北市', type: 'change', path: '11506/新北市-change.csv' }] },
    '11508': { files: [{ city: '新北市', type: 'change', path: '11508/新北市-change.csv' }, { city: '新北市', type: 'setup', path: '11508/新北市-setup.csv' }, { city: '桃園市', type: 'change', path: '11508/桃園市-change.csv' }] },
  };
  const out = await m.capitalUpIndex(dir, periods);
  assert.deepEqual(out, { '11111111': ['11506', '11508'] }, '甲一兩期；乙二只有一期變更（設立清冊不算）；丙三 11506 不是增資；丁四一期');
  assert.deepEqual(m.splitCsvLine('a,"b,c","d""e",'), ['a', 'b,c', 'd"e', '']);
  await fs.rm(dir, { recursive: true, force: true });
});
