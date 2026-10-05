// 各分頁的期數合在一起（使用者：「你可以幫我把各分頁的名單各自都把期數合併嗎」「我要找某一特定公司，但我要每期去找，這樣太累」）：
// 登記清冊、商行的本月新設立／變更不再一期一期切；同一家出現在好幾期合成一張卡片，寫出每一期是什麼；搜尋一次就找得到
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9585);
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const csv=(head,rows)=>'﻿'+[head,...rows.map(r=>r.map(q).join(','))].join('\n')+'\n';
const LH='統一編號,公司名稱,公司所在地,代表人,資本額,核准設立日期,核准變更日期,案由或變更事項,營業項目,縣市,清冊,期別';
const L7=[['11111111','甲一精密有限公司','新北市新莊區中正路1號','王一','30000000','108/10/01','115/07/10','增資','CC01080 電子零組件製造業','新北市','change','11507'],
          ['22222222','乙二機械有限公司','新北市泰山區中港西路2號','李二','20000000','109/01/01','115/07/12','增資','CB01010 機械設備製造業','新北市','change','11507']];
const L8=[['11111111','甲一精密有限公司','新北市新莊區中正路9號','王一','30000000','108/10/01','115/08/20','所在地變更','CC01080 電子零組件製造業','新北市','change','11508']];
const LINDEX={latest:'11508',generatedAt:'2026-09-26T17:00:00.000Z',periods:{
  '11507':{generatedAt:'2026-08-26T17:00:00.000Z',period:'11507',files:[{city:'新北市',type:'change',path:'11507/新北市-change.csv',rows:2,capitalUp:2}]},
  '11508':{generatedAt:'2026-09-26T17:00:00.000Z',period:'11508',files:[{city:'新北市',type:'change',path:'11508/新北市-change.csv',rows:1,capitalUp:0}]}}};
const BH='統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人';
const BINDEX={generatedAt:'2026-10-01T20:00:00.000Z',fileDate:'01-OCT-26',cities:['新北市'],minCapital:500000,total:1,byOrg:{'獨資':1},byDist:{'新莊區':1},withOwner:1,files:[{path:'biz.csv',rows:1}]};
const B7=[['33333333','丙三企業社','新北市新莊區中正路3號','張三','3000000','','115/07/05','資本額變更','F401010 國際貿易業','新北市','變更','11507'],
          ['44444444','丁四商行','新北市新莊區中正路4號','陳四','2000000','','115/07/06','所在地變更','F401010 國際貿易業','新北市','變更','11507']];
const B8=[['33333333','丙三企業社','新北市新莊區中正路30號','張三','3000000','','115/08/05','所在地變更','F401010 國際貿易業','新北市','變更','11508']];
const BMI={latest:'11508',generatedAt:'2026-10-01T14:33:16.512Z',kind:'bms',periods:{
  '11507':{generatedAt:'2026-09-01T14:33:16.512Z',period:'11507',files:[{city:'新北市',type:'change',path:'11507/新北市-change.csv',rows:2}]},
  '11508':{generatedAt:'2026-10-01T14:33:16.512Z',period:'11508',files:[{city:'新北市',type:'change',path:'11508/新北市-change.csv',rows:1}]}}};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1100}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1'); localStorage.setItem('rate-filter-default','0'); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0');}catch(e){}});
 await ctx.route('**/leads/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(LINDEX)}));
 await ctx.route('**/leads/11507/*',r=>r.fulfill({status:200,contentType:'text/csv',body:csv(LH,L7)}));
 await ctx.route('**/leads/11508/*',r=>r.fulfill({status:200,contentType:'text/csv',body:csv(LH,L8)}));
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BINDEX)}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:csv(BH,[['55555555','戊五企業社','獨資','1000000','2022/01/01','新北市新莊區中正路5號','434011','室內裝潢工程','','','Y','林五']])}));
 await ctx.route('**/leads/biz/monthly/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BMI)}));
 await ctx.route('**/leads/biz/monthly/11507/*',r=>r.fulfill({status:200,contentType:'text/csv',body:csv(LH,B7)}));
 await ctx.route('**/leads/biz/monthly/11508/*',r=>r.fulfill({status:200,contentType:'text/csv',body:csv(LH,B8)}));
 await ctx.route('**/leads/trade/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/chattel/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9585/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 登記清冊
 await pg.evaluate(()=>window.switchTab('leads')); await pg.waitForSelector('#leads-cards .card'); await pg.waitForTimeout(500);
 await pg.click('#leads-founded-btn').catch(()=>{});
 const lnames=async()=>pg.$$eval('#leads-cards .card .card-name',a=>a.map(x=>x.textContent.trim()).sort().join('|'));
 chk(await pg.locator('#leads-period').count()===0, '沒有期別下拉選單了');
 chk((await lnames())==='乙二機械有限公司|甲一精密有限公司', `兩期合在一起，同一家只一張：${await lnames()}`);
 const a=pg.locator('#leads-cards .card:has-text("甲一精密")');
 const hist=await a.locator('.leads-history').textContent();
 chk(/2 期都有：115\/8 所在地變更、115\/7 增資/.test(hist), `卡片寫每一期是什麼（新到舊）：${hist}`);
 chk(/新北市新莊區中正路9號/.test(await a.textContent()), '以最新那一期的資料為主（新地址）');
 chk(/2 期合在一起/.test(await pg.textContent('#leads-count')) && /115\/7～115\/8 共 2 期合在一起/.test(await pg.textContent('#leads-sub')), `寫明期數合在一起：${await pg.textContent('#leads-sub')}`);
 await pg.locator('#leads-fReason .chip:has-text("增資")').click(); await pg.waitForTimeout(300);
 chk((await lnames())==='乙二機械有限公司|甲一精密有限公司', `篩增資也撈得到 7 月增資、8 月遷址的那家：${await lnames()}`);
 await pg.locator('#leads-fReason .chip:has-text("增資")').click(); await pg.waitForTimeout(200);
 await pg.fill('#leads-q','甲一'); await pg.waitForTimeout(400);
 chk((await lnames())==='甲一精密有限公司', `搜尋一次就找到：${await lnames()}`);
 // 商行：本月變更
 await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForSelector('#biz-cards .card'); await pg.waitForTimeout(400);
 chk(await pg.locator('#biz-period').count()===0, '商行也沒有期別下拉選單');
 await pg.locator('#biz-mode .chip:has-text("變更（各期）")').click(); await pg.waitForTimeout(800);
 const bnames=await pg.$$eval('#biz-cards .card .card-name',a=>a.map(x=>x.textContent.trim()).sort().join('|'));
 chk(bnames==='丁四商行|丙三企業社', `商行本月變更兩期合在一起，同一家只一張：${bnames}`);
 const bh=await pg.locator('#biz-cards .card:has-text("丙三") .leads-history').textContent();
 chk(/2 期都有：2026\/08 所在地變更、2026\/07 資本額變更/.test(bh), `商行卡片寫每一期：${bh}`);
 chk(/共 2 期合在一起/.test(await pg.textContent('#biz-sub')), `商行寫明期數合在一起：${await pg.textContent('#biz-sub')}`);
 chk(/變更（各期）\s*2/.test((await pg.textContent('#biz-mode')).replace(/\s+/g,' ')), `本月變更的家數是合併後的：${(await pg.textContent('#biz-mode')).replace(/\s+/g,' ')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
