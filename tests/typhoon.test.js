'use strict';
/*
 * 颱風假：人事行政總處停班公告頁的解析（版本 370）。頁面是假的、照探路看到的結構寫。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('./load');

const page = (ntpc, extra = '') => `<html><body><p>更新時間：2026/10/22 17:11:04</p>
<TABLE><TBODY>
<TR><TD headers="city_Name Taipei City"><FONT>臺北市</FONT></TD><TD vAlign=center align=left width="70%">
尚未宣布消息
</TD></TR>
<TR><TD vAlign=center align=middle width="17%" headers="city_Name New Taipei City">
<FONT>新北市</FONT>
</TD>
<TD vAlign=center align=left width="70%">
${ntpc}
</TD></TR>${extra}</TBODY></TABLE></body></html>`;

test('停班公告：更新時間、新北市那格的句子', async () => {
  const T = await import(pathToFileURL(path.join(ROOT, 'tools/fetch-typhoon.mjs')).href);
  assert.equal(T.updatedDate(page('尚未宣布消息')), '2026-10-22');
  assert.deepEqual(T.cityLines(page('尚未宣布消息')), ['尚未宣布消息']);
  const two = '<FONT color=#FF0000 >新北市:明天停止上班、停止上課。  </FONT><br><FONT color=#800080 >新北市烏來區:今天下午04:00起停止上班、停止上課。  </FONT>';
  assert.deepEqual(T.cityLines(page(two)), ['新北市:明天停止上班、停止上課。', '新北市烏來區:今天下午04:00起停止上班、停止上課。']);
  assert.equal(T.cityLines('<html>沒有表格</html>'), null);
});

test('停班公告：整個市整天停班才算假；半天、某區、某學校只記一筆不放假', async () => {
  const T = await import(pathToFileURL(path.join(ROOT, 'tools/fetch-typhoon.mjs')).href);
  const today = '2026-10-22';
  assert.deepEqual(T.offDays(['尚未宣布消息'], { today }), { off: [], note: [] });
  assert.deepEqual(T.offDays(['新北市:明天停止上班、停止上課。'], { today }).off, ['2026-10-23']);
  assert.deepEqual(T.offDays(['新北市:今天停止上班、停止上課。', '新北市:明天停止上班、停止上課。'], { today }).off, ['2026-10-22', '2026-10-23']);
  const half = T.offDays(['新北市:今天下午04:00起停止上班、停止上課。', '新北市烏來區:明天停止上班、停止上課。', '新北市某某國民小學:明天停止上班、停止上課。', '新北市:今天照常上班、照常上課。'], { today });
  assert.deepEqual(half.off, []);
  assert.equal(half.note.length, 3);
  assert.match(half.note[0], /^2026-10-22 新北市下午04:00起停止上班/);
  // 全形冒號也認得
  assert.deepEqual(T.offDays(['新北市：今天停止上班、停止上課。'], { today }).off, ['2026-10-22']);
  // 整個市停班時那句沒有對象（2026/10/23 實際的寫法；版本 372 修）
  assert.deepEqual(T.offDays(['今天停止上班、停止上課。'], { today }).off, ['2026-10-22']);
  assert.deepEqual(T.offDays(['明天停止上班、停止上課。'], { today }).off, ['2026-10-23']);
  assert.deepEqual(T.offDays(['今天下午04:00起停止上班、停止上課。'], { today }).off, []);
  assert.deepEqual(T.offDays(['今天照常上班、照常上課。'], { today }), { off: [], note: [] });
});
