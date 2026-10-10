/*
 * 每日新名單改在 GitHub Actions 後台挑（版本 321）。
 *
 * 使用者：「每日新名單＋補電話：挑今天的新名單、查 Google 地圖電話、沒電話的跳過，5 點做完寫進同步檔」→「Ok」。
 *
 * 做法不是把挑名單的邏輯再寫一遍，而是在 Actions 上用無頭的 Chromium 打開網站本身：
 *   1. 用服務帳號（Workload Identity 聯盟換來的權杖）冒充「已登入 Google」——網站的 DriveSync 只認 google.accounts.oauth2
 *      的 token client，這裡塞一個假的進去，回的就是那把權杖；跟瀏覽器測試（tests/e2e/test-sync-race.js）同一招。
 *   2. 網站自己同步雲端硬碟的「電話推廣名單-同步資料.json」（使用者已分享給服務帳號）。
 *   3. 呼叫網站的 dailyFeed({ force: true, awaitPhones: true })：挑今天的新名單、先對貿易署電話表、再用 Google 地圖補電話，
 *      跟使用者手機上跑的是同一份程式（額度、比例、假日、沒電話的跳過、以前刪掉的不挑……全部照舊）。
 *      Google 的金鑰放 Secrets（PLACES_API_KEY）；金鑰有「網站限制」的話，送 Google 的請求把 Referer 改成網站的網址。
 *   4. 每月 1 日（或手動指定）順便 phoneBackGoogle()：「找不到電話」收起來的公司用 Google 地圖再查一次，查到只提醒。
 *   5. 再同步一次寫回雲端硬碟；網站的設定 daily-feed-on＝今天會一起同步，使用者開網站就不會再挑一次。
 *
 * report 模式：整套照跑，但送去雲端硬碟的「上傳」都被攔下來假裝成功，什麼都不會寫回（只看筆數對不對）。
 * 這個 repo 是公開的，Actions 的紀錄誰都看得到：這裡只印筆數，不印公司名、電話。
 *
 * 用法：node tools/feed-drive.mjs [--mode report|write] [--nophone auto|yes|no]
 *   需要：GDRIVE_ACCESS_TOKEN（或 GDRIVE_SERVICE_ACCOUNT）、PLACES_API_KEY；本機測試可設 PW_CHROMIUM 指定瀏覽器。
 *   Claude（版本 322）：有 Workload Identity 聯合的環境變數（ANTHROPIC_FEDERATION_RULE_ID…，workflow 設）或 ANTHROPIC_API_KEY，
 *   就在挑名單前用 Claude＋網路搜尋查候選的擴張訊號（tools/intel.mjs），查到的排前面。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_NAME, resolveAuth, findFile, modifiedTimeOf, pinCurrentRevision } from './drive-lib.mjs';
import { researchCompanies } from './intel.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const MODE = opt('mode', 'report') === 'write' ? 'write' : 'report';
const NOPHONE = opt('nophone', 'auto');
const PLACES_KEY = (process.env.PLACES_API_KEY || '').trim();
const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
// Workload Identity 聯合（不用金鑰）：四個變數都有才算設好；SDK 自己拿 OIDC token 去換存取權杖
const ANTHROPIC_WIF = ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID', 'ANTHROPIC_IDENTITY_TOKEN_FILE'].every((k) => (process.env[k] || '').trim());
const CLAUDE_ON = !!ANTHROPIC_KEY || ANTHROPIC_WIF;
// Google 金鑰的「網站限制」看 Referer：假裝是從網站本身送出的
const SITE_URL = (process.env.SITE_URL || (process.env.GITHUB_REPOSITORY ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0].toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '')).trim();

const SETUP = '還沒設定 Google 的存取（Actions 變數 GCP_WIF_PROVIDER＋GCP_SERVICE_ACCOUNT，或 Secrets 的 GDRIVE_SERVICE_ACCOUNT 都沒有），這次沒有挑。設定步驟見 README「重點推廣名單：商工登記更新改在後台跑」。';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

/** 把 repo 當靜態網站開在本機（跟 tests/e2e 的做法一樣） */
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((rq, rs) => {
      const rel = decodeURIComponent((rq.url || '/').split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT)) { rs.writeHead(403); rs.end(); return; }
      fs.readFile(file, (e, b) => {
        if (e) { rs.writeHead(404); rs.end(); return; }
        rs.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        rs.end(b);
      });
    }).listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const taipeiDate = () => new Date(Date.now() + 8 * 3600000);

