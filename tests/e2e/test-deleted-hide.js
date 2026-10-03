// 名單上刪掉的公司，各分頁一起藏：刪掉 → 分頁看不到、算在「藏起來的（含名單刪過的）」；放回來＝收回排除
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9504);
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const THEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const TROWS=[
 ['70000001','晨光貿易有限公司','','新北市新莊區中正路100號','王O明','02-2990-1234','','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','遠帆國際開發有限公司','','新北市新莊區文化路1號','李O華','02-2960-1111','','2026/01/15','2026/01/15','N','Y','110/03/01','30000000'],
];
const TCSV='﻿'+[THEAD,...TROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const TINDEX={generatedAt:'2026-10-01T20:00:00.000Z',cities:['新北市'],months:24,total:2,withPhone:2,recent:2,files:[{path:'trade.csv',rows:2}]};
const NHEAD='統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額';
const NROWS=[['70000001','晨光貿易有限公司','新北市新莊區中正路100號','4582','批發業','108/10/01','202609','02-2990-1234','12000000'],['24908600','宇駿貿易有限公司','新北市新莊區中正路1號','4552','批發業','104/08/14','202608','','30000000']];
const NCSV='﻿'+[NHEAD,...NROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const NINDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:6,total:2,withPhone:1,latestYm:'2026/09',files:[{path:'nhi.csv',rows:2}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2019',capital:'12,000',phoneRaw:'02-2990-1234',phones:[{digits:'0229901234',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路100號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-10-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('2026-10-05T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(TINDEX)}));
 await ctx.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:TCSV}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NINDEX)}));
 await ctx.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:NCSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9504/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0'); },[mk('1','晨光貿易有限公司','70000001')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 // 從名單刪掉晨光（卡片上的「刪除這筆」走的就是 Store.deleteRecord，會寫公司排除）
 await pg.locator('#cards .card:has-text("晨光") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.locator('#drawerBody button:has-text("刪除這筆")').click(); await pg.waitForTimeout(300); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(800);
 chk((await pg.evaluate(async()=>(await window.Store.allRecords()).length))===0, '名單上刪掉了');
 chk(await pg.evaluate(()=>window.deletedCompany('晨光貿易有限公司','70000001')) && !(await pg.evaluate(()=>window.deletedCompany('遠帆國際開發有限公司','70000002'))), '刪掉的公司有記到（統編／名稱）');
 // 出進口分頁：晨光藏起來，遠帆照列
 await pg.evaluate(()=>window.switchTab('trade')); await pg.waitForSelector('#trade-cards .card'); await pg.waitForTimeout(300);
 await pg.click('#trade-reset'); await pg.fill('#trade-capMin',''); await pg.fill('#trade-capMax',''); await pg.locator('#trade-fPhone .chip:has-text("有電話")').click(); await pg.locator('#trade-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(300);
 let names=await pg.$$eval('#trade-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===1 && /遠帆/.test(names[0]), `出進口分頁只剩遠帆：${names.join('|')}`);
 const hb=await pg.textContent('#trade-hidden');
 chk(/顯示藏起來的 1 家（含名單刪過的 1 家）/.test(hb), `藏起來的按鈕：${hb}`);
 chk(!(await pg.evaluate(async()=>(await window.Trade.dailyCandidates()).some(r=>r.name==='晨光貿易有限公司'))), '每日挑選也不挑刪過的');
 // 剛開始請人分頁一樣
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForSelector('#nhi-cards .card'); await pg.waitForTimeout(300);
 await pg.click('#nhi-reset'); await pg.fill('#nhi-capMin',''); await pg.fill('#nhi-capMax',''); await pg.locator('#nhi-fOrg .chip:has-text("公司")').click(); await pg.locator('#nhi-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(300);
 names=await pg.$$eval('#nhi-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===1 && /宇駿/.test(names[0]), `剛開始請人只剩宇駿：${names.join('|')}`);
 // 顯示藏起來的 → 晨光出現，按鈕是「放回來（名單刪過）」；按下去收回排除，兩頁都回來
 await pg.click('#nhi-hidden'); await pg.waitForTimeout(300);
 const card=pg.locator('#nhi-cards .card:has-text("晨光")');
 chk((await card.count())===1 && (await card.locator('button:has-text("放回來（名單刪過）")').count())===1, '藏起來的裡面有晨光、按鈕是放回來（名單刪過）');
 await card.locator('button:has-text("放回來（名單刪過）")').click(); await pg.waitForTimeout(500);
 chk(!(await pg.evaluate(()=>window.deletedCompany('晨光貿易有限公司','70000001'))), '放回來＝收回排除');
 await pg.click('#nhi-hidden').catch(()=>{}); await pg.waitForTimeout(300);
 names=await pg.$$eval('#nhi-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===2 && (await pg.locator('#nhi-cards .card:has-text("晨光") .nhi-add-one').count())===1, `放回來後正常列出、可以再加入：${names.join('|')}`);
 await pg.evaluate(()=>window.switchTab('trade')); await pg.waitForTimeout(300);
 names=await pg.$$eval('#trade-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===2, `出進口分頁也回來了：${names.join('|')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
