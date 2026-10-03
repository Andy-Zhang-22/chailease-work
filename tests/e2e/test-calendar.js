// 行事曆分頁：哪天要拜訪誰、打給誰（下次聯絡日攤開）、做完的打勾、假日灰掉、點一天列行程（拜訪同區排一起、電話另列）、
// 記拜訪開那家、複製這週、分頁名字帶今天家數、詳細頁「看行事曆」跳到那一天、?tab=cal
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
   // 甲、乙：拜訪表單寫了「下一步：再約拜訪」、下次聯絡日今天 → 🚗；丙：通話、下次今天 → 📞；丁：週三拜訪；戊：昨天打過沒約；禁止推廣不列；己：今天排了也做了
   await window.Store.addLog({recordId:'1',date:'2026-09-28',text:'實地拜訪，見到 王老闆。看了廠房\n下一步：再約拜訪',outcome:'contacted',kind:'visit',createdAt:now-7e8});
   await window.Store.addLog({recordId:'2',date:'2026-09-29',text:'電話聊過，約了 10/5 過去拜訪',outcome:'contacted',createdAt:now-6e8});
   await window.Store.addLog({recordId:'3',date:'2026-09-30',text:'有興趣，等報價\n下一步：電話追蹤',outcome:'contacted',createdAt:now-5e8});
   await window.Store.addLog({recordId:'4',date:'2026-09-30',text:'實地拜訪，見到 陳經理\n下一步：再約拜訪',outcome:'contacted',kind:'visit',createdAt:now-4e8});
   await window.Store.addLog({recordId:'5',date:'2026-10-04',text:'未接',outcome:'noanswer',createdAt:now-3e8});
   await window.Store.addLog({recordId:'7',date:'2026-10-05',text:'打通了，下週再聊',outcome:'contacted',createdAt:now-1e6});
   for (const [id,nextDate,extra] of [['1','2026-10-05',{outcome:'contacted',lastDate:'2026-09-28'}],['2','2026-10-05',{outcome:'contacted',lastDate:'2026-09-29'}],['3','2026-10-05',{outcome:'contacted',lastDate:'2026-09-30'}],['4','2026-10-07',{outcome:'contacted',lastDate:'2026-09-30'}],['5',null,{outcome:'noanswer',lastDate:'2026-10-04'}],['6','2026-10-05',{outcome:'blocked'}],['7','2026-10-05',{outcome:'contacted',lastDate:'2026-10-05'}]])
     await window.Store.setState({recordId:id,nextDate,...extra,updatedAt:now}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const tabs=await pg.$$eval('#tabs .tab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(tabs[1]==='行事曆 3', `分頁名字帶今天還沒做的家數（甲乙丙；己做完了、禁止推廣不算）：${tabs[1]}`);
 await pg.click('.tab[data-tab="cal"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('#filters').isHidden() && /2026 年 10 月/.test(await pg.textContent('#paneCal h2')), '行事曆分頁打開、整寬、本月');
 const cell=(d)=>pg.locator(`#paneCal .cal-day[data-date="${d}"]`);
 const evs=async(d)=>(await cell(d).locator('.cal-ev').allTextContents()).map(t=>t.trim());
 chk(JSON.stringify(await evs('2026-10-05'))==='["🚗 今天拜訪甲有限公司","🚗 今天拜訪乙有限公司","📞 今天打電話有限公司","✓ 📞 今天做完有限公司"]', `今天格：拜訪先、電話後、做完的打勾、禁止推廣不列：${JSON.stringify(await evs('2026-10-05'))}`);
 chk(JSON.stringify(await evs('2026-10-07'))==='["🚗 週三拜訪有限公司"]' && JSON.stringify(await evs('2026-10-04'))==='["✓ 📞 昨天打過有限公司"]', `週三有丁、昨天打過的打勾：${JSON.stringify(await evs('2026-10-07'))} ${JSON.stringify(await evs('2026-10-04'))}`);
 chk(await cell('2026-10-05').evaluate(e=>e.classList.contains('is-today')&&e.classList.contains('is-sel')) && await cell('2026-10-09').evaluate(e=>e.classList.contains('is-off')) && /補假/.test(await cell('2026-10-09').textContent()) && await cell('2026-10-04').evaluate(e=>e.classList.contains('is-off')) && !(await cell('2026-10-06').evaluate(e=>e.classList.contains('is-off'))), '今天藍框且選著、國慶補假（10/9）與週日灰掉、平日不灰');
 // 今天的行程：拜訪同區排一起（新莊區）、電話另列、做完的另列
 let ag=await pg.locator('#paneCal .cal-agenda').textContent();
 chk(/10\/05（一）要跑 2 家、打 1 家，做完 1 家/.test(ag), `標題：${ag.slice(0,40)}`);
 const caps=await pg.locator('#paneCal .cal-cap').allTextContents();
 chk(caps.join('|')==='🚗 拜訪・新莊區（同區排一起）|📞 電話|✓ 做完的', `分組：${caps.join('|')}`);
 const r0=pg.locator('#paneCal .cal-row').first();
 chk(/今天拜訪甲/.test(await r0.textContent()) && /再約拜訪/.test(await r0.textContent()) && (await r0.locator('a:has-text("導航")').count())===1 && (await r0.locator('a.tel').count())===1 && (await r0.locator('button:has-text("記拜訪")').count())===1, `拜訪列：下一步、電話、導航、記拜訪：${(await r0.textContent()).replace(/\s+/g,' ')}`);
 chk(/上次 09\/30：有興趣，等報價/.test(await pg.locator('#paneCal .cal-row.is-call').first().textContent()), '電話列帶上次談的重點');
 // 點週三
 await cell('2026-10-07').click(); await pg.waitForTimeout(300);
 ag=await pg.locator('#paneCal .cal-agenda').textContent();
 chk(/10\/07（三）要跑 1 家、打 0 家/.test(ag) && /週三拜訪有限公司/.test(ag) && /泰山區/.test(ag), `點週三列丁：${ag.slice(0,60)}`);
 // 記拜訪：開那家、拜訪表單展開
 await pg.locator('#paneCal .cal-row button:has-text("記拜訪")').first().click(); await pg.waitForTimeout(500);
 chk(/週三拜訪/.test(await pg.textContent('#drawerBody h2')) && await pg.evaluate(()=>{ const d=[...document.querySelectorAll('#drawerBody details')].find(x=>/記錄這次拜訪/.test(x.textContent)); return !!(d&&d.open); }), '記拜訪打開那家、表單展開');
 // 詳細頁「看行事曆」跳到下次聯絡日那天
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200);
 await pg.evaluate(()=>window.switchTab('all')); await pg.waitForTimeout(300);
 await pg.locator('#cards .card:has-text("週三拜訪") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody .cal-jump'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneCal').isVisible() && await pg.locator('#drawer').isHidden() && await cell('2026-10-07').evaluate(e=>e.classList.contains('is-sel')), '看行事曆：關掉詳細頁、跳到行事曆那一天');
 // 複製這週
 const wk=await pg.evaluate(()=>window.weekText('2026-10-07'));
 chk(/^10\/05～10\/11 行程\n10\/05（一）\n  🚗 今天拜訪甲有限公司（再約拜訪）　新北市新莊區中正路100號　02-2222-3331\n  🚗 今天拜訪乙有限公司/.test(wk) && /10\/07（三）\n  🚗 週三拜訪有限公司/.test(wk) && !/做完/.test(wk), `這週的文字：${wk.split('\n').slice(0,4).join(' / ')}`);
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
