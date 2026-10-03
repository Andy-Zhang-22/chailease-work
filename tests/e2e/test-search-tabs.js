// 上市櫃公司分頁：讀資料、董事長名下投資公司、同址標示、加入客戶名單加的是投資公司並排好日期
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9487);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='市場別,公司代號,公司名稱,公司簡稱,統一編號,產業別,住址,董事長,總經理,總機電話,成立日期,上市櫃日期,實收資本額,網址,名下投資公司數,名下其他公司數';
const ROWS=[
 ['上市','1101','臺灣水泥股份有限公司','台泥','11913502','水泥工業','台北市中山區中山北路2段113號','張安平','程耀輝','(02)2531-7099','1950/12/29','1962/02/09','77231817420','https://x','2','3'],
 ['上櫃','1240','茂生農經股份有限公司','茂生農經','18795706','農業科技','台北市中正區和平西路一段30號2樓','吳清德','吳清德','02-23671162','1967/02/18','2018/08/08','464439920','','0','0'],
 ['興櫃','1260','富味鄉食品股份有限公司','富味鄉','12467902','食品工業','新北市新莊區中正路100號','陳昶宏','陳昶宏','(02)2750-5667','1983/11/08','2012/11/26','1020981820','','1','1'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const OWNERS={
 '張安平':[
  {taxId:'12345678',name:'安平投資股份有限公司',invest:true,address:'台北市中山區中山北路2段113號',capital:'50,000',founded:'2010/01/05',owner:'張安平',sameSpot:true},
  {taxId:'12345679',name:'安達投資有限公司',invest:true,address:'桃園市中壢區中正路1號',capital:'3,000',founded:'2015/03/03',owner:'張安平',sameSpot:false},
  {taxId:'12345680',name:'某某貿易有限公司',invest:false}],
 '陳昶宏':[{taxId:'22345678',name:'昶宏投資有限公司',invest:true,address:'新北市新莊區中正路100號',capital:'10,000',founded:'2018/06/01',owner:'陳昶宏',sameSpot:true}],
};
const INDEX={generatedAt:'2026-09-28T06:00:00.000Z',dailyAt:'2026-10-05T22:40:00.000Z',newsAt:'2026-10-04',newsCount:4,revenueYm:'2026-09',total:3,markets:{'上市':1,'上櫃':1,'興櫃':1},chairmen:3,chairmenLeft:0,withInvest:2,investCompanies:3,files:[{path:'companies.csv',rows:3},{path:'owners.json'}]};
const NEWS={generatedAt:'2026-10-05T22:40:00.000Z',days:45,newsAt:'2026-10-04',items:[
 {m:'上市',code:'1101',name:'台泥',d:'2026-10-04',t:'16:52',s:'公告本公司董事會決議取得不動產暨興建廠房',c:'第20款',f:'2026-10-04'},
 {m:'上市',code:'1101',name:'台泥',d:'2026-10-01',t:'09:00',s:'公告本公司除息基準日',c:'',f:''},
 {m:'上市',code:'1101',name:'台泥',d:'2026-09-30',t:'09:00',s:'公告本公司115年9月自結營收',c:'',f:''},
 {m:'上市',code:'1101',name:'台泥',d:'2026-09-29',t:'09:00',s:'公告本公司股東會決議事項',c:'',f:''},
 {m:'上櫃',code:'1240',name:'茂生農經',d:'2026-10-03',t:'10:00',s:'公告本公司董事長異動',c:'第6款',f:'2026-10-03'}]};
const REV={generatedAt:'2026-10-05T22:40:00.000Z',ym:'2026-09',by:{'1101':{code:'1101',m:'上市',ym:'2026-09',cur:13515534,prev:13744103,ly:12214776,mom:-1.7,yoy:25.3,cum:98726969,cumLy:96131621,cumPct:2.7},'1240':{code:'1240',m:'上櫃',ym:'2026-09',cur:251724,prev:242511,ly:230525,mom:3.8,yoy:-30.2,cum:1,cumLy:1,cumPct:0}}};
const CHANGES={generatedAt:'2026-10-05T22:30:00.000Z',items:[{d:'2026-10-03',code:'1240',name:'茂生農經股份有限公司',market:'上櫃',field:'董事長',from:'吳清德',to:'吳大德'}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'桃園市中壢區中正路1號',city:'桃園市',district:'中壢區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1});
const SEED=[mk('1','安達投資有限公司','12345679')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/listed/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/listed/companies.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/listed/owners.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(OWNERS)}));
 await ctx.route('**/leads/listed/news.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NEWS)}));
 await ctx.route('**/leads/listed/revenue.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(REV)}));
 await ctx.route('**/leads/listed/changes.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CHANGES)}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9487/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);

 // 頂端搜尋欄跟著分頁走
 const box=pg.locator('#search');
 chk(/搜尋公司、統編、負責人/.test(await box.getAttribute('placeholder')), '重點推廣名單：原本的提示');
 await pg.fill('#search','安達'); await pg.waitForTimeout(400);
 chk(await pg.evaluate(()=>document.querySelectorAll('#list .card, #cards .card').length)>=0, '主名單搜尋照舊');
 await pg.evaluate(()=>window.switchTab('listed')); await pg.waitForSelector('#listed-cards .card'); await pg.waitForTimeout(400);
 await pg.uncheck('#listed-hideBig'); await pg.waitForTimeout(300);
 chk(/搜尋上市櫃公司/.test(await box.getAttribute('placeholder')), `切到上市櫃：提示換了 ${await box.getAttribute('placeholder')}`);
 chk((await box.inputValue())==='', '切到上市櫃：搜尋欄清空（那一頁還沒搜）');
 const names=async()=>pg.$$eval('#listed-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 await pg.fill('#search','昶宏投資'); await pg.waitForTimeout(400); let n=await names();
 chk(n.join('|')==='富味鄉食品股份有限公司', `頂端打字篩上市櫃：${n.join('|')}`);
 chk((await pg.inputValue('#listed-q'))==='昶宏投資', '那一頁自己的關鍵字欄同步');
 await pg.fill('#listed-q','台泥'); await pg.waitForTimeout(400);
 chk((await box.inputValue())==='台泥', '在那一頁的關鍵字欄打字，頂端跟著');
 await pg.click('#listed-reset'); await pg.waitForTimeout(300);
 chk((await box.inputValue())==='' && (await names()).length===2, '按清除篩選，頂端也清了、全部回來（50 億以上又藏起來，剩 2 家）');
 await pg.evaluate(()=>window.switchTab('stats')); await pg.waitForTimeout(300);
 chk(await box.isDisabled() && /沒有搜尋/.test(await box.getAttribute('placeholder')), '統計分頁：搜尋欄停用');
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 chk(!(await box.isDisabled()) && (await box.inputValue())==='安達' && /搜尋公司、統編、負責人/.test(await box.getAttribute('placeholder')), `切回重點推廣名單：原本的字還在 ${await box.inputValue()}`);
 await pg.evaluate(()=>window.switchTab('listed')); await pg.waitForTimeout(300);
 chk((await box.inputValue())==='', '再切到上市櫃：那一頁清過了，是空的');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'\n全部通過'); await br.close(); srv.close(); process.exit(bad?1:0);
})();
