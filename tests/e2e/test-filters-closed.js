// 找名單各分頁的篩選預設收起來（使用者：「我每次點進來找名單都要自己關」）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9537);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}}); await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9537/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 for (const t of ['leads','chattel','listed','biz','trade','nhi','factory','industry']) {
   await pg.evaluate((t)=>window.switchTab(t), t);
   await pg.waitForSelector(`#${t}-filters`, {state:'attached', timeout:10000}).catch(()=>{});
   const st=await pg.evaluate((t)=>{ const d=document.getElementById(`${t}-filters`); return d ? String(d.open) : 'missing'; }, t);
   chk(st==='false', `${t} 的篩選預設收起來（寬螢幕也一樣）：${st}`);
 }
 const t=await pg.evaluate(()=>{ const d=document.getElementById('trade-filters'); d.querySelector('summary').click(); return d.open; });
 chk(t===true, '點「篩選」打得開');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
