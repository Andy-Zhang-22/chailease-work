// 今日覆盤（使用者：「幫我總結我今天在系統上做了什麼事的每日覆盤，比如我聯絡了幾間客戶、對談重點」、「訪談的內容摘要可以幫我也重點出來」）
// ＋詳細頁的實收資本額直接顯示（「實收資本額也不要收在下面」）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9541);
const TODAY='2026-10-05';   // 週一
const mk=(id,company,extra)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:'2000000'+id,grade:'',founded:'2018',capital:'30,000',capitalPaid:'25,000',phoneRaw:'02-2222-333'+id,phones:[{digits:'022222333'+id,ext:'',note:''}],owner:'王O明',keyman:'',industry:'金屬加工',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:TODAY,lastDate:'2026-09-20',addedDate:'2026-09-01'},extra);
const SEED=[mk('1','星辰精密有限公司'),mk('2','晨光貿易有限公司'),mk('3','未接一有限公司'),mk('4','禁打有限公司'),mk('5','還沒打有限公司'),mk('6','明天的有限公司',{nextDate:'2026-10-06'}),mk('7','今天加的有限公司',{addedDate:TODAY,nextDate:'2026-10-06'})];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T17:30:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}
   window.__copied=[]; window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return null;};
   try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied.push(t);}},configurable:true}); }catch(e){} });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9541/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({seed,today})=>{ await window.Store.saveRecords(seed);
   const now=Date.now();
   await window.Store.addLog({recordId:'1',date:today,text:'老闆有興趣，要買 CNC 設備約 800 萬，預算明年初\n下一步：週四前寄報價',outcome:'contacted',createdAt:now-5e6});
   await window.Store.addLog({recordId:'2',date:today,text:'',outcome:'noanswer',createdAt:now-4e6});
   await window.Store.addLog({recordId:'2',date:today,text:'老闆在大陸，10/15 回台再約',outcome:'contacted',meeting:true,meetingDate:'2026-10-15',meetingArrive:'10:30',createdAt:now-3e6});
   await window.Store.addLog({recordId:'3',date:today,text:'',outcome:'noanswer',createdAt:now-2e6});
   await window.Store.addLog({recordId:'4',date:today,text:'已有往來銀行，請不要再打',outcome:'blocked',createdAt:now-1e6});
   await window.Store.addLog({recordId:'5',date:'2026-10-02',text:'上週五打過',outcome:'contacted',createdAt:now-9e8});
   await window.Store.setState({recordId:'1',chance:'yes',chanceAt:now-4e6,outcome:'contacted',lastDate:today,nextDate:'2026-10-08'});
   await window.Store.setState({recordId:'2',outcome:'contacted',lastDate:today,nextDate:'2026-10-15'});
   await window.Store.setState({recordId:'3',outcome:'noanswer',lastDate:today,nextDate:'2026-10-06'});
   await window.Store.setState({recordId:'5',outcome:'contacted',lastDate:'2026-10-02',nextDate:today});
   await window.Store.setState({recordId:'4',outcome:'blocked',lastDate:today,nextDate:null});
 },{seed:SEED,today:TODAY});
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);

 const d=await pg.evaluate(()=>window.dailyReview());
 chk(d.companies.length===4 && d.calls===5 && d.reached===2 && d.missed===1 && d.blocked===1, `聯絡 4 家、打 5 通、接通 2、未接 1、禁止推廣 1：${JSON.stringify({n:d.companies.length,calls:d.calls,r:d.reached,m:d.missed,b:d.blocked})}`);
 const pt=Object.fromEntries(d.companies.map(c=>[c.company,c.points]));
 chk(pt['星辰精密有限公司']==='老闆有興趣，要買 CNC 設備約 800 萬，預算明年初｜下一步：週四前寄報價', `星辰的重點：第一句＋下一步：${pt['星辰精密有限公司']}`);
 chk(pt['晨光貿易有限公司']==='老闆在大陸，10/15 回台再約', `晨光先未接後接通算接通、重點只抓有寫字的：${pt['晨光貿易有限公司']}`);
 chk(JSON.stringify(d.chance)==='["星辰精密有限公司"]' && d.meetings===1, `今天標有機會、約到拜訪：${JSON.stringify(d.chance)} / ${d.meetings}`);
 chk(d.left===1 && d.tomorrow===3 && d.added===1 && d.next==='2026-10-06', `還剩 1 家沒打、明天 3 家、今天加 1 家：${JSON.stringify({l:d.left,t:d.tomorrow,a:d.added,n:d.next})}`);
 const pts=await pg.evaluate(()=>window.dailyReview('2026-10-02'));
 chk(pts.companies.length===1 && pts.left===null, '挑別天：只算那天的，不算「還剩幾家」');

 // 選單打開
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="review"]'); await pg.waitForSelector('#editorBody .review');
 const txt=(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 chk(/聯絡了 4 家（打了 5 通）：接通 2、未接 1、禁止推廣 1/.test(txt) && /對談重點（接通 2 家）/.test(txt) && /未接：未接一有限公司/.test(txt) && /約到拜訪：晨光貿易有限公司（10\/15 10:30 抵達）/.test(txt), `畫面：${txt.slice(0,300)}`);
 await pg.click('#editorBody button:has-text("複製")>>nth=0'); await pg.waitForTimeout(200);
 const c1=await pg.evaluate(()=>window.__copied[window.__copied.length-1]||'');
 chk(/2026\/10\/05 覆盤/.test(c1) && /・星辰精密有限公司　老闆有興趣/.test(c1) && /10\/06 排了 3 家/.test(c1), `複製的純文字：${c1.slice(0,200)}`);
 await pg.click('#editorBody button:has-text("複製給 Claude 整理")'); await pg.waitForTimeout(200);
 const c2=await pg.evaluate(()=>window.__copied[window.__copied.length-1]||''); const op=await pg.evaluate(()=>window.__opened);
 chk(/請用繁體中文幫我/.test(c2) && /■ 星辰精密有限公司（接通；成立 2018、資本額 30,000 仟元、金屬加工）/.test(c2) && /要買 CNC 設備約 800 萬/.test(c2) && !/0222223331|02-2222-3331|王O明/.test(c2) && op[0]==='https://claude.ai/new', `給 Claude 的：完整內容、不附電話與負責人、開 Claude：${op} ${c2.slice(0,160)}`);
 // 點公司名打開詳細頁；實收資本額直接顯示
 await pg.click('#editorBody .review-points .link-btn:has-text("星辰")'); await pg.waitForSelector('#drawerBody h2');
 const order=await pg.evaluate(()=>[...document.querySelectorAll('#drawerBody > dl.detail-grid > dt')].map(x=>x.textContent.trim()));
 chk(order.indexOf('實收資本額')===order.indexOf('資本總額')+1, `實收資本額直接顯示、在資本總額下面：${order.join('、')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
