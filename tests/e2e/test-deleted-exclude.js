// 主動刪掉的公司，之後匯入別份名單時要自動剔除（不要每個月重刪一次）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9271);

const HEAD='公司名稱,統編,分級,成立,資本額,電話,負責人,KEYMAN,產業別,下次聯絡日,最近聯絡日,訪談內容,地址,名單新增日期,國家';
const csv=(rows)=>Buffer.from('﻿'+[HEAD,...rows].join('\n'),'utf8');
const 甲='甲工程有限公司,11111111,A,2010,"5,000",02-1111-1111,王甲,,營造業,,,,"新北市新莊區甲路1號",2026/09/01,';
const 乙='乙精密股份有限公司,22222222,B,2015,"8,000",02-2222-2222,李乙,,金屬加工,,,,"臺北市信義區乙路2號",2026/09/01,';
const 丙='丙全新有限公司,33333333,A,2020,"6,000",02-3333-3333,陳丙,,食品業,,,,"新北市三重區丙路3號",2026/09/01,';
const 甲無統編='甲工程有限公司,,A,2010,"5,000",02-1111-1111,王甲,,營造業,,,,"新北市新莊區甲路1號",2026/09/01,';

const 九月=csv([甲,乙,丙]);
const 十月=csv([甲,乙,丙]);          // 下個月拿到的新名單，同樣三家
const 十月無統編=csv([甲無統編,丙]); // 這份名單沒有統編欄位資料

const ask=async(pg,btn)=>{ await pg.waitForSelector('.ask-overlay',{timeout:8000});
  await pg.click(`.ask-overlay .btn:has-text("${btn}")`); await pg.waitForTimeout(400); };
