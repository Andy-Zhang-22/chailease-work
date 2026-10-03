// 客戶詳細頁「附近可以順訪的」：同區的客戶，同一條路排前面、再照值得去的程度；禁止推廣／冷名單／沒電話沒打過的不列；
// 導航從現在這家出發；勾「連找名單的也列」把出進口廠商、商行同區的排進來、可以加入名單
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9515);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const THEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const TROWS=[
 ['70000001','晨光貿易有限公司','','新北市新莊區中正路300號','王O明','02-2990-1234','','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','遠帆國際開發有限公司','','新北市板橋區文化路1號','李O華','02-2960-1111','','2026/01/15','2026/01/15','N','Y','110/03/01','30000000'],
 ['70000003','沒電話貿易有限公司','','新北市新莊區中港路5號','','','','2026/09/01','2026/09/01','Y','Y','',''],
];
const TCSV='﻿'+[THEAD,...TROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const TINDEX={generatedAt:'2026-10-01T20:00:00.000Z',cities:['新北市'],months:24,total:3,withPhone:2,recent:3,files:[{path:'trade.csv',rows:3}]};
const BHEAD='統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人';
const BROWS=[['91712817','協玖裝潢企業社','獨資','1000000','2022/12/27','新北市新莊區中正路591號','434011','室內裝潢工程','','','Y','']];
const BCSV='﻿'+[BHEAD,...BROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const BINDEX={generatedAt:'2026-10-01T20:00:00.000Z',fileDate:'01-OCT-26',cities:['新北市'],minCapital:500000,total:1,byOrg:{'獨資':1},byDist:{'新莊區':1},withOwner:0,ownersLeft:0,files:[{path:'biz.csv',rows:1}]};
const mk=(id,company,taxId,address,extra)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address,city:'新北市',district:(address.match(/新北市(..區)/)||[])[1]||'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',...extra});
const SEED=[
 mk('me','現在這家有限公司','10000001','新北市新莊區中正路100號'),
 mk('a','談過同路有限公司','10000002','新北市新莊區中正路200號',{outcome:'contacted',lastDate:'2026-09-20'}),
 mk('b','談過別路有限公司','10000003','新北市新莊區中港路8號',{outcome:'contacted',lastDate:'2026-09-25'}),
 mk('c','沒打過同路有限公司','10000004','新北市新莊區中正路50號'),
 mk('d','沒打過沒電話有限公司','10000005','新北市新莊區中正路60號',{phoneRaw:'',phones:[]}),
 mk('e','禁止推廣有限公司','10000006','新北市新莊區中正路70號',{outcome:'blocked'}),
 mk('f','別區有限公司','10000007','新北市泰山區明志路1號',{outcome:'contacted',lastDate:'2026-09-28'}),
 mk('g','打過還沒約有限公司','10000008','新北市新莊區幸福路9號',{outcome:'noanswer',lastDate:'2026-09-30'}),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(TINDEX)}));
 await ctx.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:TCSV}));
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BINDEX)}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:BCSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9515/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0');
   // 撥打狀態是記在使用者狀態裡的，名單檔上的 outcome 不算
   const now=Date.now();
   for (const [id,outcome,lastDate] of [['a','contacted','2026-09-20'],['b','contacted','2026-09-25'],['f','contacted','2026-09-28'],['g','noanswer','2026-09-30'],['e','blocked','2026-09-01']]) await window.Store.setState({recordId:id,outcome,lastDate,updatedAt:now});
   // 乙：自己標了有機會（整列覆寫，所以放最後）
   await window.Store.setState({recordId:'b',outcome:'contacted',lastDate:'2026-09-25',chance:'yes',chanceAt:now,updatedAt:now}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 await pg.uncheck('#hideBlocked'); await pg.waitForTimeout(200);
 await pg.locator('#cards .card:has-text("現在這家") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const det=pg.locator('#drawerBody details.nearby');
 chk((await det.count())===1 && /附近可以順訪的（新莊區，名單上 4 家）/.test(await det.locator('summary').textContent()), `詳細頁有這一段、算對家數：${await det.locator('summary').textContent()}`);
 await det.locator('summary').click(); await pg.waitForTimeout(300);
 const rows=await det.locator('.nearby-row').allTextContents();
 const names=rows.map(t=>(t.match(/[一-龥]+有限公司/)||[''])[0]);
 chk(names.join('|')==='談過同路有限公司|沒打過同路有限公司|談過別路有限公司|打過還沒約有限公司', `同一條路先、再照值得去的程度；禁止推廣、沒電話沒打過、別區不列：${names.join('|')}`);
 chk(/有機會/.test(rows[2]) && /同一條路/.test(rows[0]) && !/有機會/.test(rows[0]) && /📞/.test(rows[0]) && /沒打過/.test(rows[1]) && /打過還沒約/.test(rows[3]), `籤：談過的不掛「有機會／談過」、自己標的「有機會」還在（乙）：${rows[0].replace(/\s+/g,' ')} ／ ${rows[3].replace(/\s+/g,' ')}`);
 const nav=await det.locator('.nearby-row').first().locator('a:has-text("導航")').getAttribute('href');
 chk(/origin=.*%E4%B8%AD%E6%AD%A3%E8%B7%AF100/.test(nav) && /destination=.*200/.test(nav), `導航從現在這家出發：${nav}`);
 // 記錄：打開那家、游標在「記錄這通電話」的內容框（拜訪表單拿掉了，拜訪也記在這）
 await det.locator('.nearby-row').first().locator('button:has-text("記錄")').click(); await pg.waitForTimeout(500);
 chk(/談過同路/.test(await pg.textContent('#drawerBody h2')), '記錄打開那一家');
 chk(await pg.evaluate(()=>document.activeElement && document.activeElement.tagName==='TEXTAREA' && !!document.activeElement.closest('.logform')) && (await pg.locator('#drawerBody details:has-text("記錄這次拜訪")').count())===0, '游標在記這通電話的內容框、沒有拜訪表單');
 // 連找名單的也列：出進口（晨光 中正路 有電話）、商行（協玖 中正路）；沒電話貿易不列（出進口要有電話）、遠帆別區不列
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 await pg.locator('#cards .card:has-text("現在這家") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const det2=pg.locator('#drawerBody details.nearby'); await det2.locator('summary').click(); await pg.waitForTimeout(200);
 await det2.locator('.nearby-leads-toggle input').check(); await pg.waitForTimeout(1500);
 const leads=await det2.locator('.nearby-leads .nearby-row').allTextContents();
 chk(leads.length===2 && /出進口廠商.*晨光貿易.*同一條路.*02-2990-1234/.test(leads[0].replace(/\s+/g,' ')) && /商行.*協玖裝潢.*同一條路/.test(leads[1].replace(/\s+/g,' ')), `找名單裡同區的：${leads.map(t=>t.replace(/\s+/g,' ')).join(' ／ ')}`);
 await det2.locator('.nearby-leads .nearby-row').first().locator('button:has-text("加入名單")').click(); await pg.waitForTimeout(1500);
 chk(await pg.evaluate(()=>window.customerViews().some(v=>v.company==='晨光貿易有限公司' && v.phoneRaw==='02-2990-1234')), '加入名單帶電話');
 chk((await pg.evaluate(()=>localStorage.getItem('nearby-leads')))==='1', '勾選記住');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
