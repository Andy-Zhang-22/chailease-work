// 每天自動從登記清冊、動產擔保、商行、出進口廠商、剛開始請人挑進名單；上限 30、新名單 10；加入時照額度找日期
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9485);
const TODAY='2026-10-05';   // 週一
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const LHEAD='統一編號,公司名稱,公司所在地,代表人,資本額,核准設立日期,核准變更日期,案由或變更事項,營業項目,縣市,清冊,期別';
const LROWS=[
 ['11111111','甲一精密有限公司','新北市新莊區中正路1號','王一','30000000','108/10/01','115/08/20','增資、所營事業變更','CC01080 電子零組件製造業','新北市','change','11508'],
 ['22222222','乙二機械股份有限公司','新北市泰山區中港西路2號','李二','50000000','','115/08/21','增資','CB01010 機械設備製造業','新北市','change','11508'],
 ['33333333','丙三工程有限公司','新北市五股區五權路3號','張三','20000000','','115/08/22','增資','E601010 電器承裝業','新北市','change','11508'],
 ['44444444','丁四貿易有限公司','新北市新莊區中正路4號','陳四','10000000','','115/08/23','增資','F118010 資訊軟體批發業','新北市','change','11508'],
];
const LCSV='﻿'+[LHEAD,...LROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const LINDEX={latest:'11508',generatedAt:'2026-09-26T17:00:00.000Z',periods:{'11508':{generatedAt:'2026-09-26T17:00:00.000Z',period:'11508',files:[{city:'新北市',type:'change',path:'11508/新北市-change.csv',rows:4,capitalUp:4}]}}};
const CHEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const CROWS=[
 ['附條件買賣登記','112新經動字第004821號','28451237','禾泰精密工業有限公司','20000001','新鑫股份有限公司','2023/10/15','2026/10/14','12000000','新北市新莊區五權一路12號','3','2023/10/20','','111/10/01'],
 ['動產抵押登記','111新經動字第006913號','53217846','昱昌汽車貨運股份有限公司','20000002','和潤企業股份有限公司','2022/11/12','2026/11/12','8600000','新北市五股區五權路88號','2','2022/11/20','','112/03/05'],
 ['動產抵押登記','110新經動字第007355號','80126745','泓宇塑膠射出有限公司','20000003','合迪股份有限公司','2021/11/28','2026/11/28','4500000','新北市泰山區中港西路301巷','4','2021/12/01','','112/01/01'],
 ['動產抵押登記','113新經動字第001204號','16938054','巨鎰金屬製品有限公司','20000004','裕融企業股份有限公司','2024/02/15','2027/02/15','6800000','新北市新莊區化成路500號','1','2024/02/20','','113/01/01'],
 ['動產抵押登記','109新經動字第000100號','11111112','老早過期有限公司','20000002','和潤企業股份有限公司','2017/01/01','2020/01/01','3000000','新北市三重區重新路1號','1','2017/01/05','',''],
 ['附條件買賣登記','113新經動字第002000號','22222223','自家客戶有限公司','05072925','中租迪和股份有限公司','2024/01/01','2026/10/30','5000000','新北市新莊區中正路1號','1','2024/01/05','',''],
];
const CCSV='﻿'+[CHEAD,...CROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const CINDEX={generatedAt:'2026-09-26T14:36:42.637Z',dataThrough:'2026/07/02',total:19541,kept:CROWS.length,files:[{path:'ntpc.csv',rows:CROWS.length}]};
const BHEAD='統編,名稱,組織別,資本額,設立日期,地址,行業代號,行業,行業2,行業3,開發票,負責人,稅籍資本額,商業登記';
const BROWS=[
 ['61111111','新莊好商行','獨資','12000000','2019/03/01','新北市新莊區中正路371號','471','雜貨','','','Y','王好人','12000000','Y'],
 ['62222222','板橋企業社','合夥','1500000','2010/05/01','新北市板橋區文化路1號','472','五金','','','Y','李板橋','1500000','Y'],
 ['63333333','只有稅籍商行','獨資','60000000','2003/08/01','新北市新莊區中正路1號','481','水電','','','N','','60000000','N'],
];
const BCSV='\uFEFF'+[BHEAD,...BROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const BINDEX={generatedAt:'2026-09-29T13:00:00.000Z',fileDate:'29-SEP-26',cities:['新北市'],minCapital:500000,total:3,byOrg:{'獨資':2,'合夥':1},byDist:{'新莊區':2,'板橋區':1},withOwner:2,taxOnly:1,files:[{path:'biz.csv',rows:3}]};
const THEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const TROWS=[
 ['70000001','晨光貿易有限公司','MORNING TRADE','新北市新莊區中正路100號','王O明','02-2990-1234','','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','板橋出口有限公司','','新北市板橋區文化路1號','李O華','02-2960-1111','','2025/01/15','2025/01/15','N','Y','110/03/01','3000000'],
 ['70000003','沒電話貿易有限公司','','新北市新莊區中正路371號','','','','2026/09/01','2026/09/01','Y','Y','',''],
];
const TCSV='\uFEFF'+[THEAD,...TROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const TINDEX={generatedAt:'2026-10-01T20:00:00.000Z',cities:['新北市'],months:24,total:3,withPhone:2,recent:3,files:[{path:'trade.csv',rows:3}]};
const NHEAD='統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額';
const NROWS=[
 ['54867253','名祿實業有限公司','新北市新莊區中正路100號','4582','運動用品、器材批發業','108/09/03','202609','02-2960-0000','12000000'],
 ['24908600','沒電話請人有限公司','新北市板橋區文化路1號','4552','服裝及其配件批發業','104/08/14','202608','','3000000'],
];
const NCSV='\uFEFF'+[NHEAD,...NROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const NINDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:6,total:2,withPhone:1,latestYm:'2026/09',files:[{path:'nhi.csv',rows:2}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1});
const SEED=[mk('1','主力客戶一有限公司','99999991'), mk('2','主力客戶二有限公司','99999992')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(LINDEX)}));
 await ctx.route('**/leads/11508/*',r=>r.fulfill({status:200,contentType:'text/csv',body:LCSV}));
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CINDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CCSV}));
 await ctx.route('**/leads/biz/monthly/**',r=>r.fulfill({status:404,body:''}));   // 本機有真的清冊，測試不要載到
 await ctx.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BINDEX)}));
 await ctx.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:BCSV}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(TINDEX)}));
 await ctx.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:TCSV}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:'\uFEFF統編,電話,傳真,核發日期\n11111111,02-1234-5678,,2025/01/01\n'}));   // 甲一在貿易署電話表裡
 await ctx.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NINDEX)}));
 await ctx.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:NCSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9485/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('new-quota','5');
   // 昱昌以前刪掉過（公司墓碑）：挑的時候就要跳過，不然挑了 4 家只進來 3 家
   await window.Store.addCompanyTombstones([{key:'tax:53217846',company:'昱昌汽車貨運股份有限公司',taxId:'53217846'}]); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(3500);

 // 分頁名稱
 const tabs=await pg.$$eval('#tabs .tab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(tabs[0].startsWith('重點推廣名單') && tabs[1].startsWith('每月公司設立／變更登記清冊'), `分頁名稱：${tabs.join(' | ')}`);

 // 每日自動挑：動產擔保 4 家（禾泰、昱昌、泓宇、巨鎰）、登記清冊 4 家 → 8 家，都排今天
 const fed=await pg.evaluate(async(t)=>{ const all=await window.Store.allRecords(); return all.filter(r=>/^每日新名單/.test(r.source)).map(r=>({company:r.company,source:r.source,nextDate:r.nextDate,notes:r.notesRaw.slice(0,60),capital:r.capital,founded:r.founded,addedDate:r.addedDate})); },TODAY);
 chk(fed.every(f=>f.addedDate===TODAY), `每日新名單的名單新增日期＝今天：${fed.map(f=>f.addedDate).join('|')}`);
 // 優先順序不是門檻：池子裡動產擔保 6 家、登記清冊 4 家全挑進來湊到 10；順序照優先順序
 chk(fed.length===5, `額度 5：五頁輪流拿（動產擔保、登記清冊、商行、出進口、剛開始請人各 1）：${fed.map(f=>f.company).join('|')}`);
 chk(fed.some(f=>f.company==='名祿實業有限公司') && !fed.some(f=>f.company==='沒電話請人有限公司'), `剛開始請人挑 1 家、有電話且全符合的先：${fed.filter(f=>/請人|名祿/.test(f.company)).map(f=>f.company).join('|')}`);
 chk(/符合：有電話、資本額 500～6,000 萬、我的分公司、成立 6～10 年、剛投保 3 個月內/.test(await pg.evaluate(async()=>(await window.Store.allRecords()).find(r=>r.company==='名祿實業有限公司').notesRaw)), '名祿五條全符合，寫在訪談內容');
 chk(fed.some(f=>f.company==='晨光貿易有限公司'), `出進口廠商挑 1 家、有電話且全符合的先：${fed.filter(f=>/貿易|出口/.test(f.company)).map(f=>f.company).join('|')}`);
 const cg=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(r=>r.company==='晨光貿易有限公司'); return r?{notes:r.notesRaw,phone:r.phoneRaw,founded:r.founded}:null; });
 chk(cg && /符合：有電話、資本額 500～6,000 萬、我的分公司、成立 6～10 年、登記 1 年內、進口＋出口/.test(cg.notes) && cg.phone==='02-2990-1234' && cg.founded==='2019', `晨光五條全符合、電話與成立年一起進來：${JSON.stringify(cg)}`);
 chk(fed.some(f=>f.company==='新莊好商行') && !fed.some(f=>f.company==='板橋企業社') && !fed.some(f=>f.company==='只有稅籍商行'), `商行／企業社挑 1 家、有商業登記且全符合的先：${fed.filter(f=>/商行|企業社/.test(f.company)).map(f=>f.company).join('|')}`);
 chk(/符合：有商業登記、資本額 1,000 萬以上、我的分公司、設立 6～10 年、開發票/.test(await pg.evaluate(async()=>(await window.Store.allRecords()).find(r=>r.company==='新莊好商行').notesRaw)), '新莊好商行五條全符合，寫在訪談內容');
 const split=await pg.evaluate(()=>[window.splitEvenly([10,10,10],15), window.splitEvenly([10,1,10],15), window.splitEvenly([0,0,2],15), window.splitEvenly([3,3,3],20)]);
 chk(JSON.stringify(split)==='[[5,5,5],[7,1,7],[0,0,2],[3,3,3]]', `三頁平分、一頁不夠另外兩頁補：${JSON.stringify(split)}`);
 chk(fed.some(f=>f.company==='禾泰精密工業有限公司') && fed.some(f=>f.company==='甲一精密有限公司'), '全符合的先挑到');
 chk(!fed.some(f=>f.company==='昱昌汽車貨運股份有限公司') && fed.filter(f=>/動保：/.test(f.notes)).length===1, `以前刪掉的昱昌不挑，動產擔保還是補滿 1 家：${fed.map(f=>f.company).join('|')}`);
 const order=await pg.evaluate(async()=>{ const c=await window.Chattel.dailyCandidates(); const l=await window.Leads.dailyCandidates(); return {c:c.map(r=>r.cust.name+'|'+r._why), l:l.map(r=>r['公司名稱']+'|'+r._why)}; });
 // 都在名單裡了會是空的；順序要用「藏起來」之前的資料驗：改用 window 上的比較函式不好抓，改看訪談內容寫的符合條件
 const why=Object.fromEntries(fed.map(f=>[f.company,f.notes]));
 chk(/符合：本期、增資、擴張、有電話、資本額 500～6,000 萬、我的分公司、成立 6～10 年/.test(await pg.evaluate(async()=>(await window.Store.allRecords()).find(r=>r.company==='甲一精密有限公司').notesRaw)), '甲一七條全符合（含貿易署電話表對得到），寫在訪談內容');
 chk(/0212345678/.test(JSON.stringify(await pg.evaluate(()=>window.customerViews().find(v=>v.company==='甲一精密有限公司').phones))), '甲一的電話從貿易署電話表自動填進來');
 chk(/符合：成立 5 年內、3 個月內到期、同業、我的分公司、500 萬以上/.test(await pg.evaluate(async()=>(await window.Store.allRecords()).find(r=>r.company==='禾泰精密工業有限公司').notesRaw)), '禾泰四條全符合');
 // 名單頁最上面的「再補」列：打完了按一下再補 5 家
 const barText=(await pg.textContent('#feedBar')).replace(/\s+/g,' ');
 chk(/今天的新名單 5 家/.test(barText) && /再補 5 家/.test(barText), `再補那一條：${barText}`);
 await pg.click('#feedMore'); await pg.waitForTimeout(1500);
 const fed2=await pg.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^每日新名單/.test(r.source)).map(r=>r.company));
 chk(fed2.length===10, `再補之後 10 家：${fed2.join('|')}`);
 chk(fed2.includes('板橋企業社') && !fed2.includes('只有稅籍商行'), `再補的商行是板橋企業社（有商業登記），只有稅籍的還沒輪到：${fed2.filter(x=>/商行|企業社/.test(x)).join('|')}`);
 chk(/符合：3 個月內到期、我的分公司、500 萬以上/.test(await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(r=>r.company==='自家客戶有限公司'); return r?r.notesRaw:''; })) || !fed2.includes('自家客戶有限公司'), '中租自家的不算同業，排在後面補位');
 chk(fed.every(f=>f.nextDate===TODAY), `都排在今天：${[...new Set(fed.map(f=>f.nextDate))].join('|')}`);
 chk(fed.every(f=>/^每日新名單-2026-10-05(-補1)?\.csv$/.test(f.source)), `來源名稱帶日期，再補的另外取名：${[...new Set(fed.map(f=>f.source))].join('|')}`);
 const ht=fed.find(f=>f.company==='禾泰精密工業有限公司'); chk(ht && /動保：新鑫/.test(ht.notes) && ht.founded==='2022', `動保的備註與成立年進來（只挑成立 5 年內）：${ht&&ht.notes} / ${ht&&ht.founded}`);
 const jy=fed.find(f=>f.company==='甲一精密有限公司'); chk(jy && jy.capital==='30,000' && jy.founded==='2019' && /新公司清冊/.test(jy.notes), `登記清冊的資本額（仟元）、成立年、備註：${jy&&jy.capital} / ${jy&&jy.founded} / ${jy&&jy.notes}`);
 chk((await pg.evaluate(()=>localStorage.getItem('daily-feed-on')))===TODAY, '記下今天挑過了');
 chk(await pg.locator('#importer').isHidden(), '靜默匯入，沒有打開匯入抽屜');

 // 再開一次不會再挑
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(2000);
 const again=await pg.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^每日新名單/.test(r.source)).length);
 chk(again===10, `同一天再開不會再挑：${again}`);

 // 每天打得完幾家：上限 30、新名單 10、今天那一列寫（新 8）
 await pg.click('#btnMenu, .menu-btn, [aria-label="更多"]').catch(async()=>{ await pg.click('header button:has-text("…"), header button:has-text("⋯")').catch(()=>{}); });
 await pg.click('[data-act="day-load"]', {force:true}).catch(()=>{});
 await pg.waitForSelector('#editorBody .day-load',{timeout:5000}).catch(()=>{});
 const caps=await pg.$$eval('#editorBody .cap-input',a=>a.map(x=>x.value));
 chk(caps[0]==='15' && caps[1]==='5', `主力上限預設 15、新名單額度（測試設 5）：${caps.join('|')}`);
 const first=await pg.locator('#editorBody .day-row').first().textContent();
 chk(/12 家（主力 2／新 10）/.test(first.replace(/\s+/g,' ')), `今天那一列：${first.replace(/\s+/g,' ')}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 幫新名單找日期：加入的最早從明天起；12 家 → 明天 10、後天 2
 const plan=await pg.evaluate(()=>window.planNewDates(Array(12).fill('')));
 chk(plan.filter(d=>d==='2026-10-06').length===5 && plan.filter(d=>d==='2026-10-07').length===5 && plan.filter(d=>d==='2026-10-08').length===2, `12 家、額度 5：一天 5 家排三天：${JSON.stringify(plan)}`);
 const want=await pg.evaluate(()=>window.Chattel.wantedDate({end:'2026/12/23'},60));
 chk(want==='2026-10-24', `到期前 60 天：${want}`);
 const placed=await pg.evaluate(()=>window.planNewDates(['2026-10-24']));
 chk(placed[0]==='2026-10-27', `10/24 是週六、10/26 光復節補假，排到 10/27：${placed[0]}`);
 // 畫面上的篩選跟基準無關：把動產擔保切到「全部」、登記清冊勾批發零售，候選還是同一批
 await pg.click('.tab[data-tab="chattel"]'); await pg.waitForSelector('#chattel-cards .card'); await pg.locator('#chattel-fDue .chip:has-text("全部")').click(); await pg.waitForTimeout(200);
 await pg.click('.tab[data-tab="leads"]'); await pg.waitForTimeout(300); await pg.locator('#leads-fInd .chip:has-text("批發零售")').click(); await pg.waitForTimeout(200);
 const cand=await pg.evaluate(async()=>{ const c=await window.Chattel.dailyCandidates(); const l=await window.Leads.dailyCandidates(); return {c:c.map(r=>r.cust.name), l:l.map(r=>r['公司名稱'])}; });
 chk(cand.c.length===3 && !cand.c.includes('昱昌汽車貨運股份有限公司') && cand.c.includes('老早過期有限公司') && cand.l.length===2, `動保挑了 2 家還剩 3（以前刪掉的昱昌分頁也不列了、成立年不明的老早過期還在），登記清冊還剩 2 家；跟畫面篩選無關：${JSON.stringify(cand)}`);
 // 今天不打了：今天排著的全部挪到下一個上班日（10/5 一 → 10/6 二）
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 const dueNow=await pg.evaluate(()=>window.customerViews().filter(v=>v.nextDate==='2026-10-05'&&!v.blocked).length);
 chk(/今天的 \d+ 家挪到 2026\/10\/06/.test(await pg.textContent("#feedBar")) && dueNow>0, `再補那一條有「挪到明天」：${(await pg.textContent('#feedBar')).replace(/\s+/g,' ')}`);
 await pg.click('#feedDefer'); await pg.waitForTimeout(300); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(800);
 const after=await pg.evaluate(()=>({today:window.customerViews().filter(v=>v.nextDate==='2026-10-05').length, next:window.customerViews().filter(v=>v.nextDate==='2026-10-06').length}));
 chk(after.today===0 && after.next===dueNow, `今天的 ${dueNow} 家全部挪到 10/6：${JSON.stringify(after)}`);
 chk(/今天還沒有新名單/.test(await pg.textContent('#feedBar')), `挪完今天那一條變空：${(await pg.textContent('#feedBar')).replace(/\s+/g,' ')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);

 // 假日（10/10 國慶、週六）：自動不挑；按「再補」排到下一個上班日 10/12
 const ctx2=await br.newContext();
 await ctx2.addInitScript(`{ const real=Date; window.__now=new real('2026-10-10T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx2.route('**/leads/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(LINDEX)}));
 await ctx2.route('**/leads/11508/*',r=>r.fulfill({status:200,contentType:'text/csv',body:LCSV}));
 await ctx2.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CINDEX)}));
 await ctx2.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CCSV}));
 await ctx2.route('**/leads/biz/monthly/**',r=>r.fulfill({status:404,body:''}));
 await ctx2.route('**/leads/biz/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BINDEX)}));
 await ctx2.route('**/leads/biz/biz.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:BCSV}));
 await ctx2.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(TINDEX)}));
 await ctx2.route('**/leads/trade/trade.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:TCSV}));
 await ctx2.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:404,body:''}));
 await ctx2.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NINDEX)}));
 await ctx2.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:NCSV}));
 const p2=await ctx2.newPage({viewport:{width:1300,height:1100}}); const errs2=[]; p2.on('pageerror',e=>errs2.push(e.message)); p2.on('dialog',d=>d.accept());
 await p2.goto('http://localhost:9485/index.html'); await p2.waitForSelector('#dropzone'); await p2.click('#importer .drawer-close');
 await p2.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('new-quota','5'); },SEED);
 await p2.reload(); await p2.waitForSelector('#btnImport'); await p2.waitForTimeout(2500);
 const hol=await p2.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^每日新名單/.test(r.source)).length);
 chk(hol===0, `放假那天自動不挑：${hol}`);
 const bar2=(await p2.textContent('#feedBar')).replace(/\s+/g,' ');
 chk(/今天放假（週六）/.test(bar2) && /下一個上班日 2026\/10\/12/.test(bar2), `名單頁那一條講清楚放假、再補排哪天：${bar2}`);
 await p2.click('#feedMore'); await p2.waitForTimeout(1500);
 const hol2=await p2.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^每日新名單/.test(r.source)).map(r=>r.nextDate));
 chk(hol2.length===5 && hol2.every(d=>d==='2026-10-12'), `假日按再補：5 家都排在下一個上班日 10/12：${[...new Set(hol2)].join('|')}`);
 chk(errs2.length===0, `假日那一輪沒有 JS 錯誤：${errs2.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`\n${bad} 個失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
