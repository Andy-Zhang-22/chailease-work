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

test('addUsage／estimateUsd：每輪的 token 與搜尋次數加總，照牌價估美金（版本 334）', async () => {
  const m = await import(path.join(ROOT, 'tools', 'intel.mjs'));
  const u = m.emptyUsage();
  m.addUsage(u, { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 100, server_tool_use: { web_search_requests: 3 } });
  m.addUsage(u, { input_tokens: 1000, output_tokens: 500 });   // 第二輪沒搜尋、沒快取
  m.addUsage(u, null);   // 沒 usage 也不會炸
  assert.deepEqual(u, { input: 2000, output: 1000, cacheRead: 200, cacheWrite: 100, searches: 3 });
  // 2000×2 + 1000×10 + 200×0.2 + 100×2.5 ＝ 14,290 微美元 ＝ 0.01429；搜尋 3×0.01 ＝ 0.03 → 0.04
  assert.equal(m.estimateUsd(u), 0.04);
  assert.equal(m.estimateUsd(m.emptyUsage()), 0);
  // 真實規模：48 家、每家 4 次搜尋、輸入 8k、輸出 0.5k → 約 US$3
  const big = { input: 48 * 8000, output: 48 * 500, cacheRead: 0, cacheWrite: 0, searches: 48 * 4 };
  assert.equal(m.estimateUsd(big), 2.93);
});

test('pickModel／estimateUsd 換 Opus：牌價不同，不認得的名字回 Sonnet（版本 335）', async () => {
  const m = await import(path.join(ROOT, 'tools', 'intel.mjs'));
  assert.equal(m.pickModel('opus').id, 'claude-opus-5-5');
  assert.equal(m.pickModel('OPUS').id, 'claude-opus-5-5');
  assert.equal(m.pickModel('').id, 'claude-sonnet-5-5');
  assert.equal(m.pickModel('gpt').id, 'claude-sonnet-5-5');
  const big = { input: 48 * 8000, output: 48 * 500, cacheRead: 0, cacheWrite: 0, searches: 48 * 4 };
  assert.equal(m.estimateUsd(big, 'opus'), 3.94);   // 384k×4 + 24k×20 ＝ 2.016；搜尋 192×0.01 ＝ 1.92
  assert.equal(m.estimateUsd(big, 'sonnet'), m.estimateUsd(big));
});
