// 新名單合併頁（使用者：「有沒有辦法幫我全部匯總成一個分頁，同時又有各自名單的功能及更新頻率」→「除了上市櫃、商行維持獨立名單外，其餘都能合併」）：
// 六份名單依統編合成一家、寫出每份名單看到的那一句、訊號多的在前、名單裡已經有的照樣列並標「已在名單」、加入名單、篩選、底下寫各份的更新頻率
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9593);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const csv=(head,rows)=>'﻿'+[head,...rows.map(r=>r.map(q).join(','))].join('\n')+'\n';
const NHI=csv('統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額',[
 ['54867253','名祿實業有限公司','新北市新莊區中正路100號','2511','金屬結構製造業','108/09/03','202609','02-2960-0000','12000000'],
 ['24908600','宇駿貿易有限公司','新北市板橋區文化路1號','4552','服裝批發業','104/08/14','202609','','3000000'],
 ['11111111','老客戶股份有限公司','新北市新莊區中正路9號','2511','金屬結構製造業','100/01/01','202609','02-1111-1111','50000000']]);
const FAC=csv('統編,名稱,地址,行業代號,行業,成立日期,登記年月,電話,資本額,主要產品,組織型態,工廠數',[
 ['54867253','名祿實業有限公司','新北市新莊區中正路100號','25','金屬製品製造業','108/09/03','202609','02-2960-0000','12000000','金屬模具','有限公司','1'],
 ['33333333','丙三工業有限公司','新北市樹林區中山路3號','22','塑膠製品製造業','110/01/01','202605','','8000000','塑膠日用品','有限公司','1']]);
