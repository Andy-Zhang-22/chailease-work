// 每日新名單只進有電話的（版本 318；使用者：「你給我的新名單有些沒電話，都會刪掉許多」）：
// 沒電話的先用 Google 地圖查一次（名稱、地址都對得上才算），查不到就跳過換下一家；跳過的不刪、不排除。
// 登記清冊三家都沒電話：甲在貿易署電話表、乙 Google 查得到、丙查不到 → 進甲、乙，丙跳過；Google 只查乙、丙，各一次。
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9633);
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
const SEED=[{id:'1',source:'A.csv',company:'主力客戶一有限公司',aliases:[],taxId:'99999991',grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'2026-10-20',lastDate:'',addedDate:'2026-09-01'}];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('new-quota','3'); localStorage.setItem('places-api-key','AIzaSyTESTKEY00000000000000000000000');}catch(e){}});
 const asked=[];
 await ctx.route('https://places.googleapis.com/**',async(r)=>{ const qq=JSON.parse(r.request().postData()).textQuery; asked.push(qq);
   const places=/乙二/.test(qq)?[{id:'p2',displayName:{text:'乙二機械股份有限公司'},formattedAddress:'243新北市泰山區中港西路2號',nationalPhoneNumber:'02 2990 2222'}]:[];
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
 await pg.goto('http://localhost:9633/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(6000);
 const fed=await pg.evaluate(()=>window.customerViews().filter(v=>/^每日新名單/.test(v.source)).map(v=>v.company+'|'+v.phones.map(p=>String(p.digits||p.dial||p.display||'').replace(/\D/g,'')).join(',')).sort());
 chk(fed.length===2 && fed[0]==='乙二機械股份有限公司|0229902222' && fed[1]==='甲一精密有限公司|0212345678', `額度 3 只進有電話的 2 家，電話一起填好：${fed.join(' / ')}`);
 chk(!asked.some(x=>/甲一/.test(x)) && asked.filter(x=>/乙二/.test(x)).length===1 && asked.filter(x=>/丙三/.test(x)).length===1, `Google 只查沒電話的，各查一次（挑名單前查過的匯入後不再查）：${asked.join(' | ')}`);
 const tombs=await pg.evaluate(async()=>Object.keys((await window.Store.getTombstones()).companies||{}));
 chk(!tombs.some(k=>/33333333|丙三/.test(k)), '跳過的丙三沒被排除，下個月有電話了還會被挑到');
 const mix=await pg.evaluate(async()=>(await window.mixCandidates()).map(x=>x.name));
 chk(mix.includes('丙三工程有限公司'), `丙三還在合併頁：${mix.join('、')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