const names=(pg)=>pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent.trim()).sort());
const load=(pg,buf,name)=>pg.setInputFiles('#filePick',{name,mimeType:'text/csv',buffer:buf});
// 匯入同一批公司會跳「有重複的公司」，選覆蓋讓它走完
const dup=async(pg)=>{ const box=pg.locator('#editorBody h2:has-text("有重複的公司")');
  if(await box.count()){ await pg.click('#editorBody button:has-text("以新檔案覆蓋")'); await pg.waitForTimeout(2500); } };

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1400}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 const native=[]; pg.on('dialog',d=>{ native.push(d.message()); d.accept(); });
 await pg.goto('http://localhost:9271/index.html'); await pg.waitForSelector('#dropzone');
 await pg.evaluate(()=>localStorage.setItem('registry-auto','0'));

 await load(pg,九月,'九月名單.csv'); await pg.waitForTimeout(2500);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(600);
 chk(JSON.stringify(await names(pg))==='["丙全新有限公司","乙精密股份有限公司","甲工程有限公司"]',
   `九月先匯三家：${JSON.stringify(await names(pg))}`);

 // 刪掉乙
 await pg.locator('.card:has-text("乙精密") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody button:has-text("刪除這筆")');
 await ask(pg,'刪掉');
 await pg.waitForTimeout(900);
 chk(native.length===0, `刪除沒有用到瀏覽器原生對話框（${native.length} 次）`);
 chk(!(await names(pg)).includes('乙精密股份有限公司'), '乙已經刪掉');

 // 下個月的新名單又帶了乙回來 → 要自動剔除
 await pg.click('#btnImport'); await pg.waitForTimeout(400);
 await load(pg,十月,'十月名單.csv'); await pg.waitForTimeout(3000);
 await dup(pg);
 const log=(await pg.textContent('#importLog')).replace(/\s+/g,' ');
 chk(/排除 1 筆你先前刪掉的公司（乙精密股份有限公司）/.test(log), `匯入記錄有講排除了誰：${log.slice(0,220)}`);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(700);
 const after=await names(pg);
 chk(!after.includes('乙精密股份有限公司'), `乙沒有跟著新名單回來：${JSON.stringify(after)}`);
 chk(after.includes('甲工程有限公司')&&after.includes('丙全新有限公司'), '沒刪過的兩家照常更新進來');

 // 換成沒有統編的名單，靠公司名也要擋得住
 await pg.locator('.card:has-text("甲工程") .card-name').first().click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody button:has-text("刪除這筆")'); await ask(pg,'刪掉'); await pg.waitForTimeout(900);
 await pg.click('#btnImport'); await pg.waitForTimeout(400);
 await load(pg,十月無統編,'十一月名單.csv'); await pg.waitForTimeout(3000);
 await dup(pg);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(700);
 chk(!(await names(pg)).includes('甲工程有限公司'),
   `名單沒有統編時也擋得住（改比公司名）：${JSON.stringify(await names(pg))}`);

 // 收回：管理已排除的公司
 await pg.click('#btnMenu'); await pg.waitForTimeout(300);
 await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="excluded"]'); await pg.waitForSelector('#editorBody .excluded-row');
 const box=(await pg.textContent('#editorBody .excluded-list')).replace(/\s+/g,' ');
 chk(/甲工程有限公司/.test(box)&&/乙精密股份有限公司/.test(box), `排除清單列出兩家：${box.slice(0,200)}`);
 await pg.click('#editorBody .excluded-row:has-text("乙精密股份有限公司") button:has-text("收回")'); await pg.waitForTimeout(600);
 chk(/已收回「乙精密股份有限公司」/.test(await pg.textContent('#toast')), `收回有回饋：${await pg.textContent('#toast')}`);
 await pg.click('#editor .drawer-close'); await pg.waitForTimeout(200);

 await pg.click('#btnImport'); await pg.waitForTimeout(400);
 await load(pg,十月,'十二月名單.csv'); await pg.waitForTimeout(3000);
 await dup(pg);
 await pg.click('#importer .drawer-close').catch(()=>{});
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(700);
 const back=await names(pg);
 chk(back.includes('乙精密股份有限公司'), `收回之後乙會再匯進來：${JSON.stringify(back)}`);
 chk(!back.includes('甲工程有限公司'), '沒收回的甲還是擋著');

 // 手動一筆一筆新增也要吃排除名單：先問一次，預設不新增
 const addManual=async()=>{
   if (await pg.isVisible('#importer')) { await pg.click('#importer .drawer-close'); await pg.waitForTimeout(200); }
   await pg.click('#btnImport'); await pg.waitForTimeout(300);
   await pg.click('[data-act="new-customer"]'); await pg.waitForSelector('#editor h2');
   await pg.locator('#editor label.rule-field:has(span:text-is("公司名稱")) input').fill('甲工程有限公司');
   await pg.locator('#editor label.rule-field:has(span:text-is("統一編號")) input').fill('11111111');
   await pg.click('#editor button:has-text("新增")');
 };
 await addManual();
 await pg.waitForSelector('.ask-overlay',{timeout:8000});
 const warn=(await pg.textContent('.ask-overlay .ask-text')).replace(/\s+/g,' ');
 chk(/先前從名單刪掉了，已經設成排除/.test(warn), `手動新增也擋，而且講明原因：${warn}`);
 await pg.click('.ask-overlay .btn:has-text("不要新增")'); await pg.waitForTimeout(700);
 let hasA=await pg.evaluate(async()=>(await window.Store.allRecords()).some(r=>r.company==='甲工程有限公司'));
 chk(!hasA, '按「不要新增」就真的沒加進去');
 chk(/沒有新增「甲工程有限公司」（維持排除）/.test(await pg.textContent('#toast')), `而且有講：${await pg.textContent('#toast')}`);

 // 按「還是要新增」才加，並且收回排除，不然下次匯入又被自己的墓碑擋住
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
 await addManual();
 await pg.waitForSelector('.ask-overlay',{timeout:8000});
 await pg.click('.ask-overlay .btn:has-text("還是要新增")'); await pg.waitForTimeout(1200);
 hasA=await pg.evaluate(async()=>(await window.Store.allRecords()).some(r=>r.company==='甲工程有限公司'));
 chk(hasA, '按「還是要新增」才加得進去');
 const lifted=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies['tax:11111111']);
 chk(lifted&&lifted.lifted===true, `而且順手收回排除：${JSON.stringify(lifted)}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);

 chk(errs.length===0, `沒有 JS 錯誤：${errs.slice(0,3).join(' ｜ ')}`);
 console.log(bad?`\n${bad} 項不過`:'\n全過');
 await br.close(); srv.close();
})();
