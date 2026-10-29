// 同老闆的其他電話（版本 399；使用者：「這兩個是關企，為甚麼電話沒有同步」）：
// 甲、乙同老闆連結、各有自己的手機 → 甲的抽屜多一排「同老闆的其他電話」列乙的手機（標明是乙的），乙也一樣；卡片照舊只放自己那支
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9619);
const mk=(id,company,tel)=>({id,source:'測試',company,aliases:[],taxId:'',grade:'',founded:'',capital:'',phoneRaw:tel,phones:[],owner:'',keyman:'',industry:'',nextDate:'',lastDate:'2026-10-20',addedDate:'2026-09-01',country:'台灣',address:'新北市新莊區中正路1號',notesRaw:'',timeline:[],outcome:'contacted'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{['registry-auto','daily-feed-auto','auto-rebalance'].forEach(k=>localStorage.setItem(k,'0'));}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9619/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); const now=Date.now();
   for (const id of ['a','b']) await window.Store.setState({recordId:id,group:'g1',groupIds:['a','b'],groupAt:now,updatedAt:now}); },
   [mk('a','老闆甲科技有限公司','0912-333-444 王老闆'),mk('b','二代乙工程行','0933-111-222 王二代'),mk('c','路人丙有限公司','02-2222-3333')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1000);
 const extra=async(id)=>{ await pg.evaluate((i)=>window.openCustomer(i),id); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(200);
   const t=await pg.evaluate(()=>{const g=document.querySelector('#drawerBody .group-phones'); return g?g.textContent.replace(/\s+/g,' ').trim():'';});
   const n=await pg.locator('#drawerBody .group-phones a.tel[href^="tel:"]').count();
   await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200); return {t,n}; };
 const a=await extra('a'), b=await extra('b'), c=await extra('c');
 chk(/同老闆的其他電話/.test(a.t) && /二代乙工程行/.test(a.t) && /0933-111-222/.test(a.t) && a.n===1, `甲的抽屜列出乙的手機、可以撥：${a.t}`);
 chk(/老闆甲科技有限公司/.test(b.t) && /0912-333-444/.test(b.t) && b.n===1, `乙的抽屜列出甲的手機：${b.t}`);
 chk(c.t==='', '沒連結的公司沒有這一排');
 const card=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#cards .card')].find(x=>/老闆甲/.test(x.textContent)); return c?c.querySelectorAll('a.tel').length:-1;});
 chk(card===1, `卡片照舊只放一支：${card}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
