// 各來源分頁預設篩「利率不敏感」：跟同業（租賃／融資，不含銀行）借的、或各頁自己的擴張訊號（出進口＝登記 1 年內）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9531);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const ROWS=[
 ['70000001','剛開始貿易有限公司','','新北市新莊區中正路100號','王O明','02-2990-1234','','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','老牌貿易有限公司','','新北市新莊區中正路200號','李O華','02-2990-2222','','2020/01/15','2020/01/15','N','Y','108/03/01','12000000'],
 ['70000003','同業借款有限公司','','新北市新莊區中正路300號','陳O安','02-2990-3333','','2019/01/15','2019/01/15','Y','N','108/05/01','12000000'],
 ['70000004','銀行借款有限公司','','新北市新莊區中正路400號','林O文','02-2990-4444','','2019/02/15','2019/02/15','Y','N','108/06/01','12000000'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const PHONES='﻿統編,電話,傳真,核發日期\n'+ROWS.map(r=>`${r[0]},${r[5]},,2026/09/10`).join('\n')+'\n';
const INDEX={generatedAt:'2026-10-01T20:00:00.000Z',cities:['新北市'],months:24,total:4,withPhone:4,recent:1,recentWithPhone:1,byDist:{'新莊區':4},files:[{path:'trade.csv',rows:4},{path:'phones.csv',rows:4}]};
const CHEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const CROWS=[
 ['動產抵押登記','113新經動字第000001號','70000003','同業借款有限公司','20000002','和潤企業股份有限公司','2024/01/01','2027/01/01','5000000','新北市新莊區中正路300號','1','2024/01/05','','108/05/01'],
 ['動產抵押登記','113新經動字第000002號','70000004','銀行借款有限公司','20000009','臺灣土地銀行股份有限公司','2024/01/01','2027/01/01','5000000','新北市新莊區中正路400號','1','2024/01/05','','108/06/01'],
];
const CCSV='﻿'+[CHEAD,...CROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const CINDEX={generatedAt:'2026-09-26T14:36:42.637Z',dataThrough:'2026/07/02',total:2,kept:2,files:[{path:'ntpc.csv',rows:2}]};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:PHONES}));
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CINDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CCSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9531/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>window.switchTab('trade')); await pg.waitForSelector('#trade-cards .card'); await pg.waitForTimeout(1200);
 const names=async()=>(await pg.$$eval('#trade-cards .card .card-name',a=>a.map(x=>x.textContent.trim()))).sort().join('|');
 const chip=pg.locator('#trade-fRate .chip:has-text("利率不敏感")');
 chk(await chip.getAttribute('aria-pressed')==='true', '「利率不敏感」預設勾著');
 chk(await names()==='剛開始貿易有限公司|同業借款有限公司', `預設只列利率不敏感的：剛做進出口、跟和潤借；跟銀行借的、老牌的不列：${await names()}`);
 await chip.click(); await pg.waitForTimeout(300);
 chk((await names()).split('|').length===4, `按掉就全部列：${await names()}`);
 await pg.click('#trade-reset'); await pg.waitForTimeout(300);
 chk(await names()==='剛開始貿易有限公司|同業借款有限公司' && await chip.getAttribute('aria-pressed')==='true', `回到預設篩選又勾回來：${await names()}`);
 // 其他分頁也有這組籤、預設勾
 for (const t of ['leads','chattel','biz','nhi','einv']) {
   await pg.evaluate((t)=>window.switchTab(t), t); await pg.waitForTimeout(800);
   const on=await pg.locator(`#${t}-fRate .chip:has-text("利率不敏感")`).getAttribute('aria-pressed').catch(()=>null);
   chk(on==='true', `${t} 分頁有「利率」那組籤${on?`（預設 ${on}）`:''}`);
 }
 console.log('ERRORS:', errs.length?errs.join(' | '):'none');
 if (errs.length) bad++;
 await br.close(); srv.close();
 console.log(bad?`${bad} 項失敗`:'全部通過'); process.exit(bad?1:0);
})();
