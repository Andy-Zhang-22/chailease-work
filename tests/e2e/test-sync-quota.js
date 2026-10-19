// Google 儲存空間滿了：上傳回 403 storageQuotaExceeded，同步要直說空間滿了，不是叫人重新授權（版本 359）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9637);
const STUB = () => {
  window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'fake-token', expires_in: 3600 }), 0) }) } } };
  if (location.protocol !== 'http:') return;
  const realFetch = window.fetch;
  // 雲端裡有一家排在今天的客戶：上傳失敗也要先進本機（版本 361）
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const rec = { id: 'c1', source: 'A.csv', company: '雲端甲一有限公司', aliases: [], taxId: '', grade: '', founded: '2015', capital: '3,000', phoneRaw: '02-2222-3333', phones: [], owner: '', keyman: '', industry: '', address: '新北市新莊區中正路9號', city: '新北市', district: '新莊區', notesRaw: '', timeline: [], outcome: 'new', nextDate: today, lastDate: '', addedDate: '2026-09-01', importedAt: 1 };
  const dump = JSON.stringify({ version: 2, records: [rec], logs: [], states: [{ recordId: 'c1', nextDate: today, updatedAt: 5, fieldAt: { nextDate: 5 } }], tombstones: {}, settings: {} });
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.includes('googleapis.com')) return realFetch(url, opts);
    if (u.startsWith('https://www.googleapis.com/drive/v3/files?q=')) return new Response(JSON.stringify({ files: [{ id: 'f1', name: '電話推廣名單-同步資料.json', createdTime: '2026-09-01T00:00:00Z' }] }), { status: 200 });
    if (/alt=media/.test(u)) return new Response(dump, { status: 200 });
    if (u.includes('/upload/drive/v3/files')) return new Response(JSON.stringify({ error: { code: 403, errors: [{ domain: 'usageLimits', reason: 'storageQuotaExceeded', message: 'The user has exceeded their Drive storage quota' }] } }), { status: 403 });
    return new Response('unexpected ' + u, { status: 500 });
  };
};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('https://accounts.google.com/**',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
 await ctx.addInitScript(STUB);
 const pg=await ctx.newPage({viewport:{width:1100,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9637/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>{ localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-auto','0'); window.DriveSync.setClientId('fake.apps.googleusercontent.com'); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const r=await pg.evaluate(()=>window.runSync({interactive:true}));
 const toast=await pg.$eval('#toast',t=>t.textContent);
 chk(r===null, '上傳 403 時同步回 null');
 chk(/儲存空間滿了/.test(toast) && !/重新授權/.test(toast), `提示直說空間滿了：${toast}`);
 chk(/is-error|error/.test(await pg.$eval('#btnSync',b=>b.className)), '同步鍵變成錯誤狀態');
 // 版本 361：上傳失敗，雲端的資料還是要先寫進本機（不然這台一直用舊資料）
 const n=await pg.evaluate(async()=>(await window.Store.allRecords()).length);
 chk(n===1, `上傳失敗，雲端那家還是進了本機：${n} 家`);
 // 整批挪日期要先同步成功：同步失敗就不動
 await pg.waitForTimeout(500);
 await pg.evaluate(()=>{ const d=document.querySelector('#importer'); if (d) d.hidden = true; });   // 一開始沒名單時匯入視窗會開著，蓋住按鈕
 const hasDefer=await pg.locator('#feedDefer').count();
 chk(hasDefer===1, '今天排著一家，有「挪到下個上班日」');
 await pg.click('#feedDefer'); await pg.waitForTimeout(300); await pg.click('.ask-box .btn-primary'); await pg.waitForTimeout(1500);
 const today=await pg.evaluate(()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
 const nd=await pg.evaluate(async()=>{ const s=await window.Store.getState('c1'); return s && s.nextDate; });
 const t2=await pg.$eval('#toast',t=>t.textContent);
 chk(nd===today && /還沒同步成功/.test(t2), `同步失敗就不挪：nextDate ${nd}，提示：${t2}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`${bad} 項失敗`:'全部通過'); process.exit(bad?1:0);
})();
