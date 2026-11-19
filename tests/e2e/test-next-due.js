// 版本 447（使用者 11/19 看了使用次數「照你說的做」；匯出是每天匯報給主管、開 Google 是看公司做什麼跟值不值得打）：
// 1. 存完通話紀錄：這一家是今天要打的 → 直接開今天要打的下一家；不是今天要打的照舊回名單；最後一家打完講一聲
// 2. 「不是目標」一步刪掉（只給沒通話紀錄、沒連結、沒重複、沒改過的），刪完也開下一家；有通話紀錄的沒有這顆
// 3. 詳細頁公司名底下第一眼：做什麼、資本額、成立幾年、挑它的原因
// 4. 選單「匯出 Excel」：今天聯絡過的先問日報還是整份；今天還沒打就直接匯整份
// 5. 詳細頁的「用 Google 地圖找電話」拿掉了
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9643);
const TODAY='2026-10-09';
const mk=(id,company,taxId,phone,extra)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2020',capital:'20,000',phoneRaw:phone,phones:phone?[{digits:phone.replace(/\D/g,''),display:phone,ext:'',note:''}]:[],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-10-01'},extra||{});
const SEED=[
 mk('1','甲範例精密有限公司','11111111','02-0000-1234',{industry:'其他金屬製品製造',notesRaw:'每日新名單，符合：跟同業借（和潤）、剛得標\n動保：和潤 2026/08 擔保 900 萬'}),
 mk('2','乙範例實業有限公司','22222222','02-0000-9999'),
 mk('3','丙範例工業有限公司','33333333','02-0000-5678'),
 mk('4','丁範例貿易有限公司','44444444','02-0000-4321'),
 mk('5','戊範例改天有限公司','55555555','02-0000-8765',{nextDate:'2026-10-20'}),
 mk('6','己範例沒電話有限公司','66666666','',{nextDate:'2026-10-21'}),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000},acceptDownloads:true});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 await ctx.addInitScript(()=>{ window.__dl=[]; const oc=URL.createObjectURL.bind(URL); const blobs=new Map();
   URL.createObjectURL=(b)=>{ const u=oc(b); blobs.set(u,b); return u; };
   const ck=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(){ if(this.download){ window.__dl.push({name:this.download,blob:blobs.get(this.href)}); return undefined; } return ck.call(this); }; });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9643/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1000);
 const open=async(name)=>{ await pg.locator(`#cards .card:has-text("${name}") .card-name`).click(); await pg.waitForSelector('#drawerBody h2'); };
 const title=async()=>(await pg.isHidden('#drawer'))?'':(await pg.textContent('#drawerBody h2')).replace(/\s+/g,'');
 const closeAll=async()=>{ await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); })); await pg.waitForTimeout(200); };
 const order=await pg.$$eval('#cards .card .card-name',ns=>ns.map(n=>n.textContent.replace(/\s+/g,'')));
 const dueOrder=order.filter(n=>/甲範例|乙範例|丙範例|丁範例/.test(n));

 // 4a. 今天還沒打：選單的匯出 Excel 直接匯整份，不多問
 const lastDl=()=>pg.evaluate(async()=>{ const d=window.__dl[window.__dl.length-1]; if(!d||!d.blob) return {name:d?d.name:'',n:window.__dl.length,head:[],names:[]};
   const wb=window.XLSX.read(new Uint8Array(await d.blob.arrayBuffer()),{type:'array'}); const rows=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
   return {name:d.name,n:window.__dl.length,head:rows[0].slice(0,3),names:rows.slice(1).map(r=>String(r[0]||''))}; });
 await pg.evaluate(()=>window.exportMenu()); await pg.waitForTimeout(300);
 const d0=await lastDl(); const f0=d0.name;
 chk(/^電話推廣名單_2026-10-09\.xlsx$/.test(f0) && d0.names.length===6 && (await pg.locator('.ask-overlay').count())===0, `今天還沒打：匯出 Excel 直接匯整份（6 家）、不多問：${f0}／${d0.names.length} 家`);

 // 3. 第一眼：做什麼、資本額、成立幾年、挑它的原因
 await open('甲範例');
 const brief=(await pg.textContent('#drawerBody .detail-brief')).replace(/\s+/g,' ');
 chk(/做 其他金屬製品製造/.test(brief) && /資本額 20,000 仟元/.test(brief) && /成立 6 年/.test(brief) && /挑它的原因：跟同業借（和潤）、剛得標/.test(brief) && !/動保：/.test(brief), `公司名底下第一眼：${brief}`);
 // 5. 「用 Google 地圖找電話」拿掉了；搜尋連結照留
 chk((await pg.locator('#drawerBody button:has-text("用 Google 地圖找電話")').count())===0, '有電話的詳細頁沒有「用 Google 地圖找電話」');
 // 2a. 沒動過的：有「不是目標」
 chk((await pg.locator('#drawerBody .not-target').count())===1, '沒通話紀錄的有「不是目標」一步刪掉');

 // 1a. 存完：今天要打的 → 開下一家（名單上這一家後面那一家）
 const i0=dueOrder.findIndex(n=>/甲範例/.test(n)); const expect1=dueOrder[(i0+1)%dueOrder.length];
 await pg.selectOption('#drawerBody select','contacted'); await pg.fill('#drawerBody textarea','接通了，下週再聊');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
 const t1=await title();
 chk(t1 && !/甲範例/.test(t1) && expect1.startsWith(t1.slice(0,3)), `存完直接開今天要打的下一家（名單順序 ${dueOrder.map(n=>n.slice(0,3)).join('→')}）：開的是 ${t1}`);
 chk(/已儲存通話紀錄/.test(await pg.textContent('#toast')), `照樣有提示：${await pg.textContent('#toast')}`);
 const brief2=await pg.locator('#drawerBody .detail-brief').count()?(await pg.textContent('#drawerBody .detail-brief')).replace(/\s+/g,' '):'';
 chk(/資本額 20,000 仟元/.test(brief2) && !/挑它的原因/.test(brief2) && !/做 /.test(brief2), `沒產業別、沒挑選原因的只顯示有的：${brief2}`);

 // 2b. 「不是目標」：一步刪掉、記原因、接著開下一家
 const t1name=t1; const left1=dueOrder.filter(n=>!/甲範例/.test(n) && !n.startsWith(t1name.slice(0,3)));
 await pg.click('#drawerBody .not-target'); await pg.waitForTimeout(900);
 const t2=await title();
 chk((await pg.locator('.ask-overlay').count())===0 && t2 && t2!==t1name && left1.some(n=>n.startsWith(t2.slice(0,3))), `不是目標：不用再選原因，刪完開下一家：${t1name} → ${t2}`);
 const tomb=await pg.evaluate(async(n)=>{ const t=(await window.Store.getTombstones()).companies||{}; const e=Object.values(t).find(x=>x.company&&x.company.startsWith(n)); const rec=(await window.Store.allRecords()).some(r=>r.company.startsWith(n)); return {reason:e&&e.reason,rec}; },t1name.slice(0,3));
 chk(tomb.reason==='target' && tomb.rec===false, `刪掉了、原因記「不是目標」：${JSON.stringify(tomb)}`);
 chk(/已刪除.*不是目標/.test(await pg.textContent('#toast')), `提示：${await pg.textContent('#toast')}`);

 // 1b. 用「刪除這筆」選原因的，刪完一樣開下一家
 await pg.click('#drawerBody button:has-text("刪除這筆")'); await pg.waitForSelector('.ask-overlay');
 await pg.click('.ask-overlay .ask-list .btn:has-text("總機不轉接")'); await pg.waitForTimeout(900);
 const t3=await title();
 chk(t3 && t3!==t2 && /範例/.test(t3), `刪除這筆選了原因，刪完開下一家：${t2} → ${t3}`);

 // 1c. 最後一家：存完沒有下一家 → 回名單、講一聲
 await pg.selectOption('#drawerBody select','noanswer'); await pg.fill('#drawerBody textarea','沒接');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
 chk(await pg.isHidden('#drawer') && /今天要打的都打完了/.test(await pg.textContent('#toast')), `最後一家存完：回名單、講今天打完了（今天已經記過通話的甲不算下一家，就算它的日期還停在今天）：${await pg.textContent('#toast')}／${await title()}`);
 await closeAll();

 // 1d. 不是今天要打的（改天的客戶）：存完照舊回名單，不跳
 if(await pg.locator('#cards .card:has-text("戊範例")').count()){
   await open('戊範例');
   chk((await pg.locator('#drawerBody .not-target').count())===1, '改天的客戶沒動過也有「不是目標」');
   await pg.selectOption('#drawerBody select','contacted'); await pg.fill('#drawerBody textarea','補記一筆');
   await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
   chk(await pg.isHidden('#drawer'), '不是今天要打的：存完照舊回名單，不會跳到別家');
   // 2c. 有通話紀錄的：沒有「不是目標」，要走「刪除這筆」看清楚再選
   await open('戊範例');
   chk((await pg.locator('#drawerBody .not-target').count())===0 && (await pg.locator('#drawerBody button:has-text("刪除這筆")').count())===1, '有通話紀錄的沒有一步刪的「不是目標」，只有「刪除這筆」');
   await closeAll();
 } else chk(false, '名單上找不到改天的那一家（戊範例）');

 // 5b. 沒電話的詳細頁：搜尋連結照留、沒有地圖找電話那顆
 if(await pg.locator('#cards .card:has-text("己範例")').count()){
   await open('己範例');
   chk((await pg.locator('#drawerBody .phone-finder').count())===1 && (await pg.locator('#drawerBody button:has-text("用 Google 地圖找電話")').count())===0 && (await pg.locator('#drawerBody .phone-finder a').count())>=1, '沒電話的：搜尋連結照留，「用 Google 地圖找電話」拿掉了');
   await closeAll();
 } else chk(false, '名單上找不到沒電話的那一家（己範例）');

 // 4b. 今天聯絡過了：先問日報還是整份；選日報 → 檔名帶日期、只有今天聯絡過的
 const ask=pg.evaluate(()=>window.exportMenu());
 await pg.waitForSelector('.ask-overlay');
 const opts=await pg.$$eval('.ask-overlay .ask-list .btn',bs=>bs.map(b=>b.textContent));
 chk(opts.length===2 && /^今天聯絡過的 \d+ 家（日報）$/.test(opts[0]) && /^整份名單 \d+ 家$/.test(opts[1]), `今天聯絡過：匯出先問日報還是整份：${opts.join('｜')}`);
 await pg.click('.ask-overlay .ask-list .btn:has-text("日報")'); await ask; await pg.waitForTimeout(300);
 const names=await lastDl(); const f1=names.name;
 const n0=Number((opts[0].match(/\d+/)||[0])[0]);
 chk(/^電推日報_2026-10-09\.xlsx$/.test(f1) && names.names.length===n0 && names.head.join()==='公司名稱,統編,分級' && names.names.some(n=>/甲範例/.test(n)) && !names.names.some(n=>/己範例/.test(n)),
   `日報：檔名帶日期、欄位跟母檔一樣、只有今天聯絡過的 ${n0} 家：${f1}／${names.names.map(n=>n.slice(0,3)).join('、')}`);
 chk(/已匯出今天的日報：\d+ 家、\d+ 通（接通 \d+、約到拜訪 \d+）/.test(await pg.textContent('#toast')), `日報的提示帶今天的通數：${await pg.textContent('#toast')}`);

 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
