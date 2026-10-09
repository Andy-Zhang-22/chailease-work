// 頂端搜尋欄跟著分頁走：找名單的分頁轉給那一頁自己的關鍵字欄（兩邊同步、清除篩選也跟著清）；規則頁停用；切回重點推廣名單原本的字還在
// （以前用上市櫃分頁驗，版本 314 那頁拿掉了，改用商行／企業社）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9487);
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人';
const ROWS=[
 ['87493071','甲一裝修工作室','合夥','1200000','2021/02/01','新北市新莊區中港路1號','434015','室內裝修工程','室內設計','','Y','張大同'],
 ['91712817','乙二裝潢企業社','獨資','1000000','2022/12/27','新北市新莊區中港路2號','434011','室內裝潢工程','','','Y',''],
 ['91214059','丙三醫療器材行','獨資','2000000','2011/08/19','新北市板橋區中信街3號','464915','醫療機械設備批發','','','N','李四'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-01T20:00:00.000Z',fileDate:'01-OCT-26',cities:['新北市'],minCapital:500000,total:3,byOrg:{'獨資':2,'合夥':1},byDist:{'新莊區':2,'板橋區':1},withOwner:2,files:[{path:'biz.csv',rows:3}]};
const SEED=[{id:'1',source:'A.csv',company:'安達範例有限公司',aliases:[],taxId:'11111111',grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'}];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(()=>{try{localStorage.setItem('rate-filter-default','0'); localStorage.setItem('leads-filters-open','1');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('2026-10-05T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 // 其他清冊一律沒有（後登記的先比對，所以這條要放最前面）
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"generatedAt":"x"}'}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:'統編,電話,傳真,核發日期\n87493071,0912345678,,2026/01/01\n'}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9487/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);

 const box=pg.locator('#search');
 chk(/搜尋公司、統編、負責人/.test(await box.getAttribute('placeholder')), '重點推廣名單：原本的提示');
 await pg.fill('#search','安達'); await pg.waitForTimeout(400);
 chk(await pg.evaluate(()=>document.querySelectorAll('#cards .card').length)===1, '主名單搜尋照舊');
 await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForSelector('#biz-cards .card'); await pg.waitForTimeout(400);
 chk(/搜尋商行／企業社/.test(await box.getAttribute('placeholder')), `切到商行：提示換了 ${await box.getAttribute('placeholder')}`);
 chk((await box.inputValue())==='', '切到商行：搜尋欄清空（那一頁還沒搜）');
 const names=async()=>pg.$$eval('#biz-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 await pg.fill('#search','裝潢'); await pg.waitForTimeout(400); let n=await names();
 chk(n.join('|')==='乙二裝潢企業社', `頂端打字篩這一頁：${n.join('|')}`);
 chk((await pg.inputValue('#biz-q'))==='裝潢', '那一頁自己的關鍵字欄同步');
 await pg.fill('#biz-q','醫療'); await pg.waitForTimeout(400);
 chk((await box.inputValue())==='醫療', '在那一頁的關鍵字欄打字，頂端跟著');
 await pg.click('#biz-reset'); await pg.waitForTimeout(300);
 chk((await box.inputValue())==='' && (await names()).length===3, '按清除篩選，頂端也清了、全部回來');
 await pg.evaluate(()=>window.switchTab('rules')); await pg.waitForTimeout(300);
 chk(await box.isDisabled() && /沒有搜尋/.test(await box.getAttribute('placeholder')), '規則頁：搜尋欄停用');
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 chk(!(await box.isDisabled()) && (await box.inputValue())==='安達' && /搜尋公司、統編、負責人/.test(await box.getAttribute('placeholder')), `切回重點推廣名單：原本的字還在 ${await box.inputValue()}`);
 await pg.evaluate(()=>window.switchTab('biz')); await pg.waitForTimeout(300);
 chk((await box.inputValue())==='', '再切到商行：那一頁清過了，是空的');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'\n全部通過'); await br.close(); srv.close(); process.exit(bad?1:0);
})();
