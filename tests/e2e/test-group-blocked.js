// 停業表拿掉了（使用者：「這份名單好像是錯誤的，這家客戶還是在營業中」）：
// 1) 以前「已停業整批標禁止推廣」標的那家，一打開就復原（那則紀錄刪掉、狀態推回來、變未排定），同組的另一家不動；
// 2) 自己把一家標禁止推廣：同老闆的另一家不該跟著變「禁止推廣」、下次聯絡日不該被洗掉；「隱藏禁止推廣」只藏被禁的那家
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9514);
const TODAY='2026-10-05';
const mk=(id,company,taxId,next)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2011',capital:'30,000',phoneRaw:'02-2602-7170',phones:[{digits:'0226027170',ext:'',note:''}],owner:'方志堯',keyman:'',industry:'',address:'新北市林口區文化二路1段399號10樓',city:'新北市',district:'林口區',notesRaw:'',timeline:[],outcome:'new',nextDate:next,lastDate:'',addedDate:'2026-10-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9514/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({r,now})=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.removeItem('closed-undo-done');
   await window.Store.setState({recordId:'1',group:'g1',groupIds:['1','2'],groupAt:now,updatedAt:now});
   // 証宇：以前打過一通、然後被「已停業整批標禁止推廣」（那時下次聯絡日被清掉）
   await window.Store.addLog({recordId:'2',date:'2026-09-20',text:'有興趣，等報價，10/20 再聯絡',outcome:'contacted',createdAt:now-9e8});
   // 大順：同樣被整批標、剩下的紀錄沒寫日期、名單檔也沒有 → 排今天
   await window.Store.addLog({recordId:'3',date:'2026-09-25',text:'未接',outcome:'noanswer',createdAt:now-8e8});
   await window.Store.addLog({recordId:'3',date:'2026-10-03',text:'已停業（稅籍停業 2026/05/23），整批標禁止推廣',outcome:'blocked',createdAt:now-2e8});
   await window.Store.setState({recordId:'3',outcome:'blocked',nextDate:null,lastDate:'2026-10-03',updatedAt:now});
   await window.Store.addLog({recordId:'2',date:'2026-10-03',text:'已停業（稅籍非營業中），整批標禁止推廣',outcome:'blocked',createdAt:now-2e8});
   await window.Store.setState({recordId:'2',group:'g1',groupIds:['1','2'],groupAt:now,outcome:'blocked',nextDate:null,lastDate:'2026-10-03',updatedAt:now}); },
   {r:[mk('1','寶絢科技股份有限公司','53461522','2026-10-20'), mk('2','証宇科技有限公司','53461523',''), mk('3','大順工業有限公司','53461524','')], now:Date.now()});
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const views=()=>pg.evaluate(()=>window.customerViews().map(v=>({c:v.company,blocked:v.blocked,outcome:v.outcome,next:v.nextDate,last:v.lastDate})));
 let v=await views();
 const bx=()=>v.find(x=>x.c==='寶絢科技股份有限公司'); const zy=()=>v.find(x=>x.c==='証宇科技有限公司');
 chk(!zy().blocked && zy().outcome==='contacted' && zy().next==='2026-10-20' && zy().last==='2026-09-20', `証宇復原：狀態從剩下的紀錄推回來、下次聯絡日照紀錄寫的 10/20：${JSON.stringify(zy())}`);
 const st=await pg.evaluate(async()=>{ const a=await window.Store.allStates(); return {zy:a.find(s=>s.recordId==='2').nextDate, ds:a.find(s=>s.recordId==='3')}; });
 chk(st.zy==='2026-10-20' && st.ds.outcome==='noanswer' && st.ds.lastDate==='2026-09-25' && st.ds.nextDate===TODAY, `証宇存的是 10/20；大順推不出日期就排今天、狀態回未接：${JSON.stringify(st)}`);
 const logs=await pg.evaluate(async()=>(await window.Store.allLogs()).filter(l=>l.recordId==='2').map(l=>l.text));
 chk(logs.join('|')==='有興趣，等報價，10/20 再聯絡', `整批標的那則紀錄刪掉、別的留著：${logs.join('|')}`);
 chk(!bx().blocked && bx().next==='2026-10-20', `同組的寶絢不動：${JSON.stringify(bx())}`);
 chk((await pg.evaluate(()=>localStorage.getItem('closed-undo-done')))==='1', '記住跑過了');
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk(!/已復原/.test(await pg.textContent('#toast').catch(()=>'')), '再開不會再跑一次');
 // 自己把証宇標禁止推廣：寶絢不該跟著變
 await pg.locator('#cards .card:has-text("証宇") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.selectOption('#drawerBody select','blocked'); await pg.fill('#drawerBody textarea','老闆說不要再打'); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(700);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 v=await views();
 chk(zy().blocked && zy().outcome==='blocked', `証宇被禁：${JSON.stringify(zy())}`);
 chk(!bx().blocked && bx().outcome!=='blocked' && bx().next==='2026-10-20' && !bx().last, `寶絢沒被禁，狀態與下次聯絡日都沒被同組的禁打抄過去：${JSON.stringify(bx())}`);
 const names=await pg.$$eval('#cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(await pg.isChecked('#hideBlocked') && !names.includes('証宇科技有限公司') && names.includes('寶絢科技股份有限公司') && names.includes('大順工業有限公司'), `隱藏禁止推廣：証宇藏起來、寶絢與大順還在：${names.join('|')}`);
 chk(!/禁止推廣/.test(await pg.locator('#cards .card:has-text("寶絢") .card-top').textContent()), '寶絢的卡片不會寫禁止推廣');
 await pg.uncheck('#hideBlocked'); await pg.waitForTimeout(300);
 chk((await pg.$$eval('#cards .card .card-name',a=>a.length))===3, '取消隱藏三家都在');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
