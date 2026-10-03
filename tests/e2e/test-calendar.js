// 行事曆分頁：只列要去拜訪的（通話紀錄勾「約到拜訪」、約的那天＝下次聯絡日），電話不列；去過的打勾；假日灰掉；
// 點一天列行程（同區排一起、出發／抵達、導航、記錄、刪除）；刪除＝取消那則的約到拜訪；勾了沒填日期不給存；
// 直接在行事曆排拜訪（挑客戶、哪天、出發／抵達）、改期；複製這週、分頁名字帶今天家數、詳細頁「看行事曆」跳到那一天、?tab=cal
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9516);
const TODAY='2026-10-05';   // 週一
const mk=(id,company,address,extra)=>({id,source:'A.csv',company,aliases:[],taxId:'1000000'+id,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-333'+id,phones:[{digits:'0222223330',ext:'',note:''}],owner:'',keyman:'',industry:'',address,city:'新北市',district:(address.match(/新北市(..區)/)||[])[1]||'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',...extra});
const SEED=[
 mk('1','舊表單拜訪有限公司','新北市新莊區中正路100號'),
 mk('2','今天拜訪乙有限公司','新北市新莊區中正路300號'),
 mk('3','今天打電話有限公司','新北市板橋區文化路1號'),
 mk('4','週三拜訪有限公司','新北市泰山區明志路1號'),
 mk('5','昨天打過有限公司','新北市新莊區幸福路9號'),
 mk('6','禁止推廣有限公司','新北市新莊區中正路70號',{outcome:'blocked'}),
 mk('7','今天去過有限公司','新北市新莊區中港路5號'),
 mk('8','文字提到拜訪有限公司','新北市新莊區中正路500號'),
 mk('9','約過改期有限公司','新北市新莊區中正路400號'),
 mk('10','以前去過有限公司','新北市新莊區中正路600號'),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await ctx.grantPermissions(['clipboard-read','clipboard-write']);
 await pg.goto('http://localhost:9516/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0');
   const now=Date.now();
   // 只有通話紀錄勾了「約到拜訪」（meeting）、約的那天＝下次聯絡日才列：乙（今天 09:30 出發 10:00 到）、丁（週三）
   await window.Store.addLog({recordId:'1',date:'2026-09-28',text:'實地拜訪，見到 王老闆\n下一步：再約拜訪',outcome:'contacted',kind:'visit',createdAt:now-7e8});   // 舊拜訪表單：不算
   await window.Store.addLog({recordId:'2',date:'2026-09-29',text:'電話聊過，老闆說可以過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-05',meetingDepart:'09:30',meetingArrive:'10:00',createdAt:now-6e8});
   await window.Store.addLog({recordId:'3',date:'2026-09-30',text:'有興趣，等報價',outcome:'contacted',createdAt:now-5e8});   // 電話：不列
   await window.Store.addLog({recordId:'4',date:'2026-09-30',text:'老闆說週三可以過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-07',createdAt:now-4e8});
   await window.Store.addLog({recordId:'5',date:'2026-10-04',text:'未接',outcome:'noanswer',createdAt:now-3e8});
   // 己：約了今天、今天去過回來記了一筆（下次聯絡日已改到下週）→ 今天列成去過 ✓
   await window.Store.addLog({recordId:'7',date:'2026-09-30',text:'約好週一早上',outcome:'contacted',meeting:true,meetingDate:'2026-10-05',meetingArrive:'11:00',createdAt:now-2e8});
   await window.Store.addLog({recordId:'7',date:'2026-10-05',text:'去了，老闆要看方案',outcome:'contacted',createdAt:now-1e6});
   await window.Store.addLog({recordId:'8',date:'2026-09-29',text:'電話聊過，之前拜訪過的顏老闆也認識，約到拜訪再聊',outcome:'contacted',createdAt:now-6e8});   // 只是文字：不算
   // 約過改期：勾過約到拜訪（約 10/8），後來下次聯絡日改到今天、沒再勾 → 不列（使用者：「星彩我沒有勾，為什麼他會在拜訪這」）
   await window.Store.addLog({recordId:'9',date:'2026-09-29',text:'約好 10/8',outcome:'contacted',meeting:true,meetingDate:'2026-10-08',createdAt:now-6e8});
   // 以前去過：約的是 9/20，過了 → 列成去過 ✓
   await window.Store.addLog({recordId:'10',date:'2026-09-15',text:'約好 9/20 過去',outcome:'contacted',meeting:true,meetingDate:'2026-09-20',createdAt:now-6e8});
   for (const [id,nextDate,extra] of [['1','2026-10-05',{outcome:'contacted',lastDate:'2026-09-28'}],['2','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}],['3','2026-10-05',{outcome:'contacted',lastDate:'2026-09-30'}],['4','2026-10-07',{outcome:'contacted',lastDate:'2026-09-30'}],['5',null,{outcome:'noanswer',lastDate:'2026-10-04'}],['6','2026-10-05',{outcome:'blocked'}],['7','2026-10-12',{outcome:'contacted',lastDate:'2026-10-05'}],['8','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}],['9','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}],['10','2026-10-05',{outcome:'contacted',lastDate:'2026-09-15'}]])
     await window.Store.setState({recordId:id,nextDate,...extra,updatedAt:now}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const tabs=await pg.$$eval('#tabs .tab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(tabs[1]==='行事曆 1', `分頁名字帶今天還沒去的家數（只有乙；己去過了、電話不算）：${tabs[1]}`);
 await pg.click('.tab[data-tab="cal"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('#filters').isHidden() && /2026 年 10 月/.test(await pg.textContent('#paneCal h2')), '行事曆分頁打開、整寬、本月');
 const cell=(d)=>pg.locator(`#paneCal .cal-day[data-date="${d}"]`);
 const evs=async(d)=>(await cell(d).locator('.cal-ev').allTextContents()).map(t=>t.trim());
 chk(JSON.stringify(await evs('2026-10-05'))==='["🚗 10:00 今天拜訪乙有限公司","✓ 🚗 11:00 今天去過有限公司"]', `今天格：只有勾了約到拜訪、日期也對的乙（帶抵達時間）；去過的打勾；電話、舊表單、文字寫的、改過期的、禁止推廣都不列：${JSON.stringify(await evs('2026-10-05'))}`);
 chk(JSON.stringify(await evs('2026-10-07'))==='["🚗 週三拜訪有限公司"]' && (await evs('2026-10-04')).length===0 && (await evs('2026-10-08')).length===0, `週三有丁；昨天打過的電話不列；改期掉的 10/8 不列：${JSON.stringify(await evs('2026-10-07'))}`);
 chk(await cell('2026-10-05').evaluate(e=>e.classList.contains('is-today')&&e.classList.contains('is-sel')) && await cell('2026-10-09').evaluate(e=>e.classList.contains('is-off')) && /補假/.test(await cell('2026-10-09').textContent()) && await cell('2026-10-04').evaluate(e=>e.classList.contains('is-off')) && !(await cell('2026-10-06').evaluate(e=>e.classList.contains('is-off'))), '今天藍框且選著、國慶補假（10/9）與週日灰掉、平日不灰');
 chk(/🚗 要去拜訪　✓ 去過了/.test(await pg.textContent('#paneCal .cal-legend')), '圖例只有拜訪');
 // 今天的行程：只有拜訪，同區排一起；去過的另列
 let ag=await pg.locator('#paneCal .cal-agenda').textContent();
 chk(/10\/05（一）要跑 1 家，去過 1 家/.test(ag), `標題：${ag.slice(0,40)}`);
 const caps=await pg.locator('#paneCal .cal-cap').allTextContents();
 chk(caps.join('|')==='🚗 新莊區（同區排一起）|✓ 去過的' && (await pg.locator('#paneCal .cal-row.is-call').count())===0, `分組沒有電話：${caps.join('|')}`);
 const r0=pg.locator('#paneCal .cal-row').first();
 chk(/今天拜訪乙/.test(await r0.textContent()) && /出發 09:30・抵達 10:00/.test(await r0.textContent()) && (await r0.locator('a:has-text("導航")').count())===1 && (await r0.locator('a.tel').count())===1 && (await r0.locator('button:has-text("記錄")').count())===1 && (await r0.locator('button:has-text("刪除")').count())===1, `拜訪列：出發／抵達、電話、導航、記錄、刪除：${(await r0.textContent()).replace(/\s+/g,' ')}`);
 chk(/今天去過有限公司/.test(await pg.locator('#paneCal .cal-row.is-done').first().textContent()) && /09\/30 約的：約好週一早上/.test(await pg.locator('#paneCal .cal-row.is-done').first().textContent()), '去過的那列帶哪天約的');
 // 以前去過（上個月）：切到 9 月看
 await pg.evaluate(()=>window.openCalendar('2026-09-20')); await pg.waitForTimeout(300);
 chk(JSON.stringify(await evs('2026-09-20'))==='["✓ 🚗 以前去過有限公司"]', `約的那天過了列成去過：${JSON.stringify(await evs('2026-09-20'))}`);
 await pg.evaluate(()=>window.openCalendar('2026-10-05')); await pg.waitForTimeout(300);
 // 點週三
 await cell('2026-10-07').click(); await pg.waitForTimeout(300);
 ag=await pg.locator('#paneCal .cal-agenda').textContent();
 chk(/10\/07（三）要跑 1 家/.test(ag) && /週三拜訪有限公司/.test(ag) && /泰山區/.test(ag), `點週三列丁：${ag.slice(0,60)}`);
 // 記錄：開那家、游標在「記錄這通電話」的內容框；通話紀錄表單有「約到拜訪」勾選、沒勾時沒有時間框、沒有拜訪表單
 await pg.locator('#paneCal .cal-row button:has-text("記錄")').first().click(); await pg.waitForTimeout(500);
 chk(/週三拜訪/.test(await pg.textContent('#drawerBody h2')) && await pg.evaluate(()=>document.activeElement && document.activeElement.tagName==='TEXTAREA' && !!document.activeElement.closest('.logform')), '記錄打開那家、游標在內容框');
 chk(/約到拜訪/.test(await pg.locator('#drawerBody label:has(.meet-check)').textContent()) && (await pg.locator('#drawerBody details:has-text("記錄這次拜訪")').count())===0 && await pg.locator('#drawerBody .meet-times').isHidden(), '通話紀錄有「約到拜訪」勾選、沒勾時沒有時間框、拜訪表單拿掉了');
 // 勾約到拜訪：出現時間框；沒填日期不給存；填下週二存起來 → 行事曆 10/13 標 🚗 帶時間
 await pg.check('#drawerBody .meet-check'); await pg.waitForTimeout(100);
 chk(await pg.locator('#drawerBody .meet-times').isVisible(), '勾了約到拜訪出現出發／抵達時間');
 await pg.fill('#drawerBody .meet-depart','13:30'); await pg.fill('#drawerBody .meet-arrive','14:00'); await pg.fill('#drawerBody .logform textarea','老闆說下週二可以'); await pg.fill('#drawerBody input[type="date"]',''); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(300);
 chk(/勾了「約到拜訪」要填下次聯絡日/.test(await pg.textContent('#toast')), `勾了約到拜訪沒填日期不給存：${await pg.textContent('#toast')}`);
 await pg.fill('#drawerBody input[type="date"]','2026-10-13'); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(700);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200);
 await pg.evaluate(()=>window.openCalendar('2026-10-13')); await pg.waitForTimeout(300);
 chk(JSON.stringify(await evs('2026-10-13'))==='["🚗 14:00 週三拜訪有限公司"]' && (await evs('2026-10-07')).length===0, `勾約到拜訪存起來：10/13 標 🚗 帶抵達時間、10/7 不再有：${JSON.stringify(await evs('2026-10-13'))}`);
 chk(/出發 13:30・抵達 14:00/.test(await pg.locator('#paneCal .cal-row.is-visit').first().textContent()), '行程列寫出發、抵達時間');
 // 詳細頁「看行事曆」跳到下次聯絡日那天
 await pg.evaluate(()=>window.switchTab('all')); await pg.waitForTimeout(300);
 await pg.locator('#cards .card:has-text("週三拜訪") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody .cal-jump'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('#drawer').isHidden() && await cell('2026-10-13').evaluate(e=>e.classList.contains('is-sel')), '看行事曆：關掉詳細頁、跳到行事曆那一天（剛改成 10/13）');
 // 複製這週：只有拜訪
 const wk=await pg.evaluate(()=>window.weekText('2026-10-07'));
 chk(/^10\/05～10\/11 拜訪行程\n10\/05（一）\n  🚗 今天拜訪乙有限公司 09:30 出發、10:00 到　新北市新莊區中正路300號　02-2222-3332$/.test(wk) && /10\/13（二）\n  🚗 週三拜訪有限公司 13:30 出發、14:00 到/.test(await pg.evaluate(()=>window.weekText('2026-10-13'))), `這週的文字只有拜訪、去過的不列：${wk.split('\n').join(' / ')}`);
 await pg.click('#paneCal button:has-text("複製這週")'); await pg.waitForTimeout(300);
 chk(/已複製這週的行程/.test(await pg.textContent('#toast')), `複製提示：${await pg.textContent('#toast')}`);
 // 刪除：從行事曆拿掉 10/13 的拜訪（取消那則的約到拜訪，紀錄留著、下次聯絡日不動）
 await pg.locator('#paneCal .cal-row button:has-text("刪除")').first().click(); await pg.waitForTimeout(300);
 chk(/把「週三拜訪有限公司」10\/13 的拜訪從行事曆拿掉/.test(await pg.textContent('.ask-overlay')), `刪除先問：${(await pg.textContent('.ask-overlay')).slice(0,60)}`);
 await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(600);
 const after=await pg.evaluate(async()=>{ const logs=(await window.Store.allLogs()).filter(l=>l.recordId==='4'); const v=window.customerViews().find(v=>v.company==='週三拜訪有限公司'); const l=logs.find(l=>/下週二/.test(l.text)); return {n:logs.length, meeting:!!(l&&l.meeting), text:logs.map(l=>l.text).join('|'), next:v.nextDate}; });
 chk((await evs('2026-10-13')).length===0 && after.n===2 && !after.meeting && /老闆說下週二可以/.test(after.text) && after.next==='2026-10-13', `拿掉後 10/13 沒有了、那則紀錄還在只是不勾了、下次聯絡日不動：${JSON.stringify(after)}`);
 chk(/已把「週三拜訪有限公司」從行事曆拿掉/.test(await pg.textContent('#toast')), `提示：${await pg.textContent('#toast')}`);
 // 直接在行事曆排拜訪：點 10/8（空的）→ ＋ 排拜訪 → 找「今天打電話」→ 時間 → 排進去
 await cell('2026-10-08').click(); await pg.waitForTimeout(200);
 chk(/10\/08（四）沒排拜訪/.test(await pg.locator('#paneCal .cal-agenda h3').textContent()) && (await pg.locator('#paneCal .cal-add').count())===1, '空的那天有「＋ 排拜訪」');
 await pg.click('#paneCal .cal-add'); await pg.waitForSelector('#editorBody h2'); await pg.waitForTimeout(100);
 chk(/排拜訪：10\/08（四）/.test(await pg.textContent('#editorBody h2')) && (await pg.inputValue('#editorBody input[type="date"]'))==='2026-10-08', `對話框帶那一天：${await pg.textContent('#editorBody h2')}`);
 await pg.fill('#editorBody input[type="search"]','今天打'); await pg.waitForTimeout(150);
 chk((await pg.locator('#editorBody .cal-pick-row').count())===1 && /今天打電話有限公司/.test(await pg.locator('#editorBody .cal-pick-row').first().textContent()), '搜到那家');
 await pg.click('#editorBody .cal-pick-row'); await pg.waitForTimeout(100);
 chk(/🚗 今天打電話有限公司/.test(await pg.textContent('#editorBody .cal-chosen')), '挑好了');
 await pg.fill('#editorBody input[type="time"] >> nth=0','10:00'); await pg.fill('#editorBody input[type="time"] >> nth=1','10:30'); await pg.fill('#editorBody textarea','帶設備融資方案');
 await pg.click('#editorBody button:has-text("排進行事曆")'); await pg.waitForTimeout(700);
 chk(await pg.locator('#editor').isHidden() && JSON.stringify(await evs('2026-10-08'))==='["🚗 10:30 今天打電話有限公司"]' && await cell('2026-10-08').evaluate(e=>e.classList.contains('is-sel')), `排進去：10/8 有這家、帶抵達時間、停在那天：${JSON.stringify(await evs('2026-10-08'))}`);
 const sch=await pg.evaluate(async()=>{ const v=window.customerViews().find(v=>v.company==='今天打電話有限公司'); const l=(await window.Store.allLogs()).filter(l=>l.recordId==='3').sort((a,b)=>b.createdAt-a.createdAt)[0]; return {next:v.nextDate,outcome:v.outcome,text:l.text,meeting:l.meeting,md:l.meetingDate,dep:l.meetingDepart,arr:l.meetingArrive,date:l.date}; });
 chk(sch.next==='2026-10-08' && sch.outcome==='contacted' && sch.text==='帶設備融資方案' && sch.meeting && sch.md==='2026-10-08' && sch.dep==='10:00' && sch.arr==='10:30' && sch.date===TODAY, `記成一則勾了約到拜訪的紀錄、下次聯絡日改成那天：${JSON.stringify(sch)}`);
 chk((await evs('2026-10-05')).length===2, '今天格不會多出它（原本是電話；今天還是乙＋去過的己）');
 // 改期：10/8 → 10/14、時間改 14:00
 await pg.click('#paneCal .cal-row button:has-text("改期")'); await pg.waitForSelector('#editorBody h2'); await pg.waitForTimeout(100);
 chk(/改期：今天打電話有限公司/.test(await pg.textContent('#editorBody h2')) && (await pg.inputValue('#editorBody input[type="time"] >> nth=1'))==='10:30' && (await pg.locator('#editorBody input[type="search"]').count())===0, '改期對話框帶原本的時間、不用再挑客戶');
 await pg.fill('#editorBody input[type="date"]','2026-10-14'); await pg.fill('#editorBody input[type="time"] >> nth=1','14:00'); await pg.click('#editorBody button:has-text("改好了")'); await pg.waitForTimeout(700);
 chk((await evs('2026-10-08')).length===0 && JSON.stringify(await evs('2026-10-14'))==='["🚗 14:00 今天打電話有限公司"]' && (await pg.evaluate(()=>window.customerViews().find(v=>v.company==='今天打電話有限公司').nextDate))==='2026-10-14', `改期：10/8 沒了、10/14 有、下次聯絡日跟著改：${JSON.stringify(await evs('2026-10-14'))}`);
 // 上下月、今天
 await pg.click('#paneCal button[title="下個月"]'); await pg.waitForTimeout(200);
 chk(/2026 年 11 月/.test(await pg.textContent('#paneCal h2')) && (await cell('2026-11-01').count())===1, '切到下個月');
 await pg.click('#paneCal button:has-text("今天")'); await pg.waitForTimeout(200);
 chk(/2026 年 10 月/.test(await pg.textContent('#paneCal h2')) && await cell('2026-10-05').evaluate(e=>e.classList.contains('is-sel')), '按今天回來');
 // ?tab=cal
 await pg.goto('http://localhost:9516/index.html?tab=cal'); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('.tab[data-tab="cal"]').evaluate(e=>e.classList.contains('is-active')), '?tab=cal 直接開行事曆');
 if(process.env.SHOT) await pg.screenshot({path:process.env.SHOT,fullPage:true});
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
