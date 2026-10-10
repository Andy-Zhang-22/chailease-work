'use strict';
/* 網路查擴張訊號（tools/intel.mjs）：把 Claude 的回覆拆成 { expansion, score, summary, sources } 的純邏輯 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT } = require('./load');

test('parseIntel：挖出最後一段 JSON、分數夾在 0～3、沒訊號就清空摘要、來源只留網址', async () => {
  const m = await import(path.join(ROOT, 'tools', 'intel.mjs'));
  const r = m.parseIntel('我查了幾個來源。\n{"expansion": true, "score": 2, "summary": "104 正在徵 8 名作業員（2026/09）", "sources": ["https://www.104.com.tw/x", "not a url"]}');
  assert.deepEqual(r, { expansion: true, score: 2, summary: '104 正在徵 8 名作業員（2026/09）', sources: ['https://www.104.com.tw/x'], phone: '' });
  assert.deepEqual(m.parseIntel('{"expansion": false, "score": 0, "summary": "查不到", "sources": [], "phone": "02-2299-1234 分機 12"}'), { expansion: false, score: 0, summary: '', sources: [], phone: '02-2299-1234  12' }, '沒訊號也可能有電話');
  assert.equal(m.parseIntel('{"expansion": false, "score": 0, "phone": "沒有"}').phone, '', '不是電話的不收');
  assert.equal(m.parseIntel('{"expansion": true, "score": 9, "summary": "x"}').score, 3, '分數上限 3');
  assert.equal(m.parseIntel('{"expansion": true, "score": 0, "summary": "x"}').expansion, false, 'expansion 但分數 0 ＝沒有');
  assert.equal(m.parseIntel('沒有 JSON'), null);
  assert.equal(m.parseIntel(''), null);
  const nested = m.parseIntel('{"a":1} 後面還有 {"expansion": true, "score": 1, "summary": "官網：{新廠} 2026", "sources": []}');
  assert.equal(nested && nested.summary, '官網：{新廠} 2026', '摘要裡有大括號也拆得對');
});
