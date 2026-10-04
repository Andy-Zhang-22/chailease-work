// 商行分頁「幫篩出來的找電話（Google 地圖）」：沒金鑰提示、有金鑰就查、找到的填進卡片並隨加入名單帶走、查過的不再查
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9513);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人';
const ROWS=[
 ['87493071','一塊制作室內裝修工作室','合夥','1200000','2021/02/01','新北市新莊區中港路531巷136號','434015','室內裝修工程','室內設計','','Y','張大同'],
 ['91712817','協玖裝潢企業社','獨資','1000000','2022/12/27','新北市新莊區中港路591巷33號','434011','室內裝潢工程','','','Y',''],
 ['91214059','樹德醫療器材行','獨資','2000000','2011/08/19','新北市板橋區中信街78號7樓','464915','醫療機械設備批發','','','N','李四'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-01T20:00:00.000Z',fileDate:'01-OCT-26',cities:['新北市'],minCapital:500000,total:3,byOrg:{'獨資':2,'合夥':1},byDist:{'新莊區':2,'板橋區':1},withOwner:2,ownersLeft:1,files:[{path:'biz.csv',rows:3}]};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('rate-filter-default','0');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 // Google 地圖：協玖查得到（名稱、同門牌 → 確定）；一塊查到名稱對但地址在別區（疑似）；樹德沒有
 const calls=[];
 await ctx.route('**/places.googleapis.com/**',async(route)=>{ const body=JSON.parse(route.request().postData()||'{}'); calls.push(body.textQuery);
   let places=[];
   if(/協玖/.test(body.textQuery)) places=[{id:'a',displayName:{text:'協玖裝潢'},formattedAddress:'新北市新莊區中港路591巷33號',nationalPhoneNumber:'02 2277 8899',googleMapsUri:'https://maps.google.com/?cid=1'}];
   if(/一塊/.test(body.textQuery)) places=[{id:'b',displayName:{text:'一塊制作'},formattedAddress:'台北市大安區仁愛路四段1號',nationalPhoneNumber:'0912 345 678'}];
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({places})}); });
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9513/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); });
 await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForSelector('#biz-cards .card'); await pg.waitForTimeout(400);
 // 沒金鑰：提示
 await pg.click('#biz-hunt'); await pg.waitForTimeout(300);
 chk(/還沒設 Google 地圖的 API 金鑰/.test(await pg.textContent('#toast')) && calls.length===0, `沒金鑰只提示、不查：${await pg.textContent('#toast')}`);
 // 有金鑰：查三家
 await pg.evaluate(()=>localStorage.setItem('places-api-key','test-key'));
 await pg.click('#biz-hunt'); await pg.waitForTimeout(1500);
 chk(calls.length===3, `篩出來的三家都沒電話，查了 3 次：${calls.join(' | ')}`);
 chk(/查了 3 家：確定 1 家、疑似 1 家、沒找到 1 家/.test(await pg.textContent('#toast')), `結果提示：${await pg.textContent('#toast')}`);
 const jx=pg.locator('#biz-cards .card:has-text("協玖")');
 chk(/📞 02 2277 8899/.test(await jx.textContent()) && /名稱地址都對/.test(await jx.textContent()) && (await jx.locator('a[href="https://maps.google.com/?cid=1"]').count())===1, `協玖卡片上有找到的電話與地圖連結：${(await jx.textContent()).replace(/\s+/g,' ').slice(0,160)}`);
 chk((await jx.locator('.phone-search input').inputValue())==='02 2277 8899', '貼電話的框先填好');
 chk(/疑似，打前核對/.test(await pg.locator('#biz-cards .card:has-text("一塊")').textContent()), '一塊標疑似');
 const pc=(await pg.locator('#biz-fPhone .chip').allTextContents()).map(t=>t.replace(/\s+/g,'')).join('|');
 chk(pc==='有電話2|手機1|沒電話1', `電話籤把找到的算進去：${pc}`);
 // 再按一次：查過的不再查
 await pg.click('#biz-hunt'); await pg.waitForTimeout(400);
 chk(calls.length===3 && /不是已有電話就是查過了/.test(await pg.textContent('#toast')), `查過的不再花額度：${await pg.textContent('#toast')}`);
 // 重新整理還在
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForSelector('#biz-cards .card'); await pg.waitForTimeout(400);
 chk(/📞 02 2277 8899/.test(await pg.locator('#biz-cards .card:has-text("協玖")').textContent()), '重開還記得找到的電話');
 // 加入名單帶電話
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#biz-cards .card')].find(x=>x.textContent.includes('協玖')); c.querySelector('.biz-add-one').click(); });
 await pg.waitForTimeout(1200);
 const rec=await pg.evaluate(()=>{ const v=window.customerViews().find(v=>v.company==='協玖裝潢企業社'); return v?v.phoneRaw:null; });
 chk(rec==='02 2277 8899', `加進名單的電話：${rec}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
