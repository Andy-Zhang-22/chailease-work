// 探路：上週五以來雲端每個版本裡，下次聯絡日曾是 2027-02-01 的客戶，日期怎麼變的（只印日期與時間戳，看完就刪）
import { resolveAuth, findFile, drive } from './drive-lib.mjs';
const { token } = await resolveAuth();
const file = await findFile(token);
const revs = ((await (await drive(token, `https://www.googleapis.com/drive/v3/files/${file.id}/revisions?fields=revisions(id,modifiedTime)&pageSize=1000`)).json()).revisions || []).filter((r) => r.modifiedTime >= '2026-10-15T16:00:00Z');
const tw = (ms) => (ms ? new Date(Number(ms) + 8 * 3600000).toISOString().slice(5, 16).replace('T', ' ') : '-');
const dumps = [];
for (const rev of revs) dumps.push({ at: tw(Date.parse(rev.modifiedTime)), dump: await (await drive(token, `https://www.googleapis.com/drive/v3/files/${file.id}/revisions/${rev.id}?alt=media`)).json() });
console.log(`版本 ${dumps.length} 個（台灣時間）：${dumps.map((d) => d.at).join('、')}`);
const stateList = (d) => Array.isArray(d.states) ? d.states : Object.values(d.states || {});
const targets = new Set();
dumps.forEach(({ dump }) => stateList(dump).forEach((s) => { if (s && s.nextDate === '2027-02-01') targets.add(s.recordId); }));
console.log(`下次聯絡日曾是 2027-02-01 的客戶：${targets.size} 家`);
let n = 0;
for (const id of targets) {
  n += 1;
  console.log(`客戶 ${n}：`);
  let prev = '';
  dumps.forEach(({ at, dump }) => {
    const s = stateList(dump).find((x) => x && x.recordId === id);
    const line = s ? `nextDate ${s.nextDate || '-'}｜欄位時間 ${tw(s.fieldAt && s.fieldAt.nextDate)}｜整筆 ${tw(s.updatedAt)}｜lastDate ${s.lastDate || '-'}｜固定 ${s.pinDate ? '是' : '否'}｜關係企業 ${s.group ? '有' : '無'}｜dueDoneOn ${s.dueDoneOn || '-'}` : '（沒有這筆狀態）';
    if (line !== prev) console.log(`  版本 ${at}：${line}`);
    prev = line;
  });
  const logs = (dumps[dumps.length - 1].dump.logs || []).filter((l) => l.recordId === id);
  console.log(`  現在的通話紀錄 ${logs.length} 則：${logs.map((l) => `${tw(l.createdAt)}${l.updatedAt && l.updatedAt !== l.createdAt ? `（改於 ${tw(l.updatedAt)}）` : ''}`).join('、')}`);
}
const cur = dumps[dumps.length - 1].dump;
const byDay = {};
(cur.logs || []).forEach((l) => { const d = tw(l.createdAt).slice(0, 5); if (d >= '10-13' && d <= '10-19') byDay[d] = (byDay[d] || 0) + 1; });
console.log(`現在的通話紀錄，本週每天筆數：${Object.entries(byDay).sort().map(([d, c]) => `${d} ${c}`).join('、')}`);
