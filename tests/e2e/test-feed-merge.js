// 每日新名單：商行以外五頁揉在一起（使用者：「除了商行那頁外其他五頁揉在一起，照總分挑但每分頁至少保底」）——同一家在好幾頁的訊號加總、排第一、每頁保底
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9567);
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
 ['動產抵押登記','115新經動字第000999號','22222222','乙二機械股份有限公司','20000002','和潤企業股份有限公司','2026/08/15','2031/08/15','9000000','新北市泰山區中港西路2號','2','2026/08/20','','105/01/01'],
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
 ['61111111','新莊好商行','獨資','12000000','2023/03/01','新北市新莊區中正路371號','471','雜貨','','','Y','王好人','12000000','Y'],
 ['62222222','板橋企業社','合夥','1500000','2010/05/01','新北市板橋區文化路1號','472','五金','','','Y','李板橋','1500000','Y'],
 ['64444444','新設小商行','獨資','3000000','2024/01/01','新北市新莊區中正路2號','471','雜貨','','','N','','3000000','N'],
 ['63333333','只有稅籍商行','獨資','60000000','2003/08/01','新北市新莊區中正路1號','481','水電','','','N','','60000000','N'],
];
const BCSV='\uFEFF'+[BHEAD,...BROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const BINDEX={generatedAt:'2026-09-29T13:00:00.000Z',fileDate:'29-SEP-26',cities:['新北市'],minCapital:500000,total:3,byOrg:{'獨資':2,'合夥':1},byDist:{'新莊區':2,'板橋區':1},withOwner:2,taxOnly:1,files:[{path:'biz.csv',rows:3}]};
const THEAD='統編,名稱,英文名稱,地址,代表人,電話,傳真,原始登記日期,核發日期,進口,出口,成立日期,資本額';
const TROWS=[
 ['70000001','晨光貿易有限公司','MORNING TRADE','新北市新莊區中正路100號','王O明','02-2990-1234','','2026/08/20','2026/09/10','Y','Y','108/10/01','12000000'],
 ['70000002','板橋出口有限公司','','新北市板橋區文化路1號','李O華','02-2960-1111','','2025/01/15','2025/01/15','N','Y','110/03/01','3000000'],
 ['22222222','乙二機械股份有限公司','','新北市泰山區中港西路2號','李O二','02-2999-2222','','2026/07/01','2026/07/01','Y','Y','105/01/01','50000000'],
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
const EHEAD='統編,名稱,屬性,地址,首見年月,設立日期,組織別,資本額,行業代號,行業,開發票,電話';
const EROWS=[
 ['70000009','新開發票有限公司','B2B','新北市新莊區中正路200號','202610','108/05/01','有限公司','20000000','4610','商品批發經紀業','Y','02-2990-9999'],
 ['22222222','乙二機械股份有限公司','B2B','新北市泰山區中港西路2號','202610','105/01/01','股份有限公司','50000000','2911','機械製造業','Y','02-2999-2222'],
 ['70000008','沒電話發票有限公司','B2C','新北市板橋區文化路2號','202610','110/05/01','有限公司','3000000','4711','零售業','Y',''],
];
const ECSV='\uFEFF'+[EHEAD,...EROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const EINDEX={generatedAt:'2026-10-03T20:00:00.000Z',cities:['新北市'],years:3,baseline:'202609',dataYm:'202610',total:2,newTotal:2,newThisMonth:2,withPhone:1,files:[{path:'einv.csv',rows:2}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1});
const SEED=[mk('1','主力客戶一有限公司','99999991'), mk('2','主力客戶二有限公司','99999992')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1');}catch(e){}});
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
 await ctx.route('**/leads/einv/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(EINDEX)}));
 await ctx.route('**/leads/einv/einv.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:ECSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9567/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('new-quota','10'); localStorage.setItem('daily-feed-auto','0');
   // 昱昌以前刪掉過（公司墓碑）：挑的時候就要跳過，不然挑了 4 家只進來 3 家
   await window.Store.addCompanyTombstones([{key:'tax:53217846',company:'昱昌汽車貨運股份有限公司',taxId:'53217846'}]); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(2500);
 const pv=await pg.evaluate(()=>window.mergedFeedPreview());
 const top=pv[0];
 chk(top && top.name==='乙二機械股份有限公司', `同一家出現在四頁、訊號最多的排第一：${pv.slice(0,3).map(x=>x.name+'('+x.signals.length+')').join('、')}`);
 chk(top && ['本期增資','剛做進出口','剛開電子發票','最近買設備（2026/08）','跟同業借（和潤）'].every(x=>top.signals.includes(x)) && ['ch','le','tr','ei'].every(k=>top.srcs.includes(k)), `訊號加總：${top&&top.signals.join('、')}／來源 ${top&&top.srcs.join(',')}`);
 chk(pv.filter(x=>x.name==='乙二機械股份有限公司').length===1, '同一家只算一次');
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="feed-more"]'); await pg.waitForTimeout(3000);
 const fed=await pg.evaluate(async()=>(await window.Store.allRecords()).filter(r=>/^每日新名單/.test(r.source)).map(r=>({company:r.company,notes:(r.notesRaw.match(/每日新名單，[^\n]*/)||[''])[0],head:r.notesRaw.split('\n')[0]})));
 const yi=fed.find(f=>f.company==='乙二機械股份有限公司');
 chk(yi && /符合：[^；]*本期增資/.test(yi.notes) && /剛做進出口/.test(yi.notes) && /最近買設備（2026\/08）/.test(yi.notes) && !/也在：|其他：|保底/.test(yi.notes), `訪談內容只寫合併後的訊號（也在、其他條件、保底不寫）：${yi&&yi.notes}`);
 // 保底不寫進訪談內容了：改看每家第一行是哪一頁的資料
 const g=[['動產擔保',/^動保：/],['登記清冊',/^新公司清冊/],['出進口廠商',/^出進口廠商登記/],['剛開始請人',/^健保新投保/],['剛開電子發票',/^電子發票 /]].filter(([,re])=>fed.some(f=>re.test(f.head))).map(([l])=>l);
 chk(g.length===5, `每頁至少保底一家：${g.join('、')}`);
 chk(fed.some(f=>/商行|企業社/.test(f.company)), `商行照自己的規則另外挑：${fed.filter(f=>/商行|企業社/.test(f.company)).map(f=>f.company).join('、')}`);
 chk(fed.filter(f=>f.company==='乙二機械股份有限公司').length===1, '揉合後同一家只進來一次');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
