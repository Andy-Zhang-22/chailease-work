// 下次聯絡日與回撥提醒遇到國定假日、連假、週末要順延到上班日
const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9203);
const rec={id:'1',source:'A.csv',company:'甲公司',aliases:[],taxId:'11111111',grade:'',founded:'2015',capital:'12,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9203/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');

 // 先驗資料本身（不用開 UI）
 const t=await pg.evaluate(()=>{const H=window.Holidays; return {
   中秋:H.holidayName('2026-09-25'), 教師節:H.holidayName('2026-09-28'), 平日:H.holidayName('2026-09-29'),
   中秋順延:H.nextWorkday('2026-09-25').iso,        // 週五中秋 → 週一教師節也放 → 週二
   國慶順延:H.nextWorkday('2026-10-10').iso,        // 週六國慶（10/9 補假） → 週一
   春節順延:H.nextWorkday('2026-02-16').iso,        // 除夕 → 整串連假跳完
   補班日:H.holidayName('2025-02-08'),               // 週六補班 → 要上班
   沒資料的年份:H.covered('2029-01-01'),
 };});
 chk(t.中秋==='中秋節'&&t.教師節==='孔子誕辰紀念日/教師節'&&t.平日==='', `假日表讀得出來：${JSON.stringify(t)}`);
 chk(t.中秋順延==='2026-09-29', `中秋連假順延到 9/29：${t.中秋順延}`);
 chk(t.國慶順延==='2026-10-12', `國慶（含 10/9 補假）順延到 10/12：${t.國慶順延}`);
 chk(t.春節順延==='2026-02-23', `春節九天連假整串跳過：${t.春節順延}`);
 chk(t.補班日==='', '週末補班日算上班日');
 chk(t.沒資料的年份===false, '沒有行事曆資料的年份會講實話');

 // UI：把「今天」當成中秋前一天（9/24），按「明天」要跳到 9/29
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords([r]); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },rec);
 await pg.clock.install({ time: new Date('2026-09-24T10:00:00') });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.clock.resume(); await pg.waitForTimeout(600);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 await pg.locator('.card:has-text("甲公司")').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody button:has-text("明天")'); await pg.waitForTimeout(400);
 const v1=await pg.inputValue('#drawerBody input[type="date"]');
 chk(v1==='2026-09-29', `按「明天」（9/25 中秋）順延到 9/29：${v1}`);
 const toast=await pg.textContent('#toast');
 chk(/中秋節/.test(toast)&&/順延/.test(toast), `而且講明為什麼：${toast}`);

 // 「一個月後」「三個月後」是下個月、三個月後的同一天，不是 30／90 天（使用者：按三個月後不會顯示正確日期；9/30 按三個月後出來 12/30）
 await pg.click('#drawerBody button:has-text("一個月後")'); await pg.waitForTimeout(300);
 const vm1=await pg.inputValue('#drawerBody input[type="date"]');
 chk(vm1==='2026-10-27', `9/24 按「一個月後」→ 10/24 週六、10/26 光復節補假，順延到 10/27：${vm1}`);
 const m=await pg.evaluate(()=>[window.addMonths('2026-10-01',3), window.addMonths('2026-08-31',1), window.addMonths('2026-01-31',1), window.addMonths('2026-11-30',3)]);
 chk(JSON.stringify(m)==='["2027-01-01","2026-09-30","2026-02-28","2027-02-28"]', `幾個月後的同一天、沒有那一天就取月底：${JSON.stringify(m)}`);

 // 「今天」不順延：人就是在今天按的
 await pg.click('#drawerBody button:has-text("今天")'); await pg.waitForTimeout(400);
 const v2=await pg.inputValue('#drawerBody input[type="date"]');
 chk(v2==='2026-09-24', `「今天」照原樣：${v2}`);

 // 自己用日期框挑到假日，一樣順延（使用者要求：反正那天打不到人）
 await pg.fill('#drawerBody input[type="date"]','2026-10-10');
 await pg.dispatchEvent('#drawerBody input[type="date"]','change'); await pg.waitForTimeout(400);
 const v3=await pg.inputValue('#drawerBody input[type="date"]');
 chk(v3==='2026-10-12', `自己挑 10/10（週六，10/9 補假）也順延到 10/12：${v3}`);
 chk(/順延/.test(await pg.textContent('#toast')), `而且講明原因：${await pg.textContent('#toast')}`);
 const hint=await pg.textContent('#drawerBody .date-hint');
 chk(!/放假/.test(hint), `順延後的提示就不會再說放假了：${hint}`);
 // 挑到上班日不會被亂動
 await pg.fill('#drawerBody input[type="date"]','2026-10-13');
 await pg.dispatchEvent('#drawerBody input[type="date"]','change'); await pg.waitForTimeout(300);
 chk((await pg.inputValue('#drawerBody input[type="date"]'))==='2026-10-13', '挑到上班日照留，不會亂動');
 // 挑到春節：整串連假跳過
 await pg.fill('#drawerBody input[type="date"]','2026-02-18');
 await pg.dispatchEvent('#drawerBody input[type="date"]','change'); await pg.waitForTimeout(300);
 chk((await pg.inputValue('#drawerBody input[type="date"]'))==='2026-02-23', `挑到春節跳到收假後：${await pg.inputValue('#drawerBody input[type="date"]')}`);

 // 回撥提醒的自訂時間：撞到連假就順延，時間點留著
 await pg.fill('#drawerBody .remind-custom','2026-10-10T14:30');
 await pg.click('#drawerBody button:has-text("自訂時間")'); await pg.waitForTimeout(700);
 const at=await pg.evaluate(async()=>{const s=await window.Store.allStates(); return (s.find(x=>x.recordId==='1')||{}).remindAt;});
 const d=new Date(at);
 chk(d.getFullYear()===2026&&d.getMonth()===9&&d.getDate()===12&&d.getHours()===14&&d.getMinutes()===30,
   `提醒順延到 10/12 14:30（時間點留著）：${d.toLocaleString('zh-TW')}`);

 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
