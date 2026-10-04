// 同步途中本機有變動（使用者：「我在刪名單時，有時都需要再重按一次」）：
// 同步上傳到一半時刪掉一家、記一通電話，同步寫回本機時不能用開始時的快照蓋回去；接著再同步一次推上雲端
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9547);
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
    if (m) { if (window.__gate) { window.__uploading = true; await window.__gate; window.__uploading = false; } D.files[m[1]].body = opts.body; return new Response('{}', { status: 200 }); }
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
 await pg.goto('http://localhost:9547/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-auto','0'); window.DriveSync.setClientId('fake.apps.googleusercontent.com'); },[mk('r1','甲一有限公司'),mk('r2','乙二有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 await pg.evaluate(()=>window.DriveSync.sync({interactive:true}));   // 先建好雲端檔
 // 第二次同步：上傳卡住的時候刪掉甲一、替乙二記一通電話
 const res=await pg.evaluate(async()=>{
   let release; window.__gate=new Promise((r)=>{ release=r; });
   const p=window.DriveSync.sync({interactive:true});
   for (let i=0;i<200 && !window.__uploading;i++) await new Promise((r)=>setTimeout(r,10));
   const uploading=!!window.__uploading;
   await window.Store.deleteRecord('r1');
   await window.Store.addLog({recordId:'r2',date:'2026-10-05',text:'同步途中記的',outcome:'contacted'});
   window.__gate=null; release();
   const out=await p;
   const recs=(await window.Store.allRecords()).map((r)=>r.id).sort();
   const logs=(await window.Store.allLogs()).map((l)=>l.text);
   return { uploading, changed: out.changedDuring, recs, logs };
 });
 chk(res.uploading, '有卡在上傳那一步（測得到這個時間點）');
 chk(JSON.stringify(res.recs)==='["r2"]', `同步途中刪掉的甲一沒有被同步蓋回來：${JSON.stringify(res.recs)}`);
 chk(res.logs.includes('同步途中記的'), `同步途中記的通話也還在：${JSON.stringify(res.logs)}`);
 chk(res.changed===true, '回報同步途中本機有變動');
 // 接著再同步一次：雲端那份也刪掉甲一、有那通電話
 await pg.evaluate(()=>window.DriveSync.sync({interactive:true}));
 const cloud=await pg.evaluate(()=>{ const f=Object.values(window.__drive.files).find((x)=>x.name==='電話推廣名單-同步資料.json'); return JSON.parse(f.body); });
 chk(!cloud.records.some((r)=>r.id==='r1') && cloud.records.some((r)=>r.id==='r2') && cloud.logs.some((l)=>l.text==='同步途中記的'), `再同步一次之後雲端也跟上：${cloud.records.map(r=>r.id).join(',')}`);
 const again=await pg.evaluate(async()=>(await window.DriveSync.sync({interactive:true})).changedDuring);
 chk(again===false, '沒有變動時不會一直要求再同步');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
