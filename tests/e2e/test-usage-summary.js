// 使用統計＋摘要檔（使用者：「我不常用的功能有哪些？」→「可以」）：按鈕只記「哪一區＋按鈕上的字」與次數，
// 公司名稱、地址、電話不記；同步成功後寫一個小摘要檔（每台裝置一個），裡面沒有公司名稱、電話
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9621);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){}
   window.__summaries=[]; });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9621/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
 await pg.fill('#kvPaste','公司名稱：甲範例精密有限公司\n電話：02-2222-0001\n地址：新北市新莊區中正路1號'); await pg.waitForTimeout(150);
 await pg.click('#editorBody button:has-text("新增")'); await pg.waitForTimeout(700);
 await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); })); await pg.waitForTimeout(200);

 await pg.click('.tab[data-tab="cal"]'); await pg.waitForTimeout(300);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(200);
 await pg.click('#cards .card-name'); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody button:has-text("編輯資料")'); await pg.waitForSelector('#editor h2'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 const u=await pg.evaluate(()=>JSON.parse(localStorage.getItem('usage-counts')||'{}'));
 const m=Object.values(u)[0]||{}; const keys=Object.keys(m);
 chk(m['分頁:cal']===1 && m['分頁:all']>=1 && m['詳細頁:編輯資料']===1, `記到按鈕：${keys.join('、')}`);
 chk(!keys.some(k=>/甲範例|中正路|0001/.test(k)), '公司名稱、地址、電話不記');
 chk(await pg.evaluate(()=>window.usageKey(Object.assign(document.createElement('button'),{textContent:'乙範例實業有限公司'})))==='', '按鈕上是公司名稱的不記');
 // 「」裡的人名、冒號後面的公司名也不記（以前漏掉：查負責人「某某」名下的公司、✓ 🚗：某某自行車）
 const k2=await pg.evaluate(()=>[window.usageKey(Object.assign(document.createElement('button'),{textContent:'🔍 查負責人「王大明」名下的公司'})), window.usageKey(Object.assign(document.createElement('button'),{textContent:'✓ 🚗 : 丙範例自行車業'}))]);
 chk(!/王大明|丙範例/.test(k2.join('|')) && /查負責人/.test(k2[0]), `名字拿掉再記：${k2.join('、')}`);
 chk(await pg.evaluate(()=>window.usageKeyOk('視窗:🔍 查負責人「王大明」名下的公')===false && window.usageKeyOk('詳細頁:刪除這筆')===true), '以前記到名字的鍵，寫摘要時濾掉');
 // 版本 324：摘要檔裡出現過「…企業」「…裝修」結尾的公司名（不是企業社、沒有「有限公司」），也不記；「連結其他公司」這種按鈕照記
 chk(await pg.evaluate(()=>window.usageKey(Object.assign(document.createElement('button'),{textContent:'丁範例室內裝修規劃企業'}))==='' && window.usageKeyOk('詳細頁:戊範例企業')===false && window.usageKeyOk('詳細頁:連結其他公司')===true), '「…企業」結尾的公司名不記');

 // 同步成功 → 寫摘要檔（假的雲端硬碟）
 await pg.evaluate(()=>{ const D=window.DriveSync; D.isConfigured=()=>true; D.sync=async()=>({gained:{records:0,logs:0}}); D.writeSummary=async(name,obj)=>{ window.__summaries.push({name,obj}); return 'id'; }; });
 await pg.keyboard.press('Escape'); await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); }));
 await pg.evaluate(()=>{ document.querySelector('#btnSync').hidden=false; }); await pg.click('#btnSync'); await pg.waitForTimeout(1500);
 const s=await pg.evaluate(()=>window.__summaries);
 chk(s.length===1 && /^電話推廣名單-摘要-[^-]+-(App|瀏覽器)-[a-z0-9]+\.json$/.test(s[0].name), `同步後寫摘要檔：${s.map(x=>x.name).join('、')}`);
 const o=s[0]&&s[0].obj||{};
 chk(o.customers===1 && o.funnel && o.funnel.byOrigin && o.logsByMonth && o.usage && o.settings && typeof o.settings.mainCap==='number', `摘要內容：${Object.keys(o).join('、')}`);
 const txt=JSON.stringify(o);
 chk(!/甲範例|中正路|2222/.test(txt) && txt.length<20000, `摘要裡沒有公司名稱、地址、電話，而且很小（${txt.length} 字）`);
 await pg.click('#btnSync'); await pg.waitForTimeout(1200);
 chk((await pg.evaluate(()=>window.__summaries.length))===1, '半小時內不重寫');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
