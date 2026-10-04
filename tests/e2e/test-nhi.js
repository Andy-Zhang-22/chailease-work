// 剛開始請人分頁（健保新成立投保單位）：讀資料、預設篩選、卡片、加入客戶名單帶電話與行業、開場白
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9503);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額';
const ROWS=[
 ['54867253','名祿實業有限公司','新北市新莊區中正路100號','4582','運動用品、器材批發業','108/09/03','202609','02-2960-0000','12000000'],
 ['24908600','宇駿貿易有限公司','新北市板橋區文化路1號','4552','服裝及其配件批發業','104/08/14','202608','','3000000'],
 ['02198779','蓮莊香舖','新北市新莊區新樹路497巷11號','4852','其他全新商品零售業','105/01/12','202605','',''],
 ['11111111','老客戶股份有限公司','新北市新莊區中正路9號','2511','金屬結構製造業','100/01/01','202609','02-1111-1111','50000000'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:6,total:4,withPhone:2,latestYm:'2026/09',byYm:{'202609':2,'202608':1,'202605':1},files:[{path:'nhi.csv',rows:4}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2011',capital:'50,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1');}catch(e){}}); await ctx.addInitScript(()=>{try{localStorage.setItem('rate-filter-default','0');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 // Playwright 後登記的路由先比對：其他清冊一律 404 的要先登記，健保的兩個檔才接得到
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9503/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0'); },[mk('1','老客戶股份有限公司','11111111')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 chk((await pg.$$eval('#subtabs .subtab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()))).some(t=>t.startsWith('剛開始請人')), '找名單底下有「剛開始請人」');
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForSelector('#nhi-cards .card'); await pg.waitForTimeout(300);
 const sub=(await pg.textContent('#nhi-sub')).replace(/\s+/g,' ');
 chk(/新北市最近 6 個月新成立的投保單位 4 家（對到電話 2）/.test(sub) && /資料到 2026\/09/.test(sub), `標題：${sub}`);
 // 預設篩選：資本額 500～6,000 萬、公司、我的分公司 → 名祿（新莊、1,200 萬）；老客戶 5,000 萬也在新莊但已在名單（還是列，標已在名單）
 let names=await pg.$$eval('#nhi-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===2 && /名祿/.test(names[1]) && /老客戶/.test(names[0]), `預設篩選後照資本額排：${names.join(' | ')}`);
 chk((await pg.locator('#nhi-cards .card:has-text("老客戶") .badge-mine').count())===1, '已在名單的標出來');
 const card=pg.locator('#nhi-cards .card:has-text("名祿")');
 chk((await card.locator('.card-name a[href="https://findbiz.nat.gov.tw/fts/company/54867253"]').count())===1, '公司名直達商工登記頁（商號走用統編查的規則在 normalize.test.js）');
 const ct=(await card.textContent()).replace(/\s+/g,' ');
 chk(/剛開始請人/.test(ct) && /成立 7 年才投保/.test(ct) && /📞 02-2960-0000/.test(ct) && /2026\/09 成立投保單位（1 個月前）/.test(ct) && /資本額 1,200 萬/.test(ct) && /運動用品/.test(ct), `卡片：${ct.slice(0,200)}`);
 chk((await card.locator('.copy-dot').count())===1 && (await card.locator('.phone-search a').count())===4 && (await card.locator('.phone-search input').count())===0, '有複製點；有電話的也有找電話那排，但沒有貼電話的框');
 // 清掉預設：四家都出來，沒電話的有找電話那排
 await pg.click('#nhi-reset'); await pg.waitForTimeout(200);
 await pg.fill('#nhi-capMin',''); await pg.fill('#nhi-capMax',''); await pg.waitForTimeout(200);
 await pg.locator('#nhi-fOrg .chip:has-text("公司")').click(); await pg.locator('#nhi-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(300);
 names=await pg.$$eval('#nhi-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===4, `全部 4 家：${names.join(' | ')}`);
 chk((await pg.locator('#nhi-cards .card:has-text("宇駿") .phone-search').count())===1, '沒電話的有 Google／地圖／104／1111 那排');
 chk(/成立投保單位（2 個月前）/.test(await pg.locator('#nhi-cards .card:has-text("宇駿")').textContent()), '2 個月前');
 // 加入一家：帶電話、行業、成立年、資本額；單張加入直接打開
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#nhi-cards .card')].find(x=>x.textContent.includes('名祿')); c.querySelector('.nhi-add-one').click(); });
 await pg.waitForTimeout(1200);
 const rec=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(x=>x.company==='名祿實業有限公司'); return r?{phone:r.phoneRaw,founded:r.founded,capital:r.capital,industry:r.industry,notes:r.notesRaw,source:r.source,next:r.nextDate}:null; });
 chk(rec && rec.phone==='02-2960-0000' && rec.founded==='2019' && rec.capital==='12,000' && rec.industry==='運動用品、器材批發業' && /^健保新投保 2026-09/.test(rec.notes) && /^剛開始請人-2026-10-05-1家\.csv$/.test(rec.source), `加進來的：${JSON.stringify(rec)}`);
 chk(await pg.isVisible('#drawer') && /名祿/.test(await pg.textContent('#drawerBody h2')), '單張加入直接打開那一筆');
 const op=(await pg.locator('#drawerBody .detail-opener').textContent()).replace(/\s+/g,' ');
 chk(/開始幫員工投保、在擴編/.test(op), `開場白：${op}`);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 chk((await pg.locator('#nhi-cards .card:has-text("名祿") .badge-mine').count())===1, '加完卡片標已在名單');
 // 統計的來源漏斗認得這個來源
 await pg.evaluate(()=>window.switchTab('stats')); await pg.waitForTimeout(400);
 chk(/剛開始請人/.test(await pg.textContent('#paneStats .funnel')), '來源漏斗列「剛開始請人」');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
