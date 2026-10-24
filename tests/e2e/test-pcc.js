// 政府標案得標分頁（g0v 標案 API 的決標公告，版本 378）：讀資料、預設篩選、卡片（標案、機關、金額、決標日）、加入客戶名單帶電話與備註、來源漏斗、名單卡片標 🏆
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9598);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,組織型態,地址,電話,最近決標日,標案名稱,招標機關,決標金額,得標件數,首次決標日,案號,成立日期,資本額';
const ROWS=[
 ['54867253','名祿營造有限公司','公司登記','新北市新莊區中正路100號','02-2960-0000','2026-09-28','某國小校舍整修工程','新北市政府教育局','12500000','2','2026-08-05','1150923-1','108/09/03','12000000'],
 ['24908600','宇駿工程有限公司','公司登記','新北市板橋區文化路1號','','2026-08-20','道路養護工程','新北市政府工務局','3000000','1','2026-08-20','1150820-2','104/08/14','3000000'],
 ['02198779','蓮莊水電行','商業登記','新北市新莊區新樹路497巷11號','','2026-05-12','水電修繕','某公所','800000','1','2026-05-12','1150512-3','105/01/12',''],
 ['11111111','老客戶股份有限公司','公司登記','新北市新莊區中正路9號','02-1111-1111','2026-09-30','機房設備採購','某署','50000000','1','2026-09-30','1150930-1','100/01/01','50000000'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],days:180,total:4,withPhone:2,latestDate:'2026-09-30',files:[{path:'pcc.csv',rows:4}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2011',capital:'50,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1');}catch(e){}}); await ctx.addInitScript(()=>{try{localStorage.setItem('rate-filter-default','0');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 // Playwright 後登記的路由先比對：其他清冊一律 404 的要先登記，這一頁的兩個檔才接得到
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/pcc/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/pcc/pcc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9598/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0'); },[mk('1','老客戶股份有限公司','11111111')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 chk((await pg.$$eval('#subtabs .subtab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()))).some(t=>t.startsWith('政府標案'))===false, '找名單底下沒有「政府標案得標」按鈕（跟其他來源一樣收進合併頁）');
 await pg.evaluate(()=>window.switchTab('pcc')); await pg.waitForSelector('#pcc-cards .card'); await pg.waitForTimeout(300);
 const sub=(await pg.textContent('#pcc-sub')).replace(/\s+/g,' ');
 chk(/新北市最近 180 天得標的廠商 4 家（有電話 2）/.test(sub) && /資料到 2026-09-30/.test(sub), `標題：${sub}`);
 // 預設篩選：資本額 300～6,000 萬、公司、我的分公司 → 名祿（新莊、1,200 萬）；老客戶 5,000 萬也在新莊但已在名單（還是列，標已在名單）
 let names=await pg.$$eval('#pcc-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===2 && /名祿/.test(names[1]) && /老客戶/.test(names[0]), `預設篩選後照資本額排：${names.join(' | ')}`);
 chk((await pg.locator('#pcc-cards .card:has-text("老客戶") .badge-mine').count())===1, '已在名單的標出來');
 const card=pg.locator('#pcc-cards .card:has-text("名祿")');
 chk((await card.locator('.card-name a[href="https://company.g0v.ronny.tw/id/54867253"]').count())===1, '公司名直達商工登記頁（商號走用統編查的規則在 normalize.test.js）');
 const ct=(await card.textContent()).replace(/\s+/g,' ');
 chk(/剛得標/.test(ct) && /得標 2 件/.test(ct) && /📞 02-2960-0000/.test(ct) && /🏆 2026\/09\/28 決標（1 個月前）/.test(ct) && /📜 某國小校舍整修工程/.test(ct) && /🏛 新北市政府教育局/.test(ct) && /💵 決標 1,250 萬/.test(ct) && /資本額 1,200 萬/.test(ct), `卡片：${ct.slice(0,260)}`);
 chk((await card.locator('.copy-dot').count())===2 && (await card.locator('.card-meta .copy-dot').count())===1 && (await card.locator('.phone-search a').count())===4 && (await card.locator('.phone-search input').count())===0, '公司名、電話後面各有複製點；有電話的也有找電話那排，但沒有貼電話的框');
 // 清掉預設：四家都出來，沒電話的有找電話那排
 await pg.click('#pcc-reset'); await pg.waitForTimeout(200);
 await pg.fill('#pcc-capMin',''); await pg.fill('#pcc-capMax',''); await pg.waitForTimeout(200);
 await pg.locator('#pcc-fOrg .chip:has-text("公司登記")').click(); await pg.locator('#pcc-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(300);
 names=await pg.$$eval('#pcc-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===4, `全部 4 家：${names.join(' | ')}`);
 chk((await pg.locator('#pcc-cards .card:has-text("宇駿") .phone-search').count())===1, '沒電話的有 Google／地圖／104／1111 那排');
 chk(/決標（2 個月前）/.test(await pg.locator('#pcc-cards .card:has-text("宇駿")').textContent()), '2 個月前');
 chk(/蓮莊水電行/.test(names.join('|')), '商業登記的水電行也在（組織型態看公告）');
 // 加入一家：帶電話、行業、成立年、資本額；單張加入直接打開
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#pcc-cards .card')].find(x=>x.textContent.includes('名祿')); c.querySelector('.pcc-add-one').click(); });
 await pg.waitForTimeout(1200);
 const rec=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(x=>x.company==='名祿營造有限公司'); return r?{phone:r.phoneRaw,founded:r.founded,capital:r.capital,industry:r.industry,notes:r.notesRaw,source:r.source,next:r.nextDate}:null; });
 chk(rec && rec.phone==='02-2960-0000' && rec.founded==='2019' && rec.capital==='12,000' && rec.industry==='' && /^政府標案得標 2026-09-28，某國小校舍整修工程，招標機關 新北市政府教育局，決標 1,250 萬，共 2 件/.test(rec.notes) && /^政府標案得標-2026-10-05-1家\.csv$/.test(rec.source), `加進來的（產業別留空不猜）：${JSON.stringify(rec)}`);
 chk(await pg.isVisible('#drawer') && /名祿/.test(await pg.textContent('#drawerBody h2')), '單張加入直接打開那一筆');
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 chk((await pg.locator('#pcc-cards .card:has-text("名祿") .badge-mine').count())===1, '加完卡片標已在名單');
 // 來源漏斗（摘要檔的數字）認得這個來源
 chk(Object.keys(await pg.evaluate(()=>window.funnelStats().byOrigin)).includes('政府標案得標'), '來源漏斗列「政府標案得標」');
 chk((await pg.evaluate(()=>window.funnelStats().byOrigin))['政府標案得標'].n===1, '剛加的那家算在這個來源');
 // 名單上已經有的客戶剛得標：卡片標 🏆（不用打開那一頁）
 await pg.evaluate(()=>window.switchTab('all')); await pg.waitForTimeout(400);
 const fb=await pg.locator('#cards .card:has-text("老客戶") .badge:has-text("剛得標")').textContent().catch(()=>'');
 chk(/🏆 剛得標 2026\/09/.test(fb), `名單卡片標剛得標：${fb}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
