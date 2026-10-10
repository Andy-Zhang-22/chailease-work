// 後台挑每日新名單的接點（版本 321；tools/feed-drive.mjs 用無頭瀏覽器開網站叫這幾個）：
// dailyFeed({ force, awaitPhones }) 回摘要（挑了幾家、沒電話跳過幾家、補電話的結果），排滿回 full、放假回 holiday；
// phoneBackGoogle()：「找不到電話」收起來的公司用 Google 地圖再查一次，查到存進會同步的設定、名單上方只提醒。
// 版本 322：後台掛 window.backendResearch（Claude＋網路搜尋）。使用者定的順序：1 挑名單 → 2 網路確認擴張訊號 → 3 找電話 → 4 給他：
// 候選先上網查，查到訊號的排前面（排序不是門檻）、那句寫進訪談內容、來源存進狀態；官網上看到的電話直接用，不用再查 Google。
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9635);
const TODAY='2026-10-05';   // 週一
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const LHEAD='統一編號,公司名稱,公司所在地,代表人,資本額,核准設立日期,核准變更日期,案由或變更事項,營業項目,縣市,清冊,期別';
const LROWS=[
 ['11111111','甲一精密有限公司','新北市新莊區中正路1號','王一','30000000','108/10/01','115/08/20','增資','CC01080 電子零組件製造業','新北市','change','11508'],
 ['22222222','乙二機械股份有限公司','新北市泰山區中港西路2號','李二','50000000','108/10/01','115/08/21','增資','CB01010 機械設備製造業','新北市','change','11508'],
 ['33333333','丙三工程有限公司','新北市五股區五權路3號','張三','20000000','108/10/01','115/08/22','增資','E601010 電器承裝業','新北市','change','11508'],
 ['44444444','丁四大企業股份有限公司','新北市新莊區中正路4號','陳四','150000000','108/10/01','115/08/23','增資','CB01010 機械設備製造業','新北市','change','11508'],   // 資本額 1.5 億：不符合規則，不拿去上網查、排最後
];
const LCSV='﻿'+[LHEAD,...LROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const LINDEX={latest:'11508',generatedAt:'2026-09-26T17:00:00.000Z',periods:{'11508':{generatedAt:'2026-09-26T17:00:00.000Z',period:'11508',files:[{city:'新北市',type:'change',path:'11508/新北市-change.csv',rows:4,capitalUp:4}]}}};
const mk=(id,company,taxId,phone)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'3,000',phoneRaw:phone,phones:phone?[{digits:phone.replace(/\D/g,''),ext:'',note:''}]:[],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'2026-10-20',lastDate:'',addedDate:'2026-09-01'});
const SEED=[mk('1','主力客戶一有限公司','99999991','02-2222-3333'),mk('2','戊五範例有限公司','55555555','')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('new-quota','3'); localStorage.setItem('places-api-key','AIzaSyTESTKEY00000000000000000000000');}catch(e){}});
 const asked=[];
 await ctx.route('https://places.googleapis.com/**',async(r)=>{ const qq=JSON.parse(r.request().postData()).textQuery; asked.push(qq);
   const places=/乙二/.test(qq)?[{id:'p2',displayName:{text:'乙二機械股份有限公司'},formattedAddress:'243新北市泰山區中港西路2號',nationalPhoneNumber:'02 2990 2222'}]
     :/戊五/.test(qq)?[{id:'p5',displayName:{text:'戊五範例有限公司'},formattedAddress:'242新北市新莊區中正路9號',nationalPhoneNumber:'02 2345 6789'}]:[];
   r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({places})}); });
 await ctx.route('**/leads/**',r=>{
   const u=r.request().url();
   if(/leads\/index\.json/.test(u)) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(LINDEX)});
   if(/leads\/11508\//.test(u)) return r.fulfill({status:200,contentType:'text/csv',body:LCSV});
   if(/trade\/phones\.csv/.test(u)) return r.fulfill({status:200,contentType:'text/csv',body:'﻿統編,電話,傳真,核發日期\n11111111,02-1234-5678,,2025/01/01\n'});
   if(/trade\/index\.json/.test(u)) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({generatedAt:'a'})});
   return r.fulfill({status:404,body:''});
 });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 // 假的後台研究：乙二有擴張訊號；丙三沒訊號但官網上有電話（跟真的一樣：key 是統編，回 { expansion, score, summary, sources, phone }）
 const researched=[];
 await pg.exposeFunction('backendResearch', async(items)=>{ researched.push(items.map(i=>`${i.name}|${i.taxId}|${i.address}`)); const out={}; items.forEach(i=>{ out[i.key]= i.taxId==='22222222'?{expansion:true,score:2,summary:'104 正在徵 8 名作業員（2026/09）',sources:['https://www.104.com.tw/x'],phone:''}
   : i.taxId==='33333333'?{expansion:false,score:0,summary:'',sources:['https://example.com/c'],phone:'02-2299-3333'}
   : i.taxId==='44444444'?{expansion:true,score:3,summary:'（不該被問到）',sources:[],phone:'02-0000-4444'}:{expansion:false,score:0,summary:'',sources:[],phone:''}; }); return out; });
 await pg.goto('http://localhost:9635/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk(await pg.evaluate(()=>typeof window.dailyFeed==='function' && typeof window.runSync==='function' && typeof window.phoneBackGoogle==='function'), '後台用的掛點都在（dailyFeed、runSync、phoneBackGoogle）');

 // 版本 322：額度 1 的時候，排名較後但網路有擴張訊號的乙二排到甲一前面被挑中（排序不是門檻）
 await pg.evaluate(()=>localStorage.setItem('new-quota','1'));
 const one=await pg.evaluate(()=>window.dailyFeed({force:true,awaitPhones:true}));
 const fedOne=await pg.evaluate(()=>window.customerViews().filter(v=>/^每日新名單/.test(v.source)).map(v=>v.company));
 chk(one && one.picked===1 && fedOne.length===1 && fedOne[0]==='乙二機械股份有限公司', `額度 1：網路有擴張訊號的乙二排前面：${fedOne.join('|')}，摘要 ${JSON.stringify(one && one.research)}`);
 chk(researched.length===1 && researched[0].length===3 && researched[0].every(x=>/\|\d{8}\|新北市/.test(x)) && !researched[0].some(x=>/丁四/.test(x)), `先上網查（找電話之前）、只查符合規則的三家（資本額 1.5 億的丁四不查）、帶統編與地址：${JSON.stringify(researched)}`);
 const noteB=await pg.evaluate(async()=>((await window.Store.allRecords()).find(r=>r.company==='乙二機械股份有限公司')||{}).notesRaw||'');
 chk(/網路：104 正在徵 8 名作業員（2026\/09）/.test(noteB), `訊號那句寫進訪談內容：${noteB}`);
 const stB=await pg.evaluate(async()=>{ const v=window.customerViews().find(v=>v.company==='乙二機械股份有限公司'); return (await window.Store.allStates()).find(s=>s.recordId===v.id).intel; });
 chk(stB && stB.expansion===true && stB.score===2 && stB.sources[0]==='https://www.104.com.tw/x', `來源存進追蹤狀態：${JSON.stringify(stB)}`);
 chk((await pg.locator('#cards .card:has-text("乙二") .badge-intel').count())===1, '卡片標「🌐 網路有擴張訊號」');
 await pg.locator('#cards .card:has-text("乙二") .card-name').first().click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const dB=(await pg.textContent('#drawerBody .intel-line')).replace(/\s+/g,' ');
 chk(/網路查到：104 正在徵 8 名作業員/.test(dB) && (await pg.locator('#drawerBody .intel-line a').count())===1, `詳細頁有那句＋來源連結：${dB}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 // 清掉這一批、額度調回 3，再走原本的流程
 await pg.evaluate(async()=>{ await window.Store.deleteSource('每日新名單-2026-10-05.csv',{keepTombstone:false,dropTrail:true}); localStorage.removeItem('daily-feed-on'); localStorage.setItem('new-quota','3'); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 // 自動挑關著（daily-feed-auto=0），後台用 force 叫：回摘要、等補電話跑完
 const res=await pg.evaluate(()=>window.dailyFeed({force:true,awaitPhones:true}));
 chk(res && res.picked===3 && res.skippedNoPhone===1 && res.day===TODAY && res.quota===3 && res.bySrc && res.bySrc['登記清冊']===3, `摘要：挑 3 家（丙三的電話是上網查到的；找電話那關會多看到額度兩倍，丁四沒電話算跳過 1 家，但它不符合規則本來就排最後）：${JSON.stringify(res)}`);
 chk(res && res.phones && res.phones.trade && typeof res.phones.trade.tried==='number' && res.phones.google && typeof res.phones.google.tried==='number', `補電話的結果一起回（awaitPhones）：${JSON.stringify(res && res.phones)}`);
 chk(res && res.research && res.research.asked===3 && res.research.withSignals===1, `網路查的筆數一起回：${JSON.stringify(res && res.research)}`);
 const fed=await pg.evaluate(()=>window.customerViews().filter(v=>/^每日新名單/.test(v.source)).map(v=>v.company+'|'+v.phones.map(p=>String(p.digits||p.dial||p.display||'').replace(/\D/g,'')).join(',')).sort());
 chk(fed.length===3 && fed[0]==='丙三工程有限公司|0222993333' && fed[1]==='乙二機械股份有限公司|0229902222' && fed[2]==='甲一精密有限公司|0212345678', `進來的 3 家電話都填好（丙三是網路查到的）：${fed.join(' / ')}`);
 chk(!asked.some(x=>/丙三/.test(x)), `網路已有電話的不再問 Google 地圖：${asked.join(' | ')}`);
 const srcC=await pg.evaluate(async()=>{ const v=window.customerViews().find(v=>v.company==='丙三工程有限公司'); return (await window.Store.allStates()).find(s=>s.recordId===v.id).phoneSource; });
 chk(srcC && srcC.kind==='web' && srcC.website==='https://example.com/c', `電話來源標「網路」：${JSON.stringify(srcC)}`);
 await pg.locator('#cards .card:has-text("丙三") .card-name').first().click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 chk(/電話是上網查擴張訊號時在官網／徵才頁看到的/.test(await pg.textContent('#drawerBody')), '詳細頁說明電話是上網看到的');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 chk((await pg.evaluate(()=>localStorage.getItem('daily-feed-on')))===TODAY, '今天挑過了的記號有記（會同步，使用者開網站不再挑）');
 const again=await pg.evaluate(()=>window.dailyFeed({force:true,awaitPhones:true}));
 chk(again && again.full===true && again.picked===0 && again.have===3, `再叫一次：額度 3、已有 3 家，回 full 不重挑：${JSON.stringify(again)}`);
 await pg.evaluate(()=>localStorage.setItem('new-quota','4'));
 const more=await pg.evaluate(()=>window.dailyFeed({force:true}));
 chk(more && more.picked===0 && !more.full && more.have===3 && more.skippedNoPhone===1, `額度 4：符合規則的都進來了，才輪到丁四補，但它沒電話（也沒拿去上網查）→ 跳過：${JSON.stringify(more)}`);
 // 放假
 await pg.evaluate(()=>{ window.__now=new Date('2026-10-10T09:00:00').getTime(); });
 const off=await pg.evaluate(()=>window.dailyFeed({force:true}));
 chk(off && off.holiday===true && off.picked===0, `放假回 holiday：${JSON.stringify(off)}`);
 await pg.evaluate(()=>{ window.__now=new Date('2026-10-05T09:00:00').getTime(); });

 // 找不到電話的再查 Google：戊五收起來（找不到電話），公開資料沒有、Google 查得到 → 只提醒、存進會同步的設定
 await pg.evaluate(async()=>{ await window.Store.deleteRecord('2',{noPhone:true}); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);   // 後台是同步完 reload 才叫，排除名單要重新載
 const before=asked.length;
 const pb=await pg.evaluate(()=>window.phoneBackGoogle());
 chk(pb && pb.tried===1 && pb.found===1 && pb.kept===0, `Google 查了 1 家、查到 1 家：${JSON.stringify(pb)}`);
 chk(asked.slice(before).length===1 && /戊五/.test(asked[before]), `只查戊五一次：${asked.slice(before).join(' | ')}`);
 const saved=await pg.evaluate(async()=>{ const d=await window.Store.exportAll(); return (d.settings['phone-back-google']||{}).v||''; });
 chk(/戊五範例有限公司/.test(saved) && /02 2345 6789/.test(saved), `存進同步的設定 phone-back-google：${saved.slice(0,80)}`);
 chk(/之前找不到電話的 1 家/.test(await pg.textContent('#phoneBackBar')), `名單上方提醒：${await pg.textContent('#phoneBackBar')}`);
 const tombs=await pg.evaluate(async()=>Object.keys((await window.Store.getTombstones()).companies||{}));
 chk(tombs.some(k=>/55555555/.test(k)), '只提醒，沒自動放回名單');
 const pb2=await pg.evaluate(()=>window.phoneBackGoogle());
 chk(pb2 && pb2.tried===0 && pb2.kept===1 && asked.length===before+1, `再叫一次：以前查到的留著、不重查：${JSON.stringify(pb2)}`);
 // 已排除的公司那頁看得到 Google 查到的電話與對到的店名
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]').catch(()=>null); await pg.click('[data-act="excluded"]'); await pg.waitForTimeout(400);
 const ex=(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 chk(/戊五範例有限公司/.test(ex) && /Google 地圖/.test(ex), `「已排除的公司」標出 Google 查到的：${ex.match(/戊五.{0,80}/)?.[0]}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
