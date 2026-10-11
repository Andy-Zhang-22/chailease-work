// 出發提醒（使用者：「還有什麼你能幫我做的？」→「都做」）：名單最上面「今天要拜訪」，出發前 15 分鐘變色、提示。
// 「📅 加到手機行事曆」版本 329 拿掉了（一週用 0 次）。
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9617);
const TODAY='2026-10-06';
const mk=(id,company,addr)=>({id,source:'測試',company,aliases:[],taxId:'',grade:'',founded:'',capital:'',phoneRaw:'02-2222-0000',phones:[{raw:'02-2222-0000',display:'02-2222-0000',tel:'0222220000'}],owner:'',keyman:'',industry:'',nextDate:TODAY,lastDate:'2026-09-01',addedDate:'2026-09-01',country:'台灣',address:addr,addressActual:addr,city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000},acceptDownloads:true});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T15:20:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D;
   try{localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){} }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9617/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); const now=Date.now();
   const nd={a:'2026-10-06',b:'2026-10-08',c:'2026-10-09',d:'2026-10-06'};
   for (const r of recs) await window.Store.setState({recordId:r.id,outcome:'contacted',lastDate:'2026-09-01',nextDate:nd[r.id],updatedAt:now});
   await window.Store.addLog({recordId:'a',date:'2026-10-01',text:'約好今天下午',outcome:'contacted',meeting:true,meetingDate:'2026-10-06',meetingDepart:'15:30',meetingArrive:'16:00',createdAt:now-1e6});
   await window.Store.addLog({recordId:'b',date:'2026-10-01',text:'週四一點出發',outcome:'contacted',meeting:true,meetingDate:'2026-10-08',meetingDepart:'13:00',createdAt:now-1e6});
   await window.Store.addLog({recordId:'c',date:'2026-10-01',text:'週五過去，時間再約',outcome:'contacted',meeting:true,meetingDate:'2026-10-09',createdAt:now-1e6});
   await window.Store.addLog({recordId:'d',date:'2026-10-01',text:'上週去過',outcome:'contacted',meeting:true,meetingDate:'2026-10-02',createdAt:now-1e6}); },
   [mk('a','今天拜訪範例有限公司','新北市新莊區中正路1號'),mk('b','週四拜訪範例有限公司','新北市五股區五工路2號'),mk('c','週五拜訪範例有限公司','新北市泰山區明志路3號'),mk('d','去過範例有限公司','新北市新莊區思源路4號')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);
 await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); }));
 const bar=(await pg.textContent('#departBar')).replace(/\s+/g,' ');
 chk(await pg.isVisible('#departBar') && /今天要拜訪（1）/.test(bar) && /15:30 出發・16:00 到/.test(bar) && /今天拜訪範例/.test(bar) && !/週四/.test(bar), `名單上面列今天要拜訪：${bar}`);
 chk(await pg.locator('#departBar .depart-row.is-due').count()===1, '出發前 15 分鐘變色');
 chk((await pg.getAttribute('#departBar .depart-row a','href')).includes('maps/dir'), '有導航');
 await pg.evaluate(()=>{ window.__now += 31000; }); await pg.waitForTimeout(31500);
 chk(/該出發了：今天拜訪範例有限公司（15:30 出發）/.test(await pg.textContent('#toast')), `跳提示：${await pg.textContent('#toast')}`);

 // 「📅 加到手機行事曆」版本 329 拿掉了（一週用 0 次）
 await pg.click('.tab[data-tab="cal"]'); await pg.waitForTimeout(500);
 chk((await pg.locator('.cal-ics').count())===0 && (await pg.evaluate(()=>typeof window.visitsIcs))==='undefined', '行事曆沒有「加到手機行事曆」了');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
