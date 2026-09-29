/**
 * 重點推廣名單的商工登記更新，改在 GitHub Actions 後台跑。
 *
 * 使用者：「我的重點電推名單的自動透過商工登記更新的步驟也能在後台自動跑嗎」。
 * 名單不在 GitHub 上（在瀏覽器與使用者自己的雲端硬碟），所以這支走雲端硬碟：
 *
 *   1. 用 Google 服務帳號讀雲端硬碟裡的「電話推廣名單-同步資料.json」（使用者要把這個檔分享給服務帳號）
 *   2. 每一筆客戶拿統編（沒統編用名稱）查商工登記——用網站自己的 registry.js，跟瀏覽器裡一模一樣
 *   3. 比對名單上的欄位（跟 app.js 的 REGISTRY_FIELDS 同一套）：資本總額、實收資本額、負責人、地址、成立年、核准變更日期
 *   4. 這個 repo 是公開的，Actions 的執行紀錄誰都看得到，所以紀錄裡只印筆數；差異的明細寫進同步檔的
 *      設定 registry-drive-report，網站「從商工登記更新公司資料」視窗會顯示。
 *      report 模式：只寫報告，不動任何客戶資料（先跑幾天確認無誤）
 *      write 模式：把差異寫成「編輯」（edits＋editsAt，跟瀏覽器套用登記的做法一樣，詳細頁可還原）、
 *      記查核時間與變更登記歷程（regAt／regChanges），把 registry-auto-last 設成今天（瀏覽器那條每日
 *      更新看到今天跑過就不重跑），用 sync.js 的 mergeDumps 跟雲端最新版合併後寫回。寫回前先把
 *      雲端硬碟目前的版本釘住（keepForever），出事可以從版本紀錄退回。
 *
 * 需要下面兩種之一：
 *   GDRIVE_ACCESS_TOKEN     由 workflow 的 google-github-actions/auth 用 Workload Identity 聯盟換來的存取權杖
 *                           （使用者的 Google Cloud 組織政策禁止建立服務帳號金鑰，走這條不用金鑰）
 *   GDRIVE_SERVICE_ACCOUNT  服務帳號的 JSON 金鑰（放 repo Secrets）；組織允許建金鑰的話比較簡單
 * 用法：node tools/registry-drive.mjs [--mode report|write] [--limit N] [--mirror]
 */
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { loadModules } = require('../tests/load.js');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const MODE = opt('mode', 'report') === 'write' ? 'write' : 'report';
const LIMIT = Number(opt('limit', '0')) || 0;
const FORCE_MIRROR = args.includes('--mirror');
const DELAY = Number(opt('delay', '300')) || 300;

const FILE_NAME = '電話推廣名單-同步資料.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const fetchLikeBrowser = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), 'User-Agent': UA }, signal: init.signal || AbortSignal.timeout(45000) });
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 純邏輯（跟 app.js 同一套規則，測試也測這幾個） ---------------- */

const REGISTRY_FIELDS = [
  ['taxId', '統一編號'], ['capital', '資本總額（仟元）'], ['capitalPaid', '實收資本額（仟元）'],
  ['owner', '負責人'], ['address', '登記地址'], ['founded', '成立年'], ['regChanged', '最近核准變更日期'],
];
const FIELD_LABEL = Object.fromEntries(REGISTRY_FIELDS);
const REG_KIND_ORDER = ['capitalUp', 'capitalDown', 'address', 'owner', 'other'];
const registryValue = (key, data) => { const v = String((data && data[key]) || '').trim(); if (key === 'founded') { const m = v.match(/^(\d{4})/); return m ? m[1] : ''; } return v; };
const listValue = (key, r) => { const v = String((r && r[key]) || '').trim(); if (key === 'founded') { const m = v.match(/(\d{4})/); return m ? m[1] : v; } return v; };

/** 名單上這筆現在的樣子＝原始資料蓋上使用者（或上次登記更新）的編輯 */
const viewOf = (rec, st) => (st && st.edits ? { ...rec, ...st.edits } : rec);

