// 版本 315 的三件事：
// 1. 詳細頁「空號」一鍵收起來：墓碑記 noPhone＋打不通的號碼；之後公開資料給的還是那支就不提醒，給了別支才提醒
// 2. 存完通話紀錄自動關閉詳細頁
// 3. Google 地圖金鑰在「設定：雲端同步、Google 金鑰」裡填；今天的新名單有沒電話的、又沒金鑰，名單上方提一句
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9631);
const TODAY='2026-10-09';
const mk=(id,company,taxId,phone,extra)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2015',capital:'3,000',phoneRaw:phone,phones:phone?[{digits:phone.replace(/\D/g,''),display:phone,ext:'',note:''}]:[],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-09-01'},extra||{});
const SEED=[mk('1','甲範例精密有限公司','11111111','02-0000-1234'),mk('2','乙範例實業有限公司','22222222','02-0000-9999'),mk('3','丙範例工業有限公司','33333333','02-0000-5678'),
 mk('4','丁範例新名單有限公司','44444444','',{source:`每日新名單-${TODAY}.csv`,addedDate:TODAY})];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 // 出進口廠商電話表：甲還是同一支（空號）、乙換了一支
 await ctx.route('**/leads/**',r=>{
   const u=r.request().url();
   if(/trade\/phones\.csv/.test(u)) return r.fulfill({status:200,contentType:'text/csv',body:'統編,電話,傳真,核發日期\n11111111,02-0000-1234,,2026/10/01\n22222222,02-0000-7777,,2026/10/01\n'});
   if(/trade\/index\.json/.test(u)) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({generatedAt:'a'})});
   return r.fulfill({status:404,body:''});
 });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9631/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1000);

 // 1. 空號
 const open=async(name)=>{ await pg.locator(`#cards .card:has-text("${name}") .card-name`).click(); await pg.waitForSelector('#drawerBody h2'); };
 await open('甲範例');
 chk((await pg.locator('#drawerBody .dead-tel').count())===1, '詳細頁電話旁有「空號」');
 await pg.click('#drawerBody .dead-tel'); await pg.waitForSelector('.ask-overlay');
 chk(/空號/.test(await pg.textContent('.ask-overlay')), '按了先確認');
 await pg.click('.ask-overlay button:has-text("空號，收起來")'); await pg.waitForTimeout(900);
 await open('乙範例'); await pg.click('#drawerBody .dead-tel'); await pg.waitForSelector('.ask-overlay'); await pg.click('.ask-overlay button:has-text("空號，收起來")'); await pg.waitForTimeout(900);
 chk(await pg.isHidden('#drawer') && (await pg.locator('#cards .card:has-text("甲範例")').count())===0, '收起來後離開詳細頁、名單上不見了');
 const tombs=await pg.evaluate(async()=>(await window.Store.getTombstones()).companies);
 chk(tombs['tax:11111111'].noPhone===true && JSON.stringify(tombs['tax:11111111'].deadTels)==='["0200001234"]', `墓碑記著空號的號碼：${JSON.stringify(tombs['tax:11111111'])}`);
 const hits=await pg.evaluate(async()=>(await window.phoneBackDaily({force:true})).map(h=>`${h.company}|${h.tel}`));
 chk(hits.length===1 && hits[0]==='乙範例實業有限公司|02-0000-7777', `公開資料還是同一支的不提醒，換了一支的才提醒：${hits.join('、')}`);
 await pg.waitForTimeout(300);
 chk(/之前找不到電話的 1 家/.test(await pg.textContent('#phoneBackBar')), '名單上面只提醒乙');
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('#menu [data-act="excluded"]'); await pg.waitForTimeout(800);
 const ex=(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 chk(/甲範例精密有限公司\s*空號/.test(ex) && /乙範例實業有限公司\s*空號\s*有電話了/.test(ex), `已排除的公司標「空號」：${ex.slice(0,160)}`);
 await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); })); await pg.waitForTimeout(200);

 // 2. 存完紀錄自動關閉
 await open('丙範例');
 await pg.selectOption('#drawerBody select','contacted'); await pg.fill('#drawerBody textarea','接通了，下週再聊');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
 chk(await pg.isHidden('#drawer'), '存完通話紀錄直接回到名單');
 chk(/已儲存通話紀錄/.test(await pg.textContent('#toast')), `有提示：${await pg.textContent('#toast')}`);
 chk((await pg.evaluate(async()=>(await window.Store.allLogs()).length))===1, '紀錄有存到');

 // 3. Google 金鑰
 chk(await pg.isVisible('#feedBar .feed-key'), '今天的新名單有沒電話的、沒金鑰：名單上方提一句');
 await pg.click('#feedBar .feed-key'); await pg.waitForTimeout(300);
 chk(await pg.isVisible('#syncSetup') && await pg.isVisible('#placesKeyInput'), '點了打開設定視窗，有金鑰欄');
 await pg.fill('#placesKeyInput','abc'); await pg.click('#btnSavePlacesKey'); await pg.waitForTimeout(300);
 chk(/看起來不對/.test(await pg.textContent('#toast')) && !(await pg.evaluate(()=>localStorage.getItem('places-api-key'))), '不像金鑰的不存');
 await pg.fill('#placesKeyInput','AIzaSyTESTKEY00000000000000000000000'); await pg.click('#btnSavePlacesKey'); await pg.waitForTimeout(400);
 chk((await pg.evaluate(()=>localStorage.getItem('places-api-key')))==='AIzaSyTESTKEY00000000000000000000000' && /自動補/.test(await pg.textContent('#toast')), '存了金鑰');
 await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); })); await pg.waitForTimeout(300);
 chk((await pg.locator('#feedBar .feed-key').count())===0, '有金鑰了就不再提');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
