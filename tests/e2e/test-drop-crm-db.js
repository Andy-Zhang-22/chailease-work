const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9191);
const mk=(id,name)=>({id,source:'A.csv',company:name,aliases:[],taxId:'12345678',grade:'',founded:'2015',capital:'10,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:'',display:'02-1111-1111',dial:'0211111111'}],owner:'王小明',keyman:'',industry:'',address:'新北市新莊區中正路1號',addressActual:'',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1200}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9191/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 名單留一筆，並造一個舊版徵信資料庫 crm-db（裡面塞一份徵信資料）
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); }, [mk('1','測試股份有限公司')]);
 const before = await pg.evaluate(async()=>{
   await new Promise((res,rej)=>{ const q=indexedDB.open('crm-db',1);
     q.onupgradeneeded=()=>{ const db=q.result; ['customers','cases','notes','dossiers'].forEach(n=>{ if(!db.objectStoreNames.contains(n)) db.createObjectStore(n,{keyPath:'id'}); }); };
     q.onsuccess=()=>{ const db=q.result; const tx=db.transaction('dossiers','readwrite'); tx.objectStore('dossiers').put({id:'d1',company:'舊徵信'}); tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>rej(tx.error); };
     q.onerror=()=>rej(q.error); });
   localStorage.removeItem('crm-db-dropped');
   return (await indexedDB.databases()).map(d=>d.name).sort();
 });
 console.log('清除前的資料庫：', JSON.stringify(before));
 chk(before.includes('crm-db'), `舊徵信資料庫存在：${before.join()}`);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);
 const after = await pg.evaluate(async()=>({ dbs:(await indexedDB.databases()).map(d=>d.name).sort(), flag: localStorage.getItem('crm-db-dropped'), n:(await window.Store.allRecords()).length }));
 console.log('清除後的資料庫：', JSON.stringify(after.dbs));
 chk(!after.dbs.includes('crm-db'), `徵信資料庫已清除：${after.dbs.join()}`);
 chk(after.flag==='1', `記下已清除，不會每次重跑：${after.flag}`);
 chk(after.n===1, `名單資料沒事：${after.n} 筆`);
 // 再開一次不該出錯
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const again = await pg.evaluate(async()=>({ dbs:(await indexedDB.databases()).map(d=>d.name), n:(await window.Store.allRecords()).length }));
 chk(!again.dbs.includes('crm-db') && again.n===1, `第二次開啟正常：${again.dbs.join()} / ${again.n} 筆`);
 chk((await pg.locator('a[href="dossier.html"]').count())===0 && (await pg.locator('text=📑 徵信').count())===0, '首頁沒有徵信入口');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
