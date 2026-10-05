const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(8891);

(async()=>{
 let bad=0;
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1000,height:1200}});
 pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.route('**/data.gcis.nat.gov.tw/**',(r)=>r.abort('failed'));

 let proxyMode='dead';
 await pg.route('**/my-worker.test/**',(route)=>{
   if(proxyMode==='dead') return route.abort('failed');
   if(proxyMode==='wrong') return route.fulfill({status:200,contentType:'text/plain',body:'Hello World!'});
   const u=route.request().url();
   if(!/[?&]url=/.test(u)) return route.fulfill({status:400,contentType:'text/plain',body:'只接受 data.gcis.nat.gov.tw 的網址'});
   return route.fulfill({status:200,contentType:'application/json',body:'[]'});
 });

 await pg.goto('http://localhost:8891/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}});
 await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async()=>{await window.Store.saveRecords([{id:'P1',source:'x',company:'甲工程有限公司',
   aliases:[],taxId:'11111111',grade:'A',founded:'2010',capital:'5,000',phoneRaw:'',phones:[],owner:'王',
   keyman:'',industry:'',address:'',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',
   nextDate:'',lastDate:'',addedDate:''}]);});
 await pg.reload(); await pg.waitForTimeout(900);

 const openDlg=async()=>{ await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#editorBody h2'); };
 const setProxy=async(v)=>{ await pg.fill('#proxyUrl',v); await pg.dispatchEvent('#proxyUrl','change'); };
 const diagText=async()=>(await pg.textContent('#editorBody .proxy-diag')).replace(/\s+/g,' ');

 // 1. 網址根本不是網址
 await openDlg(); await setProxy('workers.dev 我隨便打的');
 await pg.click('button:has-text("檢查代理設定")'); await pg.waitForTimeout(800);
 let t=await diagText();
 let ok=/不是合法的網址/.test(t); if(!ok)bad++;
 console.log(`${ok?'PASS':'FAIL'} 網址格式錯誤 → 指出是網址問題`);

 // 2. 代理連不到（沒部署 / ORIGIN 不符）
 proxyMode='dead'; await setProxy('https://my-worker.test/');
 await pg.click('button:has-text("檢查代理設定")'); await pg.waitForTimeout(900);
 t=await diagText();
 ok=/連不到代理/.test(t)&&/ORIGIN/.test(t); if(!ok)bad++;
 console.log(`${ok?'PASS':'FAIL'} 連不到 → 提示 ORIGIN 並給可直接開的網址`);
 const link=await pg.locator('#editorBody .proxy-diag a').count();
 if(!link)bad++; console.log(`${link?'PASS':'FAIL'} 附上可在新分頁打開的代理網址`);

 // 3. 腳本沒貼對（還是 Hello World）
 proxyMode='wrong';
 await pg.click('button:has-text("檢查代理設定")'); await pg.waitForTimeout(900);
 t=await diagText();
 ok=/Hello World|沒刪乾淨|不是預期/.test(t); if(!ok)bad++;
 console.log(`${ok?'PASS':'FAIL'} 腳本沒貼對 → 指出腳本問題而非網路問題`);

 // 4. 一切正常
 proxyMode='ok';
 await pg.click('button:has-text("檢查代理設定")'); await pg.waitForTimeout(900);
 t=await diagText();
 ok=/代理活著/.test(t); if(!ok)bad++;
 console.log(`${ok?'PASS':'FAIL'} 設定正確 → 明確說可以往下走`);

 // 5. 查詢失敗時的訊息要分來源，不能都講「政府的 API」
 proxyMode='dead';
 await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(1800);
 const all=(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 const proxyMsgOk=/連不到你的代理/.test(all);
 const notMisleading=!/自架代理：瀏覽器擋下了這個請求。最可能的原因是政府/.test(all);
 if(!proxyMsgOk)bad++; console.log(`${proxyMsgOk?'PASS':'FAIL'} 代理失敗有自己的說明`);
 if(!notMisleading)bad++; console.log(`${notMisleading?'PASS':'FAIL'} 不再把代理的錯誤講成「政府的 API 不允許跨網域」`);

 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
