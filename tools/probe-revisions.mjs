// 探路：同步檔與備份檔的版本紀錄佔多少空間（只印筆數與大小，看完就刪）
import { resolveAuth, findFile, drive } from './drive-lib.mjs';
const auth = await resolveAuth();
const { token } = auth;
const file = await findFile(token);
const mb = (b) => (Number(b) / 1048576).toFixed(1);
const res = await drive(token, `https://www.googleapis.com/drive/v3/files/${file.id}/revisions?fields=revisions(id,modifiedTime,keepForever,size)&pageSize=1000`);
const revs = (await res.json()).revisions || [];
const pinned = revs.filter((r) => r.keepForever);
const total = revs.reduce((s, r) => s + Number(r.size || 0), 0);
console.log(`同步檔版本 ${revs.length} 個，合計 ${mb(total)} MB；釘住的 ${pinned.length} 個，合計 ${mb(pinned.reduce((s, r) => s + Number(r.size || 0), 0))} MB`);
console.log(`最舊版本 ${revs[0] && revs[0].modifiedTime}，最新 ${revs[revs.length - 1] && revs[revs.length - 1].modifiedTime}`);
const byDay = {};
revs.forEach((r) => { const d = String(r.modifiedTime).slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
console.log('每天版本數：' + Object.entries(byDay).map(([d, n]) => `${d.slice(5)} ${n}`).join('、'));
const q = encodeURIComponent(`name contains '電話推廣名單' and trashed=false`);
const list = await (await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(name,size,modifiedTime)&pageSize=100`)).json();
(list.files || []).forEach((f) => console.log(`檔案 ${f.name.replace(/\d{8}/, '日期')} ${mb(f.size)} MB ${String(f.modifiedTime).slice(0, 10)}`));
