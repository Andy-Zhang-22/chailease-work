// 本週節奏（業務的一週）：照星期幾換內容；週一標最熱、設目標；通話紀錄勾「約到見面」→ 週三列拜訪；週五未跟完移下週
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9502);
const mk=(id,company,o)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:'',grade:'',founded:'',capital:'12,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'},o);
const RECS=[
 mk('1','星辰精密工業股份有限公司',{taxId:'11111111',outcome:'contacted',nextDate:'2026-10-06',lastDate:'2026-09-20'}),
 mk('2','遠帆國際開發有限公司',{taxId:'22222222',outcome:'contacted',nextDate:'2026-10-07',lastDate:'2026-09-21'}),
 mk('3','律森科技股份有限公司',{taxId:'33333333',outcome:'contacted',nextDate:'2026-10-08',lastDate:'2026-09-22'}),
 mk('4','範例數位文創股份有限公司',{taxId:'44444444',outcome:'contacted',nextDate:'2026-10-09',lastDate:'2026-09-23'}),
 mk('5','老友機械有限公司',{taxId:'55555555',outcome:'contacted',lastDate:'2026-05-01',notesRaw:'114/3/1 目前跟中租往來中，額度 500 萬。'}),
 mk('6','久違工程有限公司',{taxId:'66666666',outcome:'contacted',lastDate:'2026-06-10'}),
 mk('7','新來的有限公司',{taxId:'77777777'}),
];
// 上週（9/28～10/4）記了兩通電話、一次拜訪
const LOGS=[
 {recordId:'1',date:'2026-09-29',text:'聊過',outcome:'contacted',createdAt:new Date('2026-09-29T10:00:00').getTime()},
 {recordId:'2',date:'2026-09-30',text:'',outcome:'noanswer',createdAt:new Date('2026-09-30T10:00:00').getTime()},
 {recordId:'3',date:'2026-10-01',text:'實地拜訪，見到 王總。看了工廠\n下一步：送資料評估',outcome:'contacted',kind:'visit',createdAt:new Date('2026-10-01T10:00:00').getTime()},
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; let keep=''; try{ keep=localStorage.getItem('__now')||''; }catch(e){} window.__now=keep?Number(keep):new real('2026-10-05T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1200,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9502/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({r,l})=>{ await window.Store.saveRecords(r); for(const x of l) await window.Store.addLog(x);
   // 洽談狀態、日期是從使用者自己記的狀態來的（檔案欄位只是備援），所以寫進狀態
   for(const x of r) if(x.outcome!=='new') await window.Store.setState({recordId:x.id,outcome:x.outcome,nextDate:x.nextDate||null,lastDate:x.lastDate,updatedAt:Date.now()}); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },{r:RECS,l:LOGS});
 const setDay=async(iso)=>{ await pg.evaluate((t)=>{ localStorage.setItem('__now',String(new Date(`${t}T09:00:00`).getTime())); },iso); await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300); };
 await setDay('2026-10-05');   // 週一
 const head=async()=>(await pg.textContent('#weekBar .remind-toggle')).replace(/\s+/g,' ');
 chk(/週一 數字日｜先看帳，再出門/.test(await head()), `週一：${await head()}`);
 const body=async()=>(await pg.textContent('#weekBar .week-body')).replace(/\s+/g,' ');
 chk(/上週（2026\/09\/28～2026\/10\/04）/.test(await body()) && /打 2 通、接通 1、約到見面 0、拜訪 1、標有機會 0、送件 1/.test(await body()), `上週數字：${(await body()).slice(0,120)}`);
 chk(await pg.inputValue('#weekBar .week-goal')==='3', '本週目標預設 3');
 await pg.fill('#weekBar .week-goal','4'); await pg.dispatchEvent('#weekBar .week-goal','change'); await pg.waitForTimeout(300);
 chk((await pg.evaluate(()=>localStorage.getItem('week-goal')))==='2026-10-05:4', `目標存成本週的：${await pg.evaluate(()=>localStorage.getItem('week-goal'))}`);
 // 追單名單：談過的四家＋老客戶…；標最熱三家，第四家擋
 const rows=await pg.locator('#weekBar .week-row').count();
 chk(rows>=4, `追單名單有 ${rows} 列`);
 chk((await pg.locator('#weekBar .week-row:has-text("新來的")').count())===0, '沒打過的不在追單名單');
 for (const n of ['星辰','遠帆','律森']) { await pg.locator(`#weekBar .week-row:has-text("${n}") .hot-btn`).click(); await pg.waitForTimeout(300); }
 chk((await pg.locator('#weekBar .hot-btn.is-on').count())===3, '標了三家最熱');
 await pg.locator('#weekBar .week-row:has-text("範例") .hot-btn').click(); await pg.waitForTimeout(300);
 chk(/最熱的只標 3 家/.test(await pg.textContent('#toast')) && (await pg.locator('#weekBar .hot-btn.is-on').count())===3, '第四家擋下來');
 chk((await pg.locator('#cards .card:has-text("星辰") .badge-hot').count())===1, '卡片上標 🔥 本週最熱');
 chk(/本週追單名單（3\/3 家標了最熱）/.test(await body()), '標題算到 3/3');
 // 點週三的籤先看
 await pg.locator('#weekBar .week-tab:has-text("三")').click(); await pg.waitForTimeout(200);
 chk(/週三 拜訪日/.test(await head()) && /先看週三的；今天是週一/.test(await body()), '可以先看別天');
 // 週二：記一通電話勾「約到見面」，日期週三
 await setDay('2026-10-06');
 chk(/週二 開發日｜只做一件事：約見面/.test(await head()), `週二：${await head()}`);
 chk(/本週約到 0 個見面／目標 4/.test(await body()) && /舊名單重啟/.test(await body()) && /久違工程/.test(await body()) && !/老友機械/.test(await body()), `週二內容：${(await body()).slice(0,200)}`);
 await pg.locator('#cards .card:has-text("星辰")').first().click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const form=pg.locator('#drawerBody .logform').first();
 await form.locator('textarea').fill('約週三下午拜訪'); await form.locator('input[type=date]').fill('2026-10-07'); await form.locator('input[type=date]').dispatchEvent('change');
 await form.locator('.meet-check').check(); await pg.waitForTimeout(100);
 chk((await form.locator('select').inputValue())==='contacted', '勾約到見面就把結果改成已聯絡');
 await form.locator('button:has-text("儲存紀錄")').click(); await pg.waitForTimeout(600);
 chk(/約到 2026\/10\/07 見面/.test(await pg.textContent('#toast')), `提示：${await pg.textContent('#toast')}`);
 const log=await pg.evaluate(async()=>(await window.Store.allLogs()).find(l=>l.meeting));
 chk(log && log.meetingDate==='2026-10-07' && log.recordId==='1', `紀錄上有約到見面：${JSON.stringify(log&&{m:log.meeting,d:log.meetingDate})}`);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 chk(/本週約到 1 個見面／目標 4，今天約到 1 個/.test(await body()), `週二算到約到 1：${(await body()).slice(0,120)}`);
 // 週三：列今天要拜訪的
 await setDay('2026-10-07');
 chk(/週三 拜訪日/.test(await head()) && /今天要去拜訪（1 家，至少 2 家）/.test(await body()) && (await pg.locator('#weekBar .week-row').count())===1 && /只排了一家/.test(await body()), `週三只列約到見面的星辰：${(await body()).slice(0,160)}`);
 chk(/本週已約：週三 1/.test(await body()), '本週已約的統計');
 await pg.locator('#weekBar .week-row:has-text("星辰") button:has-text("記拜訪")').click(); await pg.waitForTimeout(500);
 chk(await pg.isVisible('#drawer') && await pg.evaluate(()=>document.querySelector('#drawerBody .visit-section').open), '「記拜訪」開詳細頁並攤開拜訪表單');
 const vf=pg.locator('#drawerBody .visitform');
 await vf.locator('input[type=text]').fill('王總'); await vf.locator('textarea').fill('看了新廠房'); await vf.locator('.chip:has-text("週轉金")').click(); await vf.locator('.chip:has-text("送資料評估")').click();
 await vf.locator('input[type=date]').nth(1).fill('2026-10-14');
 await pg.evaluate(()=>{ window.__copied=''; navigator.clipboard.writeText=async(t)=>{ window.__copied=t; }; });
 await vf.locator('button:has-text("複製會後摘要給客戶")').click(); await pg.waitForTimeout(200);
 const copied=await pg.evaluate(()=>window.__copied);
 chk(/^王總 您好，謝謝今天撥空。\n今天談到：看了新廠房\n資金需求：週轉金\n下一步：送資料評估，2026\/10\/14 再跟您聯繫\n有任何問題隨時找我。$/.test(copied), `會後摘要：${JSON.stringify(copied)}`);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 // 週四：老客戶
 await setDay('2026-10-08');
 chk(/週四 服務日/.test(await head()) && /老友機械/.test(await body()) && /往來中/.test(await body()) && !/久違工程/.test(await body()), `週四列老客戶：${(await body()).slice(0,160)}`);
 // 週五：覆盤；未跟完的移到下週一
 await setDay('2026-10-09');
 chk(/週五 覆盤日｜算帳，備戰/.test(await head()), `週五：${await head()}`);
 chk(/約到見面 1／4 ❌ 差 3/.test(await body()) && /上週：打 2 通/.test(await body()), `對目標：${(await body()).slice(0,200)}`);
 // 本週排到今天為止、還沒聯絡到的：星辰（約了 10/7 見面但沒記拜訪）、遠帆 10/7、律森 10/8、範例 10/9
 const mv=pg.locator('#weekBar button:has-text("未跟完的")');
 chk(/未跟完的 4 家移到 2026\/10\/12/.test(await mv.textContent()), `未跟完：${await mv.textContent()}`);
 await mv.click(); await pg.waitForTimeout(300); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(800);
 const moved=await pg.evaluate(async()=>{ const s=await window.Store.allStates(); return ['1','2','3','4'].map(id=>(s.find(x=>x.recordId===id)||{}).nextDate); });
 chk(moved.every(d=>d==='2026-10-12'), `四家都改到 10/12：${moved}`);
 chk(/下週三（2026\/10\/14）的拜訪：已約 0 家/.test(await body()) && /今天就約好/.test(await body()), '下週三的拜訪');
 // 週末看覆盤；收起來記得
 await setDay('2026-10-10');
 chk(/週五 覆盤日/.test(await head()), '週六看覆盤');
 await pg.click('#weekBar .remind-toggle'); await pg.waitForTimeout(200);
 chk((await pg.locator('#weekBar .week-body').count())===0 && (await pg.evaluate(()=>localStorage.getItem('week-bar-open')))==='0', '收起來並記住');
 // 下週一：最熱自動失效
 await setDay('2026-10-12');
 chk((await pg.locator('#cards .badge-hot').count())===0, '下週 🔥 自動失效');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
