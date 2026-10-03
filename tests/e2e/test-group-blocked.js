// 同老闆兩家，一家被標禁止推廣（例如已停業整批標的）：另一家不該跟著變成「禁止推廣」的樣子、下次聯絡日不該被洗掉，
// 「隱藏禁止推廣」藏得掉被禁的那家、留著沒被禁的那家（使用者：「為什麼寶絢科技被標記禁止推廣還沒有被隱藏起來？」）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9514);
const TODAY='2026-10-05';
const CCSV='﻿統編,名稱,狀態,日期\n53461523,証宇科技有限公司,稅籍非營業中,\n';
const CINDEX={generatedAt:'2026-10-03T03:00:00.000Z',cities:['新北市'],years:30,total:1,byKind:{'稅籍非營業中':1},files:[{path:'closed.csv',rows:1}]};
const mk=(id,company,taxId,next)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2011',capital:'30,000',phoneRaw:'02-2602-7170',phones:[{digits:'0226027170',ext:'',note:''}],owner:'方志堯',keyman:'',industry:'',address:'新北市林口區文化二路1段399號10樓',city:'新北市',district:'林口區',notesRaw:'',timeline:[],outcome:'new',nextDate:next,lastDate:'',addedDate:'2026-10-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/closed/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CINDEX)}));
 await ctx.route('**/leads/closed/closed.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CCSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9514/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({r,now})=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0');
   await window.Store.setState({recordId:'1',group:'g1',groupIds:['1','2'],groupAt:now,updatedAt:now});
   await window.Store.setState({recordId:'2',group:'g1',groupIds:['1','2'],groupAt:now,updatedAt:now}); },
   {r:[mk('1','寶絢科技股份有限公司','53461522','2026-10-20'), mk('2','証宇科技有限公司','53461523','')], now:Date.now()});
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const views=()=>pg.evaluate(()=>window.customerViews().map(v=>({c:v.company,blocked:v.blocked,outcome:v.outcome,next:v.nextDate,last:v.lastDate})));
 let v=await views();
 chk(v.length===2 && v.every(x=>!x.blocked) && v[0].next==='2026-10-20', `起點：兩家同組、都沒禁：${JSON.stringify(v)}`);
 // 証宇已停業 → 整批標禁止推廣
 const btn=pg.locator('#btnBlockClosed');
 chk(await btn.isVisible() && /已停業 1 家/.test(await btn.textContent()), `整批鈕只算到証宇：${await btn.textContent()}`);
 await btn.click(); await pg.waitForTimeout(300); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(800);
 v=await views();
 const bx=v.find(x=>x.c==='寶絢科技股份有限公司'); const zy=v.find(x=>x.c==='証宇科技有限公司');
 chk(zy.blocked && zy.outcome==='blocked' && !zy.next, `証宇被禁：${JSON.stringify(zy)}`);
 chk(!bx.blocked && bx.outcome!=='blocked' && bx.next==='2026-10-20' && !bx.last, `寶絢沒被禁，狀態與下次聯絡日都沒被同組的禁打抄過去：${JSON.stringify(bx)}`);
 const names=await pg.$$eval('#cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(await pg.isChecked('#hideBlocked') && names.join('|')==='寶絢科技股份有限公司', `隱藏禁止推廣：証宇藏起來、寶絢還在：${names.join('|')}`);
 chk(!/禁止推廣/.test(await pg.locator('#cards .card:has-text("寶絢") .card-top').textContent()), '寶絢的卡片不會寫禁止推廣');
 await pg.uncheck('#hideBlocked'); await pg.waitForTimeout(300);
 chk((await pg.$$eval('#cards .card .card-name',a=>a.length))===2, '取消隱藏兩家都在');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
