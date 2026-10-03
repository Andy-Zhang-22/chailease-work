// 出進口廠商分頁：讀資料、篩選、加入客戶名單帶電話；補電話：清冊加進來的沒電話用統編對 phones.csv、選單那顆整份補
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9499);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const ROWS=[
 ['70000001','晨光貿易有限公司','MORNING TRADE CO., LTD.','新北市新莊區中正路100號','王O明','02-2990-1234','02-2990-1235','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','遠帆國際開發有限公司','','新北市板橋區文化路1號','李O華','0912-345-678','','2025/01/15','2025/01/15','N','Y','','3000000'],
 ['70000003','新莊好商行','','新北市新莊區中正路371號','','','','2026/09/01','2026/09/01','Y','N','114/08/20',''],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const PHONES='﻿統編,電話,傳真,核發日期\n70000001,02-2990-1234,02-2990-1235,2026/09/10\n70000002,0912-345-678,,2025/01/15\n22222222,02-8888-0000,,2024/03/03\n';
const INDEX={generatedAt:'2026-10-01T20:00:00.000Z',lastModified:'Tue, 29 Sep 2026 00:00:39 GMT',cities:['新北市'],months:24,total:75454,withPhone:70514,recent:3,recentWithPhone:2,byDist:{'新莊區':2,'板橋區':1},files:[{path:'trade.csv',rows:3},{path:'phones.csv',rows:3}]};
const mk=(id,company,taxId,o)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'3,000',phoneRaw:'',phones:[],owner:'',keyman:'',industry:'',address:'新北市板橋區文化路1號',city:'新北市',district:'板橋區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1},o);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:PHONES}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9499/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 名單裡：遠帆已在名單但沒電話（統編對得到）、另一家沒電話統編對不到、一家有電話
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },
   [mk('1','遠帆國際開發有限公司','70000002'), mk('2','律森科技股份有限公司','33333333'), mk('3','星辰精密工業股份有限公司','22222222',{phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}]})]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);

 chk(await pg.locator('.subtab[data-tab=\"trade\"]').count()===1, '找名單底下有「出進口廠商」');
 await pg.evaluate(()=>window.switchTab('trade')); await pg.waitForSelector('#trade-cards .card'); await pg.waitForTimeout(400);
 const sub=await pg.textContent('#trade-sub');
 chk(/新北市的出進口廠商 75,454 家（有電話 70,514）/.test(sub) && /最近 24 個月內的 3 家/.test(sub), `副標：${sub}`);
 const names=async()=>pg.$$eval('#trade-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 let n=await names();
 // 預設篩資本額 500～6,000 萬、有電話、我的分公司（使用者：「照你的建議做」）
 const defs=await pg.evaluate(()=>({min:document.querySelector('#trade-capMin').value,max:document.querySelector('#trade-capMax').value,phone:document.querySelector('#trade-fPhone .chip[aria-pressed="true"]')?.textContent,branch:document.querySelector('#trade-fBranch .chip[aria-pressed="true"]')?.textContent}));
 chk(defs.min==='500'&&defs.max==='6000'&&/有電話/.test(defs.phone||'')&&/新莊分公司/.test(defs.branch||''), `預設篩選：${JSON.stringify(defs)}`);
 chk(n.join('|')==='晨光貿易有限公司', `預設只剩最值得打的：${n.join('|')}`);
 // 把預設清掉看全部
 const clearAll=async()=>{ await pg.fill('#trade-capMin',''); await pg.fill('#trade-capMax',''); await pg.waitForTimeout(200); for (const sel of ['#trade-fPhone','#trade-fBranch']) { const on=pg.locator(`${sel} .chip[aria-pressed="true"]`); if (await on.count()) { await on.first().click(); await pg.waitForTimeout(200); } } };
 await clearAll(); n=await names();
 chk(n.join('|')==='晨光貿易有限公司|遠帆國際開發有限公司|新莊好商行', `清掉預設後照資本額高到低：${n.join('|')}`);
 const first=pg.locator('#trade-cards .card:has-text("晨光")');
 chk((await first.locator('.card-name a[href="https://findbiz.nat.gov.tw/fts/company/70000001"]').count())===1 && /queryList\.do\?qryCond=70000003&/.test(await pg.locator('#trade-cards .card:has-text("新莊好商行") .card-name a').getAttribute('href')), '公司名直達商工登記頁、商行連用統編查');
 const top=(await first.locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/新登記/.test(top) && /進口＋出口/.test(top) && /新莊分公司/.test(top), `卡片標籤：${top}`);
 const meta=(await first.locator('.card-meta').textContent()).replace(/\s+/g,' ');
 chk(/📞 02-2990-1234/.test(meta) && /📠 02-2990-1235/.test(meta) && /代表人 王O明/.test(meta) && /原始登記 2026\/08\/20（1 個月前）/.test(meta) && /最近異動 2026\/09\/10/.test(meta) && /🎂 成立 2019\/10（7 年）/.test(meta) && /💰 資本額 1,200 萬/.test(meta), `卡片內容：${meta}`);
 chk(/成立年還沒查到/.test(await pg.locator('#trade-cards .card:has-text("遠帆")').locator('.card-meta').textContent()), '沒查到成立年的有寫');
 chk(await first.locator('a[href^="tel:"]').count()===1, '電話可以直接撥');
 chk(/已在名單/.test(await pg.locator('#trade-cards .card:has-text("遠帆")').locator('.card-top').textContent()), '已在名單的有標');
 const clickChip=async(host,label)=>{ await pg.locator(`${host} .chip:has-text("${label}")`).first().click(); await pg.waitForTimeout(250); };
 await clickChip('#trade-fWhen','3 個月內'); n=await names(); chk(n.join('|')==='晨光貿易有限公司|新莊好商行', `篩 3 個月內：${n.join('|')}`);
 await clickChip('#trade-fAge','5～10 年'); n=await names(); chk(n.join('|')==='晨光貿易有限公司', `再篩成立 5～10 年：${n.join('|')}`); await clickChip('#trade-fAge','5～10 年');
 await clickChip('#trade-fPhone','有電話'); n=await names(); chk(n.join('|')==='晨光貿易有限公司', `再篩有電話：${n.join('|')}`);
 await clickChip('#trade-fPhone','有電話'); await clickChip('#trade-fWhen','3 個月內'); await clickChip('#trade-fPhone','手機'); n=await names(); chk(n.join('|')==='遠帆國際開發有限公司', `只按「手機」就只剩手機的：${n.join('|')}`); await clickChip('#trade-fPhone','手機'); await clickChip('#trade-fWhen','3 個月內'); await clickChip('#trade-fPhone','有電話');
 await pg.fill('#trade-capMin','500'); await pg.waitForTimeout(300); n=await names(); chk(n.join('|')==='晨光貿易有限公司', `資本額 500 萬以上：${n.join('|')}`);
 await pg.click('#trade-reset'); await pg.waitForTimeout(300); n=await names(); chk(n.join('|')==='晨光貿易有限公司', `「回到預設篩選」回到那組預設：${n.join('|')}`); await clearAll(); n=await names(); chk(n.length===3, '再清掉看全部');
 await pg.fill('#search','MORNING'); await pg.waitForTimeout(400); n=await names(); chk(n.join('|')==='晨光貿易有限公司', `頂端搜尋欄搜英文名：${n.join('|')}`); await pg.fill('#search',''); await pg.waitForTimeout(400);

 // 單家加入：電話、代表人、地址、備註一起進去，排明天
 await first.locator('button.trade-add-one').click(); await pg.waitForTimeout(1500);
 const recs=await pg.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^出進口廠商/.test(r.source)).map(r=>({company:r.company,taxId:r.taxId,owner:r.owner,phoneRaw:r.phoneRaw,founded:r.founded,capital:r.capital,nextDate:r.nextDate,notes:r.notesRaw,address:r.address})));
 chk(recs.length===1 && recs[0].company==='晨光貿易有限公司' && recs[0].taxId==='70000001' && recs[0].phoneRaw==='02-2990-1234' && recs[0].owner==='王O明' && recs[0].founded==='2019' && recs[0].capital==='12,000' && recs[0].address==='新北市新莊區中正路100號', `加進去的資料：${JSON.stringify(recs[0])}`);
 chk(recs[0] && /出進口廠商登記（貿易署）：進口＋出口/.test(recs[0].notes) && /原始登記 2026-08-20/.test(recs[0].notes) && recs[0].nextDate==='2026-10-06', `備註、排明天：${recs[0]&&recs[0].notes} ${recs[0]&&recs[0].nextDate}`);
 await pg.click('#importer .drawer-close').catch(()=>{}); await pg.waitForTimeout(300);

 // 補電話：選單那顆——遠帆（統編對得到）補上、律森（對不到）還是沒有、星辰本來就有不動
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 // 沒電話的卡片上有一排找電話的連結跟貼回來的框（使用者：撈不到電話都要自己 Google）
 const yfCard=pg.locator('#cards .card:has-text("遠帆")').first();
 chk(await yfCard.locator('.phone-search a').count()===4 && await yfCard.locator('.phone-search input').count()===1, `沒電話的卡片有找電話連結：${await yfCard.locator('.phone-search a').count()}`);
 chk(/google\.com\/search\?q=.*%E9%9B%BB%E8%A9%B1/.test(await yfCard.locator('.phone-search a').first().getAttribute('href')), 'Google 連結搜「公司名 電話」');
 await yfCard.locator('.phone-search input').fill('02-5555-6666'); await yfCard.locator('.phone-search input').press('Enter'); await pg.waitForTimeout(500);
 chk(/0255556666/.test(JSON.stringify(await pg.evaluate(()=>window.customerViews().find(v=>v.company==='遠帆國際開發有限公司').phones))), '貼回來按 Enter 就存了');
 chk(await pg.isHidden('#drawer'), '在卡片上貼電話不會誤開詳細頁');
 await pg.evaluate(async()=>{ const v=window.customerViews().find(x=>x.company==='遠帆國際開發有限公司'); const st=(await window.Store.getState(v.id))||{}; await window.Store.setState({...st, recordId:v.id, edits:{...(st.edits||{}), phoneRaw:''}}); }); await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 const res=await pg.evaluate(()=>window.tradePhones('',{toast:true}));
 chk(res.tried===2 && res.found===1, `整份補電話：沒電話有統編的 ${res.tried} 家、對到 ${res.found} 家`);
 await pg.waitForTimeout(400);
 const after=await pg.evaluate(()=>window.customerViews().map(v=>({company:v.company,phones:v.phones.map(p=>p.dial||p.digits),src:v.phoneSource&&v.phoneSource.kind})));
 const yf=after.find(v=>v.company==='遠帆國際開發有限公司'); const ls=after.find(v=>v.company==='律森科技股份有限公司'); const xc=after.find(v=>v.company==='星辰精密工業股份有限公司');
 chk(yf && yf.phones.length===1 && /0912345678/.test(yf.phones[0]) && yf.src==='trade', `遠帆補到電話、來源記 trade：${JSON.stringify(yf)}`);
 chk(ls && ls.phones.length===0 && !ls.src, `律森對不到還是沒電話：${JSON.stringify(ls)}`);
 chk(xc && xc.phones.length===1 && /0211111111/.test(xc.phones[0]) && !xc.src, `星辰本來的電話不動：${JSON.stringify(xc)}`);
 chk(/對到 1 家/.test(await pg.textContent('#toast')), `提示：${await pg.textContent('#toast')}`);
 // 詳細頁註明來源
 await pg.locator('#cards .card:has-text("遠帆")').first().click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 chk(/電話來自貿易署出進口廠商登記（核發 2025\/01\/15）/.test(await pg.textContent('#drawerBody')), '詳細頁寫電話來自貿易署');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);

 // 分頁加進來的沒電話也會補：用登記清冊的標準 CSV 走 importLeadsFile（統編 22222222… 這裡用電話表裡的 22222222 換一家新公司）
 await pg.evaluate(async()=>{ const csv='﻿公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家\n範例數位文創股份有限公司,22222223,,2018,5000,,,,,2026-10-06,,登記清冊,新北市新莊區中正路5號,2026-10-05,\n';
   await window.importLeadsFile(new File([csv],'登記清冊-11508-1家.csv',{type:'text/csv'})); });
 await pg.waitForTimeout(1500);
 const fx=await pg.evaluate(()=>{ const v=window.customerViews().find(x=>x.company==='範例數位文創股份有限公司'); return v?{phones:v.phones.length}:null; });
 chk(fx && fx.phones===0, `電話表沒有這家就不亂填：${JSON.stringify(fx)}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);

 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
