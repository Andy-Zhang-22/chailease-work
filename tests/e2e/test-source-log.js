// 新名單分頁直接記錄（使用者：「我會在新名單找名單撥打電話，並且將它加入到重點名單，想即時編輯訪談內容都還要回到重點名單那搜尋」）：
// 各來源分頁卡片上的「已在名單　📝 記錄」點了就打開名單上那一筆、捲到「記錄這通電話」、游標在內容框；存好就記在名單那一筆
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9583);
const TODAY='2026-10-05';
const HEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const ROWS=[
 ['動產抵押登記','A1','40000001','已加入精密有限公司','20000001','新鑫股份有限公司','2026/08/01','2031/08/01','9000000','新北市新莊區中正路1號','1','','','108/01/01'],
 ['動產抵押登記','A2','40000002','還沒加入有限公司','20000001','新鑫股份有限公司','2026/07/01','2031/07/01','5000000','新北市新莊區中正路2號','1','','','108/01/01'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-10-01T02:00:00.000Z',dataThrough:'2026/09/01',total:ROWS.length,kept:ROWS.length,files:[{path:'ntpc.csv',rows:ROWS.length}]};
const REC={id:'1',source:'每日新名單-2026-10-02.csv',company:'已加入精密有限公司',aliases:[],taxId:'40000001',grade:'',founded:'2019',capital:'5,000',phoneRaw:'02-2222-3331',phones:[{digits:'0222223331',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'動保：新鑫',timeline:[],outcome:'new',nextDate:'2026-10-05',lastDate:null,addedDate:'2026-10-02'};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T10:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('feed-need-phone','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('rate-filter-default','0'); localStorage.setItem('leads-filters-open','1');}catch(e){}});
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9583/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords([r]); },REC);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 await pg.evaluate(()=>window.switchTab('chattel')); await pg.waitForSelector('#chattel-cards .card');
 await pg.locator('#chattel-fDue .chip:has-text("全部")').click(); await pg.waitForTimeout(300);
 const mineCard=pg.locator('#chattel-cards .card:has-text("已加入精密")');
 const badge=mineCard.locator('.badge-mine.is-log');
 chk(await badge.count()===1 && /已在名單・10\/2 加入.*📝 記錄/.test(await badge.textContent()), `已在名單那顆寫「📝 記錄」：${await badge.count() ? await badge.textContent() : '沒有'}`);
 chk(await pg.locator('#chattel-cards .card:has-text("還沒加入") .badge-mine').count()===0, '還沒加入的沒有');
 await badge.click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(500);
 chk(/已加入精密有限公司/.test(await pg.textContent('#drawerBody h2')), '打開名單上那一筆');
 const focused=await pg.evaluate(()=>document.activeElement && document.activeElement.closest('.logform') ? document.activeElement.tagName : '');
 chk(focused==='TEXTAREA', `游標直接在「記錄這通電話」的內容框：${focused}`);
 await pg.keyboard.type('老闆接了，要週轉金 500 萬，下週再打');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(600);
 const v=await pg.evaluate(()=>{ const x=window.customerViews().find(v=>v.id==='1'); return x.outcome+'|'+x.lastDate; });
 chk(v==='noanswer|2026-10-05' || v==='contacted|2026-10-05', `記在名單那一筆：${v}`);
 const logs=await pg.evaluate(async()=>(await window.Store.allLogs()).filter(l=>l.recordId==='1').map(l=>l.text));
 chk(logs.length===1 && /週轉金 500 萬/.test(logs[0]), `訪談內容存進去：${logs}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
