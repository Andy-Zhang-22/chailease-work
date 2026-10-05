// 分頁之間互通（使用者：「分頁各自的資訊都能互通」）：卡片上「🔗 也在：…」寫這家在其他名單看到的、點了跳過去；
// 「這家不用了」在任何一頁藏，其他頁與合併頁都藏；放回來也一起
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9595);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const csv=(head,rows)=>'﻿'+[head,...rows.map(r=>r.map(q).join(','))].join('\n')+'\n';
const NHI=csv('統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額',[
 ['54867253','名祿實業有限公司','新北市新莊區中正路100號','2511','金屬結構製造業','108/09/03','202609','02-2960-0000','12000000'],
 ['24908600','宇駿貿易有限公司','新北市新莊區文化路1號','4552','服裝批發業','104/08/14','202609','','30000000']]);
const FAC=csv('統編,名稱,地址,行業代號,行業,成立日期,登記年月,電話,資本額,主要產品,組織型態,工廠數',[
 ['54867253','名祿實業有限公司','新北市新莊區中正路100號','25','金屬製品製造業','108/09/03','202609','02-2960-0000','12000000','金屬模具','有限公司','1']]);
const BIZ=csv('統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人',[
 ['24908600','宇駿貿易有限公司','獨資','3000000','2015/08/14','新北市新莊區文化路1號','4552','服裝批發','','','Y','王宇'],
 ['87493071','一塊工作室','合夥','1200000','2021/02/01','新北市新莊區中港路531巷136號','434015','室內裝修工程','','','Y','張大同']]);
const BIDX=JSON.stringify({generatedAt:'2026-10-01T20:00:00.000Z',fileDate:'01-OCT-26',cities:['新北市'],minCapital:500000,total:2,byOrg:{'獨資':1,'合夥':1},byDist:{'新莊區':2},withOwner:2,files:[{path:'biz.csv',rows:2}]});
const IDX=(f)=>JSON.stringify({generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:12,total:2,withPhone:1,latestYm:'2026/09',files:[{path:f,rows:2}]});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1100}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('rate-filter-default','0'); localStorage.setItem('leads-filters-open','1');}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:IDX('nhi.csv')}));
 await ctx.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:NHI}));
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:BIDX}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:BIZ}));
 await ctx.route('**/leads/factory/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:IDX('factory.csv')}));
 await ctx.route('**/leads/factory/factory.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:FAC}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9595/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForSelector('#nhi-cards .card'); await pg.waitForTimeout(1500);
 const nameCard=(pane,n)=>pg.locator(`${pane} .card:has(.card-name:has-text("${n}"))`);
 const cl=await nameCard('#nhi-cards','名祿').locator('.cross-line').textContent().catch(()=>'');
 chk(/🔗 也在：新設工廠（2026\/09 登記工廠，金屬模具）/.test(cl), `剛開始請人的卡片寫「也在新設工廠」：${cl}`);
 chk(!/新設工廠/.test(await nameCard('#nhi-cards','宇駿').locator('.cross-line').textContent().catch(()=>'')), '不在新設工廠的不會寫新設工廠');
 await nameCard('#nhi-cards','名祿').locator('.cross-src').click(); await pg.waitForTimeout(800);
 chk(await pg.locator('#paneFactory').isVisible(), '點「新設工廠」跳過去');
 const cl2=await nameCard('#factory-cards','名祿').locator('.cross-line').textContent().catch(()=>'');
 chk(/🔗 也在：剛開始請人（2026\/09 成立投保單位）/.test(cl2), `新設工廠那頁也寫回來：${cl2}`);
 // 在新設工廠藏：剛開始請人、合併頁也藏
 await nameCard('#factory-cards','名祿').locator('.factory-hide').click(); await pg.waitForTimeout(300);
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForTimeout(500);
 chk(await nameCard('#nhi-cards','名祿').count()===0, '剛開始請人那頁也藏起來了');
 await pg.evaluate(()=>window.switchTab('mix')); await pg.waitForTimeout(1500);
 const mixNames=await pg.$$eval('#mix-cards .mix-card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(!mixNames.includes('名祿實業有限公司') && mixNames.includes('宇駿貿易有限公司'), `合併頁也藏：${mixNames.join('|')}`);
 const feed=await pg.evaluate(async()=>(await window.Nhi.dailyCandidates()).map(r=>r.name));
 chk(!feed.includes('名祿實業有限公司'), '每日新名單也不挑');
 // 在剛開始請人「放回來」：新設工廠也回來
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForTimeout(300);
 await pg.click('#nhi-hidden'); await pg.waitForTimeout(300);
 await nameCard('#nhi-cards','名祿').locator('button:has-text("放回來")').click(); await pg.waitForTimeout(300);
 await pg.evaluate(()=>window.switchTab('factory')); await pg.waitForTimeout(500);
 chk(await nameCard('#factory-cards','名祿').count()===1 && await nameCard('#factory-cards','名祿').evaluate(e=>!e.classList.contains('is-hidden')), '一頁放回來，另一頁也回來');
 await pg.evaluate(()=>window.switchTab('mix')); await pg.waitForTimeout(1500);
 chk((await pg.$$eval('#mix-cards .mix-card .card-name',a=>a.map(x=>x.textContent.trim()))).includes('名祿實業有限公司'), '合併頁也回來');
 // 商行也併進新名單，跟其他份一樣互通（使用者：「把商行也合併在其他分頁裡」）
 await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForSelector('#biz-cards .card'); await pg.waitForTimeout(1500);
 if (await nameCard('#biz-cards','宇駿').count()===0) { await pg.click('#biz-reset').catch(()=>{}); await pg.waitForTimeout(400); }
 const bl=await nameCard('#biz-cards','宇駿').locator('.cross-line').textContent().catch(()=>'');
 chk(/🔗 也在：剛開始請人（2026\/09 成立投保單位）/.test(bl), `商行卡片寫「也在剛開始請人」：${bl}`);
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForTimeout(500);
 const nl=await nameCard('#nhi-cards','宇駿').locator('.cross-line').textContent().catch(()=>'');
 chk(/也在：商行／企業社（獨資，服裝批發，2015\/08 設立/.test(nl), `剛開始請人卡片寫「也在商行」：${nl}`);
 // 合併頁：商行跟剛開始請人的同一家合成一張
 await pg.evaluate(()=>window.switchTab('mix')); await pg.waitForTimeout(1500);
 const yu=await pg.locator('#mix-cards .mix-card:has(.card-name:has-text("宇駿")) .mix-srcs li').allTextContents();
 chk(yu.length===2 && yu.some(l=>/^剛開始請人：/.test(l)) && yu.some(l=>/^商行／企業社：獨資/.test(l)), `合併頁商行跟剛開始請人合成一張：${yu.join(' ／ ')}`);
 const one=await pg.$$eval('#mix-cards .mix-card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(one.includes('一塊工作室'), `只在商行的也在合併頁：${one.join('|')}`);
 // 在商行藏：剛開始請人也藏
 await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForTimeout(400);
 await nameCard('#biz-cards','宇駿').locator('.biz-hide').click(); await pg.waitForTimeout(300);
 await pg.evaluate(()=>window.switchTab('nhi')); await pg.waitForTimeout(400);
 chk(await nameCard('#nhi-cards','宇駿').evaluate(e=>e.classList.contains('is-hidden')).catch(()=>true), '在商行藏，剛開始請人也藏');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
