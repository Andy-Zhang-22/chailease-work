// 同負責人的其他公司（使用者選「同一個老闆的其他公司」、「6也做」）：詳細頁「🔍 同負責人的公司」打開連結視窗，用負責人姓名查商工登記
// （官方資料集 4B61A0F1，瀏覽器走自架代理）；已在名單的「連結這一家」、不在的「加入並連結」；自己那家不列；遮字的名字不給按；沒代理講清楚
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9591);
const mk=(id,company,taxId,owner)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'30,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner,keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:'2099-12-31',lastDate:'2026-09-01',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('hide-dealing','0');}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('https://data.gcis.nat.gov.tw/**',r=>r.abort('failed'));   // 瀏覽器直接打官方會被 CORS 擋
 let asked='';
 await ctx.route('https://proxy.example.workers.dev/**',r=>{ const inner=decodeURIComponent(new URL(r.request().url()).searchParams.get('url')||''); asked=inner;
   const body=/4B61A0F1/.test(inner)&&/Responsible_Name eq 王大明/.test(decodeURIComponent(inner))?[{Business_Accounting_NO:'11111111',Company_Name:'大明精密有限公司'},{Business_Accounting_NO:'22222222',Company_Name:'大明投資有限公司'},{Business_Accounting_NO:'33333333',Company_Name:'大明國際股份有限公司'}]:[];
   r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9591/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },[mk('1','大明精密有限公司','11111111','王大明'),mk('2','大明投資有限公司','22222222','王大明'),mk('3','遮字有限公司','44444444','李O華')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 // 遮字的負責人：沒有按鈕
 await pg.locator('#cards .card:has-text("遮字有限公司") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 chk(await pg.locator('#drawerBody .owner-search').count()===0, '負責人有遮字（李O華）不給查');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 // 沒設代理：講清楚要設代理
 await pg.locator('#cards .card:has-text("大明精密") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody .owner-search'); await pg.waitForSelector('#editorBody .group-registry'); await pg.waitForTimeout(600);
 chk(/要先設好自架代理/.test(await pg.textContent('#editorBody .group-registry')), `沒代理時講清楚：${(await pg.textContent('#editorBody .group-registry .rule-verdict')).slice(0,80)}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 // 設了代理：查得到，自己不列，已在名單的連結、不在的加入
 await pg.evaluate(()=>localStorage.setItem('registry-proxy-url','https://proxy.example.workers.dev'));
 await pg.locator('#cards .card:has-text("大明精密") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.click('#drawerBody .owner-search'); await pg.waitForSelector('#editorBody .group-registry'); await pg.waitForTimeout(800);
 chk(/4B61A0F1/.test(asked), `查的是官方 4B61A0F1、經由代理：${asked.slice(0,90)}`);
 const rows=await pg.$$eval('#editorBody .group-list-found .group-row',a=>a.map(x=>x.textContent.replace(/\s+/g,' ')));
 chk(rows.length===2 && /大明投資有限公司.*已在名單.*連結這一家/.test(rows.join('|')) && /大明國際股份有限公司.*名單裡沒有.*加入並連結/.test(rows.join('|')), `列出名下其他公司（自己不列）：${rows.join(' ／ ')}`);
 chk(/負責人「王大明」名下還有 2 家。同名同姓的人很多/.test(await pg.textContent('#editorBody .group-registry')), '提醒同名同姓');
 await pg.locator('#editorBody .group-list-found .group-row:has-text("大明投資") button').click(); await pg.waitForTimeout(800);
 const g=await pg.evaluate(()=>{ const v=window.customerViews(); const a=v.find(x=>x.id==='1'), b=v.find(x=>x.id==='2'); return !!a.group && a.group===b.group; });
 chk(g, '按「連結這一家」就連成同一個老闆');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
