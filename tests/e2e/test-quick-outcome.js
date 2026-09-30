// 一鍵通話結果、資料狀態、禁止推廣原因與日期
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.csv':'text/csv'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9493);
const TODAY='2026-10-02';   // 週五：未接 → 10/5（週一）
const mk=(id,company)=>({id,source:'A.csv',company,aliases:[],taxId:'',grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-09-01',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1100,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9493/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('registry-auto','0'); },[mk('1','甲一有限公司'),mk('2','乙二有限公司'),mk('3','丙三有限公司'),mk('4','丁四有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 const card=(name)=>pg.locator('#cards .card',{hasText:name}).first();
 chk(await card('甲一有限公司').locator('.card-quick .btn').count()===4, '卡片上有四顆一鍵結果');
 await card('甲一有限公司').locator('.quick-noanswer').click(); await pg.waitForTimeout(600);
 chk(await pg.locator('#editor').isHidden(), '按一鍵不開詳細頁');
 let v=await pg.evaluate(()=>{ const x=window.customerViews().find(r=>r.company==='甲一有限公司'); return {o:x.outcome,n:x.nextDate,l:x.lastDate,logs:x.id}; });
 const logs=await pg.evaluate(async()=>(await window.Store.allLogs()).map(l=>`${l.recordId}|${l.outcome}|${l.text}|${l.date}`));
 chk(v.o==='noanswer' && v.n==='2026-10-05' && v.l===TODAY, `未接：未接通、下次 10/5（週一）、最近今天：${JSON.stringify(v)}`);
 chk(logs.includes(`1|noanswer|未接|${TODAY}`), `寫了一則紀錄：${logs.join(' ; ')}`);
 await card('乙二有限公司').locator('.quick-interested').click(); await pg.waitForTimeout(600);
 v=await pg.evaluate(()=>{ const x=window.customerViews().find(r=>r.company==='乙二有限公司'); return {o:x.outcome,n:x.nextDate,c:x.chance}; });
 chk(v.o==='contacted' && v.n==='2026-10-05' && v.c==='yes', `有興趣：已聯絡、3 天後→10/5、有機會：${JSON.stringify(v)}`);
 await card('丙三有限公司').locator('.quick-nointerest').click(); await pg.waitForTimeout(600);
 v=await pg.evaluate(()=>{ const x=window.customerViews().find(r=>r.company==='丙三有限公司'); return {o:x.outcome,n:x.nextDate,c:x.chance}; });
 chk(v.o==='contacted' && v.c==='no' && v.n>='2027-03-31', `無意願：無機會、半年後：${JSON.stringify(v)}`);
 // 禁止推廣：在通話紀錄裡標，卡片標籤帶日期，詳細頁有原因
 await pg.evaluate(async()=>{ await window.Store.addLog({recordId:'4',date:'2026-09-20',text:'老闆說不要再打',outcome:'blocked',createdAt:Date.now()}); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 await pg.locator('#hideBlocked').uncheck(); await pg.waitForTimeout(300);
 const badge=await card('丁四有限公司').locator('.badge-blocked').first();
 chk((await badge.textContent()).includes('禁止推廣 9/20') && (await badge.getAttribute('title')).includes('老闆說不要再打'), `禁止推廣標籤帶日期與原因：${await badge.textContent()} / ${await badge.getAttribute('title')}`);
 chk(await card('丁四有限公司').locator('.card-quick').count()===0, '禁止推廣的沒有一鍵結果');
 await card('丁四有限公司').click(); await pg.waitForTimeout(500);
 const warn=(await pg.textContent('#drawerBody .blocked-warning')).replace(/\s+/g,' ');
 chk(/2026\/9\/20|2026\/09\/20/.test(warn) && /老闆說不要再打/.test(warn), `詳細頁警示有日期與原因：${warn}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 // 資料狀態（清冊全部 404 → 全標紅）
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="data-status"]'); await pg.waitForTimeout(1500);
 const st=(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 chk(/資料狀態/.test(st) && /上市櫃公司/.test(st) && /讀不到/.test(st) && /項有問題/.test(st), `資料狀態面板：${st.slice(0,200)}`);
 chk(await pg.locator('#editorBody .status-table tr.is-bad').count()>=5, '五個來源都標紅');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'全部通過');
 await br.close(); srv.close();
})();
