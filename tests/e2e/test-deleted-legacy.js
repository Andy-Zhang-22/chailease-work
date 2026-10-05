// 這個功能上線前就刪掉的公司（只留下 id 墓碑、反推不出公司名）也要照樣擋住
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9273);

const HEAD='公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家';
const csv=(rows)=>Buffer.from('﻿'+[HEAD,...rows].join('\n'),'utf8');
const 甲='甲工程有限公司,11111111,A,2010,"5,000",02-1111-1111,王甲,,營造業,,,,"新北市新莊區甲路1號",2026/09/01,';
const 乙='乙精密股份有限公司,22222222,B,2015,"8,000",02-2222-2222,李乙,,金屬加工,,,,"臺北市信義區乙路2號",2026/09/01,';
const 丙='丙全新有限公司,33333333,A,2020,"6,000",02-3333-3333,陳丙,,食品業,,,,"新北市三重區丙路3號",2026/09/01,';
const 九月=csv([甲,乙,丙]), 十月=csv([甲,乙,丙]);

const load=(pg,buf,name)=>pg.setInputFiles('#filePick',{name,mimeType:'text/csv',buffer:buf});
const dup=async(pg)=>{ if(await pg.locator('#editorBody h2:has-text("有重複的公司")').count()){
  await pg.click('#editorBody button:has-text("以新檔案覆蓋")'); await pg.waitForTimeout(2500); } };
const names=(pg)=>pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent.trim()).sort());

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1400}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9273/index.html'); await pg.waitForSelector('#dropzone');
 await pg.evaluate(()=>localStorage.setItem('registry-auto','0'));
 await load(pg,九月,'九月名單.csv'); await pg.waitForTimeout(2500);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(600);

 // 重現舊版的刪除：只留 id 墓碑，沒有公司墓碑
 const gone=await pg.evaluate(async()=>{
   const all=await window.Store.allRecords();
   const r=all.find(x=>x.company.includes('乙精密'));
   await window.Store.deleteRecordsById([r.id]);
   await window.Store.addTombstone('records', r.id);
   return { id:r.id, tombs:(await window.Store.getTombstones()) };
 });
 chk(Object.keys(gone.tombs.companies||{}).length===0, '起始狀態確實沒有公司墓碑（就是早上刪的那種）');
 chk(!!gone.tombs.records[gone.id], '只有一張 id 墓碑');
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(700);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(400);

 // 下一份名單又把乙帶回來
 await pg.click('#btnImport'); await pg.waitForTimeout(400);
 await load(pg,十月,'十月名單.csv'); await pg.waitForTimeout(3000);
 await dup(pg);
 const log=(await pg.textContent('#importLog')).replace(/\s+/g,' ');
 chk(/排除 1 筆你先前刪掉的公司（乙精密股份有限公司）/.test(log), `舊墓碑也認得出來：${log.slice(0,160)}`);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(700);
 chk(!(await names(pg)).includes('乙精密股份有限公司'), `乙沒有回來：${JSON.stringify(await names(pg))}`);

 // 認出來之後要補一張公司墓碑，才列得進「管理已排除的公司」
 const after=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies);
 chk(!!after['tax:22222222']&&!!after['name:乙精密股份有限公司'], `已補上公司墓碑：${JSON.stringify(Object.keys(after))}`);
 await pg.click('#btnMenu'); await pg.waitForTimeout(300);
 await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="excluded"]'); await pg.waitForSelector('.ask-overlay');
 chk(/乙精密股份有限公司/.test(await pg.textContent('.ask-overlay')), '早上刪的那家也列得出來、收得回來');
 await pg.click('.ask-overlay .btn:has-text("取消")'); await pg.waitForTimeout(300);

 // 收回要能撐過同步：墓碑是聯集合併，直接刪掉的話雲端那份會把它加回來
 await pg.click('#btnMenu'); await pg.waitForTimeout(300);
 await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="excluded"]'); await pg.waitForSelector('.ask-overlay');
 await pg.click('.ask-overlay .ask-list .btn:has-text("乙精密股份有限公司")'); await pg.waitForTimeout(600);
 const lifted=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies);
 chk(lifted['tax:22222222']&&lifted['tax:22222222'].lifted===true,
   `收回是寫「已收回」標記而不是刪掉鍵：${JSON.stringify(lifted['tax:22222222'])}`);
 // 雲端還留著舊墓碑，合併後要以比較新的「已收回」為準
 const merged=await pg.evaluate(async(mine)=>window.DriveSync.mergeTombstones(
   { companies: { 'tax:22222222': 1 }, logs:{}, sources:{}, records:{} },
   { companies: mine, logs:{}, sources:{}, records:{} }).companies['tax:22222222'], lifted);
 chk(merged && merged.lifted===true, `同步合併後仍然是已收回：${JSON.stringify(merged)}`);
 await pg.click('#btnImport'); await pg.waitForTimeout(400);
 await load(pg,十月,'十二月名單.csv'); await pg.waitForTimeout(3000);
 await dup(pg);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(700);
 chk((await names(pg)).includes('乙精密股份有限公司'), `收回之後乙匯得進來：${JSON.stringify(await names(pg))}`);

 chk(errs.length===0, `沒有 JS 錯誤：${errs.slice(0,3).join(' ｜ ')}`);
 console.log(bad?`\n${bad} 項不過`:'\n全過');
 await br.close(); srv.close();
})();