async function main() {
  const summary = [];
  const out = (line) => { console.log(line); summary.push(line); };
  const auth = await resolveAuth();
  if (!auth) { out(SETUP); await writeSummary(summary); return; }
  const { token, saEmail } = auth;
  const file = await findFile(token);
  if (!file) throw new Error(`雲端硬碟裡找不到「${FILE_NAME}」，或還沒分享給服務帳號 ${saEmail || '（見設定）'}（要給「編輯者」權限）`);
  const doNoPhone = NOPHONE === 'yes' || (NOPHONE === 'auto' && taipeiDate().getUTCDate() === 1);
  out(`同步檔雲端最後修改 ${file.modifiedTime}；模式 ${MODE}${PLACES_KEY ? '，有 Google 金鑰' : '，沒有 Google 金鑰（沒電話的只能靠公開資料）'}${CLAUDE_ON ? `，Claude 用${ANTHROPIC_WIF ? '身分聯合' : '金鑰'}（候選先上網查擴張訊號）` : '，沒設 Claude（不上網查訊號）'}${doNoPhone ? '，這次順便幫找不到電話的再查 Google' : ''}`);

  const { chromium } = require('playwright');
  const { srv, port } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  let pageErrors = 0;
  try {
    const ctx = await browser.newContext({ timezoneId: 'Asia/Taipei', locale: 'zh-TW', viewport: { width: 1300, height: 1000 } });
    // 1. 假的 Google 登入元件：要權杖就給服務帳號的那把；網站的設定只留這次要的
    await ctx.addInitScript(({ tok, key }) => {
      window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: tok, expires_in: 3000 }), 0) }) } } };
      try {
        localStorage.setItem('driveClientId', 'backend');   // DriveSync.isConfigured() 看這個
        localStorage.setItem('device-id', 'backend');
        localStorage.setItem('daily-feed-auto', '0');       // 不要網站一開就自己挑，等同步完由這支叫
        localStorage.setItem('auto-rebalance', '0');        // 重排、商工登記更新不在這裡做
        localStorage.setItem('registry-auto', '0');
        if (key) localStorage.setItem('places-api-key', key); else localStorage.removeItem('places-api-key');
      } catch (e) { /* 不會發生 */ }
    }, { tok: token, key: PLACES_KEY });
    await ctx.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    if (SITE_URL) await ctx.route('https://places.googleapis.com/**', (r) => r.continue({ headers: { ...r.request().headers(), referer: SITE_URL } }));
    // report 模式：上傳一律攔下來假裝成功，雲端硬碟一個字都不會動
    if (MODE !== 'write') await ctx.route('https://www.googleapis.com/upload/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: file.id }) }));
    const page = await ctx.newPage();
    page.on('pageerror', () => { pageErrors += 1; });
    // 網站挑名單時把候選丟過來，這邊用 Claude＋網路搜尋查擴張訊號（沒金鑰就不掛，網站照舊）
    const researchStats = { asked: 0, withSignals: 0, failed: 0 };
    if (CLAUDE_ON) {
      await page.exposeFunction('backendResearch', async (items) => {
        const r = await researchCompanies(items || [], { apiKey: ANTHROPIC_KEY, log: (m) => console.log(`  ${m}`) });
        researchStats.asked += r.asked; researchStats.withSignals += r.withSignals; researchStats.failed += r.failed;
        return r.results;
      });
    }
    page.on('dialog', (d) => d.accept());
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.waitForFunction(() => typeof window.dailyFeed === 'function' && typeof window.runSync === 'function' && window.Store, null, { timeout: 60000 });

    // 2. 先同步：把雲端的名單拉下來（網站一開也會自己同步，DriveSync 同時只跑一次）
    const first = await page.evaluate(() => window.runSync({ quiet: true }).then((r) => (r ? { ok: true, firstTime: !!r.firstTime } : { ok: false })));
    if (!first.ok) throw new Error('雲端硬碟同步失敗（看網站的同步設定與服務帳號的分享）');
    if (first.firstTime) throw new Error('網站找不到同步檔、想新建一個：服務帳號沒有儲存空間，不能這樣。請確認同步檔已分享給服務帳號');
    const n = await page.evaluate(async () => (await window.Store.allRecords()).length);
    out(`同步完成：名單 ${n} 筆`);

    // 3. 挑今天的新名單（跟網站一模一樣的那條），等補電話跑完
    const res = await page.evaluate(() => window.dailyFeed({ force: true, awaitPhones: true }));
    const today = taipeiDate().toISOString().slice(0, 10);
    let line;
    if (!res) line = `${today} 後台沒有挑（網站的每日新名單沒跑：可能還沒有名單、或清冊沒載到）`;
    else if (res.holiday) line = `${today} 放假，今天不挑`;
    else if (res.full) line = `${today} 今天的 ${res.quota} 家新名單已經排滿（已有 ${res.have} 家），沒挑`;
    else if (!res.picked) line = `${today} 候選裡沒有可以補的${res.skippedNoPhone ? `（${res.skippedNoPhone} 家沒電話、Google 地圖也查不到）` : ''}`;
    else {
      const src = Object.entries(res.bySrc || {}).map(([k, v]) => `${k} ${v}`).join('、');
      const ph = res.phones || {};
      line = `${today} 後台挑了 ${res.picked} 家（${src}${res.biz ? `；商行／企業社 ${res.biz}` : ''}），排在 ${res.day}`
        + `${res.lost > 0 ? `；${res.lost} 家匯入時比對到已在名單上，略過` : ''}${res.skippedNoPhone ? `；沒電話的跳過 ${res.skippedNoPhone} 家` : ''}`
        + `${ph.trade ? `；出進口電話表對到 ${ph.trade.found}/${ph.trade.tried}` : ''}${ph.google ? `，Google 地圖找到 ${ph.google.found}/${ph.google.tried}` : ''}`
        + `${res.research ? `；網路查了 ${res.research.asked} 家，${res.research.strong} 家有明確擴張訊號（弱訊號 ${res.research.withSignals - res.research.strong}）${researchStats.failed ? `（${researchStats.failed} 家查失敗）` : ''}；挑進來的 ${res.picked} 家裡 ${res.research.pickedStrong} 家有明確訊號` : ''}`;
    }
    out(line);

    // 4. 每月一次：找不到電話的再查 Google
    if (doNoPhone) {
      const pb = await page.evaluate(() => window.phoneBackGoogle());
      out(`找不到電話的：Google 地圖查了 ${pb.tried} 家、查到 ${pb.found} 家；以前查到還留著的 ${pb.kept} 家、公開資料有的 ${pb.skipped} 家`);
    }

    // 5. 寫回：把這次的結果留一句在同步檔的設定（網站「每天打得完幾家」會顯示），釘住雲端目前的版本，再同步一次
    if (MODE === 'write') {
      const stamp = `${taipeiDate().toISOString().slice(5, 16).replace('T', ' ')} ${line.replace(/^\d{4}-\d{2}-\d{2} /, '')}`;
      await page.evaluate((s) => window.Store.setSetting('feed-drive-summary', s), stamp);
      const pinned = await pinCurrentRevision(token, file.id);
      const before = await modifiedTimeOf(token, file.id);
      const last = await page.evaluate(() => window.runSync({ quiet: true }).then((r) => !!r));
      if (!last) throw new Error('最後寫回雲端硬碟失敗');
      // 網站匯入後自己排的那次同步（4 秒後）可能還沒跑完：等它，別關到一半
      await nap(6000);
      await page.waitForFunction(() => !document.querySelector('#btnSync.is-busy'), null, { timeout: 60000 }).catch(() => null);
      const after = await modifiedTimeOf(token, file.id);
      out(after !== before || !res || !res.picked
        ? `已寫回雲端硬碟（${after}）${pinned ? '；寫回前的版本已釘在版本紀錄（可退回）' : ''}。使用者開網站同步就會看到，網站今天不會再挑一次。`
        : '※ 雲端硬碟的修改時間沒變，寫回可能沒成功，請看 Actions 紀錄。');
    } else {
      out('（report 模式：上傳都攔下來了，雲端硬碟沒動。確認筆數對了就把排程的模式改成 write。）');
    }
  } finally {
    await browser.close().catch(() => null);
    srv.close();
  }
  if (pageErrors) out(`※ 網站跑的時候有 ${pageErrors} 個 JS 錯誤（內容不印，自己開網站看 console）`);
  await writeSummary(summary);
}

async function writeSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await fs.promises.appendFile(process.env.GITHUB_STEP_SUMMARY, `${['## 每日新名單（後台）', '', ...lines.map((l) => `- ${l}`)].join('\n')}\n`);
}

main().catch(async (err) => {
  console.error(`✗ ${err && err.message ? err.message : err}`);
  await writeSummary([`✗ ${err && err.message ? err.message : err}`]);
  process.exitCode = 1;
});
