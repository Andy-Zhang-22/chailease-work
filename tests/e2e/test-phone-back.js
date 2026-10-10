// 找不到電話先收起來（使用者：「我刪除的電話中目前有些是在公開資訊上找不到電話的，但可能未來會找的到」）：
// 沒電話的刪除時可選「找不到電話」→ 之後公開資料（出進口廠商電話表等）查到電話，名單上面提醒；
// 「已排除的公司」查到電話的排前面，可放回名單或「還是不要」；沒查到的有收回與 Google／地圖／104／1111
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9613);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 // 一開始公開資料查不到電話；後來（下個月）出進口廠商電話表有了甲、丙
 let later=false;
 await ctx.route('**/leads/**',r=>{
   const u=r.request().url();
   if(/trade\/phones\.csv/.test(u)) return r.fulfill({status:200,contentType:'text/csv',body:'統編,電話,傳真,核發日期\n'+(later?'11111111,02-0000-1234,,2026/10/01\n22222222,02-0000-9999,,2026/10/01\n33333333,02-0000-5678,,2026/10/01\n':'')});
   if(/trade\/index\.json/.test(u)) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({generatedAt:later?'b':'a'})});
   return r.fulfill({status:404,body:''});
 });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9613/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 const add=async(kv)=>{ await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
   await pg.fill('#kvPaste',kv); await pg.waitForTimeout(150); await pg.click('#editorBody button:has-text("新增")'); await pg.waitForTimeout(700);
   await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); })); await pg.waitForTimeout(200); };
 await add('公司名稱：甲範例精密有限公司\n統一編號：11111111\n地址：新北市新莊區中正路1號');
 await add('公司名稱：乙範例實業有限公司\n統一編號：22222222\n地址：新北市五股區五工路2號');
 await add('公司名稱：丙範例工業有限公司\n統一編號：33333333\n地址：新北市泰山區明志路3號');
 await add('公司名稱：丁範例有限公司\n統一編號：44444444\n地址：新北市新莊區思源路4號');
 const del=async(name,pick)=>{ await pg.locator(`#cards .card:has-text("${name}") .card-name`).click(); await pg.waitForSelector('#drawerBody h2');
   await pg.click('#drawerBody button:has-text("刪除這筆")'); await pg.waitForSelector('.ask-overlay');
   const opts=await pg.$$eval('.ask-overlay .ask-list .btn',bs=>bs.map(b=>b.textContent));
   await pg.click(`.ask-overlay .ask-list .btn:has-text("${pick}")`); await pg.waitForTimeout(900); return opts; };
 const opts=await del('甲範例','找不到電話');
 chk(opts.length===4 && /找不到電話，先收起來/.test(opts[0]) && /不是目標/.test(opts[1]) && /已是客戶/.test(opts[2]) && /其他原因/.test(opts[3]), `沒電話的刪除有四種（版本 326）：${opts.join('｜')}`);
 await del('乙範例','不是目標');
 await del('丙範例','找不到電話');
 await del('丁範例','其他原因');
 const tombs=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies);
 chk(tombs['tax:11111111'].noPhone===true && !tombs['tax:22222222'].noPhone, '墓碑記著哪家是「找不到電話」');
 chk(tombs['tax:11111111'].reason==='nophone' && tombs['tax:22222222'].reason==='target' && tombs['tax:44444444'].reason==='other', `墓碑記著刪的原因：${['11111111','22222222','44444444'].map(t=>tombs['tax:'+t].reason).join('、')}`);
 // 「不是目標」太多的來源排後面：出進口廠商最近 90 天 3 家都當不是目標刪掉、名單上沒有 → 排後面；動產擔保沒有
 await pg.evaluate(async()=>{ for(const [k,n] of [['tax:66666661','己一'],['tax:66666662','己二'],['tax:66666663','己三']]) await window.Store.addTombstone('companies',k,{company:`${n}範例有限公司`,taxId:k.slice(4),reason:'target',src:'出進口廠商'}); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const demoted=await pg.evaluate(()=>window.demotedOrigins());
 chk(demoted.length===1 && demoted[0]==='出進口廠商', `「不是目標」太多的來源：${demoted.join('、')}`);
 chk(await pg.isHidden('#phoneBackBar'), '還查不到電話時沒有提醒');

 // 下個月：公開資料有電話了 → 重新打開網站
 later=true;
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200); await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); }));
 const hits=await pg.evaluate(async()=>(await window.phoneBackDaily({force:true})).map(h=>`${h.company}|${h.tel}|${h.from}`));
 chk(hits.length===2 && hits.includes('甲範例精密有限公司|02-0000-1234|出進口廠商登記'), `查到「找不到電話」那兩家的電話：${hits.join('、')}`);
 await pg.waitForTimeout(300);
 const barTxt=await pg.textContent('#phoneBackBar');
 chk(await pg.isVisible('#phoneBackBar') && /之前找不到電話的 2 家，現在查到電話了/.test(barTxt), `名單上面提醒：${barTxt}`);
 chk((await pg.evaluate(()=>window.customerViews().length))===0, '沒有自動放回名單');

 await pg.click('#phoneBackBar button'); await pg.waitForSelector('#editorBody .excluded-row'); await pg.waitForTimeout(800);
 const rows=await pg.$$eval('#editorBody .excluded-row',rs=>rs.map(r=>r.textContent.replace(/\s+/g,' ')));
 chk(rows.length===7 && rows.slice(0,3).every(r=>/有電話了/.test(r)) && !/有電話了/.test(rows.slice(3).join(' ')), `選「不是目標」刪的乙，查到電話一樣標出來：${rows.map(r=>r.slice(0,20)).join('｜')}`);
 chk(rows.some(r=>/乙範例.*不是目標/.test(r)) && rows.some(r=>/丁範例.*其他原因/.test(r)), '已排除的公司標出刪的原因');
 chk(/之前找不到電話的 2 家/.test(await pg.textContent('#phoneBackBar')), '但名單上面的提醒只算「找不到電話」的那兩家');
 chk(/查到電話的 3 家全部放回名單/.test(await pg.textContent('#editorBody .excluded-all')), '有「全部放回」');
 // 搜尋：公司名、統編、電話；全部放回只算搜尋出來的
 const shown=async()=>pg.$$eval('#editorBody .excluded-row strong',xs=>xs.map(x=>x.textContent));
 await pg.fill('#editorBody .excluded-q','乙範例'); await pg.waitForTimeout(300);
 chk(JSON.stringify(await shown())==='["乙範例實業有限公司"]' && /搜尋到、查到電話的 1 家全部放回名單/.test(await pg.textContent('#editorBody .excluded-all')), '搜公司名只剩那一家，全部放回只算它');
 await pg.fill('#editorBody .excluded-q','44444444'); await pg.waitForTimeout(300);
 chk(JSON.stringify(await shown())==='["丁範例有限公司"]' && await pg.isHidden('#editorBody .excluded-all'), '搜統編；沒電話的不出現全部放回');
 await pg.fill('#editorBody .excluded-q','0000-5678'); await pg.waitForTimeout(300);
 chk(JSON.stringify(await shown())==='["丙範例工業有限公司"]', '搜電話（有沒有打「-」都行）');
 await pg.fill('#editorBody .excluded-q','找不到的字'); await pg.waitForTimeout(300);
 chk(/沒有符合的公司/.test(await pg.textContent('#editorBody .excluded-list')), '搜不到會講');
 await pg.fill('#editorBody .excluded-q',''); await pg.waitForTimeout(300);
 chk((await shown()).length===7, '清掉搜尋就全部回來（含種進去的 3 家）');
 const ding=pg.locator('#editorBody .excluded-row:has-text("丁範例")');
 chk((await ding.locator('button:has-text("收回")').count())===1 && (await ding.locator('a:has-text("104")').count())===1 && (await ding.locator('button:has-text("放回名單")').count())===0, '沒查到電話的：收回＋自己再找');

 await pg.click('#editorBody .excluded-row:has-text("丙範例") button:has-text("還是不要")'); await pg.waitForTimeout(500);
 const t2=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies['tax:33333333']);
 chk(t2 && t2.noPhone===false && t2.keep===true && !t2.lifted, '還是不要：維持排除、不再提醒');
 chk(/查到電話的 2 家全部放回名單/.test(await pg.textContent('#editorBody .excluded-all')), '還是不要的不算進全部放回');

 await pg.click('#editorBody .excluded-row:has-text("甲範例") button:has-text("放回名單")'); await pg.waitForTimeout(1200);
 let back=await pg.evaluate(()=>window.customerViews().map(v=>`${v.company}|${v.taxId}|${v.phones.map(p=>p.display||p.raw||p).join(',')}`));
 chk(back.length===1 && /^甲範例精密有限公司\|11111111\|.*0000-1234/.test(back[0]), `放回名單、帶著電話：${back.join('、')}`);
 await pg.click('#editorBody .excluded-all'); await pg.waitForSelector('.ask-overlay');
 chk(/乙範例實業有限公司（02-0000-9999）/.test(await pg.textContent('.ask-overlay')) && !/丙範例/.test(await pg.textContent('.ask-overlay')), '全部放回先列名字確認');
 await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(1500);
 back=await pg.evaluate(()=>window.customerViews().map(v=>v.company).sort());
 chk(JSON.stringify(back)==='["乙範例實業有限公司","甲範例精密有限公司"]', `整批放回：${back.join('、')}`);
 chk(await pg.isHidden('#editorBody .excluded-all'), '放完「全部放回」就收起來');
 const t1=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies['tax:11111111']);
 chk(t1 && t1.lifted===true, '放回的不再排除');
 await pg.click('#editor .drawer-close'); await pg.waitForTimeout(300);
 chk(await pg.isHidden('#phoneBackBar'), '處理完提醒就不見');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
