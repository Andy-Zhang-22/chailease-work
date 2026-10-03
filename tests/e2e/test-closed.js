// 已停業自動藏：leads/closed 的停業表 → 名單分頁把那些公司當藏起來的（不列、不挑、藏起來那邊寫原因），客戶名單上的卡片標「已停業」
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9510);
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const THEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const TROWS=[
 ['70000001','晨光貿易有限公司','','新北市新莊區中正路100號','王O明','02-2990-1234','','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','遠帆國際開發有限公司','','新北市新莊區文化路1號','李O華','02-2960-1111','','2026/01/15','2026/01/15','N','Y','110/03/01','30000000'],
];
const TCSV='﻿'+[THEAD,...TROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const TINDEX={generatedAt:'2026-10-01T20:00:00.000Z',cities:['新北市'],months:24,total:2,withPhone:2,recent:2,files:[{path:'trade.csv',rows:2}]};
const NHEAD='統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額';
const NROWS=[['70000001','晨光貿易有限公司','新北市新莊區中正路100號','4582','批發業','108/10/01','202609','02-2990-1234','12000000'],['24908600','宇駿貿易有限公司','新北市新莊區中正路1號','4552','批發業','104/08/14','202608','','3000000']];
const NCSV='﻿'+[NHEAD,...NROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const NINDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:6,total:2,withPhone:1,latestYm:'2026/09',files:[{path:'nhi.csv',rows:2}]};
const CCSV='﻿統編,名稱,狀態,日期\n70000002,遠帆國際開發有限公司,稅籍停業,2026/05/23\n24908600,宇駿貿易有限公司,健保投保單位註銷,2026/06/30\n';
const CINDEX={generatedAt:'2026-10-03T03:00:00.000Z',cities:['新北市','臺北市'],years:30,taxFileDate:'02-OCT-26',total:2,byKind:{'稅籍停業':1,'健保投保單位註銷':1},files:[{path:'closed.csv',rows:2}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2021',capital:'30,000',phoneRaw:'02-2960-1111',phones:[{digits:'0229601111',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區文化路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('2026-10-05T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 // Playwright 後登記的路由先比對：其他清冊一律 404 的要先登記
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(TINDEX)}));
 await ctx.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:TCSV}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NINDEX)}));
 await ctx.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:NCSV}));
 await ctx.route('**/leads/closed/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CINDEX)}));
 await ctx.route('**/leads/closed/closed.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CCSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9510/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0'); },[mk('1','遠帆國際開發有限公司','70000002'), mk('2','還在營業有限公司','70000009')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 // 名單上的卡片：遠帆標已停業，另一家沒有
 const top=(await pg.locator('#cards .card:has-text("遠帆") .card-top').textContent()).replace(/\s+/g,' ');
 chk(/已停業・稅籍停業 2026\/05\/23/.test(top), `名單卡片標已停業：${top}`);
 chk(!/已停業/.test(await pg.locator('#cards .card:has-text("還在營業")').textContent()), '沒停業的不標');
 // 出進口分頁：遠帆藏起來，晨光照列；藏起來的按鈕寫「已停業 1 家」；打開看得到原因、沒有放回來
 await pg.evaluate(()=>window.switchTab('trade')); await pg.waitForSelector('#trade-cards .card'); await pg.waitForTimeout(300);
 await pg.click('#trade-reset'); await pg.fill('#trade-capMin',''); await pg.fill('#trade-capMax',''); await pg.locator('#trade-fPhone .chip:has-text("有電話")').click(); await pg.locator('#trade-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(300);
 let names=await pg.$$eval('#trade-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===1 && /晨光/.test(names[0]), `出進口分頁只剩晨光：${names.join('|')}`);
 const hb=await pg.textContent('#trade-hidden');
 chk(/顯示藏起來的 1 家（已停業 1 家）/.test(hb), `藏起來的按鈕：${hb}`);
 chk(!(await pg.evaluate(async()=>(await window.Trade.dailyCandidates()).some(r=>r.name==='遠帆國際開發有限公司'))), '每日挑選也不挑已停業的');
 await pg.click('#trade-hidden'); await pg.waitForTimeout(300);
 const card=pg.locator('#trade-cards .card:has-text("遠帆")');
 chk((await card.count())===1 && /已停業（稅籍停業 2026\/05\/23），自動藏起來/.test(await card.textContent()) && (await card.locator('button:has-text("放回來")').count())===0, `打開藏起來的：寫原因、沒有放回來：${(await card.textContent()).replace(/\s+/g,' ').slice(0,160)}`);
 await pg.click('#trade-hidden'); await pg.waitForTimeout(300);
 // 剛開始請人分頁：健保註銷的宇駿也藏
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForSelector('#nhi-cards .card'); await pg.waitForTimeout(300);
 await pg.click('#nhi-reset'); await pg.fill('#nhi-capMin',''); await pg.fill('#nhi-capMax',''); await pg.locator('#nhi-fOrg .chip:has-text("公司")').click(); await pg.locator('#nhi-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(300);
 names=await pg.$$eval('#nhi-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===1 && /晨光/.test(names[0]), `剛開始請人只剩晨光：${names.join('|')}`);
 chk(/已停業 1 家/.test(await pg.textContent('#nhi-hidden')), `剛開始請人的藏起來按鈕：${await pg.textContent('#nhi-hidden')}`);
 // 資料狀態認得這個來源
 chk((await pg.evaluate(()=>window.Closed.count()))===2 && (await pg.evaluate(()=>window.Closed.info().total))===2, '停業表載好了');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
