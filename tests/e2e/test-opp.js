// 重新聯絡的時機（使用者：「都做」）：🔁 換約時機（同業動保 3 個月內到期、30 天沒聯絡）、📈 有新變化（無機會／久沒聯絡後又變更登記）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9571);
const TODAY='2026-10-05';
const HEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const C=(no,tax,name,lender,end)=>['動產抵押登記',no,tax,name,'20000001',lender,'2023/12/01',end,'9000000','新北市新莊區中正路1號','1','','','108/01/01'];
const ROWS=[
 C('A1','40000001','換約甲有限公司','合迪股份有限公司','2026/12/01'),
 C('A2','40000002','剛聯絡乙有限公司','合迪股份有限公司','2026/11/20'),
 C('A3','40000003','銀行丙有限公司','臺灣銀行股份有限公司','2026/11/20'),
 C('A7','40000007','已排丁有限公司','新鑫股份有限公司','2026/11/20'),
];
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-01T02:00:00.000Z',dataThrough:'2026/09/01',total:ROWS.length,kept:ROWS.length,files:[{path:'ntpc.csv',rows:ROWS.length}]};
const mk=(id,company,o)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:'4000000'+id,grade:'',founded:'2018',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'2026/08/01 談過',timeline:[],outcome:'contacted',nextDate:'2099-12-31',lastDate:'2026-08-01',addedDate:'2026-01-01'},o);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1100}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('hide-dealing','0');}catch(e){}});
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9571/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 const chanceAt=new Date('2026-06-01T10:00:00').getTime();
 await pg.evaluate(async([recs,chanceAt])=>{ await window.Store.saveRecords(recs); const now=Date.now();
   await window.Store.setState({recordId:'4',outcome:'contacted',lastDate:'2026-06-01',nextDate:null,chance:'no',chanceAt,updatedAt:now,regChanges:[{date:'2026-09-16',kinds:['capitalUp']}]});
   await window.Store.setState({recordId:'5',outcome:'contacted',lastDate:'2026-05-01',nextDate:null,updatedAt:now,regChanges:[{date:'2026-08-20',kinds:['address']}]});
   await window.Store.setState({recordId:'6',outcome:'contacted',lastDate:'2026-05-01',nextDate:null,updatedAt:now,regChanges:[{date:'2026-04-01',kinds:['capitalUp']}]});
 },[[mk('1','換約甲有限公司'),mk('2','剛聯絡乙有限公司',{lastDate:'2026-09-25'}),mk('3','銀行丙有限公司'),mk('4','無機會增資有限公司'),mk('5','久沒聯絡遷址有限公司'),mk('6','變更在前有限公司'),mk('7','已排丁有限公司',{nextDate:'2026-10-07'})],chanceAt]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);
 const names=async()=>pg.$$eval('#cards .card .card-name',a=>a.map(x=>x.textContent.trim()).sort().join('|'));
 const opp=await pg.evaluate(()=>window.customerViews().filter(v=>v.opp&&v.opp.length).map(v=>v.company+':'+v.opp.join(',')).sort().join(' '));
 chk(opp==='久沒聯絡遷址有限公司:fresh 換約甲有限公司:renew 無機會增資有限公司:fresh', `只挑對的：${opp}`);
 const barText=await pg.locator('#oppBar').textContent();
 chk(await pg.locator('#oppBar').isVisible() && /🔁 換約時機 1 家/.test(barText) && /📈 有新變化 2 家/.test(barText), `名單上方出現時機列：${barText}`);
 await pg.locator('#oppBar [data-opp="renew"]').click(); await pg.waitForTimeout(300);
 chk((await names())==='換約甲有限公司', `按「換約時機」只剩那一家：${await names()}`);
 const badge=await pg.locator('#cards .card .badge-opp').first().textContent();
 chk(/🔁 換約時機/.test(badge), `卡片標 🔁：${badge}`);
 chk(/看全部/.test(await pg.locator('#oppBar [data-opp="renew"]').textContent()), '按下去的那顆變「看全部」');
 await pg.locator('#oppBar [data-opp="renew"]').click(); await pg.waitForTimeout(300);
 chk((await names()).split('|').length===7, `再按一次取消：${await names()}`);
 await pg.locator('#oppBar [data-opp="fresh"]').click(); await pg.waitForTimeout(300);
 chk((await names())==='久沒聯絡遷址有限公司|無機會增資有限公司', `按「有新變化」：${await names()}`);
 const fb=await pg.$$eval('#cards .card .badge-opp',a=>a.map(x=>x.textContent).join('|'));
 chk(/📈 增資 /.test(fb) && /📈 變更登記地址 /.test(fb), `卡片寫哪種變更：${fb}`);
 const chips=await pg.$$eval('#fltOpp .chip',a=>a.map(x=>x.textContent.replace(/\s+/g,'')).join('|'));
 chk(/^1🔁換約時機/.test(chips) && /2📈有新變化/.test(chips), `篩選「重新聯絡的時機」：${chips}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
