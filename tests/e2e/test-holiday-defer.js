// 放假那天（颱風假）排著的全部挪到下個上班日（版本 373）：後台叫 window.holidayDefer()；固定的、禁止推廣的、今天處理過的、約了拜訪的不動
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9597);
const TODAY='2026-10-23';   // 週五；颱風假從 leads/holidays-extra.json 讀進來；10/24、25 週末，10/26 補假 → 10/27
const mk=(i)=>({id:`r${i}`,source:'A.csv',company:`主力${i}有限公司`,aliases:[],taxId:String(20000000+i),grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:TODAY,lastDate:'2026-09-01',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/holidays-extra.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({'2026-10-23':'颱風假（新北市停止上班）'})}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9597/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('auto-rebalance','0');
   const now=Date.now();
   for (const r of recs) await window.Store.setState({recordId:r.id,outcome:r.id==='r3'?'blocked':'contacted',blocked:r.id==='r3',lastDate:r.id==='r4'?'2026-10-23':'2026-09-01',nextDate:'2026-10-23',pinDate:r.id==='r2',updatedAt:now});
   await window.Store.addLog({recordId:'r5',date:'2026-10-20',text:'約好颱風天過去（測試）',outcome:'contacted',meeting:true,meetingDate:'2026-10-23',createdAt:now-1e6}); },
   [1,2,3,4,5,6].map(mk));
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);
 const h=await pg.evaluate(()=>({ name: window.Holidays.holidayName('2026-10-23'), work: window.Holidays.isWorkday('2026-10-23') }));
 chk(h.name==='颱風假（新北市停止上班）' && h.work===false, `颱風假從 leads/holidays-extra.json 讀進來：${JSON.stringify(h)}`);
 const bar=await pg.textContent('#feedBar').catch(()=>'')||await pg.evaluate(()=>document.body.innerText);
 chk(/今天放假（颱風假/.test(bar), '首頁上方講今天放假');
 const btn=await pg.locator('#feedDefer').textContent().catch(()=>'');
 chk(/今天的 2 家挪到 2026\/10\/27/.test(btn), `放假那天也有「挪到下個上班日」的按鈕，只算可以挪的 2 家：${btn}`);
 const r=await pg.evaluate(()=>window.holidayDefer());
 chk(r.moved===2 && r.next==='2026-10-27', `後台叫 holidayDefer：挪了 ${r.moved} 家到 ${r.next}`);
 const v=await pg.evaluate(()=>Object.fromEntries(window.customerViews().map(x=>[x.id,x.nextDate])));
 chk(v.r1==='2026-10-27' && v.r6==='2026-10-27', `一般的挪到 10/27：r1 ${v.r1}、r6 ${v.r6}`);
 chk(v.r2==='2026-10-23' && v.r3==='2026-10-23' && v.r4==='2026-10-23' && v.r5==='2026-10-23', `固定的、禁止推廣的、今天處理過的、約了拜訪的不動：${v.r2} ${v.r3} ${v.r4} ${v.r5}`);
 const again=await pg.evaluate(()=>window.holidayDefer());
 chk(again.moved===0, '再跑一次沒有東西可挪');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
