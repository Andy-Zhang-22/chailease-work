// 商行／企業社分頁：讀資料、篩選、加入客戶名單、頂端搜尋欄
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9488);
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
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市板橋區中信街78號7樓',city:'新北市',district:'板橋區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"generatedAt":"x"}'}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:'統編,電話,傳真,核發日期\n87493071,0912345678,,2026/01/01\n91214059,02-2277-0000,,2026/01/01\n'}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9488/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },[mk('1','樹德醫療器材行','91214059')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 chk(await pg.locator('.tab[data-tab="biz"]').count()===1, '分頁列上有「商行／企業社」');
 await pg.click('.tab[data-tab="biz"]'); await pg.waitForSelector('#biz-cards .card'); await pg.waitForTimeout(400);
 const sub=await pg.textContent('#biz-sub');
 chk(/新北市的商行、企業社 3 家（獨資 2、合夥 1）/.test(sub) && /50 萬 以上/.test(sub) && /查到負責人的 2 家/.test(sub), `副標：${sub}`);
 const names=async()=>pg.$$eval('#biz-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 let n=await names();
 chk(n[0]==='樹德醫療器材行' && n.length===3, `預設照資本額：${n.join('|')}`);
 const first=pg.locator('#biz-cards .card:has-text("一塊制作")');
 const top=(await first.locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/合夥/.test(top) && /新莊分公司/.test(top) && /開發票/.test(top), `卡片標籤：${top}`);
 const meta=(await first.locator('.card-meta').textContent()).replace(/\s+/g,' ');
 chk(/資本額 120 萬/.test(meta) && /設立 2021\/02（5 年）/.test(meta) && /負責人 張大同/.test(meta) && /室內裝修工程、室內設計/.test(meta), `卡片內容：${meta}`);
 chk(await first.evaluate(e=>e.classList.contains('is-up')), '在我的分公司轄區的卡片左邊有色');
 chk(/已在名單・9\/1 加入/.test(await pg.locator('#biz-cards .card:has-text("樹德")').locator('.card-top').textContent()), `已在名單的有標，而且寫哪天加的：${await pg.locator('#biz-cards .card:has-text("樹德")').locator('.card-top').textContent()}`);
 const clickChip=async(host,label)=>{ await pg.locator(`${host} .chip:has-text("${label}")`).first().click(); await pg.waitForTimeout(250); };
 await clickChip('#biz-fBranch','新莊分公司'); n=await names(); chk(n.length===2 && !n.includes('樹德醫療器材行'), `篩新莊分公司：${n.join('|')}`);
 await clickChip('#biz-fAge','未滿 5 年'); n=await names(); chk(n.join('|')==='協玖裝潢企業社', `再篩未滿 5 年：${n.join('|')}`);
 await pg.click('#biz-reset'); await pg.waitForTimeout(300); n=await names(); chk(n.length===3, '清除篩選');
 const pc=(await pg.locator('#biz-fPhone .chip').allTextContents()).map(t=>t.replace(/\s+/g,'')).join('|'); chk(pc==='有電話2|手機1|沒電話1', `電話籤（對出進口廠商電話表）：${pc}`);
 await clickChip('#biz-fPhone','手機'); n=await names(); chk(n.join('|')==='一塊制作室內裝修工作室', `只按「手機」：${n.join('|')}`);
 chk(/📞 手機（多半是老闆本人）/.test(await pg.locator('#biz-cards .card').first().locator('.card-top').textContent()), '卡片標手機');
 await clickChip('#biz-fPhone','沒電話'); n=await names(); chk(n.length===2 && n.includes('協玖裝潢企業社'), `手機＋沒電話是「或」：${n.join('|')}`);
 await pg.click('#biz-reset'); await pg.waitForTimeout(300); n=await names(); chk(n.length===3, '清除篩選也清電話籤');
 // 頂端搜尋欄跟著分頁
 await pg.fill('#search','裝潢'); await pg.waitForTimeout(400); n=await names(); chk(n.join('|')==='協玖裝潢企業社', `頂端搜尋欄搜這一頁：${n.join('|')}`); await pg.fill('#search',''); await pg.waitForTimeout(400);
 // 名稱旁有複製的點；卡片上有找電話那排＋貼電話的框（使用者：在分頁找好電話，加入時要一起帶、加完直接開那一筆）
 const jx=pg.locator('#biz-cards .card:has-text("協玖")');
 chk(await jx.locator('.card-name .copy-dot').count()===1, '名稱旁一顆複製的點');
 chk(await jx.locator('.phone-search a').count()===4 && await jx.locator('.phone-search input').count()===1, `卡片上有找電話連結與貼電話的框：${await jx.locator('.phone-search a').count()}`);
 await jx.locator('.phone-search input').fill('02-2277-8899'); await pg.waitForTimeout(100);
 await pg.locator('#biz-fBranch .chip').first().click(); await pg.waitForTimeout(250); await pg.locator('#biz-fBranch .chip').first().click(); await pg.waitForTimeout(250);   // 重畫
 chk((await pg.locator('#biz-cards .card:has-text("協玖") .phone-search input').inputValue())==='02-2277-8899', '重畫之後貼的電話還在');
 // 單家加入
 await pg.locator('#biz-cards .card:has-text("協玖")').locator('button.biz-add-one').click(); await pg.waitForTimeout(1500);
 chk(await pg.isVisible('#drawer') && /協玖/.test(await pg.textContent('#drawerBody h2')), '單家加入後直接打開那一筆');
 chk((await pg.evaluate(()=>window.customerViews().find(v=>v.company==='協玖裝潢企業社').phoneRaw))==='02-2277-8899', '卡片上貼的電話一起進名單');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 const recs=await pg.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^商行企業社/.test(r.source)).map(r=>({company:r.company,taxId:r.taxId,owner:r.owner,industry:r.industry,capital:r.capital,founded:r.founded,nextDate:r.nextDate,notes:r.notesRaw,address:r.address,addedDate:r.addedDate})));
 chk(recs.length===1 && recs[0].company==='協玖裝潢企業社' && recs[0].taxId==='91712817' && recs[0].capital==='1,000' && recs[0].founded==='2022' && recs[0].industry==='室內裝潢工程', `加進去的資料：${JSON.stringify(recs[0])}`);
 chk(recs[0] && /商行／企業社（稅籍登記）：獨資/.test(recs[0].notes) && /只有稅籍登記/.test(recs[0].notes) && recs[0].nextDate==='2026-10-06' && recs[0].addedDate===TODAY, `備註、排明天、名單新增日期：${recs[0]&&recs[0].notes} ${recs[0]&&recs[0].nextDate}`);
 await pg.click('#importer .drawer-close').catch(()=>{}); await pg.waitForTimeout(300);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(200); await pg.click('.tab[data-tab="biz"]'); await pg.waitForTimeout(400);
 chk(/已在名單/.test(await pg.locator('#biz-cards .card:has-text("協玖")').locator('.card-top').textContent()), '切回來變成已在名單');
 chk(/把篩出來的加入客戶名單（1 家）/.test(await pg.textContent('#biz-add')), `整批按鈕算還不在名單的：${await pg.textContent('#biz-add')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'\n全部通過'); await br.close(); srv.close(); process.exit(bad?1:0);
})();
