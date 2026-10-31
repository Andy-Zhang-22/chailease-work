// 本機今天跑了沒（版本 401）：名單上方一行「104：hh:mm 查了 N 家、N 家徵才、加了 N 家｜標案：hh:mm 抓了，資料到 yyyy/mm/dd」；
// 沒跑的講明「104 今天還沒查（最近 …）」「標案今天還沒抓（資料到 …）」；從來沒查過 104、也沒標案資料就整行不顯示
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9641);
const TODAY='2026-10-27';   // 週二
const mk=(i,src)=>({id:`r${i}`,source:src||'A.csv',company:`主力${i}有限公司`,aliases:[],taxId:String(20000000+i),grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-10-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({timezoneId:'Asia/Taipei'});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T14:00:00+08:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 let pcc=null;
 await ctx.route('**/leads/**',r=>{ if(/leads\/pcc\/index\.json/.test(r.request().url())&&pcc) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(pcc)}); r.fulfill({status:404,body:''}); });
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9641/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({recs})=>{ await window.Store.saveRecords(recs); ['registry-auto','daily-feed-auto','leads-hunt','auto-rebalance'].forEach(k=>localStorage.setItem(k,'0')); },{recs:[1,2].map((i)=>mk(i))});
 const line=async()=>{ await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200); return pg.evaluate(()=>{ const d=document.querySelector('#feedBar .feed-devices'); return d?d.textContent:''; }); };
 // 1. 從來沒查過 104、沒標案資料：整行不顯示
 const t0=await line();
 chk(t0==='' && (await pg.locator('#feedBar .feed-devices[hidden]').count())===1, `沒跑過就不顯示：「${t0}」`);
 // 2. 今天 13:50 查了 3 家、2 家有徵才、加進 1 家；標案今天 09:29 抓的、資料到 10/26
 const at=new Date(`${TODAY}T13:50:00+08:00`).getTime();
 pcc={generatedAt:`${TODAY}T01:29:48.403Z`,cities:['新北市'],days:180,total:1466,withPhone:1466,latestDate:'2026-10-26',files:[{path:'pcc.csv',rows:1466}]};
 await pg.evaluate(async({at,rec})=>{ await window.Store.setSetting('hiring-results', JSON.stringify({at,list:[{key:'20000011',count:3,at},{key:'20000012',count:0,at},{key:'20000013',count:1,at}]})); await window.Store.saveRecords([rec]); },{at,rec:mk(3,`每日新名單-${TODAY}-104.csv`)});
 const t1=await line();
 chk(t1==='104：13:50 查了 3 家、2 家徵才、加了 1 家｜標案：09:29 抓了，資料到 2026/10/26', `今天都跑了：「${t1}」`);
 // 3. 104 昨天查的、標案前天抓的：講明今天還沒跑
 const y=new Date(`2026-10-26T13:50:00+08:00`).getTime();
 pcc={generatedAt:'2026-10-25T01:29:48.403Z',cities:['新北市'],days:180,total:1400,withPhone:1400,latestDate:'2026-10-24',files:[{path:'pcc.csv',rows:1400}]};
 await pg.evaluate(async({at})=>{ await window.Store.setSetting('hiring-results', JSON.stringify({at,list:[{key:'20000011',count:3,at}]})); },{at:y});
 const t2=await line();
 chk(t2==='104 今天還沒查（最近 2026/10/26）｜標案今天還沒抓（資料到 2026/10/24）', `今天還沒跑：「${t2}」`);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
