// 後台挑每日新名單的接點（版本 321；tools/feed-drive.mjs 用無頭瀏覽器開網站叫這幾個）：
// dailyFeed({ force, awaitPhones }) 回摘要（挑了幾家、沒電話跳過幾家、補電話的結果），排滿回 full、放假回 holiday；
// phoneBackGoogle()：「找不到電話」收起來的公司用 Google 地圖再查一次，查到存進會同步的設定、名單上方只提醒。
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
];
const LCSV='﻿'+[LHEAD,...LROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const LINDEX={latest:'11508',generatedAt:'2026-09-26T17:00:00.000Z',periods:{'11508':{generatedAt:'2026-09-26T17:00:00.000Z',period:'11508',files:[{city:'新北市',type:'change',path:'11508/新北市-change.csv',rows:3,capitalUp:3}]}}};
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
 await pg.goto('http://localhost:9635/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk(await pg.evaluate(()=>typeof window.dailyFeed==='function' && typeof window.runSync==='function' && typeof window.phoneBackGoogle==='function'), '後台用的掛點都在（dailyFeed、runSync、phoneBackGoogle）');

 // 自動挑關著（daily-feed-auto=0），後台用 force 叫：回摘要、等補電話跑完
 const res=await pg.evaluate(()=>window.dailyFeed({force:true,awaitPhones:true}));
 chk(res && res.picked===2 && res.skippedNoPhone===1 && res.day===TODAY && res.quota===3 && res.bySrc && res.bySrc['登記清冊']===2, `摘要：挑 2 家、沒電話跳過 1 家：${JSON.stringify(res)}`);
 chk(res && res.phones && res.phones.trade && typeof res.phones.trade.tried==='number' && res.phones.google && typeof res.phones.google.tried==='number', `補電話的結果一起回（awaitPhones）：${JSON.stringify(res && res.phones)}`);
 const fed=await pg.evaluate(()=>window.customerViews().filter(v=>/^每日新名單/.test(v.source)).map(v=>v.company+'|'+v.phones.map(p=>String(p.digits||p.dial||p.display||'').replace(/\D/g,'')).join(',')).sort());
 chk(fed.length===2 && fed[0]==='乙二機械股份有限公司|0229902222' && fed[1]==='甲一精密有限公司|0212345678', `進來的 2 家電話都填好：${fed.join(' / ')}`);
 chk((await pg.evaluate(()=>localStorage.getItem('daily-feed-on')))===TODAY, '今天挑過了的記號有記（會同步，使用者開網站不再挑）');
 const again=await pg.evaluate(()=>window.dailyFeed({force:true,awaitPhones:true}));
 chk(again && again.picked===0 && again.skippedNoPhone===1 && again.have===2, `再叫一次：還缺 1 家，候選只剩沒電話的那家，跳過、沒補：${JSON.stringify(again)}`);
 await pg.evaluate(()=>localStorage.setItem('new-quota','2'));
 const full=await pg.evaluate(()=>window.dailyFeed({force:true}));
 chk(full && full.full===true && full.picked===0 && full.have===2 && full.quota===2, `額度 2、已有 2 家：回 full，不重挑：${JSON.stringify(full)}`);
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
