// 境外法人股東（使用者：「境外投資的公司會有公開資料拿找嗎」→「好做第三項試試」）：
// 查 g0v 的董監事名單，「所代表法人」是外國／境外法人的，卡片標 🌏、詳細頁負責人下面寫出來；90 天查一次；跟「商工登記自動更新」同一個開關
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9587);
const iso=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const TODAY=iso(new Date());
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'30,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'王大明',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:'2099-12-31',lastDate:'2026-09-01',addedDate:'2026-09-01'});
const G0V={
 '11111111':{公司名稱:'境外控股有限公司',董監事名單:[{序號:'0001',職稱:'董事長',姓名:'王大明',所代表法人:'',出資額:'0'},{序號:'0002',職稱:'董事',姓名:'李小華',所代表法人:[0,'薩摩亞商宏遠投資有限公司'],出資額:'9,000,000'}]},
 '22222222':{公司名稱:'本地法人股份有限公司',董監事名單:[{序號:'0001',職稱:'董事',姓名:'陳一',所代表法人:[12345678,'大華投資股份有限公司'],出資額:'1'}]},
 '33333333':{公司名稱:'新加坡投資有限公司',董監事名單:[{序號:'0001',職稱:'董事',姓名:'林二',所代表法人:[0,'新加坡商 MULTICO HOLDINGS PTE. LTD.'],出資額:'1'}]},
};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('hide-dealing','0'); if(!localStorage.getItem('registry-auto')) localStorage.setItem('registry-auto','0');}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 let calls=[];
 await ctx.route('https://company.g0v.ronny.tw/**',r=>{ const id=r.request().url().split('/').pop(); calls.push(id); const d=G0V[id];
   r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(d?{data:d}:{data:{}})}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9587/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },[mk('1','境外控股有限公司','11111111'),mk('2','本地法人股份有限公司','22222222'),mk('3','新加坡投資有限公司','33333333')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk(calls.length===0, `自動更新關著就不自動查：${calls.length} 次`);
 // 一批查（每天商工登記更新跑完後走的同一支）
 const got=await pg.evaluate(()=>window.refreshCorps(['1','2']));
 chk(JSON.stringify(got)==='{"1":["薩摩亞商宏遠投資有限公司"],"2":[]}', `只挑外國／境外法人，本地法人不算：${JSON.stringify(got)}`);
 await pg.waitForTimeout(400);
 const b1=pg.locator('#cards .card:has-text("境外控股有限公司") .badge-foreign');
 chk(await b1.count()===1 && /🌏 境外控股/.test(await b1.textContent()) && /薩摩亞商宏遠投資有限公司/.test(await b1.getAttribute('title')), '卡片標「🌏 境外控股」（租稅天堂），滑上去看法人名稱');
 chk(await pg.locator('#cards .card:has-text("本地法人") .badge-foreign').count()===0, '本地法人股東不標');
 const again=await pg.evaluate(()=>window.refreshCorps(['1']));
 chk(JSON.stringify(again)==='{}' && calls.length===2, `90 天內不重查：${calls.length} 次`);
 await pg.locator('#cards .card:has-text("境外控股有限公司") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const order=await pg.evaluate(()=>[...document.querySelectorAll('#drawerBody > dl.detail-grid > dt')].map(x=>x.textContent.trim()));
 chk(order.indexOf('境外法人股東')===order.indexOf('負責人')+1, `詳細頁負責人下面直接顯示：${order.join('、')}`);
 chk(/🌏 薩摩亞商宏遠投資有限公司/.test(await pg.textContent('#drawerBody dl.detail-grid')), '寫出法人名稱');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 await pg.fill('#search','境外法人'); await pg.waitForTimeout(400);
 const found=await pg.$$eval('#cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(found.length===1 && /境外控股/.test(found[0]), `搜尋「境外法人」找得到：${found.join('|')}`);
 await pg.fill('#search',''); await pg.waitForTimeout(200);
 // 自動更新開著：打開詳細頁就查那一家，結果直接補在負責人下面（今天的每日更新已跑過，不會整批跑）
 await pg.evaluate((t)=>{ localStorage.setItem('registry-auto','1'); localStorage.setItem('registry-auto-last',t); },TODAY);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 await pg.locator('#cards .card:has-text("新加坡投資") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(1200);
 chk(calls.includes('33333333') && /🌏 新加坡商 MULTICO HOLDINGS PTE\. LTD\./.test(await pg.textContent('#drawerBody dl.detail-grid')), `打開詳細頁就查、補在畫面上：${calls.join(',')}`);
 const st=await pg.evaluate(async()=>{ const s=await window.Store.getState('3'); return s && s.corps ? s.corps.foreign.join('|') : ''; });
 chk(st==='新加坡商 MULTICO HOLDINGS PTE. LTD.', `存進追蹤狀態（會同步）：${st}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
