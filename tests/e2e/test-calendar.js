// 行事曆分頁：哪天要拜訪誰、打給誰（下次聯絡日攤開）、做完的打勾、假日灰掉、點一天列行程（拜訪同區排一起、電話另列）、
// 記錄開那家（游標在記這通電話）、複製這週、分頁名字帶今天家數、詳細頁「看行事曆」跳到那一天、?tab=cal
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9516);
const TODAY='2026-10-05';   // 週一
const mk=(id,company,address,extra)=>({id,source:'A.csv',company,aliases:[],taxId:'1000000'+id,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-333'+id,phones:[{digits:'0222223330',ext:'',note:''}],owner:'',keyman:'',industry:'',address,city:'新北市',district:(address.match(/新北市(..區)/)||[])[1]||'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',...extra});
const SEED=[
 mk('1','今天拜訪甲有限公司','新北市新莊區中正路100號'),
 mk('2','今天拜訪乙有限公司','新北市新莊區中正路300號'),
 mk('3','今天打電話有限公司','新北市板橋區文化路1號'),
 mk('4','週三拜訪有限公司','新北市泰山區明志路1號'),
 mk('5','昨天打過有限公司','新北市新莊區幸福路9號'),
 mk('6','禁止推廣有限公司','新北市新莊區中正路70號'),
 mk('7','今天做完有限公司','新北市新莊區中港路5號'),
 mk('8','文字提到拜訪有限公司','新北市新莊區中正路500號'),
 mk('9','通話寫約到拜訪有限公司','新北市新莊區中正路400號'),
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
   // 只有通話紀錄勾了「約到拜訪」（meeting）才是 🚗：乙、丁勾了；甲是以前拜訪表單存的（寫下一步：再約拜訪）→ 現在算 📞；丙通話 → 📞；戊昨天打過沒約；禁止推廣不列；己今天排了也做了
   await window.Store.addLog({recordId:'1',date:'2026-09-28',text:'實地拜訪，見到 王老闆。看了廠房\n下一步：再約拜訪',outcome:'contacted',kind:'visit',createdAt:now-7e8});
   await window.Store.addLog({recordId:'2',date:'2026-09-29',text:'電話聊過，老闆說可以過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-05',createdAt:now-6e8});
   // 文字提到「拜訪」但不是拜訪表單選的：只算 📞（使用者：「為什麼我沒排這間拜訪卻有他在上面？」）
   await window.Store.addLog({recordId:'8',date:'2026-09-29',text:'電話聊過，之前拜訪過的顏老闆也認識，約了再聊',outcome:'contacted',createdAt:now-6e8});
   // 通話紀錄只是寫了「約到拜訪」、沒勾：不算（使用者：「只有我勾選要拜訪才是約到拜訪」）
   await window.Store.addLog({recordId:'9',date:'2026-09-29',text:'跟老闆聊得不錯，約到拜訪 10/5 下午過去',outcome:'contacted',createdAt:now-6e8});
   await window.Store.addLog({recordId:'3',date:'2026-09-30',text:'有興趣，等報價\n下一步：電話追蹤',outcome:'contacted',createdAt:now-5e8});
   await window.Store.addLog({recordId:'4',date:'2026-09-30',text:'老闆說週三可以過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-07',createdAt:now-4e8});
   await window.Store.addLog({recordId:'5',date:'2026-10-04',text:'未接',outcome:'noanswer',createdAt:now-3e8});
   await window.Store.addLog({recordId:'7',date:'2026-10-05',text:'打通了，下週再聊',outcome:'contacted',createdAt:now-1e6});
   for (const [id,nextDate,extra] of [['1','2026-10-05',{outcome:'contacted',lastDate:'2026-09-28'}],['2','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}],['3','2026-10-05',{outcome:'contacted',lastDate:'2026-09-30'}],['4','2026-10-07',{outcome:'contacted',lastDate:'2026-09-30'}],['5',null,{outcome:'noanswer',lastDate:'2026-10-04'}],['6','2026-10-05',{outcome:'blocked'}],['7','2026-10-05',{outcome:'contacted',lastDate:'2026-10-05'}],['8','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}],['9','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}]])
     await window.Store.setState({recordId:id,nextDate,...extra,updatedAt:now}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const tabs=await pg.$$eval('#tabs .tab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(tabs[1]==='行事曆 5', `分頁名字帶今天還沒做的家數（甲乙丙＋兩家文字提到拜訪的；己做完了、禁止推廣不算）：${tabs[1]}`);
 await pg.click('.tab[data-tab="cal"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('#filters').isHidden() && /2026 年 10 月/.test(await pg.textContent('#paneCal h2')), '行事曆分頁打開、整寬、本月');
 const cell=(d)=>pg.locator(`#paneCal .cal-day[data-date="${d}"]`);
 const evs=async(d)=>(await cell(d).locator('.cal-ev').allTextContents()).map(t=>t.trim());
 { const e=await evs('2026-10-05'); chk(e[0]==='🚗 今天拜訪乙有限公司' && e.slice(1,4).every(t=>/^📞 /.test(t)) && e.slice(1,4).join('|').includes('今天拜訪甲') && e[4]==='＋2 家', `今天格：只有勾了約到拜訪的乙是 🚗，舊拜訪表單的甲、文字寫約到拜訪的都算 📞；超過四行寫＋N 家、禁止推廣不列：${JSON.stringify(e)}`); }
 chk(JSON.stringify(await evs('2026-10-07'))==='["🚗 週三拜訪有限公司"]' && JSON.stringify(await evs('2026-10-04'))==='["✓ 📞 昨天打過有限公司"]', `週三有丁、昨天打過的打勾：${JSON.stringify(await evs('2026-10-07'))} ${JSON.stringify(await evs('2026-10-04'))}`);
 chk(await cell('2026-10-05').evaluate(e=>e.classList.contains('is-today')&&e.classList.contains('is-sel')) && await cell('2026-10-09').evaluate(e=>e.classList.contains('is-off')) && /補假/.test(await cell('2026-10-09').textContent()) && await cell('2026-10-04').evaluate(e=>e.classList.contains('is-off')) && !(await cell('2026-10-06').evaluate(e=>e.classList.contains('is-off'))), '今天藍框且選著、國慶補假（10/9）與週日灰掉、平日不灰');
 // 今天的行程：拜訪同區排一起（新莊區）、電話另列、做完的另列
 let ag=await pg.locator('#paneCal .cal-agenda').textContent();
 chk(/10\/05（一）要跑 1 家、打 4 家，做完 1 家/.test(ag), `標題：${ag.slice(0,40)}`);
 const caps=await pg.locator('#paneCal .cal-cap').allTextContents();
 chk(caps.join('|')==='🚗 拜訪・新莊區（同區排一起）|📞 電話|✓ 做完的', `分組：${caps.join('|')}`);
 const r0=pg.locator('#paneCal .cal-row').first();
 chk(/今天拜訪乙/.test(await r0.textContent()) && (await r0.locator('a:has-text("導航")').count())===1 && (await r0.locator('a.tel').count())===1 && (await r0.locator('button:has-text("記錄")').count())===1 && (await pg.locator('#paneCal .cal-row.is-visit').count())===1, `拜訪列：電話、導航、記錄；只有一家：${(await r0.textContent()).replace(/\s+/g,' ')}`);
 chk(/上次 09\/30：有興趣，等報價/.test(await pg.locator('#paneCal .cal-row.is-call:has-text("今天打電話")').textContent()), '電話列帶上次談的重點');
 chk((await pg.locator('#paneCal .cal-row.is-call:has-text("文字提到拜訪")').count())===1 && (await pg.locator('#paneCal .cal-row.is-call:has-text("通話寫約到拜訪")').count())===1 && (await pg.locator('#paneCal .cal-row.is-call:has-text("今天拜訪甲")').count())===1, '沒勾的（文字提到、文字寫約到拜訪、舊拜訪表單）都在電話組');
 // 點週三
 await cell('2026-10-07').click(); await pg.waitForTimeout(300);
 ag=await pg.locator('#paneCal .cal-agenda').textContent();
 chk(/10\/07（三）要跑 1 家、打 0 家/.test(ag) && /週三拜訪有限公司/.test(ag) && /泰山區/.test(ag), `點週三列丁：${ag.slice(0,60)}`);
 // 記錄：開那家、游標在「記錄這通電話」的內容框；通話紀錄表單有「約到拜訪」勾選、沒有拜訪表單
 await pg.locator('#paneCal .cal-row button:has-text("記錄")').first().click(); await pg.waitForTimeout(500);
 chk(/週三拜訪/.test(await pg.textContent('#drawerBody h2')) && await pg.evaluate(()=>document.activeElement && document.activeElement.tagName==='TEXTAREA' && !!document.activeElement.closest('.logform')), '記錄打開那家、游標在內容框');
 chk(/約到拜訪/.test(await pg.locator('#drawerBody label:has(.meet-check)').textContent()) && (await pg.locator('#drawerBody details:has-text("記錄這次拜訪")').count())===0, '通話紀錄有「約到拜訪」勾選、拜訪表單拿掉了');
 // 勾約到拜訪、填下週二存起來 → 行事曆 10/13 標 🚗
 await pg.check('#drawerBody .meet-check'); await pg.fill('#drawerBody .logform textarea','老闆說下週二可以'); await pg.fill('#drawerBody input[type="date"]','2026-10-13'); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(700);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200);
 await pg.evaluate(()=>window.openCalendar('2026-10-13')); await pg.waitForTimeout(300);
 chk(JSON.stringify(await evs('2026-10-13'))==='["🚗 週三拜訪有限公司"]' && (await evs('2026-10-07')).length===0, `勾約到拜訪存起來：10/13 標 🚗、10/7 不再有：${JSON.stringify(await evs('2026-10-13'))}`);
 // 詳細頁「看行事曆」跳到下次聯絡日那天
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200);
 await pg.evaluate(()=>window.switchTab('all')); await pg.waitForTimeout(300);
 await pg.locator('#cards .card:has-text("週三拜訪") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody .cal-jump'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('#drawer').isHidden() && await cell('2026-10-13').evaluate(e=>e.classList.contains('is-sel')), '看行事曆：關掉詳細頁、跳到行事曆那一天（剛改成 10/13）');
 // 複製這週
 const wk=await pg.evaluate(()=>window.weekText('2026-10-07'));
 chk(/^10\/05～10\/11 行程\n10\/05（一）\n  🚗 今天拜訪乙有限公司　新北市新莊區中正路300號　02-2222-3332\n  📞 /.test(wk) && !/週三拜訪/.test(wk) && !/做完/.test(wk) && /10\/13（二）\n  🚗 週三拜訪有限公司/.test(await pg.evaluate(()=>window.weekText('2026-10-13'))), `這週的文字：${wk.split('\n').slice(0,4).join(' / ')}`);
 await pg.click('#paneCal button:has-text("複製這週")'); await pg.waitForTimeout(300);
 chk(/已複製這週的行程/.test(await pg.textContent('#toast')), `複製提示：${await pg.textContent('#toast')}`);
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
