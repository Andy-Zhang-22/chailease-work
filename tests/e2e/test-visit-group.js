// 關係企業連動不能把約了拜訪的那家的日期蓋掉（版本 396；使用者：「我明明今天有約訪的客戶，我只是透過他的關企去修改拜訪內容，就被刪掉了」）：
// 甲、乙同老闆連結；甲約了今天拜訪。在乙記一通、下次聯絡日填 11/05 → 甲的下次聯絡日照舊是今天、行事曆今天照樣有甲的拜訪；乙是 11/05
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9618);
const TODAY='2026-10-28';   // 週三
const mk=(id,company)=>({id,source:'測試',company,aliases:[],taxId:'',grade:'',founded:'',capital:'',phoneRaw:'02-2222-0000',phones:[{raw:'02-2222-0000',display:'02-2222-0000',tel:'0222220000'}],owner:'',keyman:'',industry:'',nextDate:TODAY,lastDate:'2026-10-20',addedDate:'2026-09-01',country:'台灣',address:'新北市新莊區中正路1號',notesRaw:'',timeline:[],outcome:'contacted'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D;
   try{localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){} }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9618/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); const now=Date.now();
   await window.Store.setState({recordId:'a',outcome:'contacted',lastDate:'2026-10-20',nextDate:'2026-10-28',group:'g1',groupIds:['a','b'],groupAt:now,updatedAt:now});
   await window.Store.setState({recordId:'b',outcome:'contacted',lastDate:'2026-10-20',nextDate:'2026-10-28',group:'g1',groupIds:['a','b'],groupAt:now,updatedAt:now});
   await window.Store.addLog({recordId:'a',date:'2026-10-20',text:'約好 10/28 下午過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-28',meetingArrive:'14:00',createdAt:now-1e6}); },
   [mk('a','拜訪甲有限公司'),mk('b','關企乙有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 await pg.evaluate(()=>window.openCalendar('2026-10-28')); await pg.waitForTimeout(500);
 chk(/拜訪甲有限公司/.test(await pg.textContent('#paneCal')), '一開始：行事曆今天有甲的拜訪');
 // 在乙記一通、下次聯絡日改 11/05（就是「透過關企去修改」）
 await pg.evaluate(()=>window.openCustomer('b')); await pg.waitForSelector('#drawerBody textarea');
 await pg.fill('#drawerBody textarea','跟老闆確認下午拜訪的資料，乙這家下週再追');
 const di='#drawerBody input[type="date"]';
 await pg.fill(di,'2026-11-05'); await pg.dispatchEvent(di,'change'); await pg.locator(di).blur(); await pg.waitForTimeout(200);
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
 const nd=await pg.evaluate(()=>Object.fromEntries(window.customerViews().map(v=>[v.id,v.nextDate])));
 chk(nd.a==='2026-10-28' && nd.b==='2026-11-05', `甲約了今天拜訪、日期不跟著組換；乙照它記的：${JSON.stringify(nd)}`);
 await pg.evaluate(()=>window.openCalendar('2026-10-28')); await pg.waitForTimeout(500);
 chk(/拜訪甲有限公司/.test(await pg.textContent('#paneCal')), `記完之後：行事曆今天照樣有甲的拜訪`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