const regDateMs = (v) => { const m = String(v || '').match(/(\d{2,4})[/\-.](\d{1,2})[/\-.](\d{1,2})/); if (!m) return 0; const y = +m[1] < 1911 ? +m[1] + 1911 : +m[1]; return Date.UTC(y, +m[2] - 1, +m[3]); };
/** 查到的核准變更日期比名單上的舊：備援來源的舊快照，整筆不套用（跟 app.js staleRegistry 同一條規則） */
const staleRegistry = (r, data) => { const mine = regDateMs(listValue('regChanged', r)); const got = regDateMs(registryValue('regChanged', data)); return !!(mine && got && got < mine); };

/** 登記查到的跟名單不一樣的欄位 { key: { from, to } }；查到有值才算；資料比名單舊就回空的 */
function diffFields(r, data) {
  const changes = {};
  if (staleRegistry(r, data)) return changes;
  REGISTRY_FIELDS.forEach(([key]) => {
    const now = listValue(key, r); const next = registryValue(key, data);
    if (next && next !== now) changes[key] = { from: now, to: next };
  });
  return changes;
}

/** 分類成變更登記：增資／減資、地址、負責人、其他；原本空白的不算變更（app.js classifyRegistryChanges） */
function classify(changes, r) {
  const kinds = new Set();
  const num = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
  const paidNow = num((changes.capitalPaid && changes.capitalPaid.to) || (r && r.capitalPaid));
  Object.entries(changes).forEach(([key, ch]) => {
    if (!String(ch.from || '').trim()) return;
    if (key === 'regChanged') return;
    if (key === 'capital' || key === 'capitalPaid') {
      const a = num(ch.from); const b = num(ch.to);
      if (key === 'capital' && paidNow && a === paidNow) return;
      if (b > a) kinds.add('capitalUp'); else if (b < a) kinds.add('capitalDown');
    } else if (key === 'address') kinds.add('address');
    else if (key === 'owner') kinds.add('owner');
    else kinds.add('other');
  });
  return REG_KIND_ORDER.filter((k) => kinds.has(k));
}

/**
 * 把查核結果套進 dump 的 states（回傳新的 dump，不改原本的）。
 * 跟瀏覽器的 recordRegistryChecks＋applyRegistryDiffs 做一樣的事：
 * 有差異 → edits 蓋上去、editsAt＝現在；regAt＝現在；有變更登記 → regChanges 往上加一筆。
 * 查不到 → regAt＋regError。settings 的 registry-auto-last 設成今天。
 */
function applyResults(dump, results, { now, today, mergeRegChanges, regHistoryOf }) {
  const states = new Map((dump.states || []).map((s) => [s.recordId, s]));
  let edited = 0;
  results.forEach((res) => {
    const prev = states.get(res.recordId) || { recordId: res.recordId };
    const st = { ...prev };
    if (!res.ok) {
      st.regAt = now; st.regError = String(res.reason || '查不到').split('\n')[0].slice(0, 120);
    } else {
      st.regAt = now; delete st.regError;
      const kinds = classify(res.changes, res.view);
      if (kinds.length) {
        const kept = {};
        Object.entries(res.changes).forEach(([key, ch]) => { if (String(ch.from || '').trim()) kept[key] = ch; });
        st.regChanges = mergeRegChanges([{ date: today, kinds, changes: kept }], regHistoryOf(prev));
        [st.regChange] = st.regChanges;
      }
      if (Object.keys(res.changes).length) {
        st.edits = { ...(prev.edits || {}) };
        Object.entries(res.changes).forEach(([key, ch]) => { st.edits[key] = ch.to; });
        st.editsAt = now;
        edited += 1;
      }
    }
    st.updatedAt = Math.max(prev.updatedAt || 0, now);
    states.set(res.recordId, st);
  });
  const settings = { ...(dump.settings || {}) };
  settings['registry-auto-last'] = { v: today, at: now };
  const okCount = results.filter((r) => r.ok).length;
  settings['registry-auto-summary'] = { v: `後台查 ${results.length} 筆，更新 ${edited} 筆，${results.length - okCount} 筆查不到`, at: now };
  return { ...dump, states: [...states.values()], settings, edited };
}

/* ---------------- Google 服務帳號 → access token（不用任何套件） ---------------- */

