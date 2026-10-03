// 篩選「有沒有機會」：同老闆連結的關係企業算一家（使用者：「這個標注裡，有幾間是關係企業不要重複計算，會有錯覺」）；
// 點下去篩出來的名單照舊列每一家
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9521);
const TODAY='2026-10-05';
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'王大明',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:'2026-10-20',lastDate:'2026-09-01',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9521/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 甲乙丙同一組（同老闆），整組標有機會；丁自己標有機會；戊無機會；己未判斷
 await pg.evaluate(async({r,now})=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0');
   for (const id of ['1','2','3']) await window.Store.setState({recordId:id,group:'g1',groupIds:['1','2','3'],groupAt:now,outcome:'contacted',lastDate:'2026-09-01',nextDate:'2026-10-20',updatedAt:now});
   await window.Store.setState({recordId:'1',group:'g1',groupIds:['1','2','3'],groupAt:now,outcome:'contacted',lastDate:'2026-09-01',nextDate:'2026-10-20',chance:'yes',chanceAt:now,updatedAt:now});
   await window.Store.setState({recordId:'4',outcome:'contacted',lastDate:'2026-09-01',nextDate:'2026-10-20',chance:'yes',chanceAt:now,updatedAt:now});
   await window.Store.setState({recordId:'5',outcome:'contacted',lastDate:'2026-09-01',nextDate:'2026-10-20',chance:'no',chanceAt:now,updatedAt:now}); },
   {r:[mk('1','甲關係有限公司','10000001'),mk('2','乙關係有限公司','10000002'),mk('3','丙關係有限公司','10000003'),mk('4','丁獨立有限公司','10000004'),mk('5','戊無機會有限公司','10000005'),mk('6','己未判斷有限公司','10000006')], now:Date.now()});
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const yes=await pg.evaluate(()=>window.customerViews().filter(v=>v.chance==='yes').map(v=>v.company).sort().join('|'));
 chk(yes==='丁獨立有限公司|丙關係有限公司|乙關係有限公司|甲關係有限公司'.split('|').sort().join('|'), `整組共用有機會（四家是 yes）：${yes}`);
 const chips=await pg.$$eval('#fltChance .chip',a=>a.map(x=>x.textContent.replace(/\s+/g,'')).join('|'));
 chk(chips==='2有機會|1無機會|1未判斷', `關係企業算一家：甲乙丙算 1、丁 1 → 有機會 2：${chips}`);
 chk(/關係企業算一家/.test(await pg.textContent('.filter-group[data-group="chance"] label')), '標題講明關係企業算一家');
 await pg.locator('#fltChance .chip:has-text("有機會")').first().click(); await pg.waitForTimeout(300);
 const names=await pg.$$eval('#cards .card .card-name',a=>a.length);
 chk(names===4, `點下去照舊列每一家：${names} 家`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
