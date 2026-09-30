// 密碼鎖：正式網址要擋、本機不擋、密碼對了才進得去、這台裝置會記住
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9279);

const PW='83uxyvihhm';

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); const pg=await ctx.newPage({viewport:{width:420,height:800}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message));

 // 本機不鎖：不然自己開發、跑測試每次都卡在門口（原始碼本來就公開，鎖本機沒擋到誰）
 await pg.goto('http://localhost:9279/index.html'); await pg.waitForTimeout(800);
 chk(await pg.locator('#lockGate').count()===0, '本機（localhost）不鎖');
 chk(await pg.isVisible('#btnImport'), '而且網站正常可用');

 // 帶 ?lock=1 就照鎖——正式網址的行為
 await pg.goto('http://localhost:9279/index.html?lock=1'); await pg.waitForSelector('#lockGate');
 chk(await pg.isVisible('#lockGate'), '正式網址要輸入密碼才進得去');
 chk(!(await pg.isVisible('#btnImport')), '沒解開之前看不到網站內容');
 const txt=(await pg.textContent('#lockGate')).replace(/\s+/g,' ');
 chk(/私人的工作工具/.test(txt), `講明這是私人工具：${txt.slice(0,60)}`);

 // 密碼錯
 await pg.fill('#lockInput','wrong-one');
 await pg.click('#lockGate button'); await pg.waitForTimeout(2000);
 chk(/密碼不對/.test(await pg.textContent('#lockMsg')), '密碼錯會講');
 chk(await pg.isVisible('#lockGate'), '密碼錯還是進不去');

 // 密碼對
 await pg.fill('#lockInput',PW);
 await pg.click('#lockGate button'); await pg.waitForTimeout(3000);
 chk(await pg.locator('#lockGate').count()===0, '密碼對就進得去');
 chk(await pg.isVisible('#btnImport'), '網站正常顯示');

 // 這台裝置記住
 await pg.goto('http://localhost:9279/index.html?lock=1'); await pg.waitForTimeout(1200);
 chk(await pg.locator('#lockGate').count()===0, '同一台裝置不用再輸入一次');

 // 換一台裝置（新的瀏覽器環境）→ 又要密碼
 const ctx2=await br.newContext(); const pg2=await ctx2.newPage();
 await pg2.goto('http://localhost:9279/index.html?lock=1'); await pg2.waitForSelector('#lockGate',{timeout:8000});
 chk(await pg2.isVisible('#lockGate'), '換一台裝置還是要密碼');

 // 原始碼裡不能有明文密碼——網站是公開的 repo
 const src=fs.readFileSync(ROOT+'/assets/js/lock.js','utf8');
 chk(!src.includes(PW), '程式裡沒有明文密碼，只有雜湊');
 chk(/250000/.test(src), '雜湊迭代次數夠高，離線猜密碼慢');

 chk(errs.length===0, `沒有 JS 錯誤：${errs.slice(0,3).join(' ｜ ')}`);
 console.log(bad?`\n${bad} 項不過`:'\n全過');
 await br.close(); srv.close();
})();
