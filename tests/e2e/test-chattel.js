// 快到期分頁：讀動保清冊、跟名單比對、加入客戶名單走匯入流程、這家不用了記在裝置上
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9482);

const TODAY='2026-09-26';
const HEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const ROWS=[
 ['附條件買賣登記','112新經動字第004821號','28451237','禾泰精密工業有限公司','20000001','新鑫股份有限公司','2023/10/15','2026/10/14','12000000','新北市新莊區五權一路12號','3','2023/10/20','','101/10/01'],
 ['動產抵押登記','111新經動字第006913號','53217846','昱昌汽車貨運股份有限公司','20000002','和潤企業股份有限公司','2022/11/12','2026/11/12','8600000','新北市五股區五權路88號','2','2022/11/20','','112/03/05'],
 ['動產抵押登記','110新經動字第007355號','80126745','泓宇塑膠射出有限公司','20000003','合迪股份有限公司','2021/11/28','2026/11/28','4500000','新北市泰山區中港西路301巷','4','2021/12/01','',''],
 ['動產抵押登記','113新經動字第001204號','16938054','巨鎰金屬製品有限公司','20000004','裕融企業股份有限公司','2024/02/15','2027/02/15','6800000','新北市新莊區化成路500號','1','2024/02/20','',''],
 ['動產抵押登記','109新經動字第000100號','11111111','老早過期有限公司','20000002','和潤企業股份有限公司','2017/01/01','2020/01/01','3000000','新北市三重區重新路1號','1','2017/01/05','',''],
 ['附條件買賣登記','113新經動字第002000號','22222222','自家客戶有限公司','05072925','中租迪和股份有限公司','2024/01/01','2026/10/30','5000000','新北市新莊區中正路1號','1','2024/01/05','',''],
 ['動產抵押登記','113新經動字第003000號','33333333','小額案件有限公司','20000001','新鑫股份有限公司','2024/01/01','2026/10/20','500000','新北市新莊區中正路2號','0','2024/01/05','',''],
];
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-09-26T02:00:00.000Z',dataThrough:'2026/07/03',total:19541,kept:ROWS.length,files:[{path:'ntpc.csv',rows:ROWS.length}]};

