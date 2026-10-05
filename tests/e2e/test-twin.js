// Claude 分身（使用者：「有辦法生成一個跟我一樣的企金業務在系統上嗎」→ AI 分身、「系統這邊也幫我做」）
// 選單設定網址（只收 claude.ai）、複製說明書；詳細頁「問分身」複製這家的資料（不帶電話、負責人、KEYMAN，訪談裡的電話遮掉）並打開分身專案；
// 沒設網址時按「問分身」先跳設定；今日覆盤的「複製給 Claude 整理」也開分身
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9553);
const TODAY='2026-10-05';
const REC={id:'1',source:'A.csv',company:'星辰精密有限公司',aliases:[],taxId:'20000001',grade:'',founded:'2018',capital:'30,000',capitalPaid:'25,000',phoneRaw:'02-2222-3331',phones:[{digits:'0222223331',ext:'',note:''}],owner:'王O明',keyman:'陳經理',industry:'金屬加工',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:'2026-10-08',lastDate:TODAY,addedDate:'2026-09-01'};
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

 // 沒設網址：按「問分身」先跳設定
 await pg.locator('#cards .card .card-name').first().click(); await pg.waitForSelector('#drawerBody h2');
 const tb=await pg.evaluate(()=>{const b=document.querySelector('#drawerBody button.twin-btn'); return b?[b.textContent,b.title,b.getAttribute('aria-label')].join('|'):'';});
 chk(tb==='🤖|問 Claude|問 Claude', `問分身按鈕只放 🤖、滑過提示「問 Claude」：${tb}`);
 await pg.click('#drawerBody button.twin-btn'); await pg.waitForTimeout(200);
 chk(/Claude 分身/.test(await pg.textContent('#editorBody')) && (await pg.evaluate(()=>window.__opened.length))===0, '沒設網址時先跳出設定，不亂開');
 await pg.click('#editorBody button:has-text("複製分身說明書")'); await pg.waitForTimeout(150);
 chk(/你是我的分身：中租租賃新莊分公司的企金業務/.test(await last()) && /利率不敏感的客群/.test(await last()), '複製分身說明書');
 await pg.fill('#editorBody .twin-url','https://example.com/x'); await pg.click('#editorBody button:has-text("存起來")'); await pg.waitForTimeout(150);
 chk(await pg.locator('#editorBody .save-err').isVisible(), '不是 claude.ai 的網址不收');
 await pg.fill('#editorBody .twin-url','https://claude.ai/project/abc123'); await pg.click('#editorBody button:has-text("存起來")'); await pg.waitForTimeout(300);
 const op=await pg.evaluate(()=>window.__opened);
 chk(op[0]==='https://claude.ai/project/abc123', `存好之後接著把剛才那家送去分身：${op}`);
 const p=await last();
 chk(/請照專案說明，幫我看這家客戶/.test(p) && /星辰精密有限公司（統編 20000001）/.test(p) && /成立 2018（8 年）｜資本總額 30,000 仟元/.test(p) && /實收 25,000 仟元｜產業 金屬加工/.test(p) && /新北市新莊區/.test(p), `給分身的公司資料：${p.slice(0,260)}`);
 chk(/要買 CNC 約 800 萬/.test(p) && /下一步：週四前寄報價/.test(p) && /（電話略）/.test(p), '訪談內容帶過去、裡面的電話遮掉');
 chk(!/0912|345-678|02-2222-3331|0222223331|王O明/.test(p) && /KEYMAN 欄位沒有附上/.test(p), '電話、負責人、KEYMAN 欄位不帶（訪談裡的電話也遮掉），結尾寫明');
 chk((await pg.evaluate(()=>localStorage.getItem('claude-twin-url')))==='https://claude.ai/project/abc123', '網址存起來');
 // 選單也找得到；今日覆盤開分身
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 await pg.click('#btnMenu'); chk(await pg.locator('#menu [data-act="twin"]').count()===1, '選單有「Claude 分身」');
 await pg.click('#menu [data-act="review"]'); await pg.waitForSelector('#editorBody .review');
 await pg.click('#editorBody button:has-text("複製給 Claude 整理")'); await pg.waitForTimeout(150);
 chk((await pg.evaluate(()=>window.__opened))[1]==='https://claude.ai/project/abc123', '今日覆盤的「複製給 Claude 整理」也開分身');
 // 手機：Claude App 只接 claude.ai/new，專案網址會變成開網頁版（使用者：「我用手機點問分身為什麼沒有連動到我手機上的 claude」）
 // → 開 claude.ai/new（用真的連結在同一次點擊裡打開），複製的內容前面附分身說明書；手機上沒設網址也能用
 const mctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
 await mctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T10:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await mctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}
   window.__copied=[]; window.__opened=[]; window.__links=[]; window.open=(u)=>{window.__opened.push(u); return null;};
   document.addEventListener('click',(e)=>{ const a=e.target&&e.target.closest&&e.target.closest('a'); if(a&&/claude\.ai/.test(a.href)){ window.__links.push(a.href+'|'+a.target); e.preventDefault(); } },true);
   try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied.push(t);}},configurable:true}); }catch(e){} });
 await mctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const mp=await mctx.newPage(); mp.on('pageerror',e=>errs.push('手機：'+e.message)); mp.on('dialog',d=>d.accept());
 await mp.goto('http://localhost:9553/index.html'); await mp.waitForSelector('#dropzone');
 await mp.evaluate(()=>{ const c=document.querySelector('#importer .drawer-close'); if(c) c.click(); });
 await mp.evaluate(async(r)=>{ await window.Store.saveRecords([r]); },REC);
 await mp.reload(); await mp.waitForSelector('#btnImport'); await mp.waitForTimeout(800);
 await mp.locator('#cards .card .card-name').first().click(); await mp.waitForSelector('#drawerBody h2');
 await mp.click('#drawerBody button.twin-btn'); await mp.waitForTimeout(300);
 const ml=await mp.evaluate(()=>({links:window.__links,opened:window.__opened,copied:window.__copied[window.__copied.length-1]||'',setup:/Claude 分身/.test((document.querySelector('#editor:not([hidden]) #editorBody')||{}).textContent||'')}));
 chk(JSON.stringify(ml.links)==='["https://claude.ai/new|_blank"]' && !ml.opened.length && !ml.setup, `手機開 claude.ai/new（App 接得到），沒設網址也不跳設定：${JSON.stringify(ml.links)} ${JSON.stringify(ml.opened)}`);
 chk(/^你是我的分身：中租租賃新莊分公司的企金業務/.test(ml.copied) && /以下是這次要你看的/.test(ml.copied) && /星辰精密有限公司（統編 20000001）/.test(ml.copied), `手機複製的內容前面附上分身說明書，後面是這家：${ml.copied.slice(0,60)}…`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
