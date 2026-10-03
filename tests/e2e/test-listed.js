// 上市櫃公司分頁：讀資料、董事長名下投資公司、同址標示、加入客戶名單加的是投資公司並排好日期
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9486);
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
const PLEDGE={generatedAt:'2026-10-05T22:40:00.000Z',ym:'2026-09',by:{'1101':{ym:'2026-09',n:12,shares:5000000,pledged:1750000,pct:35,pledgers:2,people:[{t:'董事長本人',n:'張安平',s:1000000,p:400000,r:40},{t:'董事本人',n:'某董事',s:500000,p:300000,r:60}]},'1240':{ym:'2026-09',n:5,shares:100000,pledged:0,pct:0,pledgers:0,people:[{t:'董事長本人',n:'吳清德',s:80000,p:0,r:0}]}}};
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
 await ctx.route('**/leads/closed/**',r=>r.fulfill({status:404,body:''}));   // 測試不要載到 repo 裡真的停業表（裡面有測試拿來當樣本的真公司）
 await ctx.route('**/leads/listed/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/listed/companies.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/listed/owners.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(OWNERS)}));
 await ctx.route('**/leads/listed/news.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NEWS)}));
 await ctx.route('**/leads/listed/revenue.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(REV)}));
 await ctx.route('**/leads/listed/changes.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CHANGES)}));
 await ctx.route('**/leads/listed/pledge.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(PLEDGE)}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9486/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 chk(await pg.locator('.subtab[data-tab=\"listed\"]').count()===1, '找名單底下有「上市櫃公司」');
 await pg.evaluate(()=>window.switchTab('listed')); await pg.waitForSelector('#listed-cards .card'); await pg.waitForTimeout(400);
 chk((await pg.$$eval('#listed-cards .card .card-name',a=>a.map(x=>x.textContent.trim()))).join('|')==='富味鄉食品股份有限公司|茂生農經股份有限公司' && /符合 2 家/.test(await pg.textContent('#listed-count')), '預設剔除實收資本額 50 億以上（台泥 772 億藏起來）');
 await pg.uncheck('#listed-hideBig'); await pg.waitForTimeout(300);
 const sub=await pg.textContent('#listed-sub');
 chk(/上市 1、上櫃 1、興櫃 1 家/.test(sub) && /投資公司 3 家/.test(sub) && /動態更新 2026\/10\/05（重大訊息到 10\/04、營收到 115\/9）/.test(sub), `副標：${sub}`);
 // 動態：營收、異動、重大訊息
 const tc=pg.locator('#listed-cards .card:has-text("臺灣水泥")');
 const dynTxt=(await tc.locator('.dyn-box').textContent()).replace(/\s+/g,' ');
 chk(/115\/9 營收 135.2 億/.test(dynTxt) && /年增 \+25.3%/.test(dynTxt) && /月增 -1.7%/.test(dynTxt) && /累計 \+2.7%/.test(dynTxt), `營收一行：${dynTxt}`);
 chk((await tc.locator('.dyn-news .dyn-item').count())===3 && /還有 1 則…/.test(dynTxt), '重大訊息先顯示 3 則');
 chk(/10\/4資產設備公告本公司董事會決議取得不動產/.test(dynTxt.replace(/\s+/g,'')), `最新一則在前、有分類標籤：${dynTxt}`);
 await tc.locator('.dyn-more').click(); await pg.waitForTimeout(200); await pg.screenshot({path:'listed-dyn.png',clip:{x:0,y:0,width:1300,height:1100}});
 chk((await tc.locator('.dyn-news .dyn-item').count())===4, '點開看全部');
 chk(/近 30 天 4 則重大訊息/.test((await tc.locator('.card-top').textContent())), '卡片標籤寫近 30 天幾則');
 const mc=pg.locator('#listed-cards .card:has-text("茂生農經")');
 const mTxt=(await mc.locator('.dyn-box').textContent()).replace(/\s+/g,' ');
 chk(/10\/3 董事長 吳清德 → 吳大德/.test(mTxt) && /年增 -30.2%/.test(mTxt) && /人事異動/.test(mTxt), `基本資料異動與人事：${mTxt}`);
 chk(/基本資料有異動/.test(await mc.locator('.card-top').textContent()), '有異動的卡片有標');
 chk((await pg.locator('#listed-cards .card:has-text("富味鄉") .dyn-box').count())===0, '沒動態的卡片不畫動態框');
 chk(/115\/9 董監設質 2 人，合計 35%/.test(dynTxt) && /董事長本人設質 40%/.test(dynTxt) && /60%.*董事本人.*某董事.*持股 500,000 股，設質 300,000 股/.test(dynTxt), `董監設質：${dynTxt}`);
 chk(/董監都沒設質（董事長本人持股 80,000 股）/.test(mTxt), `沒設質的寫清楚：${mTxt}`);
 const names=async()=>pg.$$eval('#listed-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 let n=await names();
 chk(n[0]==='臺灣水泥股份有限公司' && n.length===3, `預設照投資公司多的在前：${n.join('|')}`);
 const first=pg.locator('#listed-cards .card').first();
 const top=(await first.locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/上市 1101/.test(top) && /水泥工業/.test(top) && /名下投資公司 2 家（同址 1）/.test(top) && /城中分公司/.test(top), `卡片標籤：${top}`);
 chk(await first.evaluate(e=>e.classList.contains('is-same')), '有同址投資公司的卡片左邊綠色');
 const meta=(await first.locator('.card-meta').textContent()).replace(/\s+/g,' ');
 chk(/實收資本 772.3 億/.test(meta) && /董事長 張安平・總經理 程耀輝/.test(meta) && /成立 1950（75 年）/.test(meta), `卡片內容：${meta}`);
 chk((await first.locator('.owner-row').count())===0 && /▸/.test(await first.locator('.owner-toggle').textContent()) && /名下其他公司（3 家，投資公司 2 家、同址 1 家）/.test(await first.locator('.owner-toggle').textContent()), `投資公司預設收起來，標題寫幾家：${(await first.locator('.owner-toggle').textContent()).replace(/\s+/g,' ')}`);
 await first.locator('.owner-toggle').click(); await pg.waitForTimeout(250);
 chk(/▾/.test(await first.locator('.owner-toggle').textContent()), '點標題展開');
 const rowsTxt=await first.locator('.owner-row').allTextContents();
 chk(rowsTxt.length===2 && /安平投資/.test(rowsTxt[0]) && /與上市公司同址/.test(rowsTxt[0]) && /資本 5,000 萬/.test(rowsTxt[0]), `名下投資公司列出來、同址有標：${rowsTxt[0].replace(/\s+/g,' ')}`);
 chk(rowsTxt.some(t=>/安達投資/.test(t) && /已在名單・上次 9\/12/.test(t)), `已在名單的投資公司有標：${rowsTxt.map(t=>t.replace(/\s+/g,' ')).join(' / ')}`);
 chk(/其他：某某貿易有限公司/.test(await first.locator('.owner-box').textContent()), '非投資的其他公司只列名字');
 chk((await first.locator('.listed-add-all').count())===0, '整張卡的「把 N 家投資公司加入客戶名單」拿掉了（使用者：這用不到）');
 // 篩選：同址
 const clickChip=async(host,label)=>{ await pg.locator(`${host} .chip:has-text("${label}")`).first().click(); await pg.waitForTimeout(250); };
 await clickChip('#listed-fDyn','資產設備'); n=await names(); chk(n.join('|')==='臺灣水泥股份有限公司', `篩重大訊息類別：${n.join('|')}`); await clickChip('#listed-fDyn','資產設備');
 await clickChip('#listed-fPledge','董事長本人有設質'); n=await names(); chk(n.join('|')==='臺灣水泥股份有限公司', `篩董事長本人有設質：${n.join('|')}`); await clickChip('#listed-fPledge','董事長本人有設質');
 await clickChip('#listed-fDyn','營收年減 20% 以上'); n=await names(); chk(n.join('|')==='茂生農經股份有限公司', `篩營收年減：${n.join('|')}`);
 await clickChip('#listed-fDyn','近 90 天基本資料異動'); n=await names(); chk(n.join('|')==='茂生農經股份有限公司', `篩基本資料異動（任一符合）：${n.join('|')}`); await clickChip('#listed-fDyn','營收年減 20% 以上'); await clickChip('#listed-fDyn','近 90 天基本資料異動');
 await pg.selectOption('#listed-sort','active'); await pg.waitForTimeout(250); n=await names(); chk(n[0]==='臺灣水泥股份有限公司' && n[1]==='茂生農經股份有限公司' && n[2]==='富味鄉食品股份有限公司', `最新動態在前：${n.join('|')}`); await pg.selectOption('#listed-sort','invest'); await pg.waitForTimeout(250);
 await clickChip('#listed-fInvest','與上市公司同址'); n=await names();
 chk(n.length===2 && !n.includes('茂生農經股份有限公司'), `只看有同址投資公司的：${n.join('|')}`);
 await clickChip('#listed-fInvest','與上市公司同址');
 await clickChip('#listed-fMarket','興櫃'); n=await names(); chk(n.join('|')==='富味鄉食品股份有限公司', `市場別：${n.join('|')}`); await clickChip('#listed-fMarket','興櫃');
 await pg.fill('#listed-q','昶宏投資'); await pg.waitForTimeout(300); n=await names(); chk(n.join('|')==='富味鄉食品股份有限公司', `關鍵字搜投資公司名稱：${n.join('|')}`); await pg.fill('#listed-q',''); await pg.waitForTimeout(300);
 chk(/把投資公司加入客戶名單（2 家）/.test(await pg.textContent('#listed-add')), `整批按鈕寫還不在名單的投資公司數：${await pg.textContent('#listed-add')}`);
 // 單家加入：加的是投資公司，備註寫上市櫃老闆，排在明天
 await first.locator('.owner-row').first().locator('button.listed-add-one').click(); await pg.waitForTimeout(1500);
 const recs=await pg.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^上市櫃投資公司/.test(r.source)).map(r=>({company:r.company,taxId:r.taxId,owner:r.owner,industry:r.industry,capital:r.capital,founded:r.founded,nextDate:r.nextDate,notes:r.notesRaw,address:r.address})));
 chk(recs.length===1 && recs[0].company==='安平投資股份有限公司' && recs[0].taxId==='12345678', `加進去的是投資公司：${JSON.stringify(recs[0]&&recs[0].company)}`);
 chk(recs[0] && recs[0].owner==='張安平' && recs[0].industry==='投資控股' && recs[0].capital==='50,000' && recs[0].founded==='2010', `負責人、產業、資本額、成立年：${JSON.stringify(recs[0])}`);
 chk(recs[0] && /張安平 是上市 臺灣水泥股份有限公司（1101）董事長/.test(recs[0].notes) && /與上市公司同址/.test(recs[0].notes), `備註寫清楚：${recs[0]&&recs[0].notes}`);
 chk(recs[0] && recs[0].nextDate==='2026-10-06', `排在明天：${recs[0]&&recs[0].nextDate}`);
 await pg.click('#importer .drawer-close').catch(()=>{}); await pg.waitForTimeout(300);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(200); await pg.evaluate(()=>window.switchTab('listed')); await pg.waitForTimeout(400);
 chk((await pg.locator('#listed-cards .card').first().locator('.owner-row').count())===2, '切回來仍是展開的');
 const rows2=await pg.locator('#listed-cards .card').first().locator('.owner-row').allTextContents();
 chk(/已在名單/.test(rows2[0]) && /打開/.test(rows2[0]), `切回來變成已在名單：${rows2[0].replace(/\s+/g,' ')}`);
 chk(/把投資公司加入客戶名單（1 家）/.test(await pg.textContent('#listed-add')), `整批按鈕數字跟著變：${await pg.textContent('#listed-add')}`);
 // 藏起來
 await pg.locator('#listed-cards .card:has-text("茂生農經")').locator('button.listed-hide').click(); await pg.waitForTimeout(250); n=await names();
 chk(!n.includes('茂生農經股份有限公司') && (await pg.textContent('#listed-hidden')).includes('顯示藏起來的 1 家'), `這家不用了：${n.join('|')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`\n${bad} 個失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
