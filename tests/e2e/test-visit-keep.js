// 約了拜訪的那天不被挪走（使用者：「為什麼我今天有一個利昇的拜訪消失了？」「我希望能夠看到我的那天拜訪資訊」）：
// 「今天的 N 家挪到…」不挪約了今天拜訪的；行事曆今天照樣列
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9615);
const TODAY='2026-10-06';
const mk=(id,company)=>({id,source:'測試',company,aliases:[],taxId:'',grade:'',founded:'',capital:'',phoneRaw:'02-2222-0000',phones:[{raw:'02-2222-0000',display:'02-2222-0000',tel:'0222220000'}],owner:'',keyman:'',industry:'',nextDate:TODAY,lastDate:'2026-09-01',addedDate:'2026-09-01',country:'台灣',address:'新北市新莊區中正路1號',addressActual:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D;
   try{localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){} }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9615/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); const now=Date.now();
   for (const r of recs) await window.Store.setState({recordId:r.id,outcome:'contacted',lastDate:'2026-09-01',nextDate:'2026-10-06',updatedAt:now});
   await window.Store.addLog({recordId:'v1',date:'2026-10-01',text:'約好今天下午過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-06',meetingArrive:'14:00',createdAt:now-1e6});
   await window.Store.addLog({recordId:'v1',date:'2026-10-03',text:'再確認一次時間',outcome:'contacted',createdAt:now-5e5}); },
   [mk('v1','拜訪範例有限公司'),mk('c1','電話甲有限公司'),mk('c2','電話乙有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);
 await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); }));
 const txt=(await pg.textContent('#feedBar')).replace(/\s+/g,' ');
 chk(/今天的 2 家挪到/.test(txt), `「挪到」只算要打電話的 2 家，不算約了拜訪的：${txt}`);
 await pg.click('#feedDefer'); await pg.waitForTimeout(300); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(900);
 const nd=await pg.evaluate(()=>Object.fromEntries(window.customerViews().map(v=>[v.id,v.nextDate])));
 chk(nd.v1==='2026-10-06' && nd.c1==='2026-10-07' && nd.c2==='2026-10-07', `拜訪那家留在今天，電話的挪到明天：${JSON.stringify(nd)}`);
 await pg.evaluate(()=>window.openCalendar('2026-10-06')); await pg.waitForTimeout(600);
 chk(/拜訪範例有限公司/.test(await pg.textContent('#paneCal')), '行事曆今天照樣看得到這個拜訪');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
