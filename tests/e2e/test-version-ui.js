const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
let serverVersion=null;   // null = 用真實檔案
const srv=http.createServer((rq,rs)=>{
 if(rq.url.split('?')[0].endsWith('version.json') && serverVersion){
   rs.writeHead(200,{'Content-Type':'application/json'}); return rs.end(JSON.stringify({version:serverVersion}));
 }
 const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(8951);

const APP=JSON.parse(fs.readFileSync(path.join(ROOT,'version.json'),'utf8')).version;

(async()=>{
 let bad=0;
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:390,height:844}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await pg.goto('http://localhost:8951/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}});
 await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.waitForTimeout(800);

 // 1. 選單看得到版本號
 await pg.click('#btnMenu'); await pg.waitForTimeout(300);
 const shown=(await pg.textContent('#menuVersion')).trim();
 const ok1=shown===`版本 ${APP}`;
 if(!ok1)bad++; console.log(`${ok1?'PASS':'FAIL'} 選單顯示版本號：「${shown}」（程式是 ${APP}）`);

 // 2. 已是最新版時，主動檢查會明說
 await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="check-update"]'); await pg.waitForTimeout(1200);
 const t1=(await pg.textContent('#toast')).trim();
 const ok2=/已經是最新版/.test(t1)&&t1.includes(APP);
 if(!ok2)bad++; console.log(`${ok2?'PASS':'FAIL'} 已是最新版會回報：「${t1}」`);

 // 3. 伺服器有新版時，主動檢查會跳提示條
 serverVersion='99999999-9';
 await pg.click('#btnMenu'); await pg.waitForTimeout(300);
 await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="check-update"]'); await pg.waitForTimeout(1200);
 const barVisible=await pg.evaluate(()=>{const b=document.querySelector('#updateBar');
   const r=b.getBoundingClientRect(); return !b.hidden && r.height>0;});
 const t2=(await pg.textContent('#toast')).trim();
 const ok3=barVisible&&/99999999-9/.test(t2);
 if(!ok3)bad++; console.log(`${ok3?'PASS':'FAIL'} 有新版會跳提示條並說明版本：「${t2}」`);

 // 4. 按過「稍後」之後，再主動檢查仍會叫出來
 await pg.click('#btnUpdateLater'); await pg.waitForTimeout(300);
 const afterLater=await pg.evaluate(()=>document.querySelector('#updateBar').hidden);
 await pg.click('#btnMenu'); await pg.waitForTimeout(300);
 await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="check-update"]'); await pg.waitForTimeout(1200);
 const backAgain=await pg.evaluate(()=>!document.querySelector('#updateBar').hidden);
 const ok4=afterLater&&backAgain;
 if(!ok4)bad++; console.log(`${ok4?'PASS':'FAIL'} 按過「稍後」後，再檢查一次還是叫得出來`);

 // 5. 切回分頁會自動重新檢查
 await pg.click('#btnUpdateLater'); await pg.waitForTimeout(300);
 await pg.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});
   document.dispatchEvent(new Event('visibilitychange'));});
 await pg.waitForTimeout(200);
 await pg.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});
   document.dispatchEvent(new Event('visibilitychange'));});
 await pg.waitForTimeout(1200);
 const ok5=await pg.evaluate(()=>!document.querySelector('#updateBar').hidden);
 if(!ok5)bad++; console.log(`${ok5?'PASS':'FAIL'} 切回分頁會自動重新檢查`);

 console.log('ERRORS:', errs.length?errs:'none');
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
