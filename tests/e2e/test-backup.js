// 雲端硬碟每週備份、找回某天的資料（假的 Drive）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9496);
const STUB = () => {
  window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'fake-token', expires_in: 3600 }), 0) }) } } };
  // files: id → { name, body, createdTime }
  if (location.protocol !== 'http:') return;
  let saved = null; try { saved = JSON.parse(localStorage.getItem('__drive') || 'null'); } catch (e) { saved = null; }
  window.__drive = { files: (saved && saved.files) || {}, seq: (saved && saved.seq) || 0, now: () => Date.now() };
  const persist = () => localStorage.setItem('__drive', JSON.stringify({ files: window.__drive.files, seq: window.__drive.seq }));
  setInterval(persist, 50); window.addEventListener('beforeunload', persist);
  const realFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.includes('googleapis.com')) return realFetch(url, opts);
    const D = window.__drive; const method = opts.method || 'GET';
    if (u.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
      const q = decodeURIComponent(u.split('q=')[1].split('&')[0]);
      let m = q.match(/name='([^']+)'/); const exact = m && m[1];
      m = q.match(/name contains '([^']+)'/); const part = m && m[1];
      const files = Object.entries(D.files).filter(([, f]) => (exact ? f.name === exact : part ? f.name.includes(part) : true))
        .map(([id, f]) => ({ id, name: f.name, createdTime: f.createdTime, size: String(f.body.length) }));
      return new Response(JSON.stringify({ files }), { status: 200 });
    }
    let m = u.match(/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (m) return new Response(D.files[m[1]].body, { status: 200 });
    m = u.match(/upload\/drive\/v3\/files\/([^?]+)\?uploadType=media/);
    if (m) { D.files[m[1]].body = opts.body; return new Response('{}', { status: 200 }); }
    if (u.includes('upload/drive/v3/files?uploadType=multipart')) {
      const parts = String(opts.body).split('\r\n\r\n');
      const meta = JSON.parse(parts[1].split('\r\n--')[0]);
      const id = `f${++D.seq}`;
      D.files[id] = { name: meta.name, body: parts[2].split('\r\n--')[0], createdTime: new Date(D.now()).toISOString() };
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    m = u.match(/drive\/v3\/files\/([^?]+)$/);
    if (m && method === 'DELETE') { delete D.files[m[1]]; return new Response('', { status: 204 }); }
    return new Response('unexpected ' + u, { status: 500 });
  };
};
const mk=(id,company)=>({id,source:'A.csv',company,aliases:[],taxId:'',grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('https://accounts.google.com/**',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
 await ctx.addInitScript(STUB);
 const pg=await ctx.newPage({viewport:{width:1100,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9496/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-auto','0'); window.DriveSync.setClientId('fake.apps.googleusercontent.com'); },[mk('r1','甲一有限公司'),mk('r2','乙二有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const names=()=>pg.evaluate(()=>Object.values(window.__drive.files).map(f=>f.name).sort());
 await pg.evaluate(()=>window.DriveSync.sync({interactive:true}));
 let n=await names();
 chk(n.length===2 && n.includes('電話推廣名單-同步資料.json') && n.some(x=>/^電話推廣名單-備份-\d{4}-\d{2}-\d{2}\.json$/.test(x)), `第一次同步：同步檔＋一份備份：${n.join(' | ')}`);
 await pg.evaluate(()=>window.DriveSync.sync({interactive:true}));
 chk((await names()).length===2, '一週內再同步不重複備份');
 // 8 天後再同步 → 多一份
 await pg.evaluate(()=>{ Object.values(window.__drive.files).forEach(f=>{ f.createdTime=new Date(Date.now()-8*86400000).toISOString(); }); localStorage.setItem('__drive', JSON.stringify({ files: window.__drive.files, seq: window.__drive.seq })); });
 await pg.evaluate(()=>window.DriveSync.sync({interactive:true}));
 chk((await names()).filter(x=>/備份/.test(x)).length===2, '超過 7 天再同步多一份備份');
 // 誤刪 r1，同步
 await pg.evaluate(async()=>{ await window.Store.deleteRecord('r1'); await window.DriveSync.sync({interactive:true}); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 chk(!(await pg.evaluate(()=>window.customerViews().some(v=>v.id==='r1'))), '刪掉了');
 // 選單 → 雲端備份 → 找回最舊那一份（刪之前）
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="backups"]'); await pg.waitForTimeout(800);
 const rows=pg.locator('#editorBody .backup-list tbody tr');
 chk(await rows.count()===2, `列出兩份備份：${await rows.count()}`);
 await rows.last().locator('button').click(); await pg.waitForSelector('.ask-overlay'); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(1500);
 chk(await pg.evaluate(()=>window.customerViews().some(v=>v.id==='r1')), '找回來了');
 const cloud=await pg.evaluate(()=>{ const f=Object.values(window.__drive.files).find(x=>x.name==='電話推廣名單-同步資料.json'); const j=JSON.parse(f.body); return { ids:j.records.map(r=>r.id).sort(), tomb:j.tombstones.records }; });
 chk(cloud.ids.join()==='r1,r2' && !cloud.tomb.r1, `雲端的同步檔也回來、墓碑拿掉：${JSON.stringify(cloud)}`);
 // 之後再刪還是有效
 await pg.evaluate(async()=>{ await window.Store.deleteRecord('r2'); await window.DriveSync.sync({interactive:true}); });
 const after=await pg.evaluate(()=>JSON.parse(Object.values(window.__drive.files).find(x=>x.name==='電話推廣名單-同步資料.json').body).records.map(r=>r.id));
 chk(after.join()==='r1', `還原之後才刪的照刪：${after}`);
 // 只留 8 份：先塞 9 份舊的，再立刻備份
 await pg.evaluate(()=>{ for(let i=0;i<9;i++){ const id=`old${i}`; window.__drive.files[id]={name:`電話推廣名單-備份-2026-0${1+(i%8)}-0${1+i}.json`,body:'{}',createdTime:new Date(Date.now()-(20+i)*86400000).toISOString()}; } });
 await pg.evaluate(()=>window.DriveSync.backupNow({interactive:true}));
 chk((await names()).filter(x=>/備份/.test(x)).length===8, `只留 8 份：${(await names()).filter(x=>/備份/.test(x)).length}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'全部通過');
 await br.close(); srv.close();
})();
