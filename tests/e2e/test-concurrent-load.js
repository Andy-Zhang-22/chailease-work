// 同時要資料不能算出 0 家（使用者：「為什麼這個是0」——新名單合併頁的登記清冊 0）：
// 合併頁、每日新名單、背景預載同時叫 dailyCandidates，第二個以後要等第一次載完，不能直接回空的
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 // 模擬手機網路慢：index.json 晚一點回來，第二個呼叫才會撞上「已經開始、還沒載好」
 const send=()=>fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});
 if (/leads\/(index|chattel\/index)\.json/.test(rq.url)) setTimeout(send,800); else send(); }).listen(9619);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){}});
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('http://localhost:9619/index.html'); await pg.waitForSelector('#dropzone');
 const r=await pg.evaluate(async()=>{
   const [a,b,c,d]=await Promise.all([window.Leads.dailyCandidates(),window.Leads.dailyCandidates(),window.Chattel.dailyCandidates(),window.Chattel.dailyCandidates()]);
   return {a:a.length,b:b.length,c:c.length,d:d.length}; });
 chk(r.a>0 && r.b===r.a, `登記清冊同時叫兩次都有：${r.a}／${r.b}`);
 chk(r.c>0 && r.d===r.c, `動產擔保同時叫兩次都有：${r.c}／${r.d}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
