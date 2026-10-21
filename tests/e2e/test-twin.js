// Claude 分身（使用者：「有辦法生成一個跟我一樣的企金業務在系統上嗎」→ AI 分身、「系統這邊也幫我做」）
// 版本 364：選單的「Claude 分身」入口、今日覆盤都拿掉了（一個月 0 次、1 次）；設定頁只剩「拍名片給分身讀」還沒設網址時會開。
// 詳細頁的「🤖 問 Claude」版本 316 拿掉了（使用次數 0），覆盤照樣走分身（今日撥打戰略版本 319 也拿掉了）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9553);
const TODAY='2026-10-05';
const REC={id:'1',source:'A.csv',company:'星辰精密有限公司',aliases:[],taxId:'20000001',grade:'',founded:'2018',capital:'30,000',capitalPaid:'25,000',phoneRaw:'02-2222-3331',phones:[{digits:'0222223331',ext:'',note:''}],owner:'王O明',keyman:'',industry:'金屬加工',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:TODAY,lastDate:'2026-10-05',addedDate:'2026-09-01'};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T10:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}
   window.__copied=[]; window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return null;};
   try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied.push(t);}},configurable:true}); }catch(e){} });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9553/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords([r]);
   await window.Store.addLog({recordId:'1',date:'2026-10-05',text:'老闆說要買 CNC 約 800 萬，打 0912-345-678 找陳經理\n下一步：週四前寄報價',outcome:'contacted',createdAt:Date.now()-1e6}); },REC);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const last=()=>pg.evaluate(()=>window.__copied[window.__copied.length-1]||'');

 // 詳細頁沒有 🤖 了
 await pg.locator('#cards .card .card-name').first().click(); await pg.waitForSelector('#drawerBody h2');
 chk((await pg.locator('#drawerBody button.twin-btn').count())===0, '詳細頁沒有「🤖 問 Claude」（版本 316 拿掉）');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 // 版本 364：選單沒有「Claude 分身」、也沒有「今日覆盤」了；設定頁從「新增客戶 → 拍名片給分身讀」進（電腦、還沒設網址）
 await pg.click('#btnMenu'); chk(await pg.locator('#menu [data-act="twin"]').count()===0 && await pg.locator('#menu [data-act="review"]').count()===0, '選單沒有「Claude 分身」「今日覆盤」');
 await pg.click('#btnMenu'); await pg.waitForTimeout(150);
 await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
 await pg.click('#editorBody button:has-text("拍名片給分身讀")'); await pg.waitForTimeout(200);
 chk(/Claude 分身/.test(await pg.textContent('#editorBody')), '還沒設網址：先開分身設定');
 await pg.click('#editorBody button:has-text("複製分身說明書")'); await pg.waitForTimeout(150);
 chk(/你是我的分身：中租租賃新莊分公司的企金業務/.test(await last()) && /利率不敏感的客群/.test(await last()), '複製分身說明書');
 await pg.fill('#editorBody .twin-url','https://example.com/x'); await pg.click('#editorBody button:has-text("存起來")'); await pg.waitForTimeout(150);
 chk(await pg.locator('#editorBody .save-err').isVisible(), '不是 claude.ai 的網址不收');
 await pg.fill('#editorBody .twin-url','https://claude.ai/project/abc123'); await pg.click('#editorBody button:has-text("存起來")'); await pg.waitForTimeout(300);
 chk((await pg.evaluate(()=>localStorage.getItem('claude-twin-url')))==='https://claude.ai/project/abc123', '網址存起來');
 chk(await pg.locator('#kvPaste').count()===1, '存好接著回到新增客戶');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
