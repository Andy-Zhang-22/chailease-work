// 動產擔保分頁：卡片下面列這家的每一件契約起訖與金額（使用者：「動產擔保的分頁裡，能幫我列出各家公司的每筆契約起訖及金額嗎」）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9561);
const TODAY='2026-10-05';
const HEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const C=(no,lender,start,end,amt)=>['動產抵押登記',no,'40000001','多件精密有限公司','20000001',lender,start,end,amt,'新北市新莊區中正路1號','1','','','108/01/01'];
const ROWS=[
 C('A1','新鑫股份有限公司','2026/02/01','2036/02/01','6880000'),
 C('A2','新鑫股份有限公司','2025/01/10','2035/01/10','31560000'),
 C('A3','合迪股份有限公司','2023/06/01','2033/06/01','25450000'),
 C('A4','合迪股份有限公司','2022/04/01','2026/12/01','31800000'),
 C('A5','新鑫股份有限公司','2021/07/01','2031/07/01','4850000'),
 C('A6','合迪股份有限公司','2019/06/01','2029/06/01','5800000'),
 ['動產抵押登記','N1','40000003','新買設備有限公司','20000003','和潤企業股份有限公司','2026/08/15','2031/08/15','12000000','新北市新莊區中正路3號','2','','','105/01/01'],
 ['動產抵押登記','B1','40000002','單件有限公司','20000002','和潤企業股份有限公司','2024/01/01','2027/01/01','3000000','新北市新莊區中正路2號','1','','','110/01/01'],
];
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-01T02:00:00.000Z',dataThrough:'2026/09/01',total:ROWS.length,kept:ROWS.length,files:[{path:'ntpc.csv',rows:ROWS.length}]};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1100}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('rate-filter-default','0'); localStorage.setItem('leads-filters-open','1');}catch(e){}});
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9561/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>window.switchTab('chattel')); await pg.waitForSelector('#chattel-cards .card');
 await pg.locator('#chattel-fDue .chip:has-text("全部")').click(); await pg.waitForTimeout(400);
 const card=pg.locator('#chattel-cards .card:has-text("多件精密")').filter({has: pg.locator('.chattel-line.is-self:has-text("2026/02～2036/02")')});
 chk(await card.count()===1, '找得到 2026/02 那件的卡片');
 const rows=async()=>card.locator('.chattel-cases tr').evaluateAll((trs)=>trs.filter((t)=>!t.hidden).map((t)=>[...t.cells].map((c)=>c.textContent).join('|')));
 chk(/這家共 6 件動保，擔保合計 10,634 萬/.test(await card.locator('.chattel-cases-head').textContent()), `標題：件數與合計：${await card.locator('.chattel-cases-head').textContent()}`);
 const r1=await rows();
 chk(JSON.stringify(r1)===JSON.stringify(['新鑫|2026/02～2036/02|688 萬','新鑫|2025/01～2035/01|3,156 萬']) && /其他 4 件/.test(await card.locator('.chattel-cases .chattel-more').textContent()), `新的在上、最多先列 2 件，其他收起：${JSON.stringify(r1)}`);
 chk(await card.locator('tr.is-self').count()===1 && /2026\/02/.test(await card.locator('tr.is-self').textContent()), '這張卡片那件粗體');
 
 await card.locator('.chattel-cases .chattel-more').click(); await pg.waitForTimeout(300);
 chk((await rows()).length===6 && /收起/.test(await card.locator('.chattel-cases .chattel-more').textContent()), `「其他 4 件」展開全部 6 件：${(await rows()).length}`);
 chk(await card.locator('tr.is-soon:has-text("2026/12")').count()===1, '3 個月內到期的標橘色');
 const single=pg.locator('#chattel-cards .card:has-text("單件有限公司")');
 chk(await single.locator('.chattel-cases').count()===0, '只有一件的不另外列');
 // 最近買設備（使用者：「幫我整理出最近有買設備的，以最近有買設備進來的公司優先提供名單給我，該分頁排序以契約最新到最舊」）
 const order=await pg.$$eval('#chattel-cards .card .card-name',(a)=>a.map((x)=>x.textContent.trim()));
 chk(order[0]==='新買設備有限公司' && (await pg.$eval('#chattel-sort',(x)=>x.value))==='start', `預設照契約起最新到最舊，最近買的在最上面：${order.slice(0,3).join('、')}`);
 chk(/🆕 最近買設備 2026\/08/.test(await pg.locator('#chattel-cards .card:has-text("新買設備")').locator('.card-top').textContent()), '最近 6 個月買的標「🆕 最近買設備 年月」');
 chk(await pg.locator('#chattel-cards .card:has-text("多件精密") .badge:has-text("最近買設備")').count()===0, '超過 6 個月的不標');
 await pg.locator('#chattel-fRecent .chip:has-text("3 個月內")').click(); await pg.waitForTimeout(300);
 const only=await pg.$$eval('#chattel-cards .card .card-name',(a)=>a.map((x)=>x.textContent.trim()));
 chk(JSON.stringify([...new Set(only)])==='["新買設備有限公司"]', `「最近買設備：3 個月內」只剩最近買的：${only.join('、')}`);
 const daily=await pg.evaluate(async()=>(await window.Chattel.dailyCandidates()).map((r)=>r.cust.name+'|'+r._why));
 chk(/^新買設備有限公司\|符合：3 個月內買設備/.test(daily[0]), `每日新名單動保先挑最近買設備的：${daily[0]}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
