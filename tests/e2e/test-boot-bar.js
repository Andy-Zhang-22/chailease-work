// 版本 449（使用者 11/20 手機打開名單是空的、只剩「0」和「—」：「為什麼」→「開始做」）：
// 程式沒跑起來時留一行不會消失的字＋「重新載入」，不要讓人以為名單不見了。
// 1. 正常開：那一行不出現
// 2. 主程式沒載到：馬上留一行；按「重新載入」後名單回來、那一行收掉
// 3. 啟動到一半出錯（少一個元件）：留一行，寫得出原因
// 4. 有程式檔沒載到但名單照樣出來：那一行收掉，不擋畫面
// 5. 程式檔一直載不完：10 秒後留一行
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9644);
const URL0='http://localhost:9644/index.html';
const SEED=[{id:'1',source:'A.csv',company:'甲範例精密有限公司',aliases:[],taxId:'11111111',grade:'',founded:'2020',capital:'20,000',phoneRaw:'02-0000-1234',
  phones:[{digits:'0200001234',display:'02-0000-1234',ext:''}],address:'新北市新莊區中正路1號',industry:'其他金屬製品製造',notesRaw:''}];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:420,height:900},serviceWorkers:'block'});
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); pg.on('dialog',d=>d.accept());
 const barShown=()=>pg.evaluate(()=>!document.getElementById('bootBar').hidden);
 const barText=async()=>(await pg.textContent('#bootMsg')).trim();
 const cards=()=>pg.locator('#cards .card').count();

 // 1. 正常開
 await pg.goto(URL0); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },SEED);
 await pg.reload(); await pg.waitForSelector('#cards .card');
 chk(!(await barShown()) && (await cards())===1, '正常開：名單出來，「還沒載入完成」那一行不出現');

 // 2. 主程式沒載到
 await ctx.route('**/assets/js/app.js*',r=>r.abort());
 await pg.goto(URL0); await pg.waitForTimeout(800);
 const t2=await barText();
 chk((await barShown()) && /有檔案沒載到/.test(t2) && /重新載入/.test(t2) && (await cards())===0 && (await pg.textContent('#listSummary')).trim()==='—',
   `主程式沒載到：畫面是空殼（—），馬上留一行：${t2}`);
 await pg.waitForTimeout(4000);
 chk(await barShown(), '那一行不會自己消失');
 await ctx.unroute('**/assets/js/app.js*');
 await pg.click('#btnBootReload'); await pg.waitForSelector('#cards .card');
 chk(!(await barShown()) && (await cards())===1, '按「重新載入」：名單回來，那一行收掉');

 // 3. 啟動到一半出錯：少了讀 PDF 的元件，init 第一步就丟錯
 await ctx.route('**/assets/vendor/pdfjs/pdf.min.js*',r=>r.abort());
 await pg.goto(URL0); await pg.waitForTimeout(1200);
 const t3=await barText();
 chk((await barShown()) && /沒有啟動成功（.+）/.test(t3) && /重新載入/.test(t3) && (await cards())===0, `啟動到一半出錯：留一行、寫得出原因：${t3}`);
 await ctx.unroute('**/assets/vendor/pdfjs/pdf.min.js*');

 // 4. 有程式檔沒載到、但名單照樣出來（辨識圖片的元件，用到才需要）：不擋畫面
 await ctx.route('**/assets/vendor/tesseract/**',r=>r.abort());
 await pg.goto(URL0); await pg.waitForSelector('#cards .card'); await pg.waitForTimeout(300);
 chk(!(await barShown()) && (await cards())===1, '少一個用到才需要的元件、名單照樣出來：那一行收掉');
 await ctx.unroute('**/assets/vendor/tesseract/**');

 // 5. 程式檔一直載不完（連得上但不回應）：10 秒後留一行
 const stuck=[]; await ctx.route('**/assets/js/app.js*',r=>{ stuck.push(r); });
 await pg.goto(URL0,{waitUntil:'commit'}); await pg.waitForSelector('#bootBar',{state:'attached'});
 await pg.waitForTimeout(6000);
 const early=await barShown();
 await pg.waitForTimeout(5000);
 const t5=await barText();
 chk(!early && (await barShown()) && /還沒載入完成/.test(t5) && /重新載入/.test(t5), `一直載不完：前 6 秒不吵，10 秒後留一行：${t5}`);
 await ctx.unroute('**/assets/js/app.js*'); stuck.forEach((r)=>{ r.abort().catch(()=>{}); });

 console.log(bad?`有 ${bad} 項沒過`:'全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