const IDX=(f,extra)=>JSON.stringify({generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:12,total:3,withPhone:1,latestYm:'2026/09',files:[{path:f,rows:3}],...extra});
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2011',capital:'50,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:'2099-12-31',lastDate:'2026-09-01',addedDate:'2026-09-01'});
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
 await ctx.route('**/leads/factory/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:IDX('factory.csv',{latestYm:'2026/09'})}));
 await ctx.route('**/leads/factory/factory.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:FAC}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9593/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },[mk('1','老客戶股份有限公司','11111111'), mk('2','丙三工業 有限公司','')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 await pg.click('.tab[data-tab="sources"]'); await pg.waitForSelector('#paneMix .mix-card',{timeout:20000}); await pg.waitForTimeout(800);
 const names=async()=>pg.$$eval('#mix-cards .mix-card .card-name',a=>a.map(x=>x.textContent.trim()));
 const n=await names();
 chk(n.length===4 && n.includes('老客戶股份有限公司'), `合併後四家，名單裡已經有的也列：${n.join('|')}`);
 // 名單裡已經有的跟各頁一樣：標「已在名單　📝 記錄」、沒有加入鈕（使用者：「合併頁跟其他分頁不同，其他分頁我加入名單到重點名單後，在該分頁上還是留在上面」）
 const old=pg.locator('#mix-cards .mix-card:has-text("老客戶")');
 chk((await old.locator('.badge-mine').count())===1 && /已在名單・9\/1 加入・上次 9\/1/.test(await old.locator('.badge-mine').textContent()) && (await old.locator('.mix-add-one').count())===0, `已在名單的標出來、沒有加入鈕：${await old.locator('.badge-mine').textContent().catch(()=>'')}`);
 // 名單上那筆名稱多一個空白、沒統編：一樣認得出是同一家（跟匯入比對重複同一套）
 chk((await pg.locator('#mix-cards .mix-card:has-text("丙三") .badge-mine').count())===1, '名稱寫法差一點的也認得是已在名單');
 chk(n[0]==='名祿實業有限公司', `兩個訊號（剛開始請人＋剛登記工廠）排第一：${n.join('|')}`);
 const c=pg.locator('#mix-cards .mix-card:has-text("名祿")');
 const ct=(await c.textContent()).replace(/\s+/g,' ');
 chk(/剛開始請人/.test(ct) && /剛登記工廠/.test(ct), `卡片標出兩份名單的訊號：${ct.slice(0,120)}`);
 const lines=await c.locator('.mix-srcs li').allTextContents();
 chk(lines.length===2 && lines.some(l=>/^剛開始請人：2026\/09 成立投保單位/.test(l)) && lines.some(l=>/^新設工廠：2026\/09 登記工廠，金屬模具/.test(l)), `每份名單看到的那一句：${lines.join(' ／ ')}`);
 chk(/📞 02-2960-0000/.test(ct) && /資本額 1,200 萬/.test(ct) && /成立 7 年/.test(ct), '電話、資本額、成立年');
 chk(/1 家出現在兩份以上的名單、2 家已在名單/.test(await pg.textContent('#mix-count')), `寫出幾家出現在兩份以上、幾家已在名單：${await pg.textContent('#mix-count')}`);
 // 篩選：來源只看新設工廠
 await pg.locator('#mix-fSrc .chip:has-text("新設工廠")').click(); await pg.waitForTimeout(300);
 chk(JSON.stringify((await names()).sort())===JSON.stringify(['丙三工業有限公司','名祿實業有限公司']), `來源篩新設工廠：${(await names()).join('|')}`);
 await pg.locator('#mix-fSrc .chip:has-text("新設工廠")').click(); await pg.locator('#mix-fPhone .chip:has-text("有電話")').click(); await pg.waitForTimeout(300);
 chk(JSON.stringify((await names()).sort())===JSON.stringify(['名祿實業有限公司','老客戶股份有限公司']), `電話篩有電話：${(await names()).join('|')}`);
 await pg.locator('#mix-fPhone .chip:has-text("有電話")').click(); await pg.locator('#mix-fPhone .chip:has-text("沒電話")').click(); await pg.waitForTimeout(300);
 chk(JSON.stringify((await names()).sort())===JSON.stringify(['丙三工業有限公司','宇駿貿易有限公司']), `電話篩沒電話：${(await names()).join('|')}`);
 await pg.locator('#mix-fPhone .chip:has-text("沒電話")').click(); await pg.locator('#mix-fPhone .chip:has-text("有手機")').click(); await pg.waitForTimeout(300);
 chk((await names()).length===0, `電話篩有手機（這兩家都是市話）：${(await names()).join('|')}`);
 await pg.locator('#mix-fPhone .chip:has-text("有手機")').click(); await pg.waitForTimeout(200);
 // 記住上次的篩選（版本 315）：篩了來源，重新整理後還在；清除篩選就清掉
 await pg.locator('#mix-fSrc .chip:has-text("新設工廠")').click(); await pg.waitForTimeout(300);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600); await pg.evaluate(()=>window.switchTab('mix')); await pg.waitForSelector('#mix-cards .card'); await pg.waitForTimeout(500);
 chk((await pg.getAttribute('#mix-fSrc .chip:has-text("新設工廠")','aria-pressed'))==='true' && JSON.stringify((await names()).sort())===JSON.stringify(['丙三工業有限公司','名祿實業有限公司']), `重新整理後篩選還在：${(await names()).join('|')}`);
 await pg.click('#mix-reset'); await pg.waitForTimeout(300);
 chk((await pg.getAttribute('#mix-fSrc .chip:has-text("新設工廠")','aria-pressed'))==='false' && (await names()).length===4, '清除篩選就清掉');
 // 來源名稱只是文字（版本 327：那幾頁的按鈕收掉了，點了不跳頁）
 await c.locator('.mix-src:has-text("新設工廠")').click(); await pg.waitForTimeout(300);
 chk(await pg.locator('#paneMix').isVisible() && (await c.locator('button.mix-src').count())===0, '來源名稱是文字，點了留在合併頁');
 // 加入名單：之後留在原地、改標「已在名單」
 await pg.locator('#mix-cards .mix-card:has-text("宇駿") .mix-add-one').click(); await pg.waitForTimeout(1500);
 const added=await pg.evaluate(()=>window.customerViews().some(v=>v.company==='宇駿貿易有限公司'));
 chk(added, '加入客戶名單');
 if (await pg.locator('#drawer').isVisible()) { await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200); }
 await pg.click('#subtabs .subtab[data-tab="mix"]'); await pg.waitForTimeout(800);
 const yj=pg.locator('#mix-cards .mix-card:has-text("宇駿")');
 chk((await yj.count())===1 && (await yj.locator('.badge-mine').count())===1 && (await yj.locator('.mix-add-one').count())===0, `加完留在原地、標已在名單：${(await names()).join('|')}`);
 // 跟我的名單比對：只看名單裡沒有的
 await pg.locator('#mix-fMine .chip:has-text("名單裡沒有")').click(); await pg.waitForTimeout(300);
 chk(JSON.stringify(await names())==='["名祿實業有限公司"]', `篩名單裡沒有：${(await names()).join('|')}`);
 await pg.locator('#mix-fMine .chip:has-text("名單裡沒有")').click(); await pg.waitForTimeout(200);
 // 點「已在名單　📝 記錄」打開名單上那一筆（使用者：「我沒辦法在這裡打開加入重點名單客戶的詳細頁」）
 await pg.locator('#mix-cards .mix-card:has-text("丙三") .badge-mine').click(); await pg.waitForTimeout(1500);
 const h2=await pg.locator('#drawerBody h2').first().textContent().catch(()=>'');
 chk(await pg.locator('#drawer').isVisible() && /丙三工業/.test(h2) && (await pg.evaluate(()=>window.customerViews().filter(v=>/丙三/.test(v.company)).length))===1, `點已在名單打開名單上那一筆、沒有重複加（${h2}）`);
 if (await pg.locator('#drawer').isVisible()) { await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200); }
 // 電話後面有複製鈕
 await pg.click('#subtabs .subtab[data-tab="mix"]'); await pg.waitForTimeout(800);
 const cc=pg.locator('#mix-cards .mix-card:has-text("名祿")');
 chk((await cc.locator('.phone-search .copy-dot').count())===1, '合併頁電話後面有複製鈕');
 // 底下各份名單的更新頻率
 await pg.waitForTimeout(500);
 const st=(await pg.textContent('#mix-status')).replace(/\s+/g,' ');
 chk(/各份名單的更新/.test(st) && /剛開始請人 每月 10 日（2026\/10\/02 更新/.test(st) && /新設工廠 每月 20 日/.test(st) && /登記清冊 每月 8 日/.test(st), `更新頻率：${st.slice(0,200)}`);
 chk(/^\d+$/.test((await pg.textContent('#countMix')).trim()), '「全部（合併）」帶家數');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
