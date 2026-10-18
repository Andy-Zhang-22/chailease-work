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
  const dump = JSON.stringify({ records: [], logs: [], state: {}, tombstones: {}, settings: {} });
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
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`${bad} 項失敗`:'全部通過'); process.exit(bad?1:0);
})();
