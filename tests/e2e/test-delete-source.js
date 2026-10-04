// 刪掉整份名單之後，那些公司不可以被下一份名單原封不動帶回來。
// 但「匯錯檔案」也是刪整份，那時候那些公司之後還要——所以刪的時候要問清楚。
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9443);

const HEAD='公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家';
const csv=(rows)=>Buffer.from('﻿'+[HEAD,...rows].join('\n'),'utf8');
const 甲='甲工程有限公司,11111111,A,2010,"5,000",02-1111-1111,王甲,,營造業,,,,"新北市新莊區甲路1號",2026/09/01,';
const 乙='乙精密股份有限公司,22222222,B,2015,"8,000",02-2222-2222,李乙,,金屬加工,,,,"臺北市信義區乙路2號",2026/09/01,';
const 丙='丙全新有限公司,33333333,A,2020,"6,000",02-3333-3333,陳丙,,食品業,,,,"新北市三重區丙路3號",2026/09/01,';
const 九月=csv([甲,乙]);
const 十一月=csv([甲,乙,丙]);   // 下一份名單，甲乙又出現了

const load=(pg,buf,name)=>pg.setInputFiles('#filePick',{name,mimeType:'text/csv',buffer:buf});
const names=(pg)=>pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent.trim()).sort());
const dup=async(pg)=>{ const box=pg.locator('#editorBody h2:has-text("有重複的公司")');
  if(await box.count()){ await pg.click('#editorBody button:has-text("以新檔案覆蓋")'); await pg.waitForTimeout(2500); } };

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 const pg=await ctx.newPage({viewport:{width:1100,height:1400}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 pg.on('dialog',d=>d.accept());

 const delSource=async(file,choice)=>{
   await pg.click('#btnMenu'); await pg.click('[data-act="manage"]');
   await pg.waitForSelector('.ask-overlay');
   await pg.click(`.ask-overlay button:has-text("${file}")`);
   await pg.waitForSelector('.ask-overlay .ask-list .btn');
   const text=(await pg.textContent('.ask-overlay .ask-text')).replace(/\s+/g,' ');
   if(choice===null){ await pg.click('.ask-overlay .ask-actions .btn:has-text("取消")'); }
   else { await pg.click(`.ask-overlay button:has-text("${choice}")`); }
   await pg.waitForTimeout(1200);
   return text;
 };
 const tombs=()=>pg.evaluate(async()=>{const t=await window.Store.getTombstones();
   return {sources:Object.keys(t.sources||{}),companies:Object.keys(t.companies||{}),logs:Object.keys(t.logs||{}).length};});

 await pg.goto('http://localhost:9443/index.html'); await pg.waitForSelector('#dropzone');
 await pg.evaluate(()=>localStorage.setItem('registry-auto','0'));
 await load(pg,九月,'九月名單.csv'); await pg.waitForTimeout(2500);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(600);
 chk(JSON.stringify(await names(pg))==='["乙精密股份有限公司","甲工程有限公司"]', `九月先匯兩家：${JSON.stringify(await names(pg))}`);

 // 在甲身上記一通電話，等一下要確認整份刪掉時紀錄也一起走
 await pg.click('.card:has-text("甲工程") .card-name'); await pg.waitForSelector('#drawerBody h2');
 await pg.fill('#drawerBody textarea','總機說不用了');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(1200);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);

 // --- 按取消：什麼都不能動 ---
 const ask=await delSource('九月名單.csv',null);
 chk(/2 筆客戶、1 則通話紀錄都會刪掉/.test(ask), `問話講清楚會刪掉什麼：${ask}`);
 chk(/管理已排除的公司/.test(ask), '講明排除之後收得回來');
 chk(JSON.stringify(await names(pg))==='["乙精密股份有限公司","甲工程有限公司"]', '按取消什麼都沒刪');

 // --- 選「只刪掉這一份」：下一份名單同一家還是進得來 ---
 await delSource('九月名單.csv','只刪掉這一份');
 chk(JSON.stringify(await names(pg))==='[]', `整份刪光了：${JSON.stringify(await names(pg))}`);
 let t=await tombs();
 chk(t.sources.includes('九月名單.csv')&&!t.companies.length, `只留名單墓碑、不排除公司：${JSON.stringify(t)}`);
 chk(t.logs===1, `通話紀錄也留了墓碑（不然同步會帶回來）：${t.logs}`);
 chk((await pg.evaluate(async()=>(await window.Store.allLogs()).length))===0, '通話紀錄清掉了');
 chk((await pg.evaluate(async()=>(await window.Store.allStates()).length))===0, '追蹤狀態清掉了（重匯同名檔案才不會把舊的帶回來）');

 await load(pg,十一月,'十一月名單.csv'); await pg.waitForTimeout(2500); await dup(pg);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(600);
 chk(JSON.stringify(await names(pg))==='["丙全新有限公司","乙精密股份有限公司","甲工程有限公司"]',
   `「只刪這一份」＝之後的名單照樣帶得進來：${JSON.stringify(await names(pg))}`);
 chk((await pg.evaluate(async()=>(await window.Store.allStates()).filter(s=>s.outcome).length))===0,
   '重新進來的甲沒有帶著上次的洽談狀態');

 // --- 選「連公司一起排除」：下一份名單就不要再帶回來了 ---
 const ask2=await delSource('十一月名單.csv','連公司一起排除');
 chk(/3 筆客戶都會刪掉/.test(ask2), `這份沒有通話紀錄就不提紀錄：${ask2}`);
 chk(JSON.stringify(await names(pg))==='[]', '整份又刪光了');
 t=await tombs();
 chk(t.companies.includes('tax:11111111')&&t.companies.includes('name:甲工程有限公司')&&t.companies.length===6,
   `三家都記了公司墓碑（統編＋名稱各一）：${t.companies.length} 個鍵`);

 await load(pg,九月,'十二月名單.csv'); await pg.waitForTimeout(2500); await dup(pg);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(600);
 chk(JSON.stringify(await names(pg))==='[]', `排除過的公司，換一份名單也不會再跳回來：${JSON.stringify(await names(pg))}`);

 // 收得回來：這是排除能用的前提
 const lifted=await pg.evaluate(async()=>{
   await window.Store.liftCompanyTombstones(['tax:11111111','name:甲工程有限公司'],{company:'甲工程有限公司'});
   const t=await window.Store.getTombstones();
   return !!(t.companies['tax:11111111']||{}).lifted; });
 chk(lifted, '排除的公司收得回來（選單「管理已排除的公司」）');
 await load(pg,九月,'一月名單.csv'); await pg.waitForTimeout(2500); await dup(pg);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(600);
 chk(JSON.stringify(await names(pg))==='["甲工程有限公司"]', `收回來的那家進得來，沒收的還是擋著：${JSON.stringify(await names(pg))}`);

 // --- 同步不能把刪掉的整份救回來 ---
 const merged=await pg.evaluate(async()=>{
   const local=await window.Store.exportAll();
   const cloud={version:2,records:[{id:'x1',source:'十一月名單.csv',company:'丙全新有限公司',importedAt:1}],
     logs:[],states:[],tombstones:{},settings:{}};
   const a=window.DriveSync.mergeDumps(local,cloud), b=window.DriveSync.mergeDumps(cloud,local);
   const brief=(m)=>m.records.map(r=>r.company).sort().join('、');
   return { a:brief(a), b:brief(b) }; });
 chk(!/丙全新/.test(merged.a)&&merged.a===merged.b, `舊雲端不會把刪掉的整份救回來：「${merged.a}」`);

 console.log('ERRORS:', errs.length?errs:'none');
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