const mk=(id,company,taxId,extra)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1,...extra});
const SEED=[mk('1','昱昌汽車貨運股份有限公司','53217846',{outcome:'noanswer'}), mk('2','巨鎰金屬製品有限公司','16938054',{})];

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1');}catch(e){}}); await ctx.addInitScript(()=>{try{localStorage.setItem('rate-filter-default','0');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"generatedAt":"x"}'}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:'統編,電話,傳真,核發日期\n28451237,0922333444,,2026/01/01\n53217846,02-2299-0000,,2026/01/01\n'}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());

 await pg.goto('http://localhost:9482/index.html'); await pg.waitForSelector('#dropzone');
 await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); await window.Store.setState({recordId:'2',outcome:'blocked',updatedAt:1}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);

 // 分頁在，切過去會抓清冊
 chk(await pg.locator('.subtab[data-tab=\"chattel\"]').count()===0, '找名單底下沒有「動產擔保」按鈕了（版本 327 收進合併頁）');
 await pg.evaluate(()=>window.switchTab('chattel')); await pg.waitForSelector('#chattel-cards .card'); await pg.waitForTimeout(400);
 const sub=await pg.textContent('#chattel-sub');
 chk(/資料截到 2026\/07/.test(sub) && /2026\/09\/26/.test(sub), `副標寫資料截到哪、何時抓的：${sub}`);
 chk(await pg.locator('#filters').isHidden(), '左側客戶篩選收起來，整個寬度給清冊');

 const names=async()=>pg.$$eval('#chattel-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 // 預設改成：到期時間全部、照契約起最新到最舊排（使用者：「該分頁排序以契約最新到最舊排序」）；同業、金額 100 萬起照舊
 let n=await names();
 chk(n.join('|')==='巨鎰金屬製品有限公司|禾泰精密工業有限公司|昱昌汽車貨運股份有限公司|泓宇塑膠射出有限公司|老早過期有限公司', `預設全部到期時間、照契約起最新到最舊：${n.join('|')}`);
 chk((await pg.$eval('#chattel-sort',(x)=>x.value))==='start', '排序預設「契約起（最新到最舊）」');
 // 底下照原本的檢查：切成 6 個月內到期、照擔保金額排
 await pg.locator('#chattel-fDue .chip:has-text("6 個月內")').click(); await pg.waitForTimeout(200);
 await pg.selectOption('#chattel-sort','amount'); await pg.waitForTimeout(200);
 n=await names();
 chk(n.join('|')==='禾泰精密工業有限公司|昱昌汽車貨運股份有限公司|巨鎰金屬製品有限公司|泓宇塑膠射出有限公司', `預設 6 個月內、照擔保金額高到低排、中租自家與 50 萬的小案子藏起來：${n.join('|')}`);
 // 分頁按鈕上的數字（#countChattel）版本 327 隨按鈕拿掉了

 // 卡片內容
 const first=pg.locator('#chattel-cards .card').first();
 const top=(await first.locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/還有 18 天到期/.test(top), `到期倒數：${top}`);
 chk(/附條件買賣/.test(top) && /金主：新鑫股份有限公司/.test(top), `案件類別與金主翻正（附條件買賣的客戶在債權人欄）：${top}`);
 chk(/新莊分公司/.test(top), `標的物所在地對到分公司：${top}`);
 chk(await first.evaluate(e=>e.classList.contains('is-overdue')), '30 天內到期的卡片左邊是紅色');
 const meta=(await first.locator('.card-meta').textContent()).replace(/\s+/g,' ');
 chk(/擔保 1,200 萬/.test(meta) && /2023\/10\/15 → 2026\/10\/14/.test(meta) && /112新經動字第004821號/.test(meta), `金額、契約起迄、登記編號：${meta}`);
 chk(await first.locator('.card-name a[href="https://findbiz.nat.gov.tw/fts/company/28451237"]').count()===1, '公司名連到商工登記');
 chk(/成立 101\/10\/01（13 年）/.test(meta), `成立年（民國＋滿幾年）：${meta}`);
 chk(/2 家還沒查到成立年/.test((await pg.textContent('#chattel-count'))), `寫還有幾家沒查到成立年：${await pg.textContent('#chattel-count')}`);

 // 已在名單：綠色、寫上次聯絡、按鈕變成打開那一筆；標過拒絕的灰掉
 const second=pg.locator('#chattel-cards .card').nth(1);
 chk(await second.evaluate(e=>e.classList.contains('is-mine')), '已在名單的卡片左邊是綠色');
 const t2=(await second.locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/已在名單・9\/1 加入・上次 9\/12/.test(t2), `寫上次聯絡日：${t2}`);
 chk(await second.locator('button:has-text("打開名單上這一家")').count()===1, '按鈕變成打開名單上那一筆');
 await second.locator('button:has-text("打開名單上這一家")').click(); await pg.waitForSelector('#drawerBody h2');
 chk(/昱昌汽車貨運/.test(await pg.textContent('#drawerBody h2')), '真的打開那一筆的詳細頁');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 到期時間籤：12 個月內會多出巨鎰（標過拒絕）；已過期籤只剩老早過期
 const clickChip=async(host,label)=>{ await pg.locator(`${host} .chip:has-text("${label}")`).first().click(); await pg.waitForTimeout(250); };
 const t4=(await pg.locator('#chattel-cards .card:has-text("巨鎰")').locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/名單上是禁止推廣/.test(t4), `禁止推廣的有寫出來：${t4}`);
 await clickChip('#chattel-fDue','3 個月內'); n=await names();
 chk(!n.includes('巨鎰金屬製品有限公司') && n.length===3, `3 個月內就沒有 2027/02 到期的：${n.join('|')}`);
 await clickChip('#chattel-fDue','已過期'); n=await names();
 chk(n.join('|')==='老早過期有限公司', `已過期還沒註銷：${n.join('|')}`);
 await clickChip('#chattel-fDue','6 個月內');
 const ages=await pg.$$eval('#chattel-fAge .chip',a=>a.map(x=>x.textContent.trim()).join('|'));
 chk(ages==='未滿 5 年1|5 年以上1|還不知道2', `成立年數的籤：${ages}`);
 await clickChip('#chattel-fAge','5 年以上'); n=await names();
 chk(n.join('|')==='禾泰精密工業有限公司', `只看 5 年以上：${n.join('|')}`);
 await clickChip('#chattel-fAge','5 年以上');
 const pc=(await pg.locator('#chattel-fPhone .chip').allTextContents()).map(t=>t.replace(/\s+/g,'')).join('|'); chk(pc==='有電話2|手機1|沒電話2', `電話籤（對出進口廠商電話表）：${pc}`);
 await clickChip('#chattel-fPhone','手機'); n=await names(); chk(n.join('|')==='禾泰精密工業有限公司', `只按「手機」：${n.join('|')}`);
 chk(/📞 09\d{8}（手機，多半是老闆本人）/.test(await pg.locator('#chattel-cards .card').first().locator('.card-top').textContent()) && (await pg.locator('#chattel-cards .card').first().locator('.card-top .copy-dot').count())===2, '卡片寫出手機號碼、後面有複製鈕');
 await clickChip('#chattel-fPhone','手機'); await clickChip('#chattel-fPhone','有電話'); n=await names(); chk(n.length===2 && n.includes('昱昌汽車貨運股份有限公司'), `「有電話」含手機：${n.join('|')}`);
 await clickChip('#chattel-fPhone','有電話');

 // 金主籤：勾中租才會看到自家的
 await clickChip('#chattel-fLender','中租'); n=await names();
 chk(n.join('|')==='自家客戶有限公司', `勾中租只看自家：${n.join('|')}`);
 await clickChip('#chattel-fLender','中租');
 // 金額下限清掉，小案子出現
 await pg.fill('#chattel-amtMin',''); await pg.waitForTimeout(250); n=await names();
 chk(n.includes('小額案件有限公司'), `金額下限拿掉就看得到 50 萬的：${n.join('|')}`);
 await pg.fill('#chattel-amtMin','100'); await pg.waitForTimeout(250);

 // 這家不用了：藏起來、記在 localStorage、重新整理還在
 await pg.locator('#chattel-cards .card:has-text("泓宇")').locator('button.chattel-hide').click(); await pg.waitForTimeout(250);
 n=await names(); chk(!n.includes('泓宇塑膠射出有限公司'), `藏起來了：${n.join('|')}`);
 chk((await pg.textContent('#chattel-hidden')).includes('顯示藏起來的 1 家'), `有「顯示藏起來的」按鈕：${await pg.textContent('#chattel-hidden')}`);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.evaluate(()=>window.switchTab('chattel')); await pg.waitForSelector('#chattel-cards .card'); await pg.waitForTimeout(300);
 n=await names(); chk(!n.includes('泓宇塑膠射出有限公司'), `重新整理之後還是藏著：${n.join('|')}`);
 await pg.click('#chattel-hidden'); await pg.waitForTimeout(250); n=await names();
 chk(n.includes('泓宇塑膠射出有限公司'), `按一下就看得到藏起來的：${n.join('|')}`);
 await pg.locator('#chattel-cards .card:has-text("泓宇")').locator('button:has-text("放回來")').click(); await pg.waitForTimeout(250);
 chk(await pg.locator('#chattel-hidden').isHidden(), '放回來之後沒有藏起來的了');

 // 加入客戶名單：走匯入流程，已在名單的略過；動保資訊在訪談內容，沒有變成通話紀錄
 await pg.locator('#chattel-fDue .chip:has-text("6 個月內")').click(); await pg.waitForTimeout(200);   // 預設改成全部到期時間了，這段照原本的 6 個月內
 const addBtn=await pg.textContent('#chattel-add');
 chk(/加入客戶名單（2 家）/.test(addBtn), `按鈕寫還不在名單的家數：${addBtn}`);
 await pg.click('#chattel-add'); await pg.waitForTimeout(1500);
 const recs=await pg.evaluate(async()=>{ const all=await window.Store.allRecords(); return all.filter(r=>/動產擔保名單/.test(r.source)).map(r=>({company:r.company,taxId:r.taxId,source:r.source,notes:r.notesRaw,founded:r.founded,timeline:r.timeline.length,lastDate:r.lastDate,outcome:r.outcome,address:r.address})); });
 chk(recs.length===2, `匯進去 2 家（已在名單的略過）：${recs.map(r=>r.company).join('|')}`);
 const ht=recs.find(r=>r.taxId==='28451237');
 chk(ht && /^動保：新鑫 擔保 1,200 萬，2023-10 起/.test(ht.notes), `訪談內容只留重點：金主、金額、哪個月起：${ht&&ht.notes}`);
 chk(ht && !ht.lastDate, `契約日期沒有被當成最近聯絡日：${ht&&ht.lastDate}`);
 chk(ht && /動產擔保名單-2026-09-26/.test(ht.source), `來源名稱帶日期，之後可以整份管理：${ht&&ht.source}`);
 chk(ht && /新莊區/.test(ht.address), `標的物所在地當地址：${ht&&ht.address}`);
 chk(ht && ht.founded==='2012', `成立年一起匯進去：${ht&&ht.founded}`);
 await pg.click('#importer .drawer-close').catch(()=>{}); await pg.waitForTimeout(300);
 await pg.evaluate(()=>window.switchTab('chattel')); await pg.waitForTimeout(400);
 const mineNow=await pg.locator('#chattel-cards .card.is-mine').count();
 chk(mineNow===4, `匯進去之後卡片變成已在名單：${mineNow}`);
 chk(/（/.test(await pg.textContent('#chattel-add'))===false, `全部都在名單了，按鈕不再寫家數：${await pg.textContent('#chattel-add')}`);

 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 個失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
