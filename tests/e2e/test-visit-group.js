// 關係企業與約了拜訪的那家（版本 396、397）：
// 396「我明明今天有約訪的客戶，我只是透過他的關企去修改拜訪內容，就被刪掉了」→ 在關企記一通、填別天，約了拜訪的那家日期不被蓋掉
// 397「我在關企的紀錄為什麼沒有讓他也劃記上已拜訪」「不管是到客戶那或關企紀錄拜訪內容都可以做修改」：
//   在關企那家勾約到拜訪＝改同一次拜訪（帶入原本的時間、不多生一個）；拜訪當天在關企記一筆＝去過了
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9618);
const TODAY='2026-10-27';   // 週二，拜訪約在隔天 10/28
const mk=(id,company)=>({id,source:'測試',company,aliases:[],taxId:'',grade:'',founded:'',capital:'',phoneRaw:'02-2222-0000',phones:[{raw:'02-2222-0000',display:'02-2222-0000',tel:'0222220000'}],owner:'',keyman:'',industry:'',nextDate:'2026-10-28',lastDate:'2026-10-20',addedDate:'2026-09-01',country:'台灣',address:'新北市新莊區中正路1號',notesRaw:'',timeline:[],outcome:'contacted'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=Number(sessionStorage.getItem('fake-now'))||new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D;
   try{localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){} }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9618/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); const now=Date.now();
   await window.Store.setState({recordId:'a',outcome:'contacted',lastDate:'2026-10-20',nextDate:'2026-10-28',group:'g1',groupIds:['a','b'],groupAt:now,updatedAt:now});
   await window.Store.setState({recordId:'b',outcome:'contacted',lastDate:'2026-10-20',nextDate:'2026-10-28',group:'g1',groupIds:['a','b'],groupAt:now,updatedAt:now});
   await window.Store.addLog({recordId:'a',date:'2026-10-20',text:'約好 10/28 下午過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-28',meetingDepart:'13:00',meetingArrive:'14:00',createdAt:now-1e6}); },
   [mk('a','拜訪甲有限公司'),mk('b','關企乙有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 const di='#drawerBody input[type="date"]';
 const evs=async()=>{ await pg.evaluate(()=>window.openCalendar('2026-10-28')); await pg.waitForTimeout(500);
   return pg.evaluate(()=>[...document.querySelectorAll('#paneCal .cal-day.is-sel .cal-ev, #paneCal .cal-ev')].filter((e,i,a)=>a.indexOf(e)===i).filter(e=>/有限公司/.test(e.textContent)).map(e=>({t:e.textContent.trim(),done:e.classList.contains('is-done')}))); };
 const nd=()=>pg.evaluate(()=>Object.fromEntries(window.customerViews().map(v=>[v.id,v.nextDate])));
 const logOn=async(id,text,date,{meet=false,arrive}={})=>{
   await pg.evaluate((i)=>window.openCustomer(i),id); await pg.waitForSelector('#drawerBody textarea');
   await pg.fill('#drawerBody textarea',text);
   if (meet) { await pg.check('#drawerBody .meet-check'); await pg.waitForTimeout(200); }
   if (date) { await pg.fill(di,date); await pg.dispatchEvent(di,'change'); await pg.locator(di).blur(); await pg.waitForTimeout(200); }
   if (arrive) await pg.fill('#drawerBody .meet-arrive',arrive);
   await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900); };

 let e=await evs();
 chk(e.length===1 && /拜訪甲/.test(e[0].t) && !e[0].done, `一開始：10/28 有甲的拜訪：${JSON.stringify(e)}`);

 // 396：10/27 在乙記一通、下次聯絡日填 11/05（沒勾約到拜訪）
 await logOn('b','跟老闆確認拜訪要帶的資料，乙這家下週再追','2026-11-05');
 let n=await nd(); e=await evs();
 chk(n.a==='2026-10-28' && n.b==='2026-11-05', `甲約了 10/28 拜訪、日期不跟著組換；乙照它記的：${JSON.stringify(n)}`);
 chk(e.length===1 && /拜訪甲/.test(e[0].t) && !e[0].done, `前一天在乙記的不算去過、拜訪還在：${JSON.stringify(e)}`);

 // 397：在乙的記錄欄看得到甲約的拜訪；勾約到拜訪＝改這次（帶入原本時間），抵達改 16:00
 await pg.evaluate(()=>window.openCustomer('b')); await pg.waitForSelector('#drawerBody textarea');
 const hint=await pg.textContent('#drawerBody .meet-current').catch(()=>'');
 chk(/同老闆的「拜訪甲有限公司」約了 2026\/10\/28/.test(hint) && /14:00 抵達/.test(hint), `乙的記錄欄寫出甲約的拜訪：${hint}`);
 await pg.check('#drawerBody .meet-check'); await pg.waitForTimeout(300);
 const pre=await pg.evaluate(()=>({d:document.querySelector('#drawerBody input[type="date"]').value,dep:document.querySelector('#drawerBody .meet-depart').value,arr:document.querySelector('#drawerBody .meet-arrive').value}));
 chk(pre.d==='2026-10-28' && pre.dep==='13:00' && pre.arr==='14:00', `勾了先帶入原本約的日期與時間：${JSON.stringify(pre)}`);
 await pg.fill('#drawerBody textarea','老闆改下午四點到'); await pg.fill('#drawerBody .meet-arrive','16:00');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
 e=await evs(); n=await nd();
 chk(e.length===1 && /16:00/.test(e[0].t) && /拜訪甲/.test(e[0].t), `改的是同一次拜訪：10/28 還是只有甲一個、時間變 16:00：${JSON.stringify(e)}`);
 chk(n.a==='2026-10-28', `甲的下次聯絡日還是拜訪那天：${JSON.stringify(n)}`);

 // 397：10/28 下午拜訪完，在乙記一筆 → 甲那次拜訪劃成去過了，之後甲照常跟組
 await pg.evaluate(()=>sessionStorage.setItem('fake-now', String(new Date('2026-10-28T17:00:00').getTime())));
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1000);
 await logOn('b','下午拜訪完，老闆說兩家一起評估','2026-11-10');
 e=await evs(); n=await nd();
 chk(e.length===1 && e[0].done && /拜訪甲/.test(e[0].t), `在乙記完：甲 10/28 那次拜訪劃成去過了：${JSON.stringify(e)}`);
 chk(n.a==='2026-11-10' && n.b==='2026-11-10', `去過之後甲照常跟組：${JSON.stringify(n)}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
