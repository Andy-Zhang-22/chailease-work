// 主力名單從公開資料補電話（版本 363；使用者：「找名單的分頁就有我主力名單的手機聯繫方式，但我不知道」）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9639);
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const NHEAD='統編,名稱,地址,行業代號,行業,成立日期,投保年月,電話,資本額';
const NROWS=[
 ['11111111','甲一精密有限公司','新北市新莊區中正路1號','4582','運動用品批發業','108/09/03','202609','02-2960-0000','12000000'],   // 主力沒電話 → 填市話
 ['22222222','乙二機械股份有限公司','新北市泰山區中港西路2號','4552','服裝批發業','104/08/14','202609','0912-345-678','3000000'],   // 主力只有市話 → 手機加成第二支
];
const NCSV='﻿'+[NHEAD,...NROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const NINDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:6,total:2,withPhone:2,latestYm:'2026/09',files:[{path:'nhi.csv',rows:2}]};
const EHEAD='統編,名稱,屬性,地址,首見年月,設立日期,組織別,資本額,行業代號,行業,開發票,電話';
const EROWS=[
 ['33333333','丙三工程有限公司','新設','新北市五股區五權路3號','202609','2026/08/01','有限公司','20000000','4311','水電工程業','Y','0933-444-555'],   // 主力已有手機 → 不動
 ['44444444','丁四貿易有限公司','新設','新北市新莊區中正路4號','202609','2026/08/02','有限公司','10000000','4610','批發業','Y','0922-778-899'],   // 禁止推廣 → 不動
];
const ECSV='﻿'+[EHEAD,...EROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const EINDEX={generatedAt:'2026-10-02T20:00:00.000Z',cities:['新北市'],months:6,total:2,withPhone:2,latestYm:'2026/09',files:[{path:'einv.csv',rows:2}]};
const mk=(id,company,taxId,phoneRaw)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'3,000',phoneRaw,phones:[],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));   // 先登記的在後面：其他清冊一律 404，下面指定的才有資料
 await ctx.route('**/leads/nhi/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(NINDEX)}));
 await ctx.route('**/leads/nhi/nhi.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:NCSV}));
 await ctx.route('**/leads/einv/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(EINDEX)}));
 await ctx.route('**/leads/einv/einv.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:ECSV}));
 const pg=await ctx.newPage({viewport:{width:1100,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9639/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');
   await window.Store.setState({ recordId:'r4', outcome:'blocked', updatedAt: Date.now() }); },
   [mk('r1','甲一精密有限公司','11111111',''), mk('r2','乙二機械股份有限公司','22222222','02-2222-3333'), mk('r3','丙三工程有限公司','33333333','0911-000-000'), mk('r4','丁四貿易有限公司','44444444','')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const res=await pg.evaluate(()=>window.publicPhones('',{toast:true}));
 chk(res.tried===1 && res.found===1 && res.mobiles===1, `沒電話 1 家對到 1 家、多了手機 1 家：${JSON.stringify(res)}`);
 await pg.waitForTimeout(400);
 const v=await pg.evaluate(()=>Object.fromEntries(window.customerViews().map(x=>[x.id,{phones:x.phones.map(p=>p.dial),src:x.phoneSource&&x.phoneSource.name,mob:x.mobileSource&&x.mobileSource.name}])));
 chk(v.r1.phones.length===1 && v.r1.phones[0]==='0229600000' && /剛開始請人/.test(v.r1.src||''), `沒電話的填了、來源記剛開始請人：${JSON.stringify(v.r1)}`);
 chk(v.r2.phones.length===2 && v.r2.phones[0]==='0222223333' && v.r2.phones[1]==='0912345678' && /剛開始請人/.test(v.r2.mob||''), `只有市話的多了手機、原本的沒蓋掉：${JSON.stringify(v.r2)}`);
 chk(v.r3.phones.length===1 && v.r3.phones[0]==='0911000000', `已經有手機的不動：${JSON.stringify(v.r3)}`);
 chk(v.r4.phones.length===0, `禁止推廣的不動：${JSON.stringify(v.r4)}`);
 const again=await pg.evaluate(()=>window.publicPhones('',{}));
 chk(again.found===0 && again.mobiles===0, `再跑一次不會重複加：${JSON.stringify(again)}`);
 await pg.click('#card-r2 .card-name, .card[data-id="r2"] .card-name').catch(()=>null);
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('.card')].find(x=>x.textContent.includes('乙二機械')); if(c){ const n=c.querySelector('.card-name'); if(n) n.click(); } });
 await pg.waitForTimeout(500);
 const detail=await pg.textContent('#drawer').catch(()=>'');
 chk(/手機來自剛開始請人/.test(detail), `詳細頁寫手機來自哪一頁：${(detail.match(/手機來自[^）]*）/)||[''])[0]}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`${bad} 項失敗`:'全部通過'); process.exit(bad?1:0);
})();
