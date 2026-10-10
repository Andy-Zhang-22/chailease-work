/*
 * 雲端硬碟存取的共用小工具：後台的商工登記更新（registry-drive.mjs）與每日新名單（feed-drive.mjs）都用這支。
 *
 * 兩種身分擇一（都沒有就回 null，呼叫端印設定步驟）：
 *   GDRIVE_ACCESS_TOKEN     workflow 用 google-github-actions/auth（Workload Identity 聯盟）換來的存取權杖
 *   GDRIVE_SERVICE_ACCOUNT  服務帳號的 JSON 金鑰（Secrets）
 * 服務帳號自己沒有儲存空間，只能讀寫使用者分享給它的那個檔，不能新建檔案。
 */
import crypto from 'node:crypto';

export const FILE_NAME = '電話推廣名單-同步資料.json';

/* ---------------- Google 服務帳號 → access token（不用任何套件） ---------------- */

const b64url = (s) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claims}`);
  const sig = signer.sign(sa.private_key).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${sig}`,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`拿不到 Google 存取權杖：HTTP ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}
export const drive = async (token, url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`雲端硬碟回應 ${res.status}：${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res;
};
export async function findFile(token) {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,owners(emailAddress))&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return ((await res.json()).files || [])[0] || null;
}
export const download = async (token, id) => (await drive(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`)).json();
export const modifiedTimeOf = async (token, id) => (await (await drive(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=modifiedTime&supportsAllDrives=true`)).json()).modifiedTime;
export async function pinCurrentRevision(token, id) {
  const res = await drive(token, `https://www.googleapis.com/drive/v3/files/${id}/revisions?fields=revisions(id,modifiedTime,keepForever)&pageSize=1000`);
  const revs = (await res.json()).revisions || [];
  const last = revs[revs.length - 1];
  if (!last) return '';
  if (!last.keepForever) await drive(token, `https://www.googleapis.com/drive/v3/files/${id}/revisions/${last.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepForever: true }) });
  return last.id;
}
export const upload = (token, id, dump) => drive(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dump) });

/** 從環境變數決定用哪種身分；回 { token, saEmail }，都沒設回 null */
export async function resolveAuth() {
  const raw = process.env.GDRIVE_SERVICE_ACCOUNT || '';
  const preToken = (process.env.GDRIVE_ACCESS_TOKEN || '').trim();
  if (!raw.trim() && !preToken) return null;
  if (preToken) return { token: preToken, saEmail: process.env.GCP_SERVICE_ACCOUNT || '' };
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { throw new Error('GDRIVE_SERVICE_ACCOUNT 不是合法的 JSON（要貼服務帳號金鑰檔的整個內容）'); }
  if (!sa.client_email || !sa.private_key) throw new Error('GDRIVE_SERVICE_ACCOUNT 缺 client_email 或 private_key');
  return { token: await accessToken(sa), saEmail: sa.client_email };
}
