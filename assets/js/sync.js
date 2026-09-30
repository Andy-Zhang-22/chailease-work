/*
 * sync.js — 透過使用者自己的 Google 雲端硬碟，在多台裝置之間同步名單與通話紀錄。
 *
 * 沒有後端：瀏覽器直接拿 OAuth token 去打 Drive API，資料寫成雲端硬碟裡的一個
 * JSON 檔。客戶個資只會在「這台裝置」與「使用者自己的雲端硬碟」之間往返。
 *
 * 合併而不是覆蓋：兩台裝置各自記的通話紀錄都會保留，同一筆客戶的追蹤狀態
 * 取比較新的那一份。刪除靠墓碑記錄，才不會下次同步又被救回來。
 */
(function (global) {
  'use strict';

  const FILE_NAME = '電話推廣名單-同步資料.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GIS_SRC = 'https://accounts.google.com/gsi/client';
  const CLIENT_ID_KEY = 'driveClientId';

  /* ---------------- 合併（純函式，與 Google 無關） ---------------- */

  const asMap = (list, key) => {
    const m = new Map();
    (list || []).forEach((item) => { if (item && item[key]) m.set(item[key], item); });
    return m;
  };

  // 墓碑的值可能是時間戳，也可能是 { at, ... } 這種帶資訊的（公司墓碑要顯示公司名）
  const tombAt = (v) => (v && typeof v === 'object' ? (v.at || 0) : (v || 0));

  function mergeTombstones(a, b) {
    const out = { logs: {}, sources: {}, records: {}, companies: {} };
    // companies：在這台刪掉的公司，別台匯入名單時也要一起擋，所以要跟著同步
    ['logs', 'sources', 'records', 'companies'].forEach((kind) => {
      const left = (a && a[kind]) || {};
      const right = (b && b[kind]) || {};
      Object.keys(left).forEach((k) => { out[kind][k] = left[k]; });
      Object.keys(right).forEach((k) => {
        const seen = out[kind][k];
        if (seen === undefined || tombAt(right[k]) >= tombAt(seen)) out[kind][k] = right[k];
      });
    });
    return out;
  }

  /*
   * 變更登記的歷程是「只會往上加」的紀錄。
   *
   * 9/16 查到增資、10/8 查到變更地址是兩件事，不是後面那件取代前面那件。
   * 兩台裝置各自查到的也都要留著：只取 regAt 比較新的那一份，會把另一台
   * 查到的那幾次整個弄丟。所以這裡取聯集，同一天同樣種類算同一次。
   */
  const REG_HISTORY_MAX = 20;
  function mergeRegChanges(left, right) {
    const seen = new Set();
    const out = [];
    const all = [...(left || []), ...(right || [])].filter((e) => e && e.date && (e.kinds || []).length);
    // 新的先看，同一天同種類、或內容一模一樣的（兩台裝置各查到一次同一件事）只留最新那次
    all.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    all.forEach((e) => {
      const content = JSON.stringify(Object.keys(e.changes || {}).sort().map((k) => [k, e.changes[k].from, e.changes[k].to]));
      const keys = [`${e.date}|${e.kinds.join(',')}`, `${e.kinds.join(',')}|${content}`];
      if (keys.some((k) => seen.has(k))) return;
      keys.forEach((k) => seen.add(k));
      out.push(e);
    });
    return out.slice(0, REG_HISTORY_MAX);
  }
  /**
   * 一筆追蹤狀態的變更登記歷程（新到舊）。
   * 舊版只存單筆 regChange，還沒更新的裝置也只會寫那一欄，所以一併收進來。
   */
  function regHistoryOf(st) {
    if (!st) return [];
    return mergeRegChanges(st.regChanges, st.regChange ? [st.regChange] : []);
  }

  /** 合併同一筆客戶的兩份追蹤狀態。 */
  function mergeState(a, b) {
    const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
    const older = newer === a ? b : a;
    const out = { ...newer };
    // 編輯內容看 editsAt：還原（把 edits 清掉）也算一次編輯，同樣靠時間戳決定
    if ((older.editsAt || 0) > (newer.editsAt || 0)) {
      out.edits = older.edits;
      out.editsAt = older.editsAt;
    }
    if (!out.edits) delete out.edits;
    // 同老闆的公司連結也一樣：解除（把 group 清掉）也算一次改動
    if ((older.groupAt || 0) > (newer.groupAt || 0)) {
      out.group = older.group;
      out.groupIds = older.groupIds;
      out.groupAt = older.groupAt;
    }
    if (!out.group) { delete out.group; delete out.groupIds; }
    // 商工登記的查核時間與失敗原因：取查核時間比較新的那份
    if ((older.regAt || 0) > (newer.regAt || 0)) {
      out.regAt = older.regAt;
      out.regError = older.regError;
    }
    // 變更登記歷程是兩邊聯集，不是二選一（見 mergeRegChanges）
    {
      const hist = mergeRegChanges(regHistoryOf(a), regHistoryOf(b));
      // regChange 留最新一次：還沒更新的裝置只看得懂這一欄
      if (hist.length) { out.regChanges = hist; [out.regChange] = hist; }
      else { delete out.regChanges; delete out.regChange; }
    }
    // 有機會／無機會：取標記時間比較新的那份（取消標記也算一次）
    if ((older.chanceAt || 0) > (newer.chanceAt || 0)) {
      out.chance = older.chance;
      out.chanceAt = older.chanceAt;
    }
    if (!out.chance) delete out.chance;
    // 回撥提醒：取設定時間比較新的那份（取消提醒也算一次設定）
    if ((older.remindSetAt || 0) > (newer.remindSetAt || 0)) {
      out.remindAt = older.remindAt;
      out.remindNote = older.remindNote;
      out.remindSetAt = older.remindSetAt;
    }
    if (!out.remindAt) { delete out.remindAt; delete out.remindNote; }
    /*
     * 其餘欄位各自看 fieldAt（saveState 每改一個欄位就記一次時間）。
     *
     * 沒有 fieldAt 的舊資料照上面「整筆取較新」；某一邊有記、另一邊沒記的，拿記的那個時間跟另一邊的 updatedAt 比。
     * 這樣手機按的「完成」（dueDoneOn）、改的下次聯絡日，不會因為電腦那份 updatedAt 比較新（背景查商工登記寫了 regAt）
     * 就整筆被蓋掉。上面已經各自處理的欄位不在這裡再比一次。
     */
    const SPECIAL = new Set(['recordId', 'updatedAt', 'fieldAt', 'edits', 'editsAt', 'group', 'groupIds', 'groupAt', 'regAt', 'regError', 'regChanges', 'regChange', 'chance', 'chanceAt', 'remindAt', 'remindNote', 'remindSetAt']);
    const fa = a.fieldAt || {}; const fb = b.fieldAt || {};
    // 有 fieldAt 的那份（新版寫的）沒記某個欄位＝它沒動過那個欄位，算 0；整筆連 fieldAt 都沒有的是舊版寫的，只能拿 updatedAt 當時間
    const stampOf = (side, k) => (side.fieldAt ? (side.fieldAt[k] != null ? side.fieldAt[k] : 0) : (side.updatedAt || 0));
    const outAt = { ...(older.fieldAt || {}), ...(newer.fieldAt || {}) };
    new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(fa), ...Object.keys(fb)]).forEach((k) => {
      if (SPECIAL.has(k)) return;
      if (fa[k] == null && fb[k] == null) return;   // 兩邊都沒記過這個欄位的時間，照整筆的結果
      const ta = stampOf(a, k); const tb = stampOf(b, k);
      const win = tb > ta ? b : ta > tb ? a : newer;
      if (win[k] === undefined) delete out[k]; else out[k] = win[k];
      outAt[k] = Math.max(ta, tb);
    });
    if (Object.keys(outAt).length) out.fieldAt = outAt;
    return out;
  }

  /**
   * 合併兩份資料。兩邊地位相同，誰是本機誰是雲端都得到一樣的結果。
   * @param {object} a
   * @param {object} b
   */
  function mergeDumps(a, b) {
    const left = a || {};
    const right = b || {};
    const tombstones = mergeTombstones(left.tombstones, right.tombstones);
    // 設定：同一個鍵取改得比較新的那份
    const settings = {};
    [left.settings || {}, right.settings || {}].forEach((side) => {
      Object.entries(side).forEach(([key, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        if (!settings[key] || (entry.at || 0) > (settings[key].at || 0)) settings[key] = entry;
      });
    });

    // 名單：兩邊聯集。同一份 PDF 在不同裝置匯入會產生相同的 id，所以不會重複。
    const records = new Map();
    [...(left.records || []), ...(right.records || [])].forEach((r) => {
      if (!r || !r.id) return;
      const seen = records.get(r.id);
      // 後匯入的版本比較新（解析邏輯可能已經改良過）
      if (!seen || (r.importedAt || 0) >= (seen.importedAt || 0)) records.set(r.id, r);
    });
    for (const [id, r] of records) {
      // 整份名單被刪掉
      const sourceKilled = tombstones.sources[r.source];
      if (sourceKilled && sourceKilled > (r.importedAt || 0)) { records.delete(id); continue; }
      // 單一筆客戶被刪掉。比墓碑新的匯入可以回來——那是使用者自己又匯入了一次，
      // 不是同步把刪掉的東西救回來。
      const selfKilled = tombstones.records[id];
      if (selfKilled && selfKilled > (r.importedAt || 0)) records.delete(id);
    }

    /*
     * 同一家公司只留一筆（使用者：「只要是重複的名單就不要匯入」）。
     *
     * 匯入時已經擋重複，但兩台裝置各自匯入、還沒同步時擋不到：手機週日按「再補」挑了六家，
     * 電腦週一早上同步失敗（token 過期）就直接挑今天的，同樣六家又進來一次，之後一同步兩邊
     * 都變成兩筆。這裡在合併時把同統編的收成一筆：留最早匯入的那筆（打過的紀錄、找來的
     * 電話多半在它身上），另一筆的通話紀錄與追蹤狀態搬過來再合併，記錄本身丟掉。
     * 兩邊算出來的結果一樣（照 importedAt、id 排），所以哪台先合併都收斂到同一份。
     * 只認統編：同名不同統編是兩家公司；沒統編的靠匯入時的名稱比對就夠了。
     */
    const alias = new Map();   // 被收掉的 id → 留下的 id
    {
      const byTax = new Map();
      records.forEach((r) => {
        const tax = String(r.taxId || '').replace(/\D/g, '');
        if (!tax) return;
        if (!byTax.has(tax)) byTax.set(tax, []);
        byTax.get(tax).push(r);
      });
      byTax.forEach((group) => {
        if (group.length < 2) return;
        group.sort((x, y) => (x.importedAt || 0) - (y.importedAt || 0) || String(x.id).localeCompare(String(y.id)));
        const keep = group[0];
        group.slice(1).forEach((r) => { alias.set(r.id, keep.id); records.delete(r.id); });
      });
    }
    const realId = (id) => alias.get(id) || id;

    // 通話紀錄：兩邊聯集，靠 uid 去重；被刪掉的不要救回來。
    //
    // 同一個 uid 出現在兩邊時要取「改得比較新」的那一份，不能先到先贏——
    // 紀錄可以就地修改，先到先贏的話在這台改完的內容會被另一台的舊版本壓著，
    // 而且是完全無聲的：畫面上看起來存好了，同步一次就變回去。
    const logs = new Map();
    const logStamp = (l) => Math.max(l.updatedAt || 0, l.createdAt || 0);
    [...(left.logs || []), ...(right.logs || [])].forEach((raw) => {
      if (!raw) return;
      const l = alias.has(raw.recordId) ? { ...raw, recordId: realId(raw.recordId) } : raw;
      const uid = raw.uid || `${raw.recordId}|${raw.createdAt}`;
      if (tombstones.logs[uid]) return;
      const seen = logs.get(uid);
      if (!seen || logStamp(l) > logStamp(seen)) logs.set(uid, { ...l, uid });
    });

    // 追蹤狀態：同一筆客戶只能有一個，取比較新的。
    // 但「編輯過的客戶資料」要分開比對自己的時間戳，否則另一台只是記了一通電話
    // （updatedAt 比較新、但身上沒有編輯內容），就會把這台的編輯洗掉。
    //
    // 客戶已經不在（整份清掉、單筆刪掉）的狀態要一起丟；比墓碑還舊的狀態也一樣。
    // 狀態本身沒有墓碑，借用客戶的：清除名單之後再匯入同一個檔案，id 會一模一樣，
    // 雲端上留著的舊狀態若照舊合併回來，上面記的下次聯絡日、編輯內容會直接蓋掉
    // 新檔案的欄位——使用者看到的就是「檔案裡沒約的客戶卻顯示逾期」。
    //
    // 「多新」不能只看 updatedAt：舊版存狀態時時間戳會卡在第一次的值，清除名單前
    // 建的狀態就算之後又記了好幾通電話，時間戳還是停在清除之前，照字面比會被
    // 當成死的，通話結果、最近聯絡日就這樣不見（紀錄本身還在，狀態卻沒了）。
    // 所以把該客戶最新一則通話紀錄的時間也算進去：清除之後還在記電話，狀態就是活的。
    const lastLogAt = new Map();
    logs.forEach((l) => {
      const at = Math.max(l.createdAt || 0, l.updatedAt || 0);
      if (at > (lastLogAt.get(l.recordId) || 0)) lastLogAt.set(l.recordId, at);
    });
    const stateDead = (st) => {
      const r = records.get(st.recordId);
      if (!r) return true;
      const stamp = Math.max(st.updatedAt || 0, st.editsAt || 0, st.groupAt || 0, st.regAt || 0, st.remindSetAt || 0, lastLogAt.get(st.recordId) || 0);
      const sourceKilled = tombstones.sources[r.source];
      if (sourceKilled && sourceKilled > stamp) return true;
      const selfKilled = tombstones.records[st.recordId];
      return !!(selfKilled && selfKilled > stamp);
    };
    const states = new Map();
    [...(left.states || []), ...(right.states || [])].forEach((raw) => {
      if (!raw || !raw.recordId) return;
      const st = alias.has(raw.recordId) ? { ...raw, recordId: realId(raw.recordId) } : raw;
      if (stateDead(st)) return;
      const seen = states.get(st.recordId);
      states.set(st.recordId, seen ? mergeState(seen, st) : st);
    });

    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      records: [...records.values()],
      logs: [...logs.values()].sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)),
      states: [...states.values()],
      tombstones,
      settings,
    };
  }

  /** 合併前後的差異，用來跟使用者說「這次同步拿到什麼」。 */
  function diffSummary(before, after) {
    const count = (d, key) => ((d && d[key]) || []).length;
    return {
      records: count(after, 'records') - count(before, 'records'),
      logs: count(after, 'logs') - count(before, 'logs'),
      states: count(after, 'states') - count(before, 'states'),
    };
  }

  /* ---------------- Google 授權 ---------------- */

  /** Google 回傳的錯誤代碼看不出要做什麼，翻成「你現在該去哪裡改」。 */
  const ERROR_HINTS = {
    access_denied: '你的 Google 帳號還不在這個應用程式的「測試使用者」名單裡。'
      + '請到 Google Cloud 主控台的「OAuth 同意畫面 → 測試使用者」，'
      + '把你登入用的 Gmail 加進去（或直接按「發布應用程式」），再回來同步一次。',
    invalid_client: '用戶端 ID 不正確，或這個 ID 屬於別的專案。請回到 Google Cloud「憑證」頁重新複製。',
    redirect_uri_mismatch: '這個網址不在用戶端 ID 的「已授權的 JavaScript 來源」裡。'
      + `請到 Google Cloud「憑證」頁把 ${global.location ? global.location.origin : '本網站網址'} 加進去。`,
    idpiframe_initialization_failed: '瀏覽器擋住了 Google 登入，請確認沒有封鎖第三方 Cookie。',
    popup_closed: '授權視窗被關掉了，再按一次同步即可。',
    popup_failed_to_open: '授權視窗被瀏覽器擋住了，請允許這個網站顯示彈出式視窗。',
  };

  const describeAuthError = (code, fallback) => ERROR_HINTS[code] || fallback || `授權失敗：${code || '未知錯誤'}`;

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;

  const clientId = () => localStorage.getItem(CLIENT_ID_KEY) || '';
  const setClientId = (id) => {
    localStorage.setItem(CLIENT_ID_KEY, String(id || '').trim());
    tokenClient = null;
    accessToken = null;
  };
  const isConfigured = () => !!clientId();

  function loadGis() {
    if (global.google && global.google.accounts && global.google.accounts.oauth2) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('無法載入 Google 登入元件')));
        return;
      }
      const el = document.createElement('script');
      el.src = GIS_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('無法載入 Google 登入元件，請檢查網路'));
      document.head.append(el);
    });
  }

  /**
   * 取得 access token。interactive=false 時只做靜默更新，
   * 需要使用者點同意的話會失敗，讓呼叫端決定要不要跳出視窗。
   */
  async function getToken({ interactive }) {
    if (!isConfigured()) throw new Error('尚未設定 Google 用戶端 ID');
    if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;
    await loadGis();

    return new Promise((resolve, reject) => {
      tokenClient = global.google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPE,
        callback: (res) => {
          if (res && res.access_token) {
            accessToken = res.access_token;
            tokenExpiry = Date.now() + (Number(res.expires_in || 3600) * 1000);
            resolve(accessToken);
          } else {
            const code = res && res.error;
            reject(new Error(describeAuthError(code, code ? undefined : '取得授權失敗')));
          }
        },
        error_callback: (err) => {
          reject(new Error(describeAuthError(err && err.type)));
        },
      });
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  function signOut() {
    accessToken = null;
    tokenExpiry = 0;
  }

  /* ---------------- Drive 存取 ---------------- */

  async function driveFetch(url, options, token) {
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...((options || {}).headers || {}) },
    });
    if (res.status === 401 || res.status === 403) {
      accessToken = null;
      const body = await res.text().catch(() => '');
      if (/accessNotConfigured|has not been used|is disabled/.test(body)) {
        throw new Error('這個 Google Cloud 專案還沒有啟用 Google Drive API，'
          + '請到主控台的「API 和服務 → 程式庫」搜尋 Google Drive API 並啟用。');
      }
      throw new Error('雲端硬碟拒絕存取，請按同步重新授權');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`雲端硬碟回應 ${res.status}${body ? `：${body.slice(0, 120)}` : ''}`);
    }
    return res;
  }

  async function findFile(token) {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=10`,
      {}, token
    );
    const data = await res.json();
    return (data.files || [])[0] || null;
  }

  async function downloadFile(fileId, token) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, token
    );
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error('雲端硬碟上的同步檔內容毀損，無法解析');
    }
  }

  async function uploadFile(fileId, dump, token) {
    const body = JSON.stringify(dump);
    if (fileId) {
      await driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, token
      );
      return fileId;
    }
    const boundary = 'tmsync' + Math.random().toString(36).slice(2);
    const metadata = { name: FILE_NAME, mimeType: 'application/json' };
    const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
      + `${JSON.stringify(metadata)}\r\n--${boundary}\r\n`
      + `Content-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: payload,
      }, token
    );
    const data = await res.json();
    return data.id;
  }

  /* ---------------- 同步流程 ---------------- */

  let running = null;

  /**
   * 下載雲端資料 → 與本機合併 → 寫回雲端 → 覆蓋本機。
   * @param {{interactive?:boolean}} [options] interactive=true 允許跳出授權視窗
   */
  function sync(options) {
    if (running) return running;            // 同時間只跑一次
    running = (async () => {
      const interactive = !!(options && options.interactive);
      const token = await getToken({ interactive });
      const local = await global.Store.exportAll();
      const file = await findFile(token);
      const remote = file ? await downloadFile(file.id, token) : null;

      const merged = mergeDumps(local, remote);
      const fileId = await uploadFile(file ? file.id : null, merged, token);
      await global.Store.replaceAll(merged);
      await global.Store.setMeta('lastSyncAt', Date.now());
      await global.Store.setMeta('driveFileId', fileId);

      return {
        merged,
        gained: diffSummary(local, merged),
        firstTime: !file,
      };
    })().finally(() => { running = null; });
    return running;
  }

  global.DriveSync = {
    sync, mergeDumps, diffSummary, mergeTombstones, mergeState, mergeRegChanges, regHistoryOf,
    isConfigured, clientId, setClientId, signOut, getToken, describeAuthError,
    FILE_NAME, SCOPE,
  };
})(window);
