// 開場白：照這家為什麼值得打給一句話；打完電話切回來自動開那家的通話紀錄
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9501);
const TODAY='2026-10-05';
const mk=(id,company,o)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:'',grade:'',founded:'',capital:'12,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-09-01'},o);
const RECS=[
 mk('1','星辰精密工業股份有限公司',{taxId:'11111111',notesRaw:'新公司清冊 115/8 變更：增資\n每日新名單，符合：本期、增資'}),
 mk('2','遠帆國際開發有限公司',{taxId:'22222222',notesRaw:'出進口廠商登記（貿易署）：進口＋出口，原始登記 2026-08-20'}),
 mk('3','律森科技股份有限公司',{taxId:'33333333',founded:'2019',notesRaw:''}),
 mk('4','範例數位文創股份有限公司',{taxId:'44444444',founded:'2001',notesRaw:'沒什麼訊號'}),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1200,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9501/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('feed-need-phone','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },RECS);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);

 const op=async(name)=>{ const c=pg.locator(`#cards .card:has-text("${name}")`).first(); return (await c.locator('.card-opener').count())? (await c.locator('.card-opener').textContent()).replace(/\s+/g,' ') : ''; };
 chk(/增資/.test(await op('星辰')) && /新莊分公司/.test(await op('星辰')), `清冊增資的卡片有開場白：${await op('星辰')}`);
 chk(/進出口/.test(await op('遠帆')), `剛做進出口的卡片有開場白：${await op('遠帆')}`);
 chk((await op('律森'))==='', '只有成立年的卡片上不放（太普遍），詳細頁才有');
 chk((await op('範例'))==='', '沒訊號的沒有開場白');
 await pg.locator('#cards .card:has-text("律森") .card-name').first().click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const dop=(await pg.locator('#drawerBody .detail-opener').textContent()).replace(/\s+/g,' ');
 chk(/成立 7 年/.test(dop) && (await pg.locator('#drawerBody .detail-opener .copy-dot').count())===1, `詳細頁有成立年的開場白＋複製點：${dop}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 按電話撥出去 → 記下是哪一家；切回來（visibilitychange）就開那一筆的通話紀錄、游標在內容框
 await pg.locator('#cards .card:has-text("星辰") a.tel').first().click().catch(()=>{}); await pg.waitForTimeout(200);
 const pend=await pg.evaluate(()=>JSON.parse(localStorage.getItem('pending-call')||'null'));
 chk(pend && pend.id==='1', `按電話記下是哪一家：${JSON.stringify(pend)}`);
 chk(await pg.isHidden('#drawer'), '按電話本身不會開詳細頁');
 await pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await pg.waitForTimeout(500);
 chk(await pg.isVisible('#drawer') && /星辰/.test(await pg.textContent('#drawerBody h2')), '切回網站就開那一家');
 chk(await pg.evaluate(()=>document.activeElement && document.activeElement.tagName==='TEXTAREA'), '游標已經在「記錄這通電話」的內容框');
 chk(/剛才打給 星辰/.test(await pg.textContent('#toast')), `提示：${await pg.textContent('#toast')}`);
 chk((await pg.evaluate(()=>localStorage.getItem('pending-call')))===null, '開過就清掉，不會一直跳');
 // 按過 tel: 連結之後無頭的 Chromium 不再把鍵盤滑鼠事件送進頁面（外部程式提示吃掉了），用頁面裡的 DOM click 關
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 chk(await pg.isHidden('#drawer'), '關得掉');
 // 超過 20 分鐘的不理
 await pg.evaluate(()=>localStorage.setItem('pending-call',JSON.stringify({id:'2',at:Date.now()-25*60000})));
 await pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await pg.waitForTimeout(300);
 chk(await pg.isHidden('#drawer'), '太久以前按的不會跳');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