const b64url = (s) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function accessToken(sa) {
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
const drive = async (token, url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`雲端硬碟回應 ${res.status}：${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res;
};
async function findFile(token) {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,owners(emailAddress))&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return ((await res.json()).files || [])[0] || null;
}
const download = async (token, id) => (await drive(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`)).json();
const modifiedTimeOf = async (token, id) => (await (await drive(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=modifiedTime&supportsAllDrives=true`)).json()).modifiedTime;
async function pinCurrentRevision(token, id) {
  const res = await drive(token, `https://www.googleapis.com/drive/v3/files/${id}/revisions?fields=revisions(id,modifiedTime,keepForever)&pageSize=1000`);
  const revs = (await res.json()).revisions || [];
  const last = revs[revs.length - 1];
  if (!last) return '';
  if (!last.keepForever) await drive(token, `https://www.googleapis.com/drive/v3/files/${id}/revisions/${last.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepForever: true }) });
  return last.id;
}
const upload = (token, id, dump) => drive(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dump) });

/* ---------------- 主流程 ---------------- */

const SETUP = `還沒設定 Google 的存取（Actions 變數 GCP_WIF_PROVIDER＋GCP_SERVICE_ACCOUNT，或 Secrets 的 GDRIVE_SERVICE_ACCOUNT 都沒有），這次沒有查。設定步驟見 README「重點推廣名單：商工登記更新改在後台跑」。`;

async function main() {
  const raw = process.env.GDRIVE_SERVICE_ACCOUNT || '';
  const preToken = (process.env.GDRIVE_ACCESS_TOKEN || '').trim();
  const summary = [];
  const out = (line) => { console.log(line); summary.push(line); };
  if (!raw.trim() && !preToken) { out(SETUP); await writeSummary(summary); return; }
  let token = preToken;
  let saEmail = process.env.GCP_SERVICE_ACCOUNT || '';
  if (!token) {
    let sa;
    try { sa = JSON.parse(raw); } catch (e) { throw new Error('GDRIVE_SERVICE_ACCOUNT 不是合法的 JSON（要貼服務帳號金鑰檔的整個內容）'); }
    if (!sa.client_email || !sa.private_key) throw new Error('GDRIVE_SERVICE_ACCOUNT 缺 client_email 或 private_key');
    token = await accessToken(sa);
    saEmail = sa.client_email;
  }

  const w = loadModules(['normalize', 'registry', 'sync'], { fetch: fetchLikeBrowser });
  const { Registry, DriveSync } = w;
  const file = await findFile(token);
  if (!file) throw new Error(`雲端硬碟裡找不到「${FILE_NAME}」，或還沒分享給服務帳號 ${saEmail || '（見設定）'}（要給「編輯者」權限）`);
  const dump = await download(token, file.id);
  const records = Array.isArray(dump.records) ? dump.records : [];
  const states = new Map((dump.states || []).map((s) => [s.recordId, s]));
  const setting = (k) => ((dump.settings || {})[k] || {}).v || '';
  const useMirror = FORCE_MIRROR || setting('registry-mirror') === '1';
  if (setting('registry-auto') === '0') out('※ 網站設定裡「每天自動更新」是關的；後台照查，但只在 write 模式才會寫回。');
  out(`同步檔：${records.length} 筆客戶（雲端最後修改 ${file.modifiedTime}），模式 ${MODE}${useMirror ? '，允許 g0v 鏡像' : ''}`);

  const targets = records.filter((r) => r && r.id && (r.taxId || r.company));
  const list = LIMIT ? targets.slice(0, LIMIT) : targets;
  const results = [];
  let fails = 0;
  const started = Date.now();
  for (let i = 0; i < list.length; i += 1) {
    const rec = list[i];
    const view = viewOf(rec, states.get(rec.id));
    const res = await Registry.lookupCompany({ taxId: String(view.taxId || '').replace(/\D/g, ''), name: view.company }, { useMirror });
    if (!res.ok) { results.push({ recordId: rec.id, company: view.company, ok: false, reason: res.reason }); fails += 1; }
    else { results.push({ recordId: rec.id, company: view.company, ok: true, changes: diffFields(view, res.data), view, label: res.label }); fails = 0; }
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${list.length}`);
    // 連續查不到太多筆就是被擋了，別再耗
    if (fails >= 8 && results.every((r) => !r.ok)) { out(`✗ 前 ${fails} 筆全部連不上（${String(res.reason || '').split('\n')[0]}），來源被擋住，這次停止。`); await writeSummary(summary); process.exitCode = 1; return; }
    if (DELAY) await nap(DELAY);
  }
  const okList = results.filter((r) => r.ok);
  const diffs = okList.filter((r) => Object.keys(r.changes).length);
  const failed = results.filter((r) => !r.ok);
  const missing = failed.filter((r) => /查無資料|沒有一筆的統編是|只回了部分欄位|不是 8 碼/.test(String(r.reason || '')));
  const sourceDown = !okList.length && failed.length === results.length && !missing.length && results.length > 0;
  out(`查了 ${results.length} 筆（${Math.round((Date.now() - started) / 1000)} 秒）：${diffs.length} 筆跟登記不一致，${failed.length} 筆查不到（其中 ${missing.length} 筆是登記上真的沒有）。明細在網站選單「從商工登記更新公司資料」裡。`);
  if (sourceDown) { out('✗ 每一筆都失敗，是來源連不上，不是資料的問題；這次不寫回。'); await writeSummary(summary); process.exitCode = 1; return; }

  const now = Date.now();
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);   // 台灣日期
  const report = buildReport({ mode: MODE, today, results, diffs, failed, missing, seconds: Math.round((now - started) / 1000) });

  // 寫回：釘住目前版本 → 重新下載最新版（使用者可能剛同步過）→ 套上結果 → 合併 → 上傳
  // report 模式只把報告寫進設定，客戶資料一個字都不動
  const pinned = await pinCurrentRevision(token, file.id);
  const latestTime = await modifiedTimeOf(token, file.id);
  const base = latestTime !== file.modifiedTime ? await download(token, file.id) : dump;
  const patched = MODE === 'write'
    ? applyResults(base, results, { now, today, mergeRegChanges: DriveSync.mergeRegChanges, regHistoryOf: DriveSync.regHistoryOf })
    : { ...base, settings: { ...(base.settings || {}) }, edited: 0 };
  patched.settings['registry-drive-report'] = { v: report, at: now };
  const merged = DriveSync.mergeDumps(base, { ...patched, records: [], logs: [] });
  const keep = MODE === 'write' ? ['registry-auto-last', 'registry-auto-summary', 'registry-drive-report'] : ['registry-drive-report'];
  merged.settings = { ...(merged.settings || {}), ...Object.fromEntries(keep.map((k) => [k, patched.settings[k]])) };
  await upload(token, file.id, merged);
  out(MODE === 'write'
    ? `已寫回雲端硬碟：更新 ${patched.edited} 筆的欄位，${results.length} 筆記了查核時間${pinned ? '；寫回前的版本已釘在版本紀錄（可退回）' : ''}。下次開網站同步就會看到。`
    : '（report 模式：只把報告寫進同步檔，客戶資料沒動。確認幾天沒問題後把 Actions 變數 REGISTRY_DRIVE_MODE 設成 write。）');
  await writeSummary(summary);
}

