// 畫面瘦身（使用者：「一個原則，畫面別太複雜 簡單明瞭」）：選單外面八項、其餘在「進階」；隱藏禁止推廣在篩選裡、中租往來留外面；
// 有電話的卡片沒有 Google／地圖／104／1111（詳細頁有）；詳細頁編輯資料等收在「⋯」、刪除這筆留外面；回撥提醒預設收起；讓 AI 整理
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9611);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9611/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 const add=async(kv)=>{ await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
   await pg.fill('#kvPaste',kv); await pg.waitForTimeout(150); await pg.click('#editorBody button:has-text("新增")'); await pg.waitForTimeout(600);
   await pg.evaluate(()=>document.querySelectorAll('.drawer-close').forEach(b=>{ if(b.offsetParent) b.click(); })); await pg.waitForTimeout(200); };
 await add('公司名稱：甲範例精密有限公司\n電話：02-0000-0001\n地址：新北市新莊區中正路1號');
 await add('公司名稱：乙範例實業有限公司\n地址：新北市五股區五工路2號');

 await pg.click('#btnMenu');
 const vis=await pg.evaluate(()=>[...document.querySelectorAll('#menu button')].filter(b=>b.offsetParent&&b.dataset.act!=='menu-more').map(b=>b.textContent));
 chk(vis.length===3 && vis.includes('今日覆盤') && vis.includes('匯出 Excel') && vis.includes('Claude 分身') && !vis.includes('商工登記更新'), `選單外面三項：${vis.join('、')}`);
 await pg.click('#menu [data-act="menu-more"]');
 chk(await pg.isVisible('#menu [data-act="registry"]') && await pg.isVisible('#menu [data-act="wipe"]'), '點「進階」才看得到其餘功能');
 await pg.click('#btnMenu'); await pg.click('#btnMenu');
 chk(!(await pg.isVisible('#menu [data-act="registry"]')), '下次打開選單「進階」又收起來');
 await pg.click('#btnMenu');

 chk(await pg.isVisible('#hideDealing') && (await pg.locator('#filters #hideBlocked').count())===1 && (await pg.locator('.list-head #hideBlocked').count())===0, '隱藏中租往來在外面、隱藏禁止推廣在篩選裡');
 const withTel=pg.locator('#cards .card:has-text("甲範例")'), noTel=pg.locator('#cards .card:has-text("乙範例")');
 chk((await withTel.locator('.phone-search').count())===0 && (await noTel.locator('.phone-search a').count())===4, '有電話的卡片沒有找電話那排，沒電話的有');

 await withTel.locator('.card-name').click(); await pg.waitForSelector('#drawerBody h2');
 chk((await pg.locator('#drawerBody .phone-search a').count())===4, '詳細頁有 Google／地圖／104／1111');
 chk(await pg.isVisible('#drawerBody button:has-text("刪除這筆")') && await pg.isVisible('#drawerBody button:has-text("編輯資料")') && await pg.isVisible('#drawerBody button:has-text("匯出 Excel")'), '刪除這筆、編輯資料、匯出 Excel 都在外面');
 const gone=await pg.evaluate(()=>['承作檢核','拜訪準備'].filter(t=>[...document.querySelectorAll('#drawerBody button')].some(b=>b.textContent.trim()===t)).concat(document.querySelector('#drawerBody .twin-btn')?['🤖']:[], document.querySelector('#drawerBody .detail-acts-more')?['⋯']:[]));
 chk(gone.length===0 && (await pg.locator('#drawerBody .chance-btn').count())===2, `承作檢核、拜訪準備、🤖、⋯ 拿掉了，有機會／無機會留著：${gone.join('、')||'無'}`);
 chk(!(await pg.evaluate(()=>document.querySelector('#drawerBody .remind-section').open)), '回撥提醒預設收起');
 chk((await pg.locator('#drawerBody button:has-text("讓 AI 整理")').count())===0 && (await pg.locator('#drawerBody button:has-text("訊息草稿")').count())===0, '「讓 AI 整理」「訊息草稿」拿掉了');
 await pg.click('#drawerBody .remind-section > summary'); await pg.click('#drawerBody button:has-text("1 小時後")'); await pg.waitForTimeout(600);
 chk(await pg.evaluate(()=>document.querySelector('#drawerBody .remind-section').open), '設了提醒之後回撥提醒自動展開');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
