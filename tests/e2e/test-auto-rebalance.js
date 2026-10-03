// 每天第一次開網站自動照上限重排（使用者：「為什麼這個還是超過主力名單的限制？」→ 選 1）：
// 主力超過上限的那天，把最不急的往後推；固定的、約到拜訪的不動；一天只跑一次；可以復原；可以關掉
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9522);
const TODAY='2026-10-05';   // 週一
const mk=(i)=>({id:`r${String(i).padStart(2,'0')}`,source:'A.csv',company:`主力${String(i).padStart(2,'0')}有限公司`,aliases:[],taxId:String(10000000+i),grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:TODAY,lastDate:'2026-09-01',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9522/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 今天排了 18 家主力（上限 15）：r01 固定、r02 約到拜訪今天 → 不動；其餘 16 家裡留 13 家
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('main-cap','15');
   const now=Date.now();
   for (const r of recs) await window.Store.setState({recordId:r.id,outcome:'contacted',lastDate:'2026-09-01',nextDate:'2026-10-05',pinDate:r.id==='r01',updatedAt:now});
   await window.Store.addLog({recordId:'r02',date:'2026-10-01',text:'約好週一過去',outcome:'contacted',meeting:true,meetingDate:'2026-10-05',createdAt:now-1e6}); },
   Array.from({length:18},(_,i)=>mk(i+1)));
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(2000);
 const day=async()=>pg.evaluate(()=>{ const v=window.customerViews(); return { today:v.filter(x=>x.nextDate==='2026-10-05').map(x=>x.id), next:v.filter(x=>x.nextDate==='2026-10-06').length }; });
 let d=await day();
 chk(d.today.length===15 && d.next===3, `一開網站就把超過的 3 家推到明天：今天 ${d.today.length}、明天 ${d.next}`);
 chk(d.today.includes('r01') && d.today.includes('r02'), `固定的、約到拜訪的不動：${JSON.stringify(await pg.evaluate(()=>window.customerViews().filter(x=>x.nextDate==='2026-10-06').map(x=>x.id+':'+x.pinDate)))}`);
 chk(/已自動把 3 家最不急的往後挪/.test(await pg.textContent('#toast')), `提示：${await pg.textContent('#toast')}`);
 chk((await pg.evaluate(()=>localStorage.getItem('auto-rebalance-on')))==='2026-10-05', '記下今天跑過了');
 // 復原
 await pg.click('#btnMenu'); await pg.click('[data-act="spread-undo"]'); await pg.waitForTimeout(800);
 d=await day();
 chk(d.today.length===18 && d.next===0, `選單復原：今天回到 18：${d.today.length}`);
 // 一天只跑一次：重開不會再挪
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(2000);
 d=await day();
 chk(d.today.length===18, `同一天重開不再自動挪：${d.today.length}`);
 // 關掉：明天也不跑
 await pg.click('#btnMenu'); await pg.click('[data-act="day-load"]'); await pg.waitForSelector('#editorBody .auto-rebalance');
 chk(await pg.isChecked('#editorBody .auto-rebalance'), '每天打得完幾家有開關、預設開');
 await pg.uncheck('#editorBody .auto-rebalance'); await pg.waitForTimeout(200);
 chk((await pg.evaluate(()=>localStorage.getItem('auto-rebalance')))==='0', '關掉存起來');
 await pg.evaluate(()=>{ localStorage.removeItem('auto-rebalance-on'); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(2000);
 d=await day();
 chk(d.today.length===18, `關掉之後不會自動挪：${d.today.length}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