/** 給網站看的報告（純文字，最多一萬多字；同步檔的設定會進 localStorage，不能太大） */
function buildReport({ mode, today, results, diffs, failed, missing, seconds }) {
  const KIND = { capitalUp: '增資', capitalDown: '減資', address: '變更地址', owner: '變更負責人', other: '其他' };
  const lines = [`${today} 後台商工登記更新（${mode === 'write' ? '已套用' : '只列差異、沒套用'}）：查 ${results.length} 筆，${seconds} 秒；${diffs.length} 筆跟登記不一致，${failed.length} 筆查不到（${missing.length} 筆登記上真的沒有）。`];
  if (diffs.length) {
    lines.push('', `▍有差異的 ${diffs.length} 筆`);
    diffs.forEach((d) => {
      const kinds = classify(d.changes, d.view);
      lines.push(`• ${d.company}${kinds.length ? `（${kinds.map((k) => KIND[k]).join('、')}）` : '（補齊空白欄位）'}：${Object.entries(d.changes).map(([k, ch]) => `${FIELD_LABEL[k]} ${ch.from || '（空）'} → ${ch.to}`).join('；')}`);
    });
  }
  if (failed.length) {
    lines.push('', `▍查不到的 ${failed.length} 筆`);
    failed.forEach((f) => lines.push(`• ${f.company}：${String(f.reason || '').split('\n')[0].slice(0, 80)}`));
  }
  const text = lines.join('\n');
  return text.length > 12000 ? `${text.slice(0, 12000)}\n…（太長，後面略）` : text;
}

async function writeSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

export { diffFields, classify, applyResults, viewOf, buildReport, staleRegistry, regDateMs, REGISTRY_FIELDS };

if (process.argv[1] && /registry-drive\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
