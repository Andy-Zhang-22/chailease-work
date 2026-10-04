// 隱藏「中租往來」（使用者：「請幫我像隱藏禁止推廣一樣，隱藏中租往來的客戶」）：預設勾、記住；篩選點「中租往來」時不藏；家數照樣算
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9523);
const mk=(id,company,notes)=>({id,source:'A.csv',company,aliases:[],taxId:'1000000'+id,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:notes,timeline:[],outcome:'contacted',nextDate:'2026-10-20',lastDate:'2026-09-01',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1200,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9523/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('leads-hunt','0'); },
   [mk('1','往來中有限公司','2026/09/01 目前與中租有往來，承作中'),mk('2','沒往來有限公司','2026/09/01 有興趣'),mk('3','另一家沒往來有限公司','')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const dk=await pg.evaluate(()=>window.customerViews().map(v=>v.company+':'+v.dealingKind).join(' '));
 const names=async()=>pg.$$eval('#cards .card .card-name',a=>a.map(x=>x.textContent.trim()).sort().join('|'));
 chk(/往來中有限公司:active/.test(dk), `種子資料有一家中租往來：${dk}`);
 chk(await pg.isChecked('#hideDealing') && !(await names()).includes('往來中有限公司') && (await names()).split('|').length===2, `預設勾、中租往來的藏起來：${await names()}`);
 const chips=await pg.$$eval('#fltRelation .chip',a=>a.map(x=>x.textContent.replace(/\s+/g,'')).join('|'));
 chk(/1/.test(chips), `往來情形那組家數照樣算：${chips}`);
 await pg.locator('#fltRelation .chip').first().click(); await pg.waitForTimeout(300);
 chk((await names())==='往來中有限公司', `篩選點「中租往來」時不藏：${await names()}`);
 await pg.locator('#fltRelation .chip').first().click(); await pg.waitForTimeout(300);
 await pg.uncheck('#hideDealing'); await pg.waitForTimeout(300);
 chk((await names()).split('|').length===3, `取消勾就全部出來：${await names()}`);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk(!(await pg.isChecked('#hideDealing')) && (await names()).split('|').length===3, '重開記得沒勾');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
